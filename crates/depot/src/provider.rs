use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use base64::Engine;
use deploy::{
    validate_public_github_url, BuildEngine, BuildLogSink, BuildOutcome, BuildProvider,
    BuildProviderKind, BuildSpec, DeployError, DeployResult,
};
use tokio::io::AsyncBufReadExt;
use tokio::process::Command;

use crate::config::DepotConfig;

/// Keep at most this many trailing output lines per command for error reporting.
/// Streaming to the log sink and digest parsing are unaffected by this cap.
const MAX_CAPTURED_LINES: usize = 500;

/// Build provider backed by the `depot` CLI. See [`crate`] docs for the two paths.
#[derive(Clone)]
pub struct DepotProvider {
    config: Arc<DepotConfig>,
}

impl DepotProvider {
    pub fn new(config: DepotConfig) -> DeployResult<Self> {
        config.validate()?;
        Ok(Self {
            config: Arc::new(config),
        })
    }
}

#[async_trait]
impl BuildProvider for DepotProvider {
    fn provider(&self) -> BuildProviderKind {
        BuildProviderKind::Depot
    }

    async fn build(
        &self,
        spec: &BuildSpec,
        on_log: &mut BuildLogSink<'_>,
    ) -> DeployResult<BuildOutcome> {
        // Bound the whole build (clone + detect + build + push) end to end. On
        // elapse the inner future is dropped, which drops the WorkDirGuard and
        // (via kill_on_drop) reaps any running child process.
        match tokio::time::timeout(self.config.build_timeout, self.build_inner(spec, on_log)).await
        {
            Ok(result) => result,
            Err(_) => Err(DeployError::Provider(format!(
                "build timed out after {}s",
                self.config.build_timeout.as_secs()
            ))),
        }
    }
}

impl DepotProvider {
    async fn build_inner(
        &self,
        spec: &BuildSpec,
        on_log: &mut BuildLogSink<'_>,
    ) -> DeployResult<BuildOutcome> {
        // Defense in depth: never clone a URL that isn't a public github.com repo,
        // even though the API and worker validate first.
        let repo_url = validate_public_github_url(&spec.source.repo_url)?;

        // Per-build working directory, removed when `_guard` drops.
        let work = self
            .config
            .work_root
            .join(spec.deployment_id.simple().to_string());
        let _ = std::fs::remove_dir_all(&work);
        std::fs::create_dir_all(&work)
            .map_err(|error| DeployError::Provider(format!("failed to create build dir: {error}")))?;
        let _guard = WorkDirGuard(work.clone());

        // 1. Clone the source and resolve the commit SHA.
        let repo_dir = work.join("repo");
        let commit_sha = self
            .clone_repo(&repo_url, spec.source.git_ref.as_deref(), &repo_dir, on_log)
            .await?;

        // 2. Resolve the build context (canonical, contained within the clone) and
        //    bound its size before handing it to a builder.
        let context = resolve_context(&repo_dir, spec.source.root_dir.as_deref())?;
        ensure_context_size(&context, self.config.max_context_bytes)?;
        let plan = detect_build_plan(&context, spec.source.dockerfile_path.as_deref())?;

        // 3. Write registry credentials into an isolated docker config dir.
        let docker_config_dir = work.join("docker");
        write_docker_config(
            &docker_config_dir,
            &self.config.registry_host,
            &self.config.registry_username,
            &self.config.registry_password,
        )?;

        // 4. Tag with the short commit SHA (falling back to the deployment id) and build.
        let tag = short_sha(&commit_sha)
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| spec.deployment_id.simple().to_string());
        let image_ref = image_reference(&spec.image_repository, &tag);
        let envs = self.build_envs(&docker_config_dir);

        let (engine, digest) = match plan {
            BuildPlan::Dockerfile(dockerfile) => {
                on_log(&format!(
                    "Building with Dockerfile {} -> {image_ref}",
                    dockerfile.display()
                ));
                let digest = self
                    .run_dockerfile_build(&context, &dockerfile, &image_ref, &envs, on_log)
                    .await?;
                (BuildEngine::Dockerfile, digest)
            }
            BuildPlan::Railpack => {
                on_log(&format!("No Dockerfile found; building with Railpack -> {image_ref}"));
                let digest = self
                    .run_railpack_build(&context, &work, &image_ref, &envs, on_log)
                    .await?;
                (BuildEngine::Railpack, digest)
            }
        };

        Ok(BuildOutcome {
            image_ref,
            digest,
            commit_sha: Some(commit_sha),
            build_engine: engine,
        })
    }

    fn build_envs(&self, docker_config_dir: &Path) -> Vec<(String, String)> {
        vec![
            ("DEPOT_TOKEN".to_owned(), self.config.token.clone()),
            (
                "DOCKER_CONFIG".to_owned(),
                docker_config_dir.display().to_string(),
            ),
        ]
    }

    /// Clone `repo_url` into `repo_dir` and return the resolved commit SHA.
    async fn clone_repo(
        &self,
        repo_url: &str,
        git_ref: Option<&str>,
        repo_dir: &Path,
        on_log: &mut BuildLogSink<'_>,
    ) -> DeployResult<String> {
        let envs = git_envs();
        let repo_dir_str = repo_dir.display().to_string();
        match git_ref.map(str::trim).filter(|r| !r.is_empty()) {
            // A raw commit SHA can't be reached with `--branch`, so do a full clone
            // and check it out.
            Some(reference) if looks_like_commit_sha(reference) => {
                let mut clone = git_hardening_args();
                clone.extend(str_args(&["clone", "--no-tags", repo_url, &repo_dir_str]));
                self.run(&self.config.git_bin, &clone, None, &envs, on_log)
                    .await?;
                let mut checkout = git_hardening_args();
                checkout.extend(str_args(&["checkout", "--detach", reference]));
                self.run(&self.config.git_bin, &checkout, Some(repo_dir), &envs, on_log)
                    .await?;
            }
            // A branch or tag: a shallow single-branch clone is enough.
            Some(reference) => {
                let mut clone = git_hardening_args();
                clone.extend(str_args(&[
                    "clone",
                    "--depth",
                    "1",
                    "--single-branch",
                    "--no-tags",
                    "--branch",
                    reference,
                    repo_url,
                    &repo_dir_str,
                ]));
                self.run(&self.config.git_bin, &clone, None, &envs, on_log)
                    .await?;
            }
            // Default branch.
            None => {
                let mut clone = git_hardening_args();
                clone.extend(str_args(&[
                    "clone",
                    "--depth",
                    "1",
                    "--single-branch",
                    "--no-tags",
                    repo_url,
                    &repo_dir_str,
                ]));
                self.run(&self.config.git_bin, &clone, None, &envs, on_log)
                    .await?;
            }
        }

        let sha = self
            .capture(
                &self.config.git_bin,
                &str_args(&["rev-parse", "HEAD"]),
                Some(repo_dir),
                &envs,
            )
            .await?;
        let sha = sha.trim().to_owned();
        if sha.is_empty() {
            return Err(DeployError::Provider(
                "could not resolve commit SHA after clone".into(),
            ));
        }
        Ok(sha)
    }

    async fn run_dockerfile_build(
        &self,
        context: &Path,
        dockerfile: &Path,
        image_ref: &str,
        envs: &[(String, String)],
        on_log: &mut BuildLogSink<'_>,
    ) -> DeployResult<Option<String>> {
        let args = depot_build_args(
            &self.config.project_id,
            &self.config.platform,
            dockerfile,
            image_ref,
            context,
        );
        let (_, digest) = self
            .run(&self.config.depot_bin, &args, None, envs, on_log)
            .await?;
        Ok(digest)
    }

    /// Railpack path: generate a build plan, then drive Depot's BuildKit endpoint
    /// (via `depot exec`) with Railpack's `gateway.v0` frontend.
    ///
    /// CAVEAT: this relies on `depot exec` exposing `BUILDKIT_HOST` to the wrapped
    /// command. That's documented behavior but not yet validated against a live
    /// account; if `depot exec` is unavailable, this path fails loudly and the
    /// Dockerfile path is unaffected.
    async fn run_railpack_build(
        &self,
        context: &Path,
        work: &Path,
        image_ref: &str,
        envs: &[(String, String)],
        on_log: &mut BuildLogSink<'_>,
    ) -> DeployResult<Option<String>> {
        let plan_dir = work.join("railpack");
        std::fs::create_dir_all(&plan_dir).map_err(|error| {
            DeployError::Provider(format!("failed to create railpack plan dir: {error}"))
        })?;
        let plan_path = plan_dir.join("railpack-plan.json");

        // Generate railpack-plan.json from the source.
        self.run(
            &self.config.railpack_bin,
            &railpack_prepare_args(context, &plan_path),
            None,
            envs,
            on_log,
        )
        .await?;

        let args = depot_exec_buildctl_args(
            &self.config.project_id,
            &self.config.buildctl_bin,
            &self.config.railpack_frontend,
            context,
            &plan_dir,
            image_ref,
        );
        let (_, digest) = self
            .run(&self.config.depot_bin, &args, None, envs, on_log)
            .await?;
        Ok(digest)
    }

    /// Run a streaming command bounded by the configured per-command timeout.
    async fn run(
        &self,
        program: &str,
        args: &[String],
        cwd: Option<&Path>,
        envs: &[(String, String)],
        on_log: &mut BuildLogSink<'_>,
    ) -> DeployResult<(String, Option<String>)> {
        run_command(program, args, cwd, envs, self.config.command_timeout, on_log).await
    }

    /// Capture a command's stdout bounded by the configured per-command timeout.
    async fn capture(
        &self,
        program: &str,
        args: &[String],
        cwd: Option<&Path>,
        envs: &[(String, String)],
    ) -> DeployResult<String> {
        capture(program, args, cwd, envs, self.config.command_timeout).await
    }
}

/// Removes the per-build working directory on drop (best effort), so a cancelled
/// or panicked build does not leak disk.
struct WorkDirGuard(PathBuf);

impl Drop for WorkDirGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

enum BuildPlan {
    Dockerfile(PathBuf),
    Railpack,
}

/// Hardening env vars applied to every `git` invocation so an untrusted repo
/// cannot hang the worker on a credential prompt or read host git config.
fn git_envs() -> Vec<(String, String)> {
    vec![
        ("GIT_TERMINAL_PROMPT".to_owned(), "0".to_owned()),
        ("GIT_ASKPASS".to_owned(), "/bin/true".to_owned()),
        ("GIT_CONFIG_NOSYSTEM".to_owned(), "1".to_owned()),
        ("GIT_CONFIG_GLOBAL".to_owned(), "/dev/null".to_owned()),
        ("GIT_LFS_SKIP_SMUDGE".to_owned(), "1".to_owned()),
    ]
}

/// `-c` flags placed before the git subcommand: disable symlink checkout and
/// non-network transports so a malicious repo can't smuggle file/ext protocols.
fn git_hardening_args() -> Vec<String> {
    str_args(&[
        "-c",
        "core.symlinks=false",
        "-c",
        "protocol.file.allow=never",
        "-c",
        "protocol.ext.allow=never",
    ])
}

/// Resolve the build context directory, honoring an optional `root_dir`. The
/// result is canonicalized and asserted to live inside the clone, so neither a
/// `..` string nor an in-repo symlink can escape it.
fn resolve_context(repo_dir: &Path, root_dir: Option<&str>) -> DeployResult<PathBuf> {
    let target = match root_dir.map(str::trim).filter(|value| !value.is_empty()) {
        None => repo_dir.to_owned(),
        Some(sub) => repo_dir.join(safe_relative(sub)?),
    };
    ensure_within(repo_dir, &target)
}

/// Decide Dockerfile vs Railpack. An explicit `dockerfile_path` must be a real
/// (non-symlink) file contained within the context; with none, a regular
/// `Dockerfile` at the context root selects the Dockerfile path, otherwise Railpack.
fn detect_build_plan(context: &Path, dockerfile_path: Option<&str>) -> DeployResult<BuildPlan> {
    match dockerfile_path.map(str::trim).filter(|value| !value.is_empty()) {
        Some(path) => {
            let candidate = context.join(safe_relative(path)?);
            if is_symlink(&candidate) {
                return Err(DeployError::Validation(format!(
                    "dockerfile_path '{path}' must not be a symlink"
                )));
            }
            let resolved = ensure_within(context, &candidate)?;
            if resolved.is_file() {
                Ok(BuildPlan::Dockerfile(resolved))
            } else {
                Err(DeployError::Validation(format!(
                    "dockerfile_path '{path}' is not a file"
                )))
            }
        }
        None => {
            let candidate = context.join("Dockerfile");
            // Only a *regular* file selects the Dockerfile path; a symlink named
            // Dockerfile is ignored (treated as no Dockerfile) and never followed.
            match std::fs::symlink_metadata(&candidate) {
                Ok(meta) if meta.file_type().is_file() => Ok(BuildPlan::Dockerfile(candidate)),
                _ => Ok(BuildPlan::Railpack),
            }
        }
    }
}

fn is_symlink(path: &Path) -> bool {
    std::fs::symlink_metadata(path)
        .map(|meta| meta.file_type().is_symlink())
        .unwrap_or(false)
}

/// Canonicalize `candidate` and assert it is contained within `base`. Both must
/// exist on disk. Returns the canonical, contained path.
fn ensure_within(base: &Path, candidate: &Path) -> DeployResult<PathBuf> {
    let base_canon = std::fs::canonicalize(base)
        .map_err(|error| DeployError::Provider(format!("failed to resolve build root: {error}")))?;
    let candidate_canon = std::fs::canonicalize(candidate).map_err(|_| {
        DeployError::Validation(format!(
            "path '{}' was not found in the repository",
            candidate.display()
        ))
    })?;
    if !candidate_canon.starts_with(&base_canon) {
        return Err(DeployError::Validation(
            "path escapes the repository root".into(),
        ));
    }
    Ok(candidate_canon)
}

/// Walk `context` and fail if total regular-file bytes exceed `max`. Symlinks are
/// neither followed nor counted.
fn ensure_context_size(context: &Path, max: Option<u64>) -> DeployResult<()> {
    let Some(max) = max else {
        return Ok(());
    };
    let mut total: u64 = 0;
    let mut stack = vec![context.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = std::fs::read_dir(&dir)
            .map_err(|error| DeployError::Provider(format!("failed to read build context: {error}")))?;
        for entry in entries {
            let entry = entry.map_err(|error| {
                DeployError::Provider(format!("failed to read build context: {error}"))
            })?;
            let file_type = entry.file_type().map_err(|error| {
                DeployError::Provider(format!("failed to stat build context entry: {error}"))
            })?;
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                stack.push(entry.path());
            } else if file_type.is_file() {
                total = total.saturating_add(entry.metadata().map(|meta| meta.len()).unwrap_or(0));
                if total > max {
                    return Err(DeployError::Validation(format!(
                        "build context exceeds the {max}-byte limit"
                    )));
                }
            }
        }
    }
    Ok(())
}

/// Validate a user-supplied relative path: no absolute paths, no `..`, no leading
/// slash, no drive/scheme. Returns the cleaned relative path.
fn safe_relative(path: &str) -> DeployResult<PathBuf> {
    let trimmed = path.trim().trim_start_matches("./");
    if trimmed.is_empty()
        || trimmed.starts_with('/')
        || trimmed.starts_with('\\')
        || trimmed.contains(':')
    {
        return Err(DeployError::Validation(format!(
            "path '{path}' must be relative to the repository root"
        )));
    }
    let mut clean = PathBuf::new();
    for component in trimmed.split(['/', '\\']) {
        match component {
            "" | "." => continue,
            ".." => {
                return Err(DeployError::Validation(format!(
                    "path '{path}' must not traverse outside the repository"
                )))
            }
            other => clean.push(other),
        }
    }
    if clean.as_os_str().is_empty() {
        return Err(DeployError::Validation(format!(
            "path '{path}' is empty after normalization"
        )));
    }
    Ok(clean)
}

fn write_docker_config(
    dir: &Path,
    registry_host: &str,
    username: &str,
    password: &str,
) -> DeployResult<()> {
    std::fs::create_dir_all(dir).map_err(|error| {
        DeployError::Provider(format!("failed to create docker config dir: {error}"))
    })?;
    let auth =
        base64::engine::general_purpose::STANDARD.encode(format!("{username}:{password}"));
    let config = serde_json::json!({
        "auths": {
            registry_host: { "auth": auth }
        }
    });
    std::fs::write(dir.join("config.json"), config.to_string())
        .map_err(|error| DeployError::Provider(format!("failed to write docker config: {error}")))
}

fn depot_build_args(
    project_id: &str,
    platform: &str,
    dockerfile: &Path,
    image_ref: &str,
    context: &Path,
) -> Vec<String> {
    vec![
        "build".to_owned(),
        "--project".to_owned(),
        project_id.to_owned(),
        "--platform".to_owned(),
        platform.to_owned(),
        "-f".to_owned(),
        dockerfile.display().to_string(),
        "-t".to_owned(),
        image_ref.to_owned(),
        "--push".to_owned(),
        context.display().to_string(),
    ]
}

fn railpack_prepare_args(context: &Path, plan_path: &Path) -> Vec<String> {
    vec![
        "prepare".to_owned(),
        context.display().to_string(),
        "--plan-out".to_owned(),
        plan_path.display().to_string(),
    ]
}

fn depot_exec_buildctl_args(
    project_id: &str,
    buildctl_bin: &str,
    railpack_frontend: &str,
    context: &Path,
    plan_dir: &Path,
    image_ref: &str,
) -> Vec<String> {
    vec![
        "exec".to_owned(),
        "--project".to_owned(),
        project_id.to_owned(),
        "--".to_owned(),
        buildctl_bin.to_owned(),
        "build".to_owned(),
        "--frontend".to_owned(),
        "gateway.v0".to_owned(),
        "--opt".to_owned(),
        format!("source={railpack_frontend}"),
        "--local".to_owned(),
        format!("context={}", context.display()),
        "--local".to_owned(),
        format!("dockerfile={}", plan_dir.display()),
        "--opt".to_owned(),
        "filename=railpack-plan.json".to_owned(),
        "--output".to_owned(),
        format!("type=image,name={image_ref},push=true"),
    ]
}

fn image_reference(repository: &str, tag: &str) -> String {
    format!("{}:{tag}", repository.trim_end_matches('/'))
}

fn short_sha(sha: &str) -> Option<&str> {
    let sha = sha.trim();
    if sha.is_empty() {
        None
    } else {
        Some(&sha[..sha.len().min(12)])
    }
}

fn looks_like_commit_sha(reference: &str) -> bool {
    let len = reference.len();
    (7..=40).contains(&len) && reference.chars().all(|c| c.is_ascii_hexdigit())
}

/// Match a `sha256:<64 hex>` digest in a single output line, flagging whether the
/// line refers to a manifest (preferred over layer/config digests).
fn digest_in_line(line: &str) -> Option<(bool, String)> {
    let index = line.find("sha256:")?;
    let hex: String = line[index + "sha256:".len()..]
        .chars()
        .take_while(|c| c.is_ascii_hexdigit())
        .collect();
    if hex.len() < 64 {
        return None;
    }
    let is_manifest = line.to_ascii_lowercase().contains("manifest");
    Some((is_manifest, format!("sha256:{}", &hex[..64])))
}

fn track_digest(line: &str, manifest: &mut Option<String>, fallback: &mut Option<String>) {
    if let Some((is_manifest, digest)) = digest_in_line(line) {
        if is_manifest {
            *manifest = Some(digest);
        } else {
            *fallback = Some(digest);
        }
    }
}

fn str_args(args: &[&str]) -> Vec<String> {
    args.iter().map(|value| (*value).to_owned()).collect()
}

/// Run a command, streaming each stdout/stderr line to `on_log` and returning the
/// (trailing, capped) combined output plus any image digest seen. Bounded by
/// `timeout`; the child is killed on elapse or future cancellation.
async fn run_command(
    program: &str,
    args: &[String],
    cwd: Option<&Path>,
    envs: &[(String, String)],
    timeout: Duration,
    on_log: &mut BuildLogSink<'_>,
) -> DeployResult<(String, Option<String>)> {
    let mut command = Command::new(program);
    command
        .args(args)
        .kill_on_drop(true)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    if let Some(dir) = cwd {
        command.current_dir(dir);
    }
    for (key, value) in envs {
        command.env(key, value);
    }

    let mut child = command
        .spawn()
        .map_err(|error| DeployError::Provider(format!("failed to spawn {program}: {error}")))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| DeployError::Provider(format!("{program}: missing stdout pipe")))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| DeployError::Provider(format!("{program}: missing stderr pipe")))?;

    let drain = async move {
        let mut stdout_lines = tokio::io::BufReader::new(stdout).lines();
        let mut stderr_lines = tokio::io::BufReader::new(stderr).lines();
        let mut captured: Vec<String> = Vec::new();
        let mut manifest_digest: Option<String> = None;
        let mut fallback_digest: Option<String> = None;
        let mut stdout_done = false;
        let mut stderr_done = false;
        while !(stdout_done && stderr_done) {
            tokio::select! {
                line = stdout_lines.next_line(), if !stdout_done => {
                    match line.map_err(|error| DeployError::Provider(error.to_string()))? {
                        Some(line) => {
                            on_log(&line);
                            track_digest(&line, &mut manifest_digest, &mut fallback_digest);
                            push_capped(&mut captured, line);
                        }
                        None => stdout_done = true,
                    }
                }
                line = stderr_lines.next_line(), if !stderr_done => {
                    match line.map_err(|error| DeployError::Provider(error.to_string()))? {
                        Some(line) => {
                            on_log(&line);
                            track_digest(&line, &mut manifest_digest, &mut fallback_digest);
                            push_capped(&mut captured, line);
                        }
                        None => stderr_done = true,
                    }
                }
            }
        }
        let status = child
            .wait()
            .await
            .map_err(|error| DeployError::Provider(error.to_string()))?;
        Ok::<_, DeployError>((status, captured, manifest_digest.or(fallback_digest)))
    };

    let (status, captured, digest) = match tokio::time::timeout(timeout, drain).await {
        Ok(result) => result?,
        Err(_) => {
            return Err(DeployError::Provider(format!(
                "{program} timed out after {}s",
                timeout.as_secs()
            )))
        }
    };

    let combined = captured.join("\n");
    if !status.success() {
        let code = status
            .code()
            .map(|code| code.to_string())
            .unwrap_or_else(|| "signal".to_owned());
        let tail: Vec<String> = captured.iter().rev().take(20).cloned().collect();
        let tail: Vec<String> = tail.into_iter().rev().collect();
        return Err(DeployError::Provider(format!(
            "{program} exited with status {code}:\n{}",
            tail.join("\n")
        )));
    }
    Ok((combined, digest))
}

/// Run a command and return its trimmed stdout, without streaming. Bounded by
/// `timeout`; the child is killed on elapse or future cancellation.
async fn capture(
    program: &str,
    args: &[String],
    cwd: Option<&Path>,
    envs: &[(String, String)],
    timeout: Duration,
) -> DeployResult<String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .kill_on_drop(true)
        .stdin(std::process::Stdio::null());
    if let Some(dir) = cwd {
        command.current_dir(dir);
    }
    for (key, value) in envs {
        command.env(key, value);
    }
    let output = match tokio::time::timeout(timeout, command.output()).await {
        Ok(result) => result
            .map_err(|error| DeployError::Provider(format!("failed to run {program}: {error}")))?,
        Err(_) => {
            return Err(DeployError::Provider(format!(
                "{program} timed out after {}s",
                timeout.as_secs()
            )))
        }
    };
    if !output.status.success() {
        return Err(DeployError::Provider(format!(
            "{program} failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

fn push_capped(buffer: &mut Vec<String>, line: String) {
    buffer.push(line);
    if buffer.len() > MAX_CAPTURED_LINES {
        let overflow = buffer.len() - MAX_CAPTURED_LINES;
        buffer.drain(0..overflow);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::DEFAULT_RAILPACK_FRONTEND;

    #[test]
    fn builds_image_reference() {
        assert_eq!(
            image_reference("registry.fly.io/app", "abc123"),
            "registry.fly.io/app:abc123"
        );
        assert_eq!(
            image_reference("registry.fly.io/app/", "abc123"),
            "registry.fly.io/app:abc123"
        );
    }

    #[test]
    fn short_sha_truncates() {
        assert_eq!(short_sha("0123456789abcdef0123"), Some("0123456789ab"));
        assert_eq!(short_sha("abc"), Some("abc"));
        assert_eq!(short_sha("   "), None);
    }

    #[test]
    fn detects_commit_sha_refs() {
        assert!(looks_like_commit_sha("0123456789abcdef0123456789abcdef01234567"));
        assert!(looks_like_commit_sha("abc1234"));
        assert!(!looks_like_commit_sha("main"));
        assert!(!looks_like_commit_sha("v1.2.3"));
        assert!(!looks_like_commit_sha("ab")); // too short
    }

    #[test]
    fn digest_prefers_manifest_lines() {
        // A layer/config digest line.
        assert_eq!(
            digest_in_line(&format!("exporting layers sha256:{}", "1".repeat(64))),
            Some((false, format!("sha256:{}", "1".repeat(64))))
        );
        // A manifest line is flagged true.
        assert_eq!(
            digest_in_line(&format!("exporting manifest sha256:{}", "2".repeat(64))),
            Some((true, format!("sha256:{}", "2".repeat(64))))
        );
        // A short hex run is not a full digest.
        assert_eq!(digest_in_line("sha256:deadbeef"), None);
        assert_eq!(digest_in_line("no digest"), None);
    }

    #[test]
    fn track_digest_prefers_manifest_over_layer() {
        let mut manifest = None;
        let mut fallback = None;
        track_digest(&format!("layer sha256:{}", "1".repeat(64)), &mut manifest, &mut fallback);
        track_digest(
            &format!("exporting manifest sha256:{}", "2".repeat(64)),
            &mut manifest,
            &mut fallback,
        );
        assert_eq!(manifest, Some(format!("sha256:{}", "2".repeat(64))));
        assert_eq!(fallback, Some(format!("sha256:{}", "1".repeat(64))));
    }

    #[test]
    fn rejects_unsafe_relative_paths() {
        assert!(safe_relative("/etc/passwd").is_err());
        assert!(safe_relative("../secrets").is_err());
        assert!(safe_relative("app/../../etc").is_err());
        assert!(safe_relative("").is_err());
        assert_eq!(safe_relative("./services/api").unwrap(), PathBuf::from("services/api"));
        assert_eq!(safe_relative("api").unwrap(), PathBuf::from("api"));
    }

    #[test]
    fn ensure_within_blocks_escapes() {
        let base = std::env::temp_dir().join(format!("depot-within-{}", uuid::Uuid::now_v7().simple()));
        let inside = base.join("sub");
        std::fs::create_dir_all(&inside).unwrap();
        // A real path inside the base resolves and is contained.
        assert!(ensure_within(&base, &inside).is_ok());
        // The parent of base is not contained.
        assert!(ensure_within(&base, base.parent().unwrap()).is_err());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn context_size_limit_trips() {
        let dir = std::env::temp_dir().join(format!("depot-size-{}", uuid::Uuid::now_v7().simple()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("big"), vec![0u8; 1024]).unwrap();
        assert!(ensure_context_size(&dir, Some(100)).is_err());
        assert!(ensure_context_size(&dir, Some(10_000)).is_ok());
        assert!(ensure_context_size(&dir, None).is_ok());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn depot_build_args_are_well_formed() {
        let args = depot_build_args(
            "proj_123",
            "linux/amd64",
            Path::new("/work/repo/Dockerfile"),
            "registry.fly.io/app:sha",
            Path::new("/work/repo"),
        );
        assert_eq!(args[0], "build");
        assert!(args.iter().any(|a| a == "--push"));
        assert_eq!(args.last().unwrap(), "/work/repo");
        let project_idx = args.iter().position(|a| a == "--project").unwrap();
        assert_eq!(args[project_idx + 1], "proj_123");
        let tag_idx = args.iter().position(|a| a == "-t").unwrap();
        assert_eq!(args[tag_idx + 1], "registry.fly.io/app:sha");
    }

    #[test]
    fn railpack_buildctl_args_target_the_frontend_and_push() {
        let args = depot_exec_buildctl_args(
            "proj_123",
            "buildctl",
            DEFAULT_RAILPACK_FRONTEND,
            Path::new("/work/repo"),
            Path::new("/work/railpack"),
            "registry.fly.io/app:sha",
        );
        assert_eq!(args[0], "exec");
        assert!(args.iter().any(|a| a == "buildctl"));
        assert!(args
            .iter()
            .any(|a| a == &format!("source={DEFAULT_RAILPACK_FRONTEND}")));
        assert!(args
            .iter()
            .any(|a| a == "type=image,name=registry.fly.io/app:sha,push=true"));
        assert!(args.iter().any(|a| a == "filename=railpack-plan.json"));
    }

    #[test]
    fn git_hardening_disables_symlinks() {
        let args = git_hardening_args();
        assert!(args.iter().any(|a| a == "core.symlinks=false"));
        assert!(args.iter().any(|a| a == "protocol.file.allow=never"));
    }

    #[test]
    fn docker_config_writes_base64_auth() {
        let dir = std::env::temp_dir().join(format!("depot-test-{}", uuid::Uuid::now_v7().simple()));
        write_docker_config(&dir, "registry.fly.io", "x", "tok").unwrap();
        let written = std::fs::read_to_string(dir.join("config.json")).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&written).unwrap();
        let auth = parsed["auths"]["registry.fly.io"]["auth"].as_str().unwrap();
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(auth)
            .unwrap();
        assert_eq!(String::from_utf8(decoded).unwrap(), "x:tok");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn requires_credentials() {
        assert!(DepotProvider::new(DepotConfig::new("", "proj", "registry.fly.io", "tok")).is_err());
        assert!(DepotProvider::new(DepotConfig::new("tok", "proj", "registry.fly.io", "")).is_err());
        assert!(DepotProvider::new(DepotConfig::new("tok", "proj", "registry.fly.io", "pw")).is_ok());
    }
}

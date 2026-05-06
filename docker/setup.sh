#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/lassejlv/produktive"
INSTALL_DIR="/opt/produktive"
BRANCH="main"

usage() {
  cat <<'EOF'
Usage: setup.sh [--dir PATH] [--branch NAME]

Install Docker, clone Produktive, prompt for env files, and start the Docker stack.

Options:
  --dir PATH      Installation directory. Default: /opt/produktive
  --branch NAME   Git branch to check out. Default: main
  -h, --help      Show this help.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dir)
      INSTALL_DIR="${2:-}"
      shift 2
      ;;
    --branch)
      BRANCH="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -z "$INSTALL_DIR" ] || [ -z "$BRANCH" ]; then
  echo "--dir and --branch values cannot be empty." >&2
  exit 1
fi

if [ ! -r /dev/tty ]; then
  echo "This setup script needs an interactive terminal for env prompts." >&2
  exit 1
fi

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
  OWNER_USER="${SUDO_USER:-root}"
  OWNER_GROUP="$(id -gn "$OWNER_USER" 2>/dev/null || echo root)"
else
  if ! command -v sudo >/dev/null 2>&1; then
    echo "This setup requires root or sudo." >&2
    exit 1
  fi
  SUDO="sudo"
  OWNER_USER="$(id -un)"
  OWNER_GROUP="$(id -gn)"
fi

run_privileged() {
  if [ -n "$SUDO" ]; then
    sudo "$@"
  else
    "$@"
  fi
}

is_debian_like() {
  [ -r /etc/os-release ] || return 1
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-} ${ID_LIKE:-}" in
    *debian*|*ubuntu*) return 0 ;;
    *) return 1 ;;
  esac
}

install_docker() {
  if ! is_debian_like; then
    echo "This installer supports Ubuntu/Debian VMs only." >&2
    exit 1
  fi

  # shellcheck disable=SC1091
  . /etc/os-release
  local codename="${VERSION_CODENAME:-}"
  if [ -z "$codename" ]; then
    codename="$(. /etc/os-release && echo "${UBUNTU_CODENAME:-}")"
  fi
  if [ -z "$codename" ]; then
    echo "Could not determine Debian/Ubuntu codename for Docker apt repository." >&2
    exit 1
  fi

  run_privileged apt-get update
  run_privileged apt-get install -y ca-certificates curl gnupg git

  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    run_privileged install -m 0755 -d /etc/apt/keyrings
    curl -fsSL "https://download.docker.com/linux/${ID}/gpg" | run_privileged gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
    run_privileged chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} ${codename} stable" \
      | run_privileged tee /etc/apt/sources.list.d/docker.list >/dev/null
    run_privileged apt-get update
    run_privileged apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi

  if [ "$OWNER_USER" != "root" ]; then
    run_privileged usermod -aG docker "$OWNER_USER" || true
  fi
}

select_docker_cmd() {
  if docker info >/dev/null 2>&1; then
    echo "docker"
  elif [ -n "$SUDO" ] && sudo docker info >/dev/null 2>&1; then
    echo "sudo docker"
  else
    echo "Docker is installed but not reachable by this user." >&2
    echo "Log out and back in for docker group membership, or run with sudo." >&2
    exit 1
  fi
}

clone_or_update_repo() {
  if [ -e "$INSTALL_DIR" ] && [ ! -d "$INSTALL_DIR/.git" ]; then
    echo "$INSTALL_DIR exists but is not a git checkout. Choose another --dir." >&2
    exit 1
  fi

  if [ -d "$INSTALL_DIR/.git" ]; then
    git -C "$INSTALL_DIR" fetch origin "$BRANCH"
    git -C "$INSTALL_DIR" checkout "$BRANCH"
    git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
  else
    run_privileged mkdir -p "$(dirname "$INSTALL_DIR")"
    run_privileged git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
    if [ "$OWNER_USER" != "root" ]; then
      run_privileged chown -R "$OWNER_USER:$OWNER_GROUP" "$INSTALL_DIR"
    fi
  fi
}

prompt_value() {
  local key="$1"
  local default_value="$2"
  local required="$3"
  local secret="${4:-false}"
  local value=""
  local prompt="$key"

  if [ -n "$default_value" ]; then
    prompt="$prompt [$default_value]"
  fi
  prompt="$prompt: "

  while true; do
    if [ "$secret" = "true" ]; then
      printf '%s' "$prompt" >/dev/tty
      IFS= read -r -s value </dev/tty
      printf '\n' >/dev/tty
    else
      printf '%s' "$prompt" >/dev/tty
      IFS= read -r value </dev/tty
    fi
    if [ -z "$value" ]; then
      value="$default_value"
    fi
    if [ "$required" = "true" ] && [ -z "$value" ]; then
      echo "$key is required." >/dev/tty
      continue
    fi
    printf '%s' "$value"
    return
  done
}

prompt_yes_no() {
  local prompt="$1"
  local default_answer="$2"
  local value=""
  local suffix="[y/N]"
  if [ "$default_answer" = "yes" ]; then
    suffix="[Y/n]"
  fi

  while true; do
    printf '%s %s: ' "$prompt" "$suffix" >/dev/tty
    IFS= read -r value </dev/tty
    value="${value:-$default_answer}"
    case "$value" in
      y|Y|yes|YES) return 0 ;;
      n|N|no|NO) return 1 ;;
      *) echo "Answer yes or no." >/dev/tty ;;
    esac
  done
}

prompt_postgres_password() {
  local value=""

  while true; do
    value="$(prompt_value POSTGRES_PASSWORD "" true true)"
    if [[ "$value" =~ [:/@\?#\[\]] ]]; then
      echo "POSTGRES_PASSWORD cannot contain URL-reserved characters: : / @ ? # [ ]" >&2
      continue
    fi
    printf '%s' "$value"
    return
  done
}

env_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

write_env_line() {
  local file="$1"
  local key="$2"
  local value="$3"
  printf '%s="%s"\n' "$key" "$(env_escape "$value")" >> "$file"
}

is_local_domain() {
  case "$1" in
    localhost|127.0.0.1|*.localhost) return 0 ;;
    *) return 1 ;;
  esac
}

configure_env_files() {
  cd "$INSTALL_DIR"

  if [ -f .env ] || [ -f .env.mcp ] || [ -f .env.bot ]; then
    if ! prompt_yes_no "Existing env files found. Overwrite them?" "no"; then
      echo "Keeping existing env files."
      return
    fi
  fi

  local app_domain mcp_domain bot_domain app_url mcp_resource_url cookie_secure
  local final_app_url final_mcp_resource_url ai_api_key ai_base_url ai_model
  local use_postgres=false
  local database_url database_direct_url postgres_db postgres_user postgres_password

  app_domain="$(prompt_value APP_DOMAIN "localhost" true false)"
  mcp_domain="$(prompt_value MCP_DOMAIN "mcp.localhost" true false)"
  bot_domain="$(prompt_value BOT_STATUS_DOMAIN "bot.localhost" true false)"

  if is_local_domain "$app_domain"; then
    app_url="http://$app_domain"
    cookie_secure="false"
  else
    app_url="https://$app_domain"
    cookie_secure="true"
  fi

  if is_local_domain "$mcp_domain"; then
    mcp_resource_url="http://$mcp_domain/mcp"
  else
    mcp_resource_url="https://$mcp_domain/mcp"
  fi

  if prompt_yes_no "Use local Postgres in Docker? Default is external Postgres." "no"; then
    use_postgres=true
    postgres_db="$(prompt_value POSTGRES_DB "produktive" true false)"
    postgres_user="$(prompt_value POSTGRES_USER "produktive" true false)"
    postgres_password="$(prompt_postgres_password)"
    database_url="postgresql://$postgres_user:$postgres_password@postgres:5432/$postgres_db"
    database_direct_url="$database_url"
  else
    database_url="$(prompt_value DATABASE_URL "" true false)"
    database_direct_url="$(prompt_value DATABASE_DIRECT_URL "$database_url" true false)"
  fi

  : > .env
  write_env_line .env PORT "$(prompt_value PORT "3000" true false)"
  write_env_line .env APP_PORT "$(prompt_value APP_PORT "3000" true false)"
  write_env_line .env MCP_PORT "$(prompt_value MCP_PORT "3001" true false)"
  write_env_line .env BOT_STATUS_PORT "$(prompt_value BOT_STATUS_PORT "3002" true false)"
  write_env_line .env HTTP_PORT "$(prompt_value HTTP_PORT "80" true false)"
  write_env_line .env HTTPS_PORT "$(prompt_value HTTPS_PORT "443" true false)"
  write_env_line .env APP_DOMAIN "$app_domain"
  write_env_line .env MCP_DOMAIN "$mcp_domain"
  write_env_line .env BOT_STATUS_DOMAIN "$bot_domain"
  write_env_line .env VITE_API_URL "$(prompt_value VITE_API_URL "" false false)"
  if [ "$use_postgres" = "true" ]; then
    write_env_line .env POSTGRES_DB "$postgres_db"
    write_env_line .env POSTGRES_USER "$postgres_user"
    write_env_line .env POSTGRES_PASSWORD "$postgres_password"
  fi
  write_env_line .env DATABASE_URL "$database_url"
  write_env_line .env DATABASE_DIRECT_URL "$database_direct_url"
  write_env_line .env JWT_SECRET "$(prompt_value JWT_SECRET "" true true)"
  write_env_line .env CORS_ORIGINS "$(prompt_value CORS_ORIGINS "$app_url,http://localhost:5173,http://127.0.0.1:5173" true false)"
  write_env_line .env AUTH_COOKIE_NAME "$(prompt_value AUTH_COOKIE_NAME "produktive_session" true false)"
  write_env_line .env AUTH_COOKIE_DOMAIN "$(prompt_value AUTH_COOKIE_DOMAIN "" false false)"
  write_env_line .env AUTH_COOKIE_SECURE "$(prompt_value AUTH_COOKIE_SECURE "$cookie_secure" true false)"
  write_env_line .env AUTH_SESSION_DAYS "$(prompt_value AUTH_SESSION_DAYS "30" true false)"
  write_env_line .env WEB_DIST_DIR "$(prompt_value WEB_DIST_DIR "/app/web/dist" true false)"
  final_app_url="$(prompt_value APP_URL "$app_url" true false)"
  final_mcp_resource_url="$(prompt_value MCP_RESOURCE_URL "$mcp_resource_url" true false)"
  write_env_line .env APP_URL "$final_app_url"
  write_env_line .env MCP_RESOURCE_URL "$final_mcp_resource_url"
  write_env_line .env CLOUDFLARE_API_TOKEN "$(prompt_value CLOUDFLARE_API_TOKEN "" true true)"
  write_env_line .env CLOUDFLARE_ACCOUNT_ID "$(prompt_value CLOUDFLARE_ACCOUNT_ID "" false false)"
  write_env_line .env CLOUDFLARE_FROM "$(prompt_value CLOUDFLARE_FROM "Produktive <be@$app_domain>" true false)"
  write_env_line .env SUPPORT_WORKER_SECRET "$(prompt_value SUPPORT_WORKER_SECRET "" false true)"
  write_env_line .env SUPPORT_EMAIL_FROM "$(prompt_value SUPPORT_EMAIL_FROM "support@$app_domain" true false)"
  write_env_line .env SUPPORT_EMAIL_WORKER_URL "$(prompt_value SUPPORT_EMAIL_WORKER_URL "" false false)"
  write_env_line .env SUPPORT_EMAIL_FALLBACK_FORWARD "$(prompt_value SUPPORT_EMAIL_FALLBACK_FORWARD "" false false)"
  ai_api_key="$(prompt_value AI_API_KEY "" true true)"
  ai_base_url="$(prompt_value AI_BASE_URL "https://ollama.com/v1" true false)"
  ai_model="$(prompt_value AI_MODEL "glm-5.1" true false)"
  write_env_line .env AI_API_KEY "$ai_api_key"
  write_env_line .env AI_BASE_URL "$ai_base_url"
  write_env_line .env AI_MODEL "$ai_model"
  write_env_line .env UNKEY_ROOT_KEY "$(prompt_value UNKEY_ROOT_KEY "" true true)"
  write_env_line .env UNKEY_API_ID "$(prompt_value UNKEY_API_ID "" true false)"
  write_env_line .env UNKEY_BASE_URL "$(prompt_value UNKEY_BASE_URL "" false false)"
  write_env_line .env MCP_TOKEN_ENCRYPTION_KEY "$(prompt_value MCP_TOKEN_ENCRYPTION_KEY "" true true)"
  write_env_line .env SLACK_TOKEN_ENCRYPTION_KEY "$(prompt_value SLACK_TOKEN_ENCRYPTION_KEY "" false true)"
  write_env_line .env TWO_FACTOR_ENCRYPTION_KEY "$(prompt_value TWO_FACTOR_ENCRYPTION_KEY "" false true)"
  write_env_line .env ENABLE_DEV_TRIGGERS "$(prompt_value ENABLE_DEV_TRIGGERS "false" true false)"
  write_env_line .env PLATFORM_ADMIN_EMAILS "$(prompt_value PLATFORM_ADMIN_EMAILS "" false false)"
  write_env_line .env S3_ENDPOINT "$(prompt_value S3_ENDPOINT "" false false)"
  write_env_line .env S3_REGION "$(prompt_value S3_REGION "auto" true false)"
  write_env_line .env S3_BUCKET "$(prompt_value S3_BUCKET "" false false)"
  write_env_line .env S3_ACCESS_KEY_ID "$(prompt_value S3_ACCESS_KEY_ID "" false true)"
  write_env_line .env S3_SECRET_ACCESS_KEY "$(prompt_value S3_SECRET_ACCESS_KEY "" false true)"
  write_env_line .env S3_PUBLIC_URL "$(prompt_value S3_PUBLIC_URL "https://cdn.$app_domain" false false)"
  write_env_line .env GITHUB_OAUTH_CLIENT_ID "$(prompt_value GITHUB_OAUTH_CLIENT_ID "" false false)"
  write_env_line .env GITHUB_OAUTH_CLIENT_SECRET "$(prompt_value GITHUB_OAUTH_CLIENT_SECRET "" false true)"
  write_env_line .env SLACK_CLIENT_ID "$(prompt_value SLACK_CLIENT_ID "" false false)"
  write_env_line .env SLACK_CLIENT_SECRET "$(prompt_value SLACK_CLIENT_SECRET "" false true)"
  write_env_line .env SLACK_SIGNING_SECRET "$(prompt_value SLACK_SIGNING_SECRET "" false true)"

  : > .env.mcp
  write_env_line .env.mcp PORT "3001"
  write_env_line .env.mcp DATABASE_URL "$database_url"
  write_env_line .env.mcp APP_URL "$final_app_url"
  write_env_line .env.mcp MCP_RESOURCE_URL "$final_mcp_resource_url"

  : > .env.bot
  write_env_line .env.bot PORT "3002"
  write_env_line .env.bot DATABASE_URL "$database_url"
  write_env_line .env.bot APP_URL "$final_app_url"
  write_env_line .env.bot AI_API_KEY "$(prompt_value AI_API_KEY "$ai_api_key" true true)"
  write_env_line .env.bot AI_BASE_URL "$(prompt_value AI_BASE_URL "$ai_base_url" true false)"
  write_env_line .env.bot AI_MODEL "$(prompt_value AI_MODEL "$ai_model" true false)"
  write_env_line .env.bot DISCORD_BOT_TOKEN "$(prompt_value DISCORD_BOT_TOKEN "" true true)"
  write_env_line .env.bot DISCORD_APPLICATION_ID "$(prompt_value DISCORD_APPLICATION_ID "" true false)"

  if [ "$use_postgres" = "true" ]; then
    printf 'COMPOSE_INCLUDE_POSTGRES=true\n' > .env.compose
  else
    printf 'COMPOSE_INCLUDE_POSTGRES=false\n' > .env.compose
  fi

  chmod 600 .env .env.mcp .env.bot .env.compose
}

main() {
  install_docker
  local docker_cmd
  docker_cmd="$(select_docker_cmd)"
  clone_or_update_repo
  configure_env_files

  cd "$INSTALL_DIR"
  DOCKER_CMD="$docker_cmd" ./docker/start.sh

  cat <<EOF

Produktive is starting.

Install directory: $INSTALL_DIR
App domain: $(grep '^APP_DOMAIN=' "$INSTALL_DIR/.env" | cut -d= -f2- | tr -d '"')

Useful commands:
  cd $INSTALL_DIR
  ./docker/start.sh
  ./docker/stop.sh
  ./docker/restart.sh

EOF
}

main

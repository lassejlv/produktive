use std::collections::HashSet;

use crate::ast::*;
use crate::diagnostic::{Diagnostic, Severity};
use crate::parse::parse;

#[derive(Debug, Clone)]
pub struct Validation {
    pub doc: Option<Document>,
    pub diagnostics: Vec<Diagnostic>,
}

impl Validation {
    pub fn ok(&self) -> bool {
        !self.diagnostics.iter().any(Diagnostic::is_error)
    }
}

pub fn parse_and_validate(src: &str) -> Validation {
    match parse(src) {
        Ok(doc) => {
            let diagnostics = validate(&doc);
            Validation {
                doc: Some(doc),
                diagnostics,
            }
        }
        Err(e) => Validation {
            doc: None,
            diagnostics: vec![Diagnostic::error(e.line, e.col, e.message)],
        },
    }
}

pub fn validate(doc: &Document) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();

    validate_sets(doc, &mut diagnostics);
    validate_rules(doc, &mut diagnostics);
    validate_required_monitor_shape(doc, &mut diagnostics);

    diagnostics
}

pub fn has_errors(diagnostics: &[Diagnostic]) -> bool {
    diagnostics.iter().any(|d| d.severity == Severity::Error)
}

fn validate_sets(doc: &Document, diagnostics: &mut Vec<Diagnostic>) {
    let mut seen = HashSet::new();
    for set in &doc.sets {
        let path = set.path.join(".");
        if !seen.insert(path.clone()) {
            diagnostics.push(Diagnostic::error(
                1,
                1,
                format!("duplicate `set {path}` declaration"),
            ));
        }

        match path.as_str() {
            "schedule.interval" => validate_duration_or_number(
                &set.value,
                diagnostics,
                "schedule.interval must be a duration or number of seconds",
            ),
            "schedule.timeout" => validate_duration_or_number(
                &set.value,
                diagnostics,
                "schedule.timeout must be a duration or number of milliseconds",
            ),
            "params.config" => validate_config_block(&set.value, diagnostics),
            _ => diagnostics.push(Diagnostic::warning(
                1,
                1,
                format!("unknown `set {path}` path will be ignored"),
            )),
        }
    }
}

fn validate_config_block(value: &Value, diagnostics: &mut Vec<Diagnostic>) {
    let Value::Block { entries } = value else {
        diagnostics.push(Diagnostic::error(
            1,
            1,
            "params.config must be an object block",
        ));
        return;
    };

    let mut seen = HashSet::new();
    for entry in entries {
        if !seen.insert(entry.key.clone()) {
            diagnostics.push(Diagnostic::error(
                1,
                1,
                format!("duplicate params.config key `{}`", entry.key),
            ));
        }

        match entry.key.as_str() {
            "url" | "host" => validate_string(
                &entry.value,
                diagnostics,
                format!("params.config.{} must be a string", entry.key),
            ),
            "port" | "expected_status" | "expected.status" => validate_number(
                &entry.value,
                diagnostics,
                format!("params.config.{} must be a number", entry.key),
            ),
            "timeout" => validate_duration_or_number(
                &entry.value,
                diagnostics,
                "params.config.timeout must be a duration or number of milliseconds",
            ),
            "expected_body_contains" | "expected.body" => validate_string(
                &entry.value,
                diagnostics,
                format!("params.config.{} must be a string", entry.key),
            ),
            "query" | "command" => validate_string(
                &entry.value,
                diagnostics,
                format!("params.config.{} must be a string", entry.key),
            ),
            "headers" => validate_headers(&entry.value, diagnostics),
            _ => diagnostics.push(Diagnostic::warning(
                1,
                1,
                format!("unknown params.config key `{}` will be ignored", entry.key),
            )),
        }
    }
}

fn validate_headers(value: &Value, diagnostics: &mut Vec<Diagnostic>) {
    let Value::Block { entries } = value else {
        diagnostics.push(Diagnostic::error(
            1,
            1,
            "params.config.headers must be an object block",
        ));
        return;
    };

    let mut seen = HashSet::new();
    for header in entries {
        if !seen.insert(header.key.to_ascii_lowercase()) {
            diagnostics.push(Diagnostic::warning(
                1,
                1,
                format!(
                    "duplicate header `{}`; later value may be ignored",
                    header.key
                ),
            ));
        }

        match header.value {
            Value::String(_) | Value::Number(_) => {}
            Value::Env { .. } => diagnostics.push(Diagnostic::error(
                1,
                1,
                format!("header `{}` cannot use env()", header.key),
            )),
            _ => diagnostics.push(Diagnostic::error(
                1,
                1,
                format!("header `{}` must be a string or number", header.key),
            )),
        }
    }
}

fn validate_rules(doc: &Document, diagnostics: &mut Vec<Diagnostic>) {
    let mut seen_else = false;
    for (idx, rule) in doc.rules.iter().enumerate() {
        match rule.kind {
            RuleKind::Else => {
                if seen_else {
                    diagnostics.push(Diagnostic::error(1, 1, "duplicate `else` rule"));
                }
                if idx + 1 != doc.rules.len() {
                    diagnostics.push(Diagnostic::error(1, 1, "`else` rule must be last"));
                }
                seen_else = true;
            }
            RuleKind::If { .. } if seen_else => diagnostics.push(Diagnostic::error(
                1,
                1,
                "rules after `else` are unreachable",
            )),
            RuleKind::If { .. } => {}
        }
    }
}

fn validate_required_monitor_shape(doc: &Document, diagnostics: &mut Vec<Diagnostic>) {
    if doc.sets.is_empty() && doc.rules.is_empty() && doc.type_decl.is_none() {
        diagnostics.push(Diagnostic::warning(1, 1, "empty DSL document"));
        return;
    }

    if doc.type_decl.is_none() {
        diagnostics.push(Diagnostic::warning(
            1,
            1,
            "missing `type`; monitor kind must be provided outside the DSL",
        ));
    }

    if !has_config_target(doc) {
        diagnostics.push(Diagnostic::warning(
            1,
            1,
            "missing params.config.url or params.config.host; monitor target must be provided outside the DSL",
        ));
    }
}

fn has_config_target(doc: &Document) -> bool {
    doc.sets.iter().any(|set| {
        set.path.as_slice() == ["params", "config"]
            && matches!(&set.value, Value::Block { entries } if entries.iter().any(|entry| {
                matches!(entry.key.as_str(), "url" | "host") && matches!(entry.value, Value::String(_))
            }))
    })
}

fn validate_duration_or_number(
    value: &Value,
    diagnostics: &mut Vec<Diagnostic>,
    message: impl Into<String>,
) {
    if !matches!(value, Value::Duration { .. } | Value::Number(_)) {
        diagnostics.push(Diagnostic::error(1, 1, message));
    }
}

fn validate_string(value: &Value, diagnostics: &mut Vec<Diagnostic>, message: impl Into<String>) {
    if !matches!(value, Value::String(_)) {
        diagnostics.push(Diagnostic::error(1, 1, message));
    }
}

fn validate_number(value: &Value, diagnostics: &mut Vec<Diagnostic>, message: impl Into<String>) {
    if !matches!(value, Value::Number(_)) {
        diagnostics.push(Diagnostic::error(1, 1, message));
    }
}

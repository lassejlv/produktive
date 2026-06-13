use crate::ast::*;

/// Projection of a DSL document into the shape of the existing Monitor record.
#[derive(Debug, Clone, Default)]
pub struct Projection {
    pub kind: Option<TypeKind>,
    pub target: Option<String>,
    pub interval_seconds: Option<i32>,
    pub timeout_ms: Option<i32>,
    pub expected_status: Option<i32>,
    pub expected_body_contains: Option<String>,
    pub headers: Vec<(String, ProjectedHeaderValue)>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ProjectedHeaderValue {
    Literal(String),
    Env(String),
}

pub fn project(doc: &Document) -> Projection {
    let mut p = Projection {
        kind: doc.type_decl,
        ..Default::default()
    };

    for set in &doc.sets {
        let path = set.path.join(".");
        match path.as_str() {
            "schedule.interval" => {
                if let Some(secs) = duration_to_seconds(&set.value) {
                    p.interval_seconds = Some(secs as i32);
                } else if let Some(n) = number_value(&set.value) {
                    p.interval_seconds = Some(n as i32);
                }
            }
            "schedule.timeout" => {
                if let Some(ms) = duration_to_ms(&set.value) {
                    p.timeout_ms = Some(ms as i32);
                } else if let Some(n) = number_value(&set.value) {
                    p.timeout_ms = Some(n as i32);
                }
            }
            "params.config" => {
                if let Value::Block { entries } = &set.value {
                    apply_config_block(&mut p, entries);
                }
            }
            _ => {}
        }
    }

    p
}

fn apply_config_block(p: &mut Projection, entries: &[BlockEntry]) {
    let mut host = None::<String>;
    let mut port = None::<u64>;

    for entry in entries {
        match entry.key.as_str() {
            "url" => {
                if let Value::String(s) = &entry.value {
                    p.target = Some(s.clone());
                }
            }
            "host" => {
                if let Value::String(s) = &entry.value {
                    host = Some(s.clone());
                }
            }
            "port" => {
                if let Value::Number(n) = &entry.value {
                    port = Some(*n as u64);
                }
            }
            "timeout" => {
                if let Some(ms) = duration_to_ms(&entry.value) {
                    p.timeout_ms = Some(ms as i32);
                } else if let Some(n) = number_value(&entry.value) {
                    p.timeout_ms = Some(n as i32);
                }
            }
            "expected_status" | "expected.status" => {
                if let Some(n) = number_value(&entry.value) {
                    p.expected_status = Some(n as i32);
                }
            }
            "expected_body_contains" | "expected.body" => {
                if let Value::String(s) = &entry.value {
                    p.expected_body_contains = Some(s.clone());
                }
            }
            "headers" => {
                if let Value::Block { entries } = &entry.value {
                    for header in entries {
                        let v = match &header.value {
                            Value::String(s) => Some(ProjectedHeaderValue::Literal(s.clone())),
                            Value::Number(n) => Some(ProjectedHeaderValue::Literal(format_num(*n))),
                            Value::Env { key } => Some(ProjectedHeaderValue::Env(key.clone())),
                            _ => None,
                        };
                        if let Some(v) = v {
                            p.headers.push((header.key.clone(), v));
                        }
                    }
                }
            }
            _ => {}
        }
    }

    if p.target.is_none() {
        if let Some(host) = host {
            p.target = match port {
                Some(port) if !host.contains(':') => Some(format!("{host}:{port}")),
                _ => Some(host),
            };
        }
    }
}

fn number_value(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => Some(*n),
        _ => None,
    }
}

fn duration_to_ms(v: &Value) -> Option<u64> {
    match v {
        Value::Duration { ms } => Some(*ms),
        _ => None,
    }
}

fn duration_to_seconds(v: &Value) -> Option<u64> {
    duration_to_ms(v).map(|ms| ms / 1000)
}

fn format_num(n: f64) -> String {
    if n.fract() == 0.0 && n.abs() < 1e16 {
        format!("{}", n as i64)
    } else {
        format!("{n}")
    }
}

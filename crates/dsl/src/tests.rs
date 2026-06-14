#![cfg(test)]
use crate::*;
use serde_json::json;

const SAMPLE: &str = r#"
type http

set params.config {
  url: "https://api.acme.com/health"
  timeout: 5s
  headers: {
    "x-api-key": "secret"
  }
}

set schedule.interval 60s

rules {
  if result.status == 200 -> ok
  if result.status >= 500 -> down with "5xx response"
  if result.latency_ms > 2000 -> warn with "slow"
  else -> ok
}
"#;

#[test]
fn parses_full_document() {
    let doc = parse(SAMPLE).expect("parse");
    assert_eq!(doc.type_decl, Some(TypeKind::Http));
    assert_eq!(doc.sets.len(), 2);
    assert_eq!(doc.rules.len(), 4);
}

#[test]
fn parses_protocol_checker_types() {
    for (source, expected) in [
        ("type postgres", TypeKind::Postgres),
        ("type redis", TypeKind::Redis),
        ("type ssh", TypeKind::Ssh),
    ] {
        let doc = parse(source).expect("parse");
        assert_eq!(doc.type_decl, Some(expected));
    }
}

#[test]
fn projects_to_monitor_columns() {
    let doc = parse(SAMPLE).expect("parse");
    let p = project(&doc);
    assert_eq!(p.kind, Some(TypeKind::Http));
    assert_eq!(p.target.as_deref(), Some("https://api.acme.com/health"));
    assert_eq!(p.interval_seconds, Some(60));
    assert_eq!(p.timeout_ms, Some(5000));
    assert_eq!(p.headers.len(), 1);
}

#[test]
fn projects_query_checker_config() {
    let doc = parse(
        r#"
type postgres
set params.config {
  url: "postgres://user:pass@db.example.com/app"
  query: "select 1"
}
"#,
    )
    .expect("parse");
    let p = project(&doc);
    assert_eq!(
        p.target.as_deref(),
        Some("postgres://user:pass@db.example.com/app")
    );
    assert_eq!(p.query.as_deref(), Some("select 1"));
}

#[test]
fn rejects_env_headers() {
    let validation = parse_and_validate(
        r#"
type http
set params.config {
  url: "https://api.acme.com/health"
  headers: {
    "x-api-key": env("API_KEY")
  }
}
"#,
    );

    assert!(has_errors(&validation.diagnostics));
    assert!(validation
        .diagnostics
        .iter()
        .any(|d| d.message == "header `x-api-key` cannot use env()"));
}

#[test]
fn evals_rules_pick_first_match() {
    let doc = parse(SAMPLE).expect("parse");
    let ctx = Context::new().put(
        "result",
        json!({"status": 503, "latency_ms": 100, "body": ""}),
    );
    let out = eval_rules(&doc.rules, &ctx).expect("matched");
    assert_eq!(out.kind, OutcomeKind::Down);
    assert_eq!(out.message.as_deref(), Some("5xx response"));
}

#[test]
fn evals_else_fallback() {
    let doc = parse("rules {\n  if result.status == 0 -> down\n  else -> ok\n}").expect("parse");
    let ctx = Context::new().put("result", json!({"status": 200}));
    let out = eval_rules(&doc.rules, &ctx).expect("matched");
    assert_eq!(out.kind, OutcomeKind::Ok);
}

#[test]
fn parse_error_has_position() {
    let err = parse("type bogus").unwrap_err();
    assert_eq!(err.line, 1);
    assert!(err.message.contains("expected http"));
}

#[test]
fn round_trip_print_then_parse() {
    let doc = parse(SAMPLE).expect("parse");
    let printed = print(&doc);
    let doc2 = parse(&printed).expect("reparse");
    assert_eq!(doc.type_decl, doc2.type_decl);
    assert_eq!(doc.rules.len(), doc2.rules.len());
    assert_eq!(doc.sets.len(), doc2.sets.len());
}

#[test]
fn contains_and_matches() {
    let doc =
        parse("rules { if result.body contains \"ok\" -> ok\n  if result.body matches \"err*\" -> down\n  else -> warn }")
            .expect("parse");
    let ok = eval_rules(
        &doc.rules,
        &Context::new().put("result", json!({"body": "all-ok"})),
    )
    .unwrap();
    assert_eq!(ok.kind, OutcomeKind::Ok);
    let down = eval_rules(
        &doc.rules,
        &Context::new().put("result", json!({"body": "err-500"})),
    )
    .unwrap();
    assert_eq!(down.kind, OutcomeKind::Down);
    let warn = eval_rules(
        &doc.rules,
        &Context::new().put("result", json!({"body": "neutral"})),
    )
    .unwrap();
    assert_eq!(warn.kind, OutcomeKind::Warn);
}

#[test]
fn parse_declare_block() {
    let src = r#"
declare result.json {
  status: string
  data: {
    id: number
    name: string
  }
  items: [{ code: string }]
}
"#;
    let doc = parse(src).expect("parse");
    assert_eq!(doc.declares.len(), 1);
    let d = &doc.declares[0];
    assert_eq!(d.path, vec!["result", "json"]);
    match &d.shape {
        TypeShape::Object { fields } => {
            assert_eq!(fields.len(), 3);
            assert_eq!(fields[0].key, "status");
            assert!(matches!(
                fields[0].shape,
                TypeShape::Prim {
                    name: PrimType::String
                }
            ));
            match &fields[2].shape {
                TypeShape::Array { items } => match items.as_ref() {
                    TypeShape::Object { fields: inner } => {
                        assert_eq!(inner.len(), 1);
                        assert_eq!(inner[0].key, "code");
                    }
                    _ => panic!("expected object inside array"),
                },
                _ => panic!("expected array"),
            }
        }
        _ => panic!("expected object"),
    }
}

#[test]
fn declare_round_trip() {
    let src = r#"declare result.json {
  status: string
  count: number
}
rules { else -> ok }
"#;
    let doc = parse(src).expect("parse");
    let printed = print(&doc);
    let doc2 = parse(&printed).expect("reparse");
    assert_eq!(doc.declares, doc2.declares);
}

#[test]
fn rules_can_reference_declared_paths() {
    let src = r#"
declare result.json {
  status: string
}
rules {
  if result.json.status == "ok" -> ok
  else -> down
}
"#;
    let doc = parse(src).expect("parse");
    let ok_ctx = Context::new().put("result", json!({"json": {"status": "ok"}}));
    let down_ctx = Context::new().put("result", json!({"json": {"status": "err"}}));
    assert_eq!(
        eval_rules(&doc.rules, &ok_ctx).unwrap().kind,
        OutcomeKind::Ok
    );
    assert_eq!(
        eval_rules(&doc.rules, &down_ctx).unwrap().kind,
        OutcomeKind::Down
    );
}

#[test]
fn header_lookup() {
    let doc = parse(
        "rules { if result.headers[\"content-type\"] contains \"json\" -> ok\n else -> warn }",
    )
    .expect("parse");
    let ok = eval_rules(
        &doc.rules,
        &Context::new().put(
            "result",
            json!({"headers": {"content-type": "application/json"}}),
        ),
    )
    .unwrap();
    assert_eq!(ok.kind, OutcomeKind::Ok);
}

#[test]
fn validation_reports_invalid_config_types() {
    let validation = parse_and_validate(
        r#"
type http
set params.config {
  url: 123
  timeout: "fast"
}
"#,
    );
    assert!(!validation.ok());
    let messages = validation
        .diagnostics
        .iter()
        .map(|d| d.message.as_str())
        .collect::<Vec<_>>();
    assert!(messages.iter().any(|m| m.contains("params.config.url")));
    assert!(messages.iter().any(|m| m.contains("params.config.timeout")));
}

#[test]
fn validation_reports_else_ordering() {
    let validation = parse_and_validate(
        r#"
rules {
  else -> ok
  if result.status == 500 -> down
}
"#,
    );
    assert!(!validation.ok());
    assert!(validation
        .diagnostics
        .iter()
        .any(|d| d.message.contains("`else` rule must be last")));
}

#[test]
fn validation_warns_about_unknown_set_paths() {
    let validation = parse_and_validate(
        r#"
type http
set params.config {
  url: "https://example.com"
}
set unknown.value true
rules { else -> ok }
"#,
    );
    assert!(validation.ok());
    assert!(validation
        .diagnostics
        .iter()
        .any(|d| d.message.contains("unknown `set unknown.value`")));
}

#[test]
fn rejects_out_of_range_numbers_before_json_serialization() {
    let source = format!("set schedule.interval {}", "9".repeat(5_000));
    let err = parse(&source).unwrap_err();
    assert!(err.message.contains("out of range"));
}

#[test]
fn projects_tcp_host_and_port_regardless_of_order() {
    let doc = parse(
        r#"
type tcp
set params.config {
  port: 5432
  host: "db.example.com"
}
"#,
    )
    .expect("parse");
    let p = project(&doc);
    assert_eq!(p.target.as_deref(), Some("db.example.com:5432"));
}

#[test]
fn serializes_ast_values_for_validator_json() {
    let doc = parse(SAMPLE).expect("parse");
    let ast = serde_json::to_value(&doc).expect("serialize ast");
    let first_set_value = &ast["sets"][0]["value"];
    assert_eq!(first_set_value["type"], "block");
    assert_eq!(first_set_value["entries"][0]["value"]["type"], "string");
    assert_eq!(
        first_set_value["entries"][0]["value"]["value"],
        "https://api.acme.com/health"
    );
}

#[test]
fn rejects_deeply_nested_blocks() {
    let mut source = String::from("set params.config ");
    for _ in 0..140 {
        source.push_str("{ a: ");
    }
    source.push_str("\"x\"");
    for _ in 0..140 {
        source.push_str(" }");
    }

    let err = parse(&source).unwrap_err();
    assert!(err.message.contains("too deep"));
}

#[test]
fn rejects_deep_expression_chains() {
    let mut source = String::from("rules { if ");
    for _ in 0..140 {
        source.push('!');
    }
    source.push_str("true -> ok }");

    let err = parse(&source).unwrap_err();
    assert!(err.message.contains("too deep"));
}

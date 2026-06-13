use crate::ast::*;

pub fn print(doc: &Document) -> String {
    let mut out = String::new();
    if let Some(kind) = doc.type_decl {
        out.push_str("type ");
        out.push_str(match kind {
            TypeKind::Http => "http",
            TypeKind::Tcp => "tcp",
            TypeKind::Ping => "ping",
            TypeKind::Postgres => "postgres",
            TypeKind::Redis => "redis",
            TypeKind::Ssh => "ssh",
        });
        out.push_str("\n\n");
    }
    let mut first_set = true;
    for set in &doc.sets {
        if !first_set {
            out.push('\n');
        }
        first_set = false;
        out.push_str("set ");
        out.push_str(&set.path.join("."));
        out.push(' ');
        print_value(&set.value, 0, &mut out);
        out.push('\n');
    }
    for declare in &doc.declares {
        if !first_set || doc.type_decl.is_some() {
            out.push('\n');
        }
        first_set = false;
        out.push_str("declare ");
        out.push_str(&declare.path.join("."));
        out.push(' ');
        print_type_shape(&declare.shape, 0, &mut out);
        out.push('\n');
    }
    if !doc.rules.is_empty() {
        if !first_set || doc.type_decl.is_some() || !doc.declares.is_empty() {
            out.push('\n');
        }
        out.push_str("rules {\n");
        for rule in &doc.rules {
            out.push_str("  ");
            match &rule.kind {
                RuleKind::If { cond } => {
                    out.push_str("if ");
                    print_expr(cond, &mut out);
                }
                RuleKind::Else => out.push_str("else"),
            }
            out.push_str(" -> ");
            out.push_str(match rule.outcome {
                OutcomeNode::Ok => "ok",
                OutcomeNode::Warn => "warn",
                OutcomeNode::Down => "down",
            });
            if let Some(msg) = &rule.message {
                out.push_str(" with ");
                out.push_str(&quote_string(msg));
            }
            out.push('\n');
        }
        out.push_str("}\n");
    }
    out
}

fn indent(n: usize, out: &mut String) {
    for _ in 0..n {
        out.push_str("  ");
    }
}

fn print_value(v: &Value, depth: usize, out: &mut String) {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&format_num(*n)),
        Value::String(s) => out.push_str(&quote_string(s)),
        Value::Duration { ms } => out.push_str(&format_duration(*ms)),
        Value::Env { key } => {
            out.push_str("env(");
            out.push_str(&quote_string(key));
            out.push(')');
        }
        Value::Block { entries } => {
            out.push_str("{\n");
            for entry in entries {
                indent(depth + 1, out);
                if entry
                    .key
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_')
                    && !entry.key.is_empty()
                {
                    out.push_str(&entry.key);
                } else {
                    out.push_str(&quote_string(&entry.key));
                }
                out.push_str(": ");
                print_value(&entry.value, depth + 1, out);
                out.push('\n');
            }
            indent(depth, out);
            out.push('}');
        }
    }
}

fn print_type_shape(shape: &TypeShape, depth: usize, out: &mut String) {
    match shape {
        TypeShape::Prim { name } => out.push_str(match name {
            PrimType::String => "string",
            PrimType::Number => "number",
            PrimType::Bool => "bool",
            PrimType::Any => "any",
        }),
        TypeShape::Object { fields } => {
            out.push_str("{\n");
            for field in fields {
                indent(depth + 1, out);
                if field
                    .key
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_')
                    && !field.key.is_empty()
                {
                    out.push_str(&field.key);
                } else {
                    out.push_str(&quote_string(&field.key));
                }
                out.push_str(": ");
                print_type_shape(&field.shape, depth + 1, out);
                out.push('\n');
            }
            indent(depth, out);
            out.push('}');
        }
        TypeShape::Array { items } => {
            out.push('[');
            print_type_shape(items, depth, out);
            out.push(']');
        }
    }
}

fn print_expr(e: &Expr, out: &mut String) {
    match e {
        Expr::Lit { value } => match value {
            Lit::Null => out.push_str("null"),
            Lit::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
            Lit::Number(n) => out.push_str(&format_num(*n)),
            Lit::String(s) => out.push_str(&quote_string(s)),
        },
        Expr::Path { segments } => {
            for (i, s) in segments.iter().enumerate() {
                match s {
                    PathSeg::Ident { name } => {
                        if i > 0 {
                            out.push('.');
                        }
                        out.push_str(name);
                    }
                    PathSeg::Index { key } => {
                        out.push('[');
                        out.push_str(&quote_string(key));
                        out.push(']');
                    }
                }
            }
        }
        Expr::Not { expr } => {
            out.push_str("not ");
            print_expr(expr, out);
        }
        Expr::And { left, right } => {
            print_expr(left, out);
            out.push_str(" and ");
            print_expr(right, out);
        }
        Expr::Or { left, right } => {
            print_expr(left, out);
            out.push_str(" or ");
            print_expr(right, out);
        }
        Expr::Cmp { op, left, right } => {
            print_expr(left, out);
            out.push(' ');
            out.push_str(match op {
                CmpOp::Eq => "==",
                CmpOp::Neq => "!=",
                CmpOp::Lt => "<",
                CmpOp::Lte => "<=",
                CmpOp::Gt => ">",
                CmpOp::Gte => ">=",
                CmpOp::Contains => "contains",
                CmpOp::Matches => "matches",
                CmpOp::In => "in",
            });
            out.push(' ');
            print_expr(right, out);
        }
    }
}

fn quote_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\t' => out.push_str("\\t"),
            other => out.push(other),
        }
    }
    out.push('"');
    out
}

fn format_num(n: f64) -> String {
    if n.fract() == 0.0 && n.abs() < 1e16 {
        format!("{}", n as i64)
    } else {
        format!("{n}")
    }
}

fn format_duration(ms: u64) -> String {
    if ms == 0 {
        return "0ms".into();
    }
    if ms.is_multiple_of(3_600_000) {
        return format!("{}h", ms / 3_600_000);
    }
    if ms.is_multiple_of(60_000) {
        return format!("{}m", ms / 60_000);
    }
    if ms.is_multiple_of(1_000) {
        return format!("{}s", ms / 1_000);
    }
    format!("{}ms", ms)
}

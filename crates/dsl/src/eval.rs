use crate::ast::*;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

const MAX_EVAL_STEPS: usize = 10_000;
const MAX_EVAL_DEPTH: usize = 128;

#[derive(Debug, Clone, Default)]
pub struct Context {
    pub root: serde_json::Map<String, JsonValue>,
}

impl Context {
    pub fn new() -> Self {
        Self {
            root: serde_json::Map::new(),
        }
    }

    pub fn put<K: Into<String>>(mut self, key: K, value: JsonValue) -> Self {
        self.root.insert(key.into(), value);
        self
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OutcomeKind {
    Ok,
    Warn,
    Down,
}

impl From<OutcomeNode> for OutcomeKind {
    fn from(o: OutcomeNode) -> Self {
        match o {
            OutcomeNode::Ok => OutcomeKind::Ok,
            OutcomeNode::Warn => OutcomeKind::Warn,
            OutcomeNode::Down => OutcomeKind::Down,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Outcome {
    pub kind: OutcomeKind,
    pub message: Option<String>,
    pub rule_index: Option<usize>,
}

pub fn eval_rules(rules: &[Rule], ctx: &Context) -> Option<Outcome> {
    let mut budget = EvalBudget::default();
    for (i, rule) in rules.iter().enumerate() {
        let matched = match &rule.kind {
            RuleKind::If { cond } => to_bool(&eval_expr(cond, ctx, &mut budget, 0)),
            RuleKind::Else => true,
        };
        if matched {
            return Some(Outcome {
                kind: rule.outcome.clone().into(),
                message: rule.message.clone(),
                rule_index: Some(i),
            });
        }
    }
    None
}

#[derive(Debug, Clone)]
enum Val {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    List(Vec<Val>),
}

#[derive(Default)]
struct EvalBudget {
    steps: usize,
}

impl EvalBudget {
    fn enter(&mut self, depth: usize) -> bool {
        self.steps += 1;
        if self.steps > MAX_EVAL_STEPS || depth > MAX_EVAL_DEPTH {
            return false;
        }
        true
    }
}

fn to_bool(v: &Val) -> bool {
    match v {
        Val::Bool(b) => *b,
        Val::Null => false,
        Val::Num(n) => *n != 0.0,
        Val::Str(s) => !s.is_empty(),
        Val::List(xs) => !xs.is_empty(),
    }
}

fn eval_expr(e: &Expr, ctx: &Context, budget: &mut EvalBudget, depth: usize) -> Val {
    if !budget.enter(depth) {
        return Val::Null;
    }
    match e {
        Expr::Lit { value } => match value {
            Lit::Null => Val::Null,
            Lit::Bool(b) => Val::Bool(*b),
            Lit::Number(n) => Val::Num(*n),
            Lit::String(s) => Val::Str(s.clone()),
        },
        Expr::Path { segments } => lookup_path(&ctx.root, segments),
        Expr::Not { expr } => Val::Bool(!to_bool(&eval_expr(expr, ctx, budget, depth + 1))),
        Expr::And { left, right } => {
            let l = eval_expr(left, ctx, budget, depth + 1);
            if !to_bool(&l) {
                Val::Bool(false)
            } else {
                Val::Bool(to_bool(&eval_expr(right, ctx, budget, depth + 1)))
            }
        }
        Expr::Or { left, right } => {
            let l = eval_expr(left, ctx, budget, depth + 1);
            if to_bool(&l) {
                Val::Bool(true)
            } else {
                Val::Bool(to_bool(&eval_expr(right, ctx, budget, depth + 1)))
            }
        }
        Expr::Cmp { op, left, right } => {
            let l = eval_expr(left, ctx, budget, depth + 1);
            let r = eval_expr(right, ctx, budget, depth + 1);
            Val::Bool(cmp(*op, &l, &r))
        }
    }
}

fn lookup_path(root: &serde_json::Map<String, JsonValue>, segs: &[PathSeg]) -> Val {
    let mut cur = JsonValue::Object(root.clone());
    for s in segs {
        cur = match (cur, s) {
            (JsonValue::Object(map), PathSeg::Ident { name }) => {
                map.get(name).cloned().unwrap_or(JsonValue::Null)
            }
            (JsonValue::Object(map), PathSeg::Index { key }) => {
                map.get(key).cloned().unwrap_or(JsonValue::Null)
            }
            (JsonValue::Array(arr), PathSeg::Index { key }) => key
                .parse::<usize>()
                .ok()
                .and_then(|i| arr.get(i).cloned())
                .unwrap_or(JsonValue::Null),
            _ => JsonValue::Null,
        };
    }
    json_to_val(cur)
}

fn json_to_val(j: JsonValue) -> Val {
    match j {
        JsonValue::Null => Val::Null,
        JsonValue::Bool(b) => Val::Bool(b),
        JsonValue::Number(n) => n.as_f64().map(Val::Num).unwrap_or(Val::Null),
        JsonValue::String(s) => Val::Str(s),
        JsonValue::Array(arr) => Val::List(arr.into_iter().map(json_to_val).collect()),
        JsonValue::Object(_) => Val::Null,
    }
}

fn cmp(op: CmpOp, l: &Val, r: &Val) -> bool {
    use CmpOp::*;
    match op {
        Eq => val_eq(l, r),
        Neq => !val_eq(l, r),
        Lt => order(l, r)
            .map(|o| o == std::cmp::Ordering::Less)
            .unwrap_or(false),
        Lte => order(l, r)
            .map(|o| o != std::cmp::Ordering::Greater)
            .unwrap_or(false),
        Gt => order(l, r)
            .map(|o| o == std::cmp::Ordering::Greater)
            .unwrap_or(false),
        Gte => order(l, r)
            .map(|o| o != std::cmp::Ordering::Less)
            .unwrap_or(false),
        Contains => match (l, r) {
            (Val::Str(haystack), Val::Str(needle)) => haystack.contains(needle.as_str()),
            (Val::List(items), needle) => items.iter().any(|x| val_eq(x, needle)),
            _ => false,
        },
        Matches => match (l, r) {
            (Val::Str(s), Val::Str(pat)) => simple_glob_match(pat, s),
            _ => false,
        },
        In => match (l, r) {
            (item, Val::List(items)) => items.iter().any(|x| val_eq(x, item)),
            (Val::Str(needle), Val::Str(haystack)) => haystack.contains(needle.as_str()),
            _ => false,
        },
    }
}

fn val_eq(a: &Val, b: &Val) -> bool {
    match (a, b) {
        (Val::Null, Val::Null) => true,
        (Val::Bool(x), Val::Bool(y)) => x == y,
        (Val::Num(x), Val::Num(y)) => (x - y).abs() < f64::EPSILON,
        (Val::Str(x), Val::Str(y)) => x == y,
        (Val::Num(x), Val::Str(y)) | (Val::Str(y), Val::Num(x)) => y
            .parse::<f64>()
            .map(|n| (n - x).abs() < f64::EPSILON)
            .unwrap_or(false),
        _ => false,
    }
}

fn order(a: &Val, b: &Val) -> Option<std::cmp::Ordering> {
    match (a, b) {
        (Val::Num(x), Val::Num(y)) => x.partial_cmp(y),
        (Val::Str(x), Val::Str(y)) => Some(x.cmp(y)),
        (Val::Num(x), Val::Str(y)) => y.parse::<f64>().ok().and_then(|n| x.partial_cmp(&n)),
        (Val::Str(x), Val::Num(y)) => x.parse::<f64>().ok().and_then(|n| n.partial_cmp(y)),
        _ => None,
    }
}

/// dead-simple glob — supports `*` only, case-sensitive
fn simple_glob_match(pat: &str, s: &str) -> bool {
    if !pat.contains('*') {
        return pat == s;
    }
    let parts: Vec<&str> = pat.split('*').collect();
    let mut idx = 0;
    let first = parts.first().copied().unwrap_or("");
    if !s[idx..].starts_with(first) {
        return false;
    }
    idx += first.len();
    for (i, part) in parts.iter().enumerate().skip(1) {
        if i == parts.len() - 1 {
            return s[idx..].ends_with(part);
        }
        match s[idx..].find(part) {
            Some(pos) => idx += pos + part.len(),
            None => return false,
        }
    }
    true
}

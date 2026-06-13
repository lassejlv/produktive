use serde::{ser::SerializeMap, Deserialize, Serialize, Serializer};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Document {
    pub version: u32,
    pub type_decl: Option<TypeKind>,
    pub sets: Vec<SetStmt>,
    #[serde(default)]
    pub declares: Vec<DeclareStmt>,
    pub rules: Vec<Rule>,
}

impl Default for Document {
    fn default() -> Self {
        Self {
            version: 1,
            type_decl: None,
            sets: Vec::new(),
            declares: Vec::new(),
            rules: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeclareStmt {
    pub path: Vec<String>,
    pub shape: TypeShape,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TypeShape {
    Prim { name: PrimType },
    Object { fields: Vec<TypeField> },
    Array { items: Box<TypeShape> },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PrimType {
    String,
    Number,
    Bool,
    Any,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TypeField {
    pub key: String,
    pub shape: TypeShape,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TypeKind {
    Http,
    Tcp,
    Ping,
    Postgres,
    Redis,
    Ssh,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SetStmt {
    pub path: Vec<String>,
    pub value: Value,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Value {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Duration { ms: u64 },
    Env { key: String },
    Block { entries: Vec<BlockEntry> },
}

impl Serialize for Value {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(None)?;
        match self {
            Value::Null => {
                map.serialize_entry("type", "null")?;
            }
            Value::Bool(value) => {
                map.serialize_entry("type", "bool")?;
                map.serialize_entry("value", value)?;
            }
            Value::Number(value) => {
                map.serialize_entry("type", "number")?;
                map.serialize_entry("value", value)?;
            }
            Value::String(value) => {
                map.serialize_entry("type", "string")?;
                map.serialize_entry("value", value)?;
            }
            Value::Duration { ms } => {
                map.serialize_entry("type", "duration")?;
                map.serialize_entry("ms", ms)?;
            }
            Value::Env { key } => {
                map.serialize_entry("type", "env")?;
                map.serialize_entry("key", key)?;
            }
            Value::Block { entries } => {
                map.serialize_entry("type", "block")?;
                map.serialize_entry("entries", entries)?;
            }
        }
        map.end()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BlockEntry {
    pub key: String,
    pub value: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Rule {
    pub kind: RuleKind,
    pub outcome: OutcomeNode,
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RuleKind {
    If { cond: Expr },
    Else,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OutcomeNode {
    Ok,
    Warn,
    Down,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "node", rename_all = "snake_case")]
pub enum Expr {
    Lit {
        value: Lit,
    },
    Path {
        segments: Vec<PathSeg>,
    },
    Not {
        expr: Box<Expr>,
    },
    And {
        left: Box<Expr>,
        right: Box<Expr>,
    },
    Or {
        left: Box<Expr>,
        right: Box<Expr>,
    },
    Cmp {
        op: CmpOp,
        left: Box<Expr>,
        right: Box<Expr>,
    },
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Lit {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
}

impl Serialize for Lit {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(None)?;
        match self {
            Lit::Null => {
                map.serialize_entry("type", "null")?;
            }
            Lit::Bool(value) => {
                map.serialize_entry("type", "bool")?;
                map.serialize_entry("value", value)?;
            }
            Lit::Number(value) => {
                map.serialize_entry("type", "number")?;
                map.serialize_entry("value", value)?;
            }
            Lit::String(value) => {
                map.serialize_entry("type", "string")?;
                map.serialize_entry("value", value)?;
            }
        }
        map.end()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PathSeg {
    Ident { name: String },
    Index { key: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CmpOp {
    Eq,
    Neq,
    Lt,
    Lte,
    Gt,
    Gte,
    Contains,
    Matches,
    In,
}

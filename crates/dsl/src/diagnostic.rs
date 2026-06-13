use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warning,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Diagnostic {
    pub severity: Severity,
    pub message: String,
    pub line: u32,
    pub col: u32,
}

impl Diagnostic {
    pub fn error(line: u32, col: u32, message: impl Into<String>) -> Self {
        Self {
            severity: Severity::Error,
            message: message.into(),
            line,
            col,
        }
    }

    pub fn warning(line: u32, col: u32, message: impl Into<String>) -> Self {
        Self {
            severity: Severity::Warning,
            message: message.into(),
            line,
            col,
        }
    }

    pub fn is_error(&self) -> bool {
        self.severity == Severity::Error
    }
}

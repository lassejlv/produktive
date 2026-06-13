//! unstatus DSL — monitor-as-code.
//!
//! Document shape:
//! ```text
//! type http
//!
//! set params.config {
//!   url: "https://api.acme.com/health"
//!   timeout: 5s
//!   headers: {
//!     "x-api-key": "secret"
//!   }
//! }
//!
//! set schedule.interval 60s
//!
//! rules {
//!   if result.status == 200    -> ok
//!   if result.status >= 500    -> down with "5xx response"
//!   if result.latency_ms > 2000 -> warn
//!   else                        -> ok
//! }
//! ```

pub mod ast;
pub mod diagnostic;
pub mod eval;
pub mod lex;
pub mod parse;
pub mod print;
pub mod project;
pub mod validate;

#[cfg(test)]
mod tests;

pub use ast::*;
pub use diagnostic::{Diagnostic, Severity};
pub use eval::{eval_rules, Context, Outcome, OutcomeKind};
pub use parse::{parse, ParseError};
pub use print::print;
pub use project::{project, ProjectedHeaderValue, Projection};
pub use validate::{has_errors, parse_and_validate, validate, Validation};

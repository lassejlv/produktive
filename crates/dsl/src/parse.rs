use crate::ast::*;
use crate::lex::{lex, LexError, Tok, Token};
use thiserror::Error;

const MAX_SOURCE_BYTES: usize = 64 * 1024;
const MAX_TOKENS: usize = 8_192;
const MAX_PARSE_STEPS: usize = 20_000;
const MAX_PARSE_DEPTH: usize = 128;

#[derive(Debug, Error)]
#[error("parse error at {line}:{col}: {message}")]
pub struct ParseError {
    pub message: String,
    pub line: u32,
    pub col: u32,
}

impl From<LexError> for ParseError {
    fn from(e: LexError) -> Self {
        ParseError {
            message: e.message,
            line: e.line,
            col: e.col,
        }
    }
}

pub fn parse(src: &str) -> Result<Document, ParseError> {
    if src.len() > MAX_SOURCE_BYTES {
        return Err(ParseError {
            message: "DSL source is too large".into(),
            line: 1,
            col: 1,
        });
    }
    let tokens = lex(src)?;
    if tokens.len() > MAX_TOKENS {
        return Err(ParseError {
            message: "DSL source has too many tokens".into(),
            line: 1,
            col: 1,
        });
    }
    let mut p = Parser {
        toks: tokens,
        i: 0,
        steps: 0,
    };
    p.skip_newlines();
    let mut doc = Document::default();
    while !p.at_eof() {
        match &p.peek().tok {
            Tok::Type => {
                p.advance();
                let kind_tok = p.advance();
                let kind = match &kind_tok.tok {
                    Tok::Ident(s) if s == "http" => TypeKind::Http,
                    Tok::Ident(s) if s == "tcp" => TypeKind::Tcp,
                    Tok::Ident(s) if s == "ping" => TypeKind::Ping,
                    Tok::Ident(s) if s == "postgres" => TypeKind::Postgres,
                    Tok::Ident(s) if s == "redis" => TypeKind::Redis,
                    Tok::Ident(s) if s == "ssh" => TypeKind::Ssh,
                    other => {
                        return Err(p.err_at(
                            kind_tok.line,
                            kind_tok.col,
                            format!(
                                "expected http|tcp|ping|postgres|redis|ssh after `type`, got `{other}`"
                            ),
                        ));
                    }
                };
                if doc.type_decl.is_some() {
                    return Err(p.err_at(
                        kind_tok.line,
                        kind_tok.col,
                        "duplicate `type` declaration".into(),
                    ));
                }
                doc.type_decl = Some(kind);
                p.consume_end()?;
            }
            Tok::Set => {
                p.advance();
                let path = p.parse_path_idents()?;
                let value = p.parse_value()?;
                doc.sets.push(SetStmt { path, value });
                p.consume_end()?;
            }
            Tok::Rules => {
                p.advance();
                p.expect(&Tok::LBrace, "expected `{` after `rules`")?;
                p.skip_newlines();
                while !matches!(p.peek().tok, Tok::RBrace) {
                    let rule = p.parse_rule()?;
                    doc.rules.push(rule);
                    p.skip_newlines();
                }
                p.expect(&Tok::RBrace, "expected `}` to close rules block")?;
                p.consume_end()?;
            }
            Tok::Declare => {
                p.advance();
                let path = p.parse_path_idents()?;
                let shape = p.parse_type_shape()?;
                doc.declares.push(DeclareStmt { path, shape });
                p.consume_end()?;
            }
            Tok::Newline => {
                p.advance();
            }
            other => {
                let t = p.peek().clone();
                return Err(p.err_at(t.line, t.col, format!("unexpected `{other}` at top level")));
            }
        }
    }
    Ok(doc)
}

struct Parser {
    toks: Vec<Token>,
    i: usize,
    steps: usize,
}

impl Parser {
    fn step(&mut self) -> Result<(), ParseError> {
        self.steps += 1;
        if self.steps > MAX_PARSE_STEPS {
            let t = self.peek().clone();
            return Err(self.err_at(t.line, t.col, "DSL source is too complex".into()));
        }
        Ok(())
    }

    fn check_depth(&self, depth: usize, line: u32, col: u32) -> Result<(), ParseError> {
        if depth > MAX_PARSE_DEPTH {
            return Err(self.err_at(line, col, "DSL nesting is too deep".into()));
        }
        Ok(())
    }

    fn peek(&self) -> &Token {
        &self.toks[self.i]
    }

    fn advance(&mut self) -> Token {
        let t = self.toks[self.i].clone();
        if self.i + 1 < self.toks.len() {
            self.i += 1;
        }
        t
    }

    fn at_eof(&self) -> bool {
        matches!(self.peek().tok, Tok::Eof)
    }

    fn expect(&mut self, want: &Tok, msg: &str) -> Result<Token, ParseError> {
        let t = self.peek().clone();
        if std::mem::discriminant(&t.tok) == std::mem::discriminant(want) {
            Ok(self.advance())
        } else {
            Err(self.err_at(t.line, t.col, format!("{msg} (got `{}`)", t.tok)))
        }
    }

    fn skip_newlines(&mut self) {
        while matches!(self.peek().tok, Tok::Newline) {
            self.advance();
        }
    }

    fn consume_end(&mut self) -> Result<(), ParseError> {
        if matches!(self.peek().tok, Tok::Newline | Tok::Eof) {
            self.skip_newlines();
            Ok(())
        } else {
            let t = self.peek().clone();
            Err(self.err_at(t.line, t.col, format!("expected newline, got `{}`", t.tok)))
        }
    }

    fn err_at(&self, line: u32, col: u32, message: String) -> ParseError {
        ParseError { message, line, col }
    }

    fn parse_path_idents(&mut self) -> Result<Vec<String>, ParseError> {
        let head = self.advance();
        let first = match head.tok {
            Tok::Ident(s) => s,
            other => {
                return Err(self.err_at(
                    head.line,
                    head.col,
                    format!("expected identifier, got `{other}`"),
                ))
            }
        };
        let mut path = vec![first];
        while matches!(self.peek().tok, Tok::Dot) {
            self.advance();
            let nxt = self.advance();
            let seg = match nxt.tok {
                Tok::Ident(s) => s,
                other => {
                    return Err(self.err_at(
                        nxt.line,
                        nxt.col,
                        format!("expected identifier after `.`, got `{other}`"),
                    ))
                }
            };
            path.push(seg);
        }
        Ok(path)
    }

    fn parse_value(&mut self) -> Result<Value, ParseError> {
        self.parse_value_at(0)
    }

    fn parse_value_at(&mut self, depth: usize) -> Result<Value, ParseError> {
        self.step()?;
        let t = self.peek().clone();
        self.check_depth(depth, t.line, t.col)?;
        match t.tok {
            Tok::LBrace => self.parse_block(depth + 1),
            Tok::Str(_)
            | Tok::Number(_)
            | Tok::Duration(_)
            | Tok::True
            | Tok::False
            | Tok::Null
            | Tok::Env => self.parse_scalar(),
            other => Err(self.err_at(t.line, t.col, format!("expected value, got `{other}`"))),
        }
    }

    fn parse_block(&mut self, depth: usize) -> Result<Value, ParseError> {
        let start = self.expect(&Tok::LBrace, "expected `{`")?;
        self.check_depth(depth, start.line, start.col)?;
        let mut entries = Vec::new();
        self.skip_newlines();
        while !matches!(self.peek().tok, Tok::RBrace) {
            self.step()?;
            let key_tok = self.advance();
            let key = match key_tok.tok {
                Tok::Ident(s) => s,
                Tok::Str(s) => s,
                other => {
                    return Err(self.err_at(
                        key_tok.line,
                        key_tok.col,
                        format!("expected key, got `{other}`"),
                    ))
                }
            };
            self.expect(&Tok::Colon, "expected `:` after key")?;
            let value = self.parse_value_at(depth + 1)?;
            entries.push(BlockEntry { key, value });
            // optional comma / newline separator
            if matches!(self.peek().tok, Tok::Comma) {
                self.advance();
            }
            self.skip_newlines();
        }
        self.expect(&Tok::RBrace, "expected `}`")?;
        Ok(Value::Block { entries })
    }

    fn parse_scalar(&mut self) -> Result<Value, ParseError> {
        let t = self.advance();
        match t.tok {
            Tok::Str(s) => Ok(Value::String(s)),
            Tok::Number(n) => Ok(Value::Number(n)),
            Tok::Duration(ms) => Ok(Value::Duration { ms }),
            Tok::True => Ok(Value::Bool(true)),
            Tok::False => Ok(Value::Bool(false)),
            Tok::Null => Ok(Value::Null),
            Tok::Env => {
                self.expect(&Tok::LParen, "expected `(` after `env`")?;
                let k = self.advance();
                let key = match k.tok {
                    Tok::Str(s) => s,
                    other => {
                        return Err(self.err_at(
                            k.line,
                            k.col,
                            format!("expected string in env(), got `{other}`"),
                        ))
                    }
                };
                self.expect(&Tok::RParen, "expected `)` to close env(...)")?;
                Ok(Value::Env { key })
            }
            other => Err(self.err_at(t.line, t.col, format!("expected scalar, got `{other}`"))),
        }
    }

    fn parse_type_shape(&mut self) -> Result<TypeShape, ParseError> {
        self.parse_type_shape_at(0)
    }

    fn parse_type_shape_at(&mut self, depth: usize) -> Result<TypeShape, ParseError> {
        self.step()?;
        let t = self.peek().clone();
        self.check_depth(depth, t.line, t.col)?;
        match t.tok {
            Tok::LBrace => {
                self.advance();
                self.skip_newlines();
                let mut fields = Vec::new();
                while !matches!(self.peek().tok, Tok::RBrace) {
                    let key_tok = self.advance();
                    let key = match key_tok.tok {
                        Tok::Ident(s) => s,
                        Tok::Str(s) => s,
                        other => {
                            return Err(self.err_at(
                                key_tok.line,
                                key_tok.col,
                                format!("expected field name, got `{other}`"),
                            ));
                        }
                    };
                    self.expect(&Tok::Colon, "expected `:` after field name")?;
                    let shape = self.parse_type_shape_at(depth + 1)?;
                    fields.push(TypeField { key, shape });
                    if matches!(self.peek().tok, Tok::Comma) {
                        self.advance();
                    }
                    self.skip_newlines();
                }
                self.expect(&Tok::RBrace, "expected `}`")?;
                Ok(TypeShape::Object { fields })
            }
            Tok::LBracket => {
                self.advance();
                let items = self.parse_type_shape_at(depth + 1)?;
                self.expect(&Tok::RBracket, "expected `]`")?;
                Ok(TypeShape::Array {
                    items: Box::new(items),
                })
            }
            Tok::Ident(name) => {
                self.advance();
                let prim = match name.as_str() {
                    "string" => PrimType::String,
                    "number" => PrimType::Number,
                    "bool" | "boolean" => PrimType::Bool,
                    "any" => PrimType::Any,
                    other => {
                        return Err(self.err_at(
                            t.line,
                            t.col,
                            format!("unknown primitive type `{other}` (expected string|number|bool|any)"),
                        ));
                    }
                };
                Ok(TypeShape::Prim { name: prim })
            }
            other => Err(self.err_at(t.line, t.col, format!("expected type, got `{other}`"))),
        }
    }

    fn parse_rule(&mut self) -> Result<Rule, ParseError> {
        self.step()?;
        let head = self.peek().clone();
        match head.tok {
            Tok::If => {
                self.advance();
                let cond = self.parse_expr()?;
                self.expect(&Tok::Arrow, "expected `->` after condition")?;
                let outcome = self.parse_outcome()?;
                let message = self.parse_optional_with()?;
                Ok(Rule {
                    kind: RuleKind::If { cond },
                    outcome,
                    message,
                })
            }
            Tok::Else => {
                self.advance();
                self.expect(&Tok::Arrow, "expected `->` after `else`")?;
                let outcome = self.parse_outcome()?;
                let message = self.parse_optional_with()?;
                Ok(Rule {
                    kind: RuleKind::Else,
                    outcome,
                    message,
                })
            }
            other => Err(self.err_at(
                head.line,
                head.col,
                format!("expected `if` or `else`, got `{other}`"),
            )),
        }
    }

    fn parse_optional_with(&mut self) -> Result<Option<String>, ParseError> {
        if matches!(self.peek().tok, Tok::With) {
            self.advance();
            let t = self.advance();
            match t.tok {
                Tok::Str(s) => Ok(Some(s)),
                other => Err(self.err_at(
                    t.line,
                    t.col,
                    format!("expected string after `with`, got `{other}`"),
                )),
            }
        } else {
            Ok(None)
        }
    }

    fn parse_outcome(&mut self) -> Result<OutcomeNode, ParseError> {
        let t = self.advance();
        match t.tok {
            Tok::Ok => Ok(OutcomeNode::Ok),
            Tok::Warn => Ok(OutcomeNode::Warn),
            Tok::Down => Ok(OutcomeNode::Down),
            other => Err(self.err_at(
                t.line,
                t.col,
                format!("expected ok|warn|down, got `{other}`"),
            )),
        }
    }

    // expression precedence: or > and > not > comparison > primary
    fn parse_expr(&mut self) -> Result<Expr, ParseError> {
        self.parse_or(0)
    }

    fn parse_or(&mut self, depth: usize) -> Result<Expr, ParseError> {
        self.step()?;
        let t = self.peek().clone();
        self.check_depth(depth, t.line, t.col)?;
        let mut left = self.parse_and(depth + 1)?;
        while matches!(self.peek().tok, Tok::Or | Tok::PipePipe) {
            self.advance();
            let right = self.parse_and(depth + 1)?;
            left = Expr::Or {
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn parse_and(&mut self, depth: usize) -> Result<Expr, ParseError> {
        self.step()?;
        let t = self.peek().clone();
        self.check_depth(depth, t.line, t.col)?;
        let mut left = self.parse_not(depth + 1)?;
        while matches!(self.peek().tok, Tok::And | Tok::AmpAmp) {
            self.advance();
            let right = self.parse_not(depth + 1)?;
            left = Expr::And {
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn parse_not(&mut self, depth: usize) -> Result<Expr, ParseError> {
        self.step()?;
        let t = self.peek().clone();
        self.check_depth(depth, t.line, t.col)?;
        if matches!(self.peek().tok, Tok::Not | Tok::Bang) {
            self.advance();
            let inner = self.parse_not(depth + 1)?;
            return Ok(Expr::Not {
                expr: Box::new(inner),
            });
        }
        self.parse_cmp(depth + 1)
    }

    fn parse_cmp(&mut self, depth: usize) -> Result<Expr, ParseError> {
        self.step()?;
        let t = self.peek().clone();
        self.check_depth(depth, t.line, t.col)?;
        let left = self.parse_primary(depth + 1)?;
        let op = match self.peek().tok {
            Tok::EqEq => Some(CmpOp::Eq),
            Tok::BangEq => Some(CmpOp::Neq),
            Tok::Lt => Some(CmpOp::Lt),
            Tok::Lte => Some(CmpOp::Lte),
            Tok::Gt => Some(CmpOp::Gt),
            Tok::Gte => Some(CmpOp::Gte),
            Tok::Contains => Some(CmpOp::Contains),
            Tok::Matches => Some(CmpOp::Matches),
            Tok::In => Some(CmpOp::In),
            _ => None,
        };
        if let Some(op) = op {
            self.advance();
            let right = self.parse_primary(depth + 1)?;
            Ok(Expr::Cmp {
                op,
                left: Box::new(left),
                right: Box::new(right),
            })
        } else {
            Ok(left)
        }
    }

    fn parse_primary(&mut self, depth: usize) -> Result<Expr, ParseError> {
        self.step()?;
        let t = self.peek().clone();
        self.check_depth(depth, t.line, t.col)?;
        match t.tok {
            Tok::LParen => {
                self.advance();
                let inner = self.parse_or(depth + 1)?;
                self.expect(&Tok::RParen, "expected `)`")?;
                Ok(inner)
            }
            Tok::Number(n) => {
                self.advance();
                Ok(Expr::Lit {
                    value: Lit::Number(n),
                })
            }
            Tok::Str(s) => {
                self.advance();
                Ok(Expr::Lit {
                    value: Lit::String(s),
                })
            }
            Tok::True => {
                self.advance();
                Ok(Expr::Lit {
                    value: Lit::Bool(true),
                })
            }
            Tok::False => {
                self.advance();
                Ok(Expr::Lit {
                    value: Lit::Bool(false),
                })
            }
            Tok::Null => {
                self.advance();
                Ok(Expr::Lit { value: Lit::Null })
            }
            Tok::Ident(_) => self.parse_path_expr(),
            other => Err(self.err_at(t.line, t.col, format!("expected expression, got `{other}`"))),
        }
    }

    fn parse_path_expr(&mut self) -> Result<Expr, ParseError> {
        let head = self.advance();
        let first = match head.tok {
            Tok::Ident(s) => s,
            other => {
                return Err(self.err_at(
                    head.line,
                    head.col,
                    format!("expected identifier, got `{other}`"),
                ))
            }
        };
        let mut segs = vec![PathSeg::Ident { name: first }];
        loop {
            match self.peek().tok {
                Tok::Dot => {
                    self.advance();
                    let nxt = self.advance();
                    let seg = match nxt.tok {
                        Tok::Ident(s) => s,
                        other => {
                            return Err(self.err_at(
                                nxt.line,
                                nxt.col,
                                format!("expected identifier after `.`, got `{other}`"),
                            ))
                        }
                    };
                    segs.push(PathSeg::Ident { name: seg });
                }
                Tok::LBracket => {
                    self.advance();
                    let nxt = self.advance();
                    let key = match nxt.tok {
                        Tok::Str(s) => s,
                        other => {
                            return Err(self.err_at(
                                nxt.line,
                                nxt.col,
                                format!("expected string in `[..]`, got `{other}`"),
                            ))
                        }
                    };
                    self.expect(&Tok::RBracket, "expected `]`")?;
                    segs.push(PathSeg::Index { key });
                }
                _ => break,
            }
        }
        Ok(Expr::Path { segments: segs })
    }
}

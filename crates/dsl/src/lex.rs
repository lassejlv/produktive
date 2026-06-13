use std::fmt;

#[derive(Debug, Clone, PartialEq)]
pub enum Tok {
    // keywords
    Type,
    Set,
    Rules,
    Declare,
    If,
    Else,
    Arrow, // ->
    With,
    Ok,
    Warn,
    Down,
    And,
    Or,
    Not,
    True,
    False,
    Null,
    Contains,
    Matches,
    In,
    Env,
    // structure
    LBrace,
    RBrace,
    LParen,
    RParen,
    LBracket,
    RBracket,
    Comma,
    Colon,
    Dot,
    Newline,
    // operators
    EqEq,
    BangEq,
    Lt,
    Lte,
    Gt,
    Gte,
    Bang,
    AmpAmp,
    PipePipe,
    // literals
    Ident(String),
    Number(f64),
    Str(String),
    Duration(u64),
    Eof,
}

impl fmt::Display for Tok {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Tok::Type => write!(f, "type"),
            Tok::Set => write!(f, "set"),
            Tok::Rules => write!(f, "rules"),
            Tok::Declare => write!(f, "declare"),
            Tok::If => write!(f, "if"),
            Tok::Else => write!(f, "else"),
            Tok::Arrow => write!(f, "->"),
            Tok::With => write!(f, "with"),
            Tok::Ok => write!(f, "ok"),
            Tok::Warn => write!(f, "warn"),
            Tok::Down => write!(f, "down"),
            Tok::And => write!(f, "and"),
            Tok::Or => write!(f, "or"),
            Tok::Not => write!(f, "not"),
            Tok::True => write!(f, "true"),
            Tok::False => write!(f, "false"),
            Tok::Null => write!(f, "null"),
            Tok::Contains => write!(f, "contains"),
            Tok::Matches => write!(f, "matches"),
            Tok::In => write!(f, "in"),
            Tok::Env => write!(f, "env"),
            Tok::LBrace => write!(f, "{{"),
            Tok::RBrace => write!(f, "}}"),
            Tok::LParen => write!(f, "("),
            Tok::RParen => write!(f, ")"),
            Tok::LBracket => write!(f, "["),
            Tok::RBracket => write!(f, "]"),
            Tok::Comma => write!(f, ","),
            Tok::Colon => write!(f, ":"),
            Tok::Dot => write!(f, "."),
            Tok::Newline => write!(f, "newline"),
            Tok::EqEq => write!(f, "=="),
            Tok::BangEq => write!(f, "!="),
            Tok::Lt => write!(f, "<"),
            Tok::Lte => write!(f, "<="),
            Tok::Gt => write!(f, ">"),
            Tok::Gte => write!(f, ">="),
            Tok::Bang => write!(f, "!"),
            Tok::AmpAmp => write!(f, "&&"),
            Tok::PipePipe => write!(f, "||"),
            Tok::Ident(s) => write!(f, "{s}"),
            Tok::Number(n) => write!(f, "{n}"),
            Tok::Str(s) => write!(f, "\"{s}\""),
            Tok::Duration(ms) => write!(f, "{ms}ms"),
            Tok::Eof => write!(f, "<eof>"),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Token {
    pub tok: Tok,
    pub line: u32,
    pub col: u32,
}

#[derive(Debug)]
pub struct LexError {
    pub message: String,
    pub line: u32,
    pub col: u32,
}

pub fn lex(src: &str) -> Result<Vec<Token>, LexError> {
    let mut out = Vec::new();
    let chars: Vec<char> = src.chars().collect();
    let mut i: usize = 0;
    let mut line: u32 = 1;
    let mut col: u32 = 1;

    // we'll mutate chars indirectly via i; keep helper closures below
    while i < chars.len() {
        let c = chars[i];
        if c == ' ' || c == '\t' || c == '\r' {
            i += 1;
            col += 1;
            continue;
        }
        if c == '\n' {
            // collapse runs of newlines into a single Newline token
            out.push(Token {
                tok: Tok::Newline,
                line,
                col,
            });
            i += 1;
            line += 1;
            col = 1;
            while i < chars.len()
                && (chars[i] == '\n' || chars[i] == ' ' || chars[i] == '\t' || chars[i] == '\r')
            {
                if chars[i] == '\n' {
                    line += 1;
                    col = 1;
                } else {
                    col += 1;
                }
                i += 1;
            }
            continue;
        }
        if c == '#' {
            // line comment
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
                col += 1;
            }
            continue;
        }
        if c == '/' && i + 1 < chars.len() && chars[i + 1] == '/' {
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
                col += 1;
            }
            continue;
        }

        let start_col = col;
        let start_line = line;

        // multi-char operators
        match c {
            '-' if i + 1 < chars.len() && chars[i + 1] == '>' => {
                out.push(Token {
                    tok: Tok::Arrow,
                    line: start_line,
                    col: start_col,
                });
                i += 2;
                col += 2;
                continue;
            }
            '=' if i + 1 < chars.len() && chars[i + 1] == '=' => {
                out.push(Token {
                    tok: Tok::EqEq,
                    line: start_line,
                    col: start_col,
                });
                i += 2;
                col += 2;
                continue;
            }
            '!' if i + 1 < chars.len() && chars[i + 1] == '=' => {
                out.push(Token {
                    tok: Tok::BangEq,
                    line: start_line,
                    col: start_col,
                });
                i += 2;
                col += 2;
                continue;
            }
            '<' if i + 1 < chars.len() && chars[i + 1] == '=' => {
                out.push(Token {
                    tok: Tok::Lte,
                    line: start_line,
                    col: start_col,
                });
                i += 2;
                col += 2;
                continue;
            }
            '>' if i + 1 < chars.len() && chars[i + 1] == '=' => {
                out.push(Token {
                    tok: Tok::Gte,
                    line: start_line,
                    col: start_col,
                });
                i += 2;
                col += 2;
                continue;
            }
            '&' if i + 1 < chars.len() && chars[i + 1] == '&' => {
                out.push(Token {
                    tok: Tok::AmpAmp,
                    line: start_line,
                    col: start_col,
                });
                i += 2;
                col += 2;
                continue;
            }
            '|' if i + 1 < chars.len() && chars[i + 1] == '|' => {
                out.push(Token {
                    tok: Tok::PipePipe,
                    line: start_line,
                    col: start_col,
                });
                i += 2;
                col += 2;
                continue;
            }
            _ => {}
        }

        // single-char punctuation
        let single = match c {
            '{' => Some(Tok::LBrace),
            '}' => Some(Tok::RBrace),
            '(' => Some(Tok::LParen),
            ')' => Some(Tok::RParen),
            '[' => Some(Tok::LBracket),
            ']' => Some(Tok::RBracket),
            ',' => Some(Tok::Comma),
            ':' => Some(Tok::Colon),
            '.' => Some(Tok::Dot),
            '<' => Some(Tok::Lt),
            '>' => Some(Tok::Gt),
            '!' => Some(Tok::Bang),
            _ => None,
        };
        if let Some(t) = single {
            out.push(Token {
                tok: t,
                line: start_line,
                col: start_col,
            });
            i += 1;
            col += 1;
            continue;
        }

        // strings
        if c == '"' {
            let mut s = String::new();
            i += 1;
            col += 1;
            loop {
                if i >= chars.len() {
                    return Err(LexError {
                        message: "unterminated string".into(),
                        line: start_line,
                        col: start_col,
                    });
                }
                let ch = chars[i];
                if ch == '"' {
                    i += 1;
                    col += 1;
                    break;
                }
                if ch == '\\' && i + 1 < chars.len() {
                    let esc = chars[i + 1];
                    let pushed = match esc {
                        'n' => '\n',
                        't' => '\t',
                        'r' => '\r',
                        '"' => '"',
                        '\\' => '\\',
                        other => other,
                    };
                    s.push(pushed);
                    i += 2;
                    col += 2;
                    continue;
                }
                if ch == '\n' {
                    return Err(LexError {
                        message: "newline in string".into(),
                        line,
                        col,
                    });
                }
                s.push(ch);
                i += 1;
                col += 1;
            }
            out.push(Token {
                tok: Tok::Str(s),
                line: start_line,
                col: start_col,
            });
            continue;
        }

        // numbers (with optional duration suffix ms/s/m/h)
        if c.is_ascii_digit() || (c == '-' && i + 1 < chars.len() && chars[i + 1].is_ascii_digit())
        {
            let mut s = String::new();
            if c == '-' {
                s.push('-');
                i += 1;
                col += 1;
            }
            while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                s.push(chars[i]);
                i += 1;
                col += 1;
            }
            let num: f64 = s.parse().map_err(|_| LexError {
                message: format!("bad number `{s}`"),
                line: start_line,
                col: start_col,
            })?;
            if !num.is_finite() {
                return Err(LexError {
                    message: format!("number `{s}` is out of range"),
                    line: start_line,
                    col: start_col,
                });
            }

            // check duration suffix
            let suffix = peek_duration_suffix(&chars, i);
            if let Some((suf, len)) = suffix {
                if num < 0.0 {
                    return Err(LexError {
                        message: "duration cannot be negative".into(),
                        line: start_line,
                        col: start_col,
                    });
                }
                let mult: u64 = match suf {
                    "ms" => 1,
                    "s" => 1_000,
                    "m" => 60_000,
                    "h" => 3_600_000,
                    _ => unreachable!(),
                };
                let ms_float = num * mult as f64;
                if !ms_float.is_finite() || ms_float > u64::MAX as f64 {
                    return Err(LexError {
                        message: "duration is out of range".into(),
                        line: start_line,
                        col: start_col,
                    });
                }
                let ms = ms_float as u64;
                out.push(Token {
                    tok: Tok::Duration(ms),
                    line: start_line,
                    col: start_col,
                });
                i += len;
                col += len as u32;
            } else {
                out.push(Token {
                    tok: Tok::Number(num),
                    line: start_line,
                    col: start_col,
                });
            }
            continue;
        }

        // identifier / keyword
        if c.is_ascii_alphabetic() || c == '_' {
            let mut s = String::new();
            while i < chars.len()
                && (chars[i].is_ascii_alphanumeric() || chars[i] == '_' || chars[i] == '-')
            {
                s.push(chars[i]);
                i += 1;
                col += 1;
            }
            let tok = match s.as_str() {
                "type" => Tok::Type,
                "set" => Tok::Set,
                "rules" => Tok::Rules,
                "declare" => Tok::Declare,
                "if" => Tok::If,
                "else" => Tok::Else,
                "with" => Tok::With,
                "ok" => Tok::Ok,
                "warn" => Tok::Warn,
                "down" => Tok::Down,
                "and" => Tok::And,
                "or" => Tok::Or,
                "not" => Tok::Not,
                "true" => Tok::True,
                "false" => Tok::False,
                "null" => Tok::Null,
                "contains" => Tok::Contains,
                "matches" => Tok::Matches,
                "in" => Tok::In,
                "env" => Tok::Env,
                _ => Tok::Ident(s),
            };
            out.push(Token {
                tok,
                line: start_line,
                col: start_col,
            });
            continue;
        }

        return Err(LexError {
            message: format!("unexpected character `{c}`"),
            line: start_line,
            col: start_col,
        });
    }

    out.push(Token {
        tok: Tok::Eof,
        line,
        col,
    });
    Ok(out)
}

fn peek_duration_suffix(chars: &[char], i: usize) -> Option<(&'static str, usize)> {
    let next = |k: usize| chars.get(i + k).copied();
    let boundary = |k: usize| {
        chars
            .get(i + k)
            .map(|c| !(c.is_ascii_alphanumeric() || *c == '_'))
            .unwrap_or(true)
    };
    if next(0) == Some('m') && next(1) == Some('s') && boundary(2) {
        return Some(("ms", 2));
    }
    if next(0) == Some('s') && boundary(1) {
        return Some(("s", 1));
    }
    if next(0) == Some('m') && boundary(1) {
        return Some(("m", 1));
    }
    if next(0) == Some('h') && boundary(1) {
        return Some(("h", 1));
    }
    None
}

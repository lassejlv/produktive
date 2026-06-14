import type * as monacoNs from "monaco-editor";

export const LANG_ID = "unstatus-dsl";
export const THEME_LIGHT = "unstatus-light";
export const THEME_DARK = "unstatus-dark";

const KEYWORDS = ["type", "set", "rules", "declare", "if", "else", "with"];
const OUTCOMES = ["ok", "warn", "down"];
const OPERATORS = ["and", "or", "not", "in", "contains", "matches"];
const LITERALS = ["true", "false", "null"];
const PRIMS = ["string", "number", "bool", "boolean", "any"];
const KINDS = ["http", "tcp", "ping", "postgres", "redis", "ssh"];

interface BuiltinPath {
  label: string;
  detail: string;
  doc: string;
}

const BUILTINS: BuiltinPath[] = [
  {
    label: "result.status",
    detail: "number",
    doc: "Protocol result code. HTTP uses the response status; query probes use 0 for success.",
  },
  { label: "result.latency_ms", detail: "number", doc: "Response time in milliseconds." },
  { label: "result.body", detail: "string", doc: "Raw response body (truncated to limit)." },
  { label: "result.error", detail: "string | null", doc: "Probe-level error message, if any." },
  { label: "result.json", detail: "object", doc: "Parsed JSON body (null if body is not JSON)." },
  {
    label: 'result.headers["..."]',
    detail: "string | null",
    doc: "Lookup a response header by name.",
  },
  {
    label: "monitor.kind",
    detail: '"http" | "tcp" | "ping" | "postgres" | "redis" | "ssh"',
    doc: "Monitor kind.",
  },
  { label: "monitor.target", detail: "string", doc: "Monitor target string." },
  { label: "monitor.interval_seconds", detail: "number", doc: "Configured probe interval." },
];

const SNIPPETS: Array<{ label: string; insertText: string; doc: string }> = [
  {
    label: "rule-ok-200",
    insertText: "if result.status == 200 -> ok",
    doc: "Mark up when HTTP status is 200.",
  },
  {
    label: "rule-down-5xx",
    insertText: 'if result.status >= 500 -> down with "5xx response"',
    doc: "Mark down when server returns a 5xx.",
  },
  {
    label: "rule-warn-slow",
    insertText: 'if result.latency_ms > ${1:2000} -> warn with "slow"',
    doc: "Mark degraded when latency exceeds a threshold.",
  },
  {
    label: "rule-body-contains",
    insertText: 'if result.body contains "${1:healthy}" -> ok',
    doc: "Match a substring in the body.",
  },
  {
    label: "rule-else",
    insertText: "else -> ${1|ok,warn,down|}",
    doc: "Default fallback when no other rule matches.",
  },
  {
    label: "declare-json",
    insertText: ["declare result.json {", "  ${1:status}: ${2|string,number,bool,any|}", "}"].join(
      "\n",
    ),
    doc: "Declare the shape of the JSON response for autocomplete.",
  },
  {
    label: "rules-block",
    insertText: [
      "rules {",
      "  if result.status == 200 -> ok",
      '  if result.status >= 500 -> down with "5xx"',
      "  if result.latency_ms > 2000 -> warn",
      "  else -> ok",
      "}",
    ].join("\n"),
    doc: "Insert a starter rules block.",
  },
  {
    label: "postgres-query-config",
    insertText: [
      'type postgres',
      '',
      'set params.config {',
      '  url: "${1:postgres://user:password@db.example.com:5432/app}"',
      '  query: "${2:SELECT 1}"',
      '  timeout: 5s',
      '}',
      '',
      'rules {',
      '  if result.status == 0 -> ok',
      '  else -> down with "query failed"',
      '}',
    ].join("\n"),
    doc: "Insert a Postgres query monitor.",
  },
  {
    label: "redis-command-config",
    insertText: [
      'type redis',
      '',
      'set params.config {',
      '  url: "${1:redis://:password@cache.example.com:6379/0}"',
      '  command: "${2:PING}"',
      '  timeout: 5s',
      '}',
      '',
      'rules {',
      '  if result.status == 0 -> ok',
      '  else -> down with "command failed"',
      '}',
    ].join("\n"),
    doc: "Insert a Redis command monitor.",
  },
];

export function registerDslLanguage(monaco: typeof monacoNs) {
  if (monaco.languages.getLanguages().some((l) => l.id === LANG_ID)) return;
  monaco.languages.register({ id: LANG_ID });

  monaco.languages.setMonarchTokensProvider(LANG_ID, {
    defaultToken: "",
    tokenPostfix: ".udsl",
    keywords: KEYWORDS,
    outcomes: OUTCOMES,
    typeOps: OPERATORS,
    literals: LITERALS,
    prims: PRIMS,
    kinds: KINDS,
    operators: ["->", "==", "!=", "<=", ">=", "&&", "||", "<", ">", "!", "=", ":", ".", ","],
    symbols: /[=><!~?:&|+\-*/^%.]+/,
    tokenizer: {
      root: [
        [/#.*$/, "comment"],
        [/\/\/.*$/, "comment"],
        [/"/, { token: "string.quote", bracket: "@open", next: "@string" }],
        [/\b\d+(?:\.\d+)?(?:ms|s|m|h)\b/, "number.duration"],
        [/\b\d+(?:\.\d+)?\b/, "number"],
        [
          /[a-zA-Z_][\w-]*/,
          {
            cases: {
              "@keywords": "keyword",
              "@outcomes": "tag",
              "@typeOps": "keyword.operator",
              "@literals": "constant",
              "@prims": "type",
              "@kinds": "type",
              "@default": "identifier",
            },
          },
        ],
        [/->/, "keyword.operator.arrow"],
        [/[{}()[\]]/, "@brackets"],
        [/@symbols/, { cases: { "@operators": "operator", "@default": "" } }],
        [/[ \t\r\n]+/, "white"],
      ],
      string: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration(LANG_ID, {
    comments: { lineComment: "#" },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: '"', close: '"' },
    ],
  });

  monaco.languages.registerCompletionItemProvider(LANG_ID, {
    triggerCharacters: [".", " ", "(", '"'],
    provideCompletionItems(model, position) {
      const text = model.getValue();
      const lineUpToCursor = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      );

      const declares = extractDeclares(text);
      const suggestions: monacoNs.languages.CompletionItem[] = [];

      // path autocomplete after `.`
      const pathMatch = lineUpToCursor.match(/([a-zA-Z_][\w-]*(?:\.[a-zA-Z_][\w-]*)*)\.$/);
      if (pathMatch) {
        const head = pathMatch[1];
        const dotRange = new monaco.Range(
          position.lineNumber,
          position.column,
          position.lineNumber,
          position.column,
        );
        // built-in children
        const children = childrenOf(head, declares);
        for (const c of children) {
          suggestions.push({
            label: c.label,
            kind: monaco.languages.CompletionItemKind.Property,
            insertText: c.label,
            detail: c.detail,
            documentation: c.doc,
            range: dotRange,
          });
        }
        return { suggestions };
      }

      // keywords at line start
      if (/^\s*[a-zA-Z_]*$/.test(lineUpToCursor)) {
        for (const k of ["type", "set", "rules", "declare", "if", "else"]) {
          suggestions.push({
            label: k,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: k,
            range,
          });
        }
      }

      // outcomes after `->`
      if (/->\s*[a-zA-Z_]*$/.test(lineUpToCursor)) {
        for (const o of OUTCOMES) {
          suggestions.push({
            label: o,
            kind: monaco.languages.CompletionItemKind.EnumMember,
            insertText: o,
            range,
          });
        }
        return { suggestions };
      }

      // top-level roots in expressions
      suggestions.push(
        {
          label: "result",
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: "result",
          detail: "probe result",
          range,
        },
        {
          label: "monitor",
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: "monitor",
          detail: "monitor metadata",
          range,
        },
      );

      // full builtin paths (helpful as hint list)
      for (const b of BUILTINS) {
        suggestions.push({
          label: b.label,
          kind: monaco.languages.CompletionItemKind.Property,
          insertText: b.label,
          detail: b.detail,
          documentation: b.doc,
          range,
        });
      }

      // snippets
      for (const s of SNIPPETS) {
        suggestions.push({
          label: s.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: s.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: "snippet",
          documentation: s.doc,
          range,
        });
      }

      // user-declared full paths
      for (const path of flattenDeclareLeaves(declares)) {
        suggestions.push({
          label: path.label,
          kind: monaco.languages.CompletionItemKind.Property,
          insertText: path.label,
          detail: path.detail,
          range,
        });
      }

      return { suggestions };
    },
  });

  monaco.editor.defineTheme(THEME_LIGHT, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "9c9a92", fontStyle: "italic" },
      { token: "keyword", foreground: "047857", fontStyle: "bold" },
      { token: "keyword.operator", foreground: "047857" },
      { token: "keyword.operator.arrow", foreground: "10b981", fontStyle: "bold" },
      { token: "tag", foreground: "d97706", fontStyle: "bold" },
      { token: "string", foreground: "1a1a17" },
      { token: "string.escape", foreground: "9c9a92" },
      { token: "string.quote", foreground: "6b6b66" },
      { token: "number", foreground: "1a1a17" },
      { token: "number.duration", foreground: "047857" },
      { token: "constant", foreground: "d97706" },
      { token: "type", foreground: "047857", fontStyle: "italic" },
      { token: "identifier", foreground: "1a1a17" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#1a1a17",
      "editorLineNumber.foreground": "#9c9a92",
      "editorLineNumber.activeForeground": "#1a1a17",
      "editor.lineHighlightBackground": "#f7f5f0",
      "editor.lineHighlightBorder": "#f7f5f0",
      "editorCursor.foreground": "#10b981",
      "editor.selectionBackground": "#10b98122",
      "editorIndentGuide.background1": "#e8e3d8",
      "editorIndentGuide.activeBackground1": "#d4cdbe",
      "editorGutter.background": "#f7f5f0",
      "scrollbarSlider.background": "#d4cdbe66",
      "scrollbarSlider.hoverBackground": "#d4cdbeaa",
      "scrollbarSlider.activeBackground": "#b8af9d",
    },
  });

  monaco.editor.defineTheme(THEME_DARK, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "5a5e6a", fontStyle: "italic" },
      { token: "keyword", foreground: "34d399", fontStyle: "bold" },
      { token: "keyword.operator", foreground: "34d399" },
      { token: "keyword.operator.arrow", foreground: "34d399", fontStyle: "bold" },
      { token: "tag", foreground: "fbbf24", fontStyle: "bold" },
      { token: "string", foreground: "e8eaf0" },
      { token: "string.escape", foreground: "9094a0" },
      { token: "string.quote", foreground: "9094a0" },
      { token: "number", foreground: "e8eaf0" },
      { token: "number.duration", foreground: "34d399" },
      { token: "constant", foreground: "fbbf24" },
      { token: "type", foreground: "34d399", fontStyle: "italic" },
      { token: "identifier", foreground: "e8eaf0" },
    ],
    colors: {
      "editor.background": "#1c1f27",
      "editor.foreground": "#e8eaf0",
      "editorLineNumber.foreground": "#5a5e6a",
      "editorLineNumber.activeForeground": "#e8eaf0",
      "editor.lineHighlightBackground": "#1f232c",
      "editor.lineHighlightBorder": "#1f232c",
      "editorCursor.foreground": "#34d399",
      "editor.selectionBackground": "#34d39926",
      "editorIndentGuide.background1": "#262a33",
      "editorIndentGuide.activeBackground1": "#32363f",
      "editorGutter.background": "#1c1f27",
      "scrollbarSlider.background": "#32363f66",
      "scrollbarSlider.hoverBackground": "#454a55aa",
      "scrollbarSlider.activeBackground": "#454a55",
    },
  });
}

// --- declare extraction ---

interface DeclareNode {
  name: string;
  children?: DeclareNode[];
  arrayOf?: DeclareNode;
  prim?: string;
}

function extractDeclares(source: string): DeclareNode[] {
  const out: DeclareNode[] = [];
  const re = /^\s*declare\s+([\w.-]+)\s*({)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const path = m[1].split(".");
    const braceIdx = m.index + m[0].length - 1;
    const inner = readBlock(source, braceIdx);
    if (!inner) continue;
    const fields = parseFields(inner);
    let node: DeclareNode = { name: path[0], children: [] };
    let cursor: DeclareNode = node;
    for (let i = 1; i < path.length; i++) {
      const child: DeclareNode = { name: path[i], children: [] };
      cursor.children = [child];
      cursor = child;
    }
    cursor.children = fields;
    // merge into existing same-root node if present
    const existing = out.find((n) => n.name === node.name);
    if (existing) {
      mergeInto(existing, node);
    } else {
      out.push(node);
    }
  }
  return out;
}

function mergeInto(a: DeclareNode, b: DeclareNode) {
  if (!a.children) a.children = [];
  for (const c of b.children ?? []) {
    const existing = a.children.find((x) => x.name === c.name);
    if (existing) mergeInto(existing, c);
    else a.children.push(c);
  }
}

function readBlock(source: string, openIdx: number): string | null {
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    const c = source[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return source.slice(openIdx + 1, i);
    }
  }
  return null;
}

function parseFields(body: string): DeclareNode[] {
  const fields: DeclareNode[] = [];
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s|,/.test(body[i])) i++;
    if (i >= body.length) break;
    // read field name (ident or "quoted")
    let name = "";
    if (body[i] === '"') {
      i++;
      while (i < body.length && body[i] !== '"') name += body[i++];
      i++;
    } else {
      while (i < body.length && /[\w-]/.test(body[i])) name += body[i++];
    }
    while (i < body.length && /\s/.test(body[i])) i++;
    if (body[i] !== ":") {
      // skip stray token
      while (i < body.length && body[i] !== "\n") i++;
      continue;
    }
    i++;
    while (i < body.length && /\s/.test(body[i])) i++;
    // read type
    if (body[i] === "{") {
      const sub = readBlock(body, i);
      if (sub == null) break;
      const children = parseFields(sub);
      fields.push({ name, children });
      i += sub.length + 2;
    } else if (body[i] === "[") {
      // array
      let depth = 1;
      let j = i + 1;
      while (j < body.length && depth > 0) {
        if (body[j] === "[") depth++;
        else if (body[j] === "]") depth--;
        if (depth > 0) j++;
      }
      const inner = body.slice(i + 1, j).trim();
      let arrayOf: DeclareNode | undefined;
      if (inner.startsWith("{")) {
        const subInner = readBlock(inner, 0);
        if (subInner != null) arrayOf = { name: "[]", children: parseFields(subInner) };
      } else {
        arrayOf = { name: "[]", prim: inner };
      }
      fields.push({ name, arrayOf });
      i = j + 1;
    } else {
      let prim = "";
      while (i < body.length && /[\w-]/.test(body[i])) prim += body[i++];
      fields.push({ name, prim });
    }
  }
  return fields;
}

function childrenOf(headPath: string, declares: DeclareNode[]): BuiltinPath[] {
  const segs = headPath.split(".");
  // built-ins for known roots
  if (headPath === "result") {
    const builtins = [
      { label: "status", detail: "number", doc: "HTTP status code." },
      { label: "latency_ms", detail: "number", doc: "Latency in ms." },
      { label: "body", detail: "string", doc: "Response body." },
      { label: "error", detail: "string | null", doc: "Error message if probe failed." },
      { label: "headers", detail: "map", doc: 'Response headers (use ["key"]).' },
      { label: "json", detail: "object", doc: "Parsed JSON body." },
    ];
    return builtins;
  }
  if (headPath === "monitor") {
    return [
      { label: "kind", detail: "string", doc: "" },
      { label: "target", detail: "string", doc: "" },
      { label: "interval_seconds", detail: "number", doc: "" },
    ];
  }
  // declared paths
  const root = declares.find((n) => n.name === segs[0]);
  if (!root) return [];
  let node: DeclareNode | undefined = root;
  for (let i = 1; i < segs.length && node; i++) {
    node = node.children?.find((c) => c.name === segs[i]);
  }
  if (!node) return [];
  if (node.arrayOf) {
    // suggest .[N] index hint
    return [];
  }
  return (node.children ?? []).map((c) => ({
    label: c.name,
    detail: describeNode(c),
    doc: "",
  }));
}

function describeNode(n: DeclareNode): string {
  if (n.prim) return n.prim;
  if (n.arrayOf) return `[${describeNode(n.arrayOf)}]`;
  if (n.children) return `{ ${n.children.length} }`;
  return "any";
}

function flattenDeclareLeaves(declares: DeclareNode[]): { label: string; detail: string }[] {
  const out: { label: string; detail: string }[] = [];
  function walk(node: DeclareNode, prefix: string[]) {
    const path = [...prefix, node.name];
    if (node.children && node.children.length) {
      for (const c of node.children) walk(c, path);
    } else if (node.arrayOf) {
      out.push({ label: path.join("."), detail: describeNode(node) });
    } else {
      out.push({ label: path.join("."), detail: node.prim ?? "any" });
    }
  }
  for (const root of declares) walk(root, []);
  return out;
}

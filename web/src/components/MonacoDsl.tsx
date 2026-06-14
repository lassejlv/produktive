import { useEffect, useRef } from "react";
import MonacoEditor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { LANG_ID, THEME_DARK, THEME_LIGHT, registerDslLanguage } from "#/lib/dslLanguage";
import { useTheme } from "#/lib/theme";

// Tell @monaco-editor/react to use our locally-installed monaco instead of CDN.
loader.config({ monaco });

// No worker — monaco runs tokenization on the main thread for our tiny DSL.
// This avoids needing a custom Vite worker setup.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(self as any).MonacoEnvironment = {
  getWorker() {
    return {
      postMessage: () => {},
      terminate: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    };
  },
};

interface Props {
  value: string;
  onChange: (next: string) => void;
  errorLine?: number | null;
  errorMessage?: string | null;
  height?: number;
}

export default function MonacoDsl({
  value,
  onChange,
  errorLine,
  errorMessage,
  height = 360,
}: Props) {
  const { theme } = useTheme();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decoRef = useRef<string[]>([]);

  const onMount: OnMount = (editor, m) => {
    registerDslLanguage(m);
    editorRef.current = editor;
    editor.updateOptions({
      fontFamily: "Geist Mono Variable, ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      fontLigatures: false,
      minimap: { enabled: false },
      lineNumbersMinChars: 3,
      glyphMargin: false,
      folding: false,
      scrollBeyondLastLine: false,
      renderLineHighlight: "line",
      smoothScrolling: true,
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      automaticLayout: true,
      padding: { top: 12, bottom: 12 },
      tabSize: 2,
      insertSpaces: true,
      wordWrap: "on",
      contextmenu: false,
      scrollbar: {
        vertical: "auto",
        horizontal: "auto",
        useShadows: false,
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
      },
    });
    m.editor.setTheme(theme === "dark" ? THEME_DARK : THEME_LIGHT);
  };

  useEffect(() => {
    if (!editorRef.current) return;
    monaco.editor.setTheme(theme === "dark" ? THEME_DARK : THEME_LIGHT);
  }, [theme]);

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const model = ed.getModel();
    if (!model) return;
    if (errorLine && errorLine > 0) {
      decoRef.current = ed.deltaDecorations(decoRef.current, [
        {
          range: new monaco.Range(errorLine, 1, errorLine, model.getLineMaxColumn(errorLine)),
          options: {
            isWholeLine: true,
            className: "udsl-error-line",
            glyphMarginClassName: "udsl-error-glyph",
            hoverMessage: errorMessage ? { value: errorMessage } : undefined,
            inlineClassName: "udsl-error-inline",
          },
        },
      ]);
    } else if (decoRef.current.length) {
      decoRef.current = ed.deltaDecorations(decoRef.current, []);
    }
  }, [errorLine, errorMessage]);

  return (
    <MonacoEditor
      height={height}
      defaultLanguage={LANG_ID}
      language={LANG_ID}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      onMount={onMount}
      theme={theme === "dark" ? THEME_DARK : THEME_LIGHT}
      options={{ automaticLayout: true }}
      loading={
        <div className="flex items-center justify-center h-full text-[12px] text-[var(--color-fg-muted)]">
          loading editor…
        </div>
      }
    />
  );
}

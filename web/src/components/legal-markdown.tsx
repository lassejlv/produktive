import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  a({ children, href, ...props }) {
    return (
      <a
        {...props}
        href={href}
        target={href?.startsWith("#") ? undefined : "_blank"}
        rel={href?.startsWith("#") ? undefined : "noreferrer"}
        className="text-accent underline decoration-accent/35 underline-offset-4 transition-colors hover:text-accent-hover"
      >
        {children}
      </a>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-6 border-l border-border pl-5 text-fg-muted">{children}</blockquote>
    );
  },
  code({ children, className, ...props }) {
    if (className) {
      return (
        <code {...props} className={[className, "font-mono text-[12px]"].join(" ")}>
          {children}
        </code>
      );
    }

    return (
      <code
        {...props}
        className="rounded-[4px] border border-border-subtle bg-surface px-1.5 py-0.5 font-mono text-[0.9em] text-fg"
      >
        {children}
      </code>
    );
  },
  h1({ children }) {
    return (
      <h1 className="mb-5 text-[30px] font-semibold leading-[1.08] tracking-[-0.035em] text-fg sm:text-[38px]">
        {children}
      </h1>
    );
  },
  h2({ children }) {
    return (
      <h2 className="mb-4 mt-12 border-t border-border-subtle pt-8 text-[22px] font-semibold leading-snug tracking-[-0.025em] text-fg">
        {children}
      </h2>
    );
  },
  h3({ children }) {
    return (
      <h3 className="mb-2 mt-7 text-[15px] font-semibold tracking-[-0.01em] text-fg">{children}</h3>
    );
  },
  hr() {
    return <hr className="my-9 border-border-subtle" />;
  },
  li({ children }) {
    return <li className="pl-1 leading-[1.75] text-fg-muted">{children}</li>;
  },
  ol({ children }) {
    return <ol className="my-6 list-decimal space-y-2 pl-5 marker:text-fg-faint">{children}</ol>;
  },
  p({ children }) {
    return <p className="my-4 text-[15px] leading-[1.78] text-fg-muted">{children}</p>;
  },
  pre({ children }) {
    return (
      <pre className="my-6 overflow-x-auto rounded-[8px] border border-border-subtle bg-surface p-4 font-mono text-[12px] leading-relaxed text-fg">
        {children}
      </pre>
    );
  },
  strong({ children }) {
    return <strong className="font-medium text-fg">{children}</strong>;
  },
  table({ children }) {
    return (
      <div className="my-6 overflow-x-auto rounded-[8px] border border-border-subtle bg-surface">
        <table className="w-full border-collapse text-left text-[13px]">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th className="border-b border-border-subtle bg-surface px-3 py-2.5 font-medium text-fg">
        {children}
      </th>
    );
  },
  td({ children }) {
    return <td className="border-b border-border-subtle px-3 py-2.5 text-fg-muted">{children}</td>;
  },
  ul({ children }) {
    return <ul className="my-6 list-disc space-y-2 pl-5 marker:text-fg-faint">{children}</ul>;
  },
};

export function LegalMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}

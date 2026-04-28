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
        className="text-accent underline decoration-accent/40 underline-offset-3 transition-colors hover:text-accent-hover"
      >
        {children}
      </a>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-3 border-l border-border pl-3 text-fg-muted">
        {children}
      </blockquote>
    );
  },
  code({ children, className, ...props }) {
    if (className) {
      return (
        <code
          {...props}
          className={[className, "font-mono text-[12px]"].join(" ")}
        >
          {children}
        </code>
      );
    }

    return (
      <code
        {...props}
        className="rounded-[4px] border border-border-subtle bg-surface px-1.5 py-0.5 font-mono text-[0.92em] text-fg"
      >
        {children}
      </code>
    );
  },
  h1({ children }) {
    return <h1 className="mb-2 mt-4 text-xl font-semibold">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="mb-2 mt-4 text-lg font-semibold">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="mb-1.5 mt-3 text-base font-semibold">{children}</h3>;
  },
  hr() {
    return <hr className="my-4 border-border-subtle" />;
  },
  li({ children }) {
    return <li className="my-1 pl-1">{children}</li>;
  },
  ol({ children }) {
    return (
      <ol className="my-3 list-decimal space-y-1 pl-5 marker:text-fg-muted">
        {children}
      </ol>
    );
  },
  p({ children }) {
    return <p className="my-2 first:mt-0 last:mb-0">{children}</p>;
  },
  pre({ children }) {
    return (
      <pre className="my-3 overflow-x-auto rounded-[7px] border border-border bg-[#101012] p-3 font-mono text-[12px] leading-relaxed text-fg">
        {children}
      </pre>
    );
  },
  table({ children }) {
    return (
      <div className="my-3 overflow-x-auto rounded-[7px] border border-border-subtle">
        <table className="w-full border-collapse text-left text-[13px]">
          {children}
        </table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th className="border-b border-border-subtle bg-surface px-2.5 py-2 font-medium text-fg">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="border-b border-border-subtle px-2.5 py-2 text-fg-muted">
        {children}
      </td>
    );
  },
  ul({ children }) {
    return (
      <ul className="my-3 list-disc space-y-1 pl-5 marker:text-fg-muted">
        {children}
      </ul>
    );
  },
};

export function ChatMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
}

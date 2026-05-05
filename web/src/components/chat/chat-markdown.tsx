import { Link } from "@tanstack/react-router";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const mediaClass =
  "my-3 max-h-[520px] max-w-full rounded-[7px] border border-border-subtle bg-surface object-contain";

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "video", "source"],
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), "href", "title", "target", "rel"],
    img: [...(defaultSchema.attributes?.img ?? []), "src", "alt", "title", "width", "height"],
    video: [
      "src",
      "poster",
      "title",
      "width",
      "height",
      "controls",
      "loop",
      "muted",
      "playsinline",
      "preload",
    ],
    source: ["src", "type"],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto", "produktive"],
    src: ["http", "https"],
    poster: ["http", "https"],
  },
};

const components: Components = {
  a({ children, href, ...props }) {
    const produktiveLink = parseProduktiveLink(href);
    if (produktiveLink) {
      const className =
        "inline-flex max-w-full items-center rounded-[5px] border border-border-subtle bg-surface-2 px-1.5 py-0.5 text-[0.88em] font-medium text-fg no-underline align-baseline transition-colors hover:border-accent/40 hover:text-accent";
      if (produktiveLink.type === "issue") {
        return (
          <Link to="/issues/$issueId" params={{ issueId: produktiveLink.id }} className={className}>
            {children}
          </Link>
        );
      }
      if (produktiveLink.type === "chat") {
        return (
          <Link to="/chat/$chatId" params={{ chatId: produktiveLink.id }} className={className}>
            {children}
          </Link>
        );
      }
      if (produktiveLink.type === "user") {
        return (
          <Link
            to="/members/$memberId"
            params={{ memberId: produktiveLink.id }}
            className={className}
          >
            {children}
          </Link>
        );
      }
    }

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
      <blockquote className="my-3 border-l border-border pl-3 text-fg-muted">{children}</blockquote>
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
  img({ src, alt, className, ...props }) {
    const safeSrc = safeMediaUrl(src);
    if (!safeSrc) return null;
    return (
      <img
        {...props}
        src={safeSrc}
        alt={typeof alt === "string" ? alt : ""}
        loading="lazy"
        className={cn(mediaClass, "block", className)}
      />
    );
  },
  li({ children }) {
    return <li className="my-1 pl-1">{children}</li>;
  },
  ol({ children }) {
    return <ol className="my-3 list-decimal space-y-1 pl-5 marker:text-fg-muted">{children}</ol>;
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
        <table className="w-full border-collapse text-left text-[13px]">{children}</table>
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
    return <td className="border-b border-border-subtle px-2.5 py-2 text-fg-muted">{children}</td>;
  },
  ul({ children }) {
    return <ul className="my-3 list-disc space-y-1 pl-5 marker:text-fg-muted">{children}</ul>;
  },
  video({ children, src, poster, className, ...props }) {
    return (
      <video
        {...props}
        src={safeMediaUrl(src)}
        poster={safeMediaUrl(poster)}
        controls
        playsInline
        preload="metadata"
        className={cn(mediaClass, "block w-full", className)}
      >
        {children}
      </video>
    );
  },
  source({ src, type, ...props }) {
    const safeSrc = safeMediaUrl(src);
    if (!safeSrc) return null;
    return <source {...props} src={safeSrc} type={typeof type === "string" ? type : undefined} />;
  },
};

export function ChatMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
}

function parseProduktiveLink(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("produktive://")) return null;
  const match = /^produktive:\/\/(issue|chat|user)\/([^/?#]+)$/.exec(value);
  if (!match) return null;
  return { type: match[1] as "issue" | "chat" | "user", id: decodeURIComponent(match[2]) };
}

function safeMediaUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const origin = globalThis.location?.origin ?? "http://localhost";
    const url = new URL(value, origin);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return value;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

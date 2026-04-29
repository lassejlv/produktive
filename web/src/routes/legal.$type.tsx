import { Link, createFileRoute } from "@tanstack/react-router";
import { LegalMarkdown } from "@/components/legal-markdown";
import { getLegalDocument, legalDocuments } from "@/lib/legal-documents";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/legal/$type")({
  component: LegalDocumentPage,
});

function LegalDocumentPage() {
  const { type } = Route.useParams();
  const document = getLegalDocument(type);

  if (!document) {
    return <UnknownLegalDocument />;
  }

  return (
    <main className="relative isolate min-h-screen bg-bg text-fg">
      <LegalPageBackground />

      <header className="sticky inset-x-0 top-0 z-20 px-4 py-4">
        <nav
          className={cn(
            "mx-auto flex max-w-[680px] items-center justify-between rounded-full border border-white/10 bg-bg/40 px-5 py-2.5 backdrop-blur-xl",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
          )}
        >
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-6 place-items-center rounded-md bg-fg text-[11px] font-semibold tracking-tight text-bg">
              P
            </span>
            <span className="text-[13px] font-medium tracking-tight text-fg">Produktive</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link
              to="/legal"
              className="rounded-full px-3 py-1 text-[12.5px] text-fg/70 transition-colors hover:text-fg"
            >
              Legal
            </Link>
            <Link
              to="/login"
              className="rounded-full px-3 py-1 text-[12.5px] text-fg/70 transition-colors hover:text-fg"
            >
              Sign in
            </Link>
          </div>
        </nav>
      </header>

      <div className="relative z-10 mx-auto w-full max-w-[760px] px-5 py-8 lg:py-12">
        <article className="min-w-0 rounded-[12px] border border-white/10 bg-bg/68 px-5 py-6 backdrop-blur-md sm:px-8 sm:py-8">
          <LegalMarkdown content={document.markdown} />
        </article>
      </div>
    </main>
  );
}

function UnknownLegalDocument() {
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-bg px-6 py-12 text-fg">
      <LegalPageBackground />

      <div className="relative z-10 w-full max-w-[420px] border-y border-white/10 bg-bg/45 py-8 text-center backdrop-blur-md">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-faint">
          Unknown document
        </p>
        <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.035em] text-fg">
          Legal page not found.
        </h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-fg-muted">
          Choose one of the available Produktive legal documents instead.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          {legalDocuments.map((item) => (
            <Link
              key={item.type}
              to="/legal/$type"
              params={{ type: item.type }}
              className="inline-flex h-9 items-center rounded-[5px] border border-border-subtle px-3 text-[13px] text-fg-muted transition-colors hover:border-border hover:text-fg"
            >
              {item.shortTitle}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

function LegalPageBackground() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10">
      <img
        src="https://cdn.produktive.app/assets/landing.webp"
        alt=""
        decoding="async"
        fetchPriority="high"
        className="animate-ken-burns absolute inset-0 h-full w-full object-cover object-[center_65%]"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-bg/0 via-bg/15 to-bg" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 50%, transparent 0%, rgba(13,13,15,0.55) 100%)",
        }}
      />
    </div>
  );
}

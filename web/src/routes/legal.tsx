import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { legalDocuments } from "@/lib/legal-documents";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/legal")({
  component: LegalIndexPage,
});

function LegalIndexPage() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  if (pathname.startsWith("/legal/")) {
    return <Outlet />;
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
          <Link
            to="/login"
            className="rounded-full px-3 py-1 text-[12.5px] text-fg/70 transition-colors hover:text-fg"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-[480px] flex-col px-5 py-24">
        <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-fg">Legal documents</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-fg-muted">
          Choose the document you want to read.
        </p>

        <div className="mt-8 grid gap-2">
          {legalDocuments.map((document) => (
            <Link
              key={document.type}
              to="/legal/$type"
              params={{ type: document.type }}
              className="group flex h-11 items-center justify-between rounded-[6px] border border-border-subtle px-3.5 text-[13px] text-fg-muted transition-colors hover:border-border hover:text-fg"
            >
              <span>{document.title}</span>
              <span aria-hidden className="font-mono text-[11px] text-fg-faint group-hover:text-fg">
                Open
              </span>
            </Link>
          ))}
        </div>
      </section>
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

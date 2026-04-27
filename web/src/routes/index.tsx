import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: ComingSoonPage,
});

function ComingSoonPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="grid size-6 place-items-center rounded-md bg-fg text-[11px] font-semibold text-bg">
            P
          </div>
          <span className="text-sm font-medium text-fg">Produktive</span>
        </div>
        <nav className="flex items-center gap-5 text-xs text-fg-muted">
          <a
            href="https://github.com/lassejlv/produktive"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-fg transition-colors"
          >
            GitHub
          </a>
          <Link to="/login" className="hover:text-fg transition-colors">
            Sign in
          </Link>
        </nav>
      </header>

      <section className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-xl text-center animate-fade-in">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-fg-muted">
            <span className="size-1.5 rounded-full bg-accent" />
            Coming soon
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
            Issue tracking for small teams.
          </h1>
          <p className="mt-4 text-base text-fg-muted">
            A focused, open-source alternative to Linear. Plain, fast, and self-hostable.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button asChild>
              <Link to="/login">Get early access</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard">Go to app</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="flex items-center justify-between px-6 py-5 text-xs text-fg-muted">
        <span>© Produktive</span>
        <a href="mailto:hello@produktive.app" className="hover:text-fg transition-colors">
          hello@produktive.app
        </a>
      </footer>
    </main>
  );
}

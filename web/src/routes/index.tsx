import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: ComingSoonPage,
});

function ComingSoonPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/4 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/[0.07] blur-[120px]" />
        <div className="absolute right-1/4 top-1/2 size-[400px] rounded-full bg-blue-500/[0.04] blur-[100px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center animate-fade-in">
        {/* Logo mark */}
        <div className="mb-8 grid size-14 place-items-center rounded-2xl border border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
          <span className="text-xl font-bold text-white">P</span>
        </div>

        {/* Title */}
        <h1 className="text-[clamp(40px,8vw,96px)] font-semibold leading-[0.92] tracking-[-0.04em] text-white">
          Produktive
        </h1>

        {/* Tagline */}
        <p className="mt-4 max-w-[420px] text-sm leading-relaxed text-muted-foreground">
          A focused, open-source Linear alternative for issues, ownership, and
          small team momentum.
        </p>

        {/* Coming soon badge */}
        <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-2 text-xs font-medium text-indigo-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-400" />
          </span>
          Coming soon
        </div>

        {/* Actions */}
        <div className="mt-10 flex items-center gap-3">
          <Button
            asChild
            className="h-10 rounded-full px-6 text-sm shadow-lg shadow-indigo-500/10 transition-all hover:shadow-indigo-500/20"
          >
            <Link to="/login">Get early access</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-10 rounded-full px-6 text-sm border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900"
          >
            <Link to="/dashboard">Go to app</Link>
          </Button>
        </div>

        {/* Footer */}
        <footer className="mt-20 flex items-center gap-4 text-[11px] text-muted-foreground">
          <span>Built with care</span>
          <span className="h-3 w-px bg-border" />
          <a
            href="https://github.com/lassejlv/produktive"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            GitHub
          </a>
          <span className="h-3 w-px bg-border" />
          <a
            href="mailto:hello@produktive.app"
            className="transition-colors hover:text-foreground"
          >
            Contact
          </a>
        </footer>
      </div>
    </main>
  );
}

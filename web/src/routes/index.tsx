import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: ComingSoonPage,
});

const today = new Intl.DateTimeFormat("en", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
}).format(new Date());

function Ornament() {
  return (
    <svg width="36" height="14" viewBox="0 0 36 14" aria-hidden="true">
      <path
        d="M0 7 H10 M26 7 H36 M14 7 L18 3 L22 7 L18 11 Z"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  );
}

function ComingSoonPage() {
  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-[1320px] flex-col px-6 pt-8 lg:px-12 lg:pt-12">
      {/* Newspaper masthead */}
      <header className="border-y-2 border-double border-ink py-3">
        <div className="flex items-baseline justify-between gap-6 text-ink-muted">
          <span className="eyebrow-ink hidden sm:block">Vol. I · No. 001</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
            {today}
          </span>
          <span className="eyebrow-ink hidden sm:block">Price · Free</span>
        </div>
      </header>

      {/* Big nameplate */}
      <section className="relative grid min-h-[58vh] grid-cols-12 items-end gap-6 border-b border-ink py-12 lg:py-16">
        <div className="col-span-12 lg:col-span-9">
          <p className="eyebrow mb-6 animate-type-rise">An Almanac for Working Teams</p>
          <h1
            className="serif-tight animate-type-rise delay-100 text-ink"
            style={{
              fontSize: "clamp(64px, 14vw, 220px)",
              lineHeight: "0.84",
              letterSpacing: "-0.05em",
              fontWeight: 500,
            }}
          >
            Produk
            <span className="text-vermilion">·</span>
            <span className="serif-italic" style={{ fontWeight: 400 }}>
              tive
            </span>
          </h1>
          <p
            className="mt-8 max-w-[520px] animate-type-rise delay-200 font-serif text-[18px] leading-[1.55] text-ink-soft sm:text-[20px]"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80' }}
          >
            A focused, open-source workshop for issues, ownership, and the daily
            momentum of small teams. Built with care, set in ink, served on paper.
          </p>
        </div>

        {/* Side column with ornament + status */}
        <aside className="col-span-12 flex flex-col items-start justify-end gap-5 lg:col-span-3 lg:items-end lg:text-right">
          <div className="animate-ink-bleed delay-300 flex items-center gap-3 border border-ink bg-paper-soft px-3 py-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-vermilion opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-vermilion" />
            </span>
            <span className="eyebrow-ink">Forthcoming Edition</span>
          </div>
          <div className="text-vermilion">
            <Ornament />
          </div>
          <p className="serif-italic max-w-[180px] text-[15px] leading-snug text-ink-muted">
            "The work is the work." — A note pinned above the desk.
          </p>
        </aside>
      </section>

      {/* Three-column editorial body */}
      <section className="grid grid-cols-1 gap-10 border-b border-ink py-12 md:grid-cols-3 lg:py-16">
        <article className="animate-ink-bleed delay-300">
          <p className="eyebrow mb-3">§ I — Plain Ledger</p>
          <h3
            className="font-serif text-[24px] font-medium leading-tight tracking-tight text-ink"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
          >
            Issues, set as type, in a single sober list.
          </h3>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
            No surfaces, no chrome, no neon. Just the work, ranked by what
            matters and stamped with the hand that picked it up.
          </p>
        </article>

        <article className="animate-ink-bleed delay-400 md:border-x md:border-ink/15 md:px-8">
          <p className="eyebrow mb-3">§ II — Open Press</p>
          <h3
            className="font-serif text-[24px] font-medium leading-tight tracking-tight text-ink"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
          >
            Source open. Roadmap public. Decisions in the margin.
          </h3>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
            Built in the open as a working alternative to the Linears and Jiras
            of the world. Run it yourself or run it with us.
          </p>
        </article>

        <article className="animate-ink-bleed delay-500">
          <p className="eyebrow mb-3">§ III — Small Teams</p>
          <h3
            className="font-serif text-[24px] font-medium leading-tight tracking-tight text-ink"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
          >
            For groups that finish things on Tuesdays.
          </h3>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
            Tuned for two-to-twenty operations who'd rather ship the next thing
            than configure the last one.
          </p>
        </article>
      </section>

      {/* Call to action — like a subscription card */}
      <section className="animate-ink-bleed delay-600 grid grid-cols-12 items-stretch gap-0 border-b border-ink">
        <div className="col-span-12 flex flex-col justify-between gap-6 p-8 md:col-span-7 md:p-10">
          <div>
            <p className="eyebrow mb-4">Subscribe to the dispatch</p>
            <h2
              className="serif-tight text-[44px] leading-[0.95] tracking-tight text-ink md:text-[60px]"
              style={{ fontWeight: 500 }}
            >
              Step inside the
              <br />
              <span className="serif-italic text-vermilion">workshop</span>.
            </h2>
            <p className="mt-5 max-w-[440px] text-[14px] leading-relaxed text-ink-muted">
              Early access opens by invitation. Take a key, walk in, leave the
              door propped for the next reader.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              to="/login"
              className="inline-flex h-12 items-center justify-center bg-ink px-7 text-[11px] font-medium uppercase tracking-[0.16em] text-paper-soft shadow-[4px_4px_0_0_var(--color-vermilion)] transition-all hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[5px_5px_0_0_var(--color-vermilion)]"
            >
              Request a key →
            </Link>
            <Link to="/dashboard" className="ink-link text-[13px]">
              or take the back door to the app
            </Link>
          </div>
        </div>

        <aside className="col-span-12 border-t border-ink bg-paper-deep p-8 md:col-span-5 md:border-l md:border-t-0 md:p-10">
          <p className="eyebrow mb-4">In this edition</p>
          <ol className="space-y-3 text-[14px] text-ink">
            {[
              ["I.", "A new ledger for issues"],
              ["II.", "Ownership, plainly noted"],
              ["III.", "Status without ceremony"],
              ["IV.", "Keyboard-first throughout"],
              ["V.", "Yours to host. Yours to fork."],
            ].map(([num, label]) => (
              <li key={num} className="flex items-baseline gap-3">
                <span className="font-mono text-[11px] text-ink-muted">{num}</span>
                <span className="serif-italic text-[16px] leading-snug">{label}</span>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      {/* Colophon footer */}
      <footer className="mt-auto flex flex-wrap items-baseline justify-between gap-6 py-6 text-[11px] text-ink-muted">
        <div className="flex items-center gap-3">
          <span className="eyebrow">Colophon</span>
          <span className="font-serif italic text-[13px]">
            Set in Fraunces &amp; Geist. Printed by Vite. Bound in TypeScript.
          </span>
        </div>
        <nav className="flex items-center gap-5 font-mono text-[10px] uppercase tracking-[0.16em]">
          <a
            href="https://github.com/lassejlv/produktive"
            target="_blank"
            rel="noopener noreferrer"
            className="ink-link"
          >
            Github
          </a>
          <a href="mailto:hello@produktive.app" className="ink-link">
            Contact
          </a>
          <span>© MMXXVI</span>
        </nav>
      </footer>
    </main>
  );
}

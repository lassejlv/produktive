export function Avatar({ name, image }: { name?: string; image?: string | null }) {
  if (image) {
    return (
      <img
        src={image}
        alt=""
        className="size-5 shrink-0 rounded-full border border-border-subtle object-cover"
      />
    );
  }
  return (
    <div className="grid size-5 shrink-0 place-items-center rounded-full border border-border-subtle bg-surface-2 text-[9px] font-medium text-fg-muted">
      {initialsFromName(name)}
    </div>
  );
}

function initialsFromName(name: string | undefined): string {
  const tokens = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "?";
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
}

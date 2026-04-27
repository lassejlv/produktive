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
  const initials = (name ?? "?").slice(0, 2).toUpperCase();
  return (
    <div className="grid size-5 shrink-0 place-items-center rounded-full border border-border-subtle bg-surface-2 text-[9px] font-medium text-fg-muted">
      {initials}
    </div>
  );
}

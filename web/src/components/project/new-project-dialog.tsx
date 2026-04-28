import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/issue/avatar";
import { MemberPicker } from "@/components/issue/member-picker";
import { Dialog } from "@/components/ui/dialog";
import { type Project, createProject, listMembers } from "@/lib/api";
import {
  defaultProjectColor,
  projectColorHex,
  projectColorOptions,
} from "@/lib/project-constants";
import { cn } from "@/lib/utils";

type NewProjectDialogProps = {
  onCreated?: (project: Project) => void;
  initialName?: string;
  /** When true, the trigger button is not rendered — dialog opens via the
   *  produktive:new-project custom event only. Useful when mounted globally. */
  headless?: boolean;
};

export function NewProjectDialog({
  onCreated,
  initialName,
  headless,
}: NewProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName ?? "");
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState<string>(defaultProjectColor);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [leadName, setLeadName] = useState<string | null>(null);
  const [leadImage, setLeadImage] = useState<string | null>(null);
  const [targetDate, setTargetDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string }>).detail;
      if (detail?.name) setName(detail.name);
      setOpen(true);
    };
    window.addEventListener("produktive:new-project", handler as EventListener);
    return () =>
      window.removeEventListener(
        "produktive:new-project",
        handler as EventListener,
      );
  }, []);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => nameRef.current?.focus());
  }, [open]);

  // When lead changes, fetch their summary for inline display
  useEffect(() => {
    if (!leadId) {
      setLeadName(null);
      setLeadImage(null);
      return;
    }
    let mounted = true;
    void listMembers()
      .then((response) => {
        if (!mounted) return;
        const member = response.members.find((m) => m.id === leadId);
        if (member) {
          setLeadName(member.name);
          setLeadImage(member.image);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [leadId]);

  const reset = () => {
    setName("");
    setIcon("");
    setColor(defaultProjectColor);
    setLeadId(null);
    setLeadName(null);
    setLeadImage(null);
    setTargetDate("");
    setSubmitting(false);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const response = await createProject({
        name: trimmed,
        icon: icon.trim() || null,
        color,
        leadId,
        targetDate: targetDate || null,
      });
      toast.success("Project created");
      onCreated?.(response.project);
      close();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create project",
      );
      setSubmitting(false);
    }
  };

  return (
    <>
      {!headless ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-fg px-3 text-[12.5px] font-medium text-bg transition-colors hover:bg-white"
        >
          <span aria-hidden>+</span>
          New project
        </button>
      ) : null}

      <Dialog open={open} onClose={close} className="w-full max-w-[440px]">
        <form onSubmit={submit} className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-3">
            <ColorIcon color={color} icon={icon} name={name || "P"} />
            <div className="min-w-0 flex-1">
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Project name"
                required
                className="h-9 w-full rounded-md border border-border bg-bg px-3 text-[14px] text-fg outline-none placeholder:text-fg-faint focus:border-fg-muted"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              value={icon}
              onChange={(event) => setIcon(event.target.value.slice(0, 4))}
              placeholder="🎯"
              maxLength={4}
              aria-label="Project emoji"
              className="h-8 w-12 rounded-md border border-border bg-bg text-center text-[16px] outline-none focus:border-fg-muted"
            />
            <div className="flex flex-wrap gap-1.5">
              {projectColorOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setColor(option)}
                  aria-label={`Color ${option}`}
                  className={cn(
                    "size-5 rounded-full transition-shadow",
                    color === option
                      ? "ring-2 ring-fg ring-offset-2 ring-offset-bg"
                      : "hover:ring-1 hover:ring-border",
                  )}
                  style={{ backgroundColor: projectColorHex[option] }}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-2.5">
            <Field label="Lead">
              <MemberPicker
                selectedId={leadId}
                onSelect={(id) => setLeadId(id)}
                trigger={({ onClick }) => (
                  <button
                    type="button"
                    onClick={onClick}
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-bg px-2.5 text-[12.5px] text-fg-muted transition-colors hover:border-fg-muted hover:text-fg"
                  >
                    {leadId && leadName ? (
                      <>
                        <Avatar name={leadName} image={leadImage} />
                        <span>{leadName}</span>
                      </>
                    ) : (
                      <>
                        <span className="size-5 rounded-full border border-dashed border-border-subtle" />
                        <span>Pick a lead</span>
                      </>
                    )}
                  </button>
                )}
              />
            </Field>
            <Field label="Target date">
              <input
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
                className="h-8 rounded-md border border-border bg-bg px-2.5 text-[12.5px] text-fg outline-none focus:border-fg-muted"
              />
            </Field>
          </div>

          <div className="mt-1 flex items-center justify-end gap-2 border-t border-border-subtle pt-3">
            <button
              type="button"
              onClick={close}
              className="h-8 rounded-md px-3 text-[12.5px] text-fg-muted transition-colors hover:bg-surface hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="h-8 rounded-md bg-fg px-3 text-[12.5px] font-medium text-bg transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function ColorIcon({
  color,
  icon,
  name,
}: {
  color: string;
  icon: string;
  name: string;
}) {
  const fg = projectColorHex[color] ?? projectColorHex.blue;
  const display = (icon || name.charAt(0) || "•").trim() || "•";
  return (
    <span
      className="grid size-9 shrink-0 place-items-center rounded-md text-[18px] font-medium"
      style={{
        backgroundColor: `${fg}33`,
        color: fg,
      }}
      aria-hidden
    >
      {display}
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[12px] text-fg-muted">{label}</span>
      <div>{children}</div>
    </label>
  );
}

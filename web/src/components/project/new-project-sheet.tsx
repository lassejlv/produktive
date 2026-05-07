import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/issue/avatar";
import { MemberPicker } from "@/components/issue/member-picker";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { type Project, createProject, listMembers } from "@/lib/api";
import {
  defaultProjectColor,
  projectColorHex,
  projectColorOptions,
} from "@/lib/project-constants";
import { cn } from "@/lib/utils";

type NewProjectSheetProps = {
  onCreated?: (project: Project) => void;
  initialName?: string;
  /** When true, the trigger button is not rendered — sheet opens via the
   *  produktive:new-project custom event only. Useful when mounted globally. */
  headless?: boolean;
};

export function NewProjectSheet({
  onCreated,
  initialName,
  headless,
}: NewProjectSheetProps) {
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
    if (!headless) return;

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
  }, [headless]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => nameRef.current?.focus());
  }, [open]);

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
        <Button size="sm" onClick={() => setOpen(true)}>
          New project
        </Button>
      ) : null}

      <Sheet open={open} onClose={close} side="right">
        <form onSubmit={submit} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>New project</SheetTitle>
            <SheetClose onClose={close} />
          </SheetHeader>

          <SheetContent>
            <div className="px-5 pt-5 pb-1">
              <div className="flex items-center gap-3">
                <ColorIcon color={color} icon={icon} name={name || "P"} />
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Project name"
                  required
                  className="min-w-0 flex-1 bg-transparent py-0 text-[18px] font-medium leading-snug tracking-[-0.02em] text-fg outline-none placeholder:text-fg-faint"
                />
              </div>
            </div>

            <div className="relative mt-4 px-5 pb-4 pt-3">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-border-subtle via-border-subtle/60 to-transparent"
              />
              <p className="mb-2 text-[11.5px] font-medium text-fg-muted">Color</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={icon}
                  onChange={(event) => setIcon(event.target.value.slice(0, 4))}
                  placeholder="🎯"
                  maxLength={4}
                  aria-label="Project emoji"
                  className="h-8 w-12 rounded-[8px] border border-border-subtle bg-surface/50 text-center text-[16px] outline-none transition-colors hover:border-border focus:border-accent/60 focus:bg-surface focus:ring-2 focus:ring-accent/30"
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
            </div>

            <div className="relative px-5 pb-6 pt-4">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-border-subtle via-border-subtle/60 to-transparent"
              />
              <div className="grid gap-3">
                <Field label="Lead">
                  <MemberPicker
                    selectedId={leadId}
                    onSelect={(id) => setLeadId(id)}
                    trigger={({ onClick }) => (
                      <button
                        type="button"
                        onClick={onClick}
                        className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-border-subtle bg-surface/40 px-2.5 text-[12.5px] text-fg-muted transition-colors hover:border-border hover:bg-surface/60 hover:text-fg"
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
                    className="h-8 rounded-[8px] border border-border-subtle bg-surface/40 px-2.5 text-[12.5px] text-fg outline-none transition-colors hover:border-border focus:border-accent/60 focus:bg-surface focus:ring-2 focus:ring-accent/30"
                  />
                </Field>
              </div>
            </div>
          </SheetContent>

          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-md px-2 text-[12px] text-fg-muted hover:text-fg"
              onClick={close}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-8 rounded-md px-4 text-[12px] font-medium"
              disabled={!name.trim() || submitting}
            >
              {submitting ? <Spinner size={11} /> : "Create project"}
            </Button>
          </SheetFooter>
        </form>
      </Sheet>
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

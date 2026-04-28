import { useEffect, useRef, useState } from "react";
import { CaretIcon, CheckIcon, PlusIcon } from "@/components/chat/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  type OrganizationMembership,
  createOrganization,
  switchOrganization,
  useOrganizations,
} from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type OrgSwitcherProps = {
  activeOrganization: { id: string; name: string };
};

export function OrgSwitcher({ activeOrganization }: OrgSwitcherProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const { organizations } = useOrganizations(menuOpen);

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const handleSwitch = async (org: OrganizationMembership) => {
    if (org.id === activeOrganization.id) {
      setMenuOpen(false);
      return;
    }
    setBusy(true);
    setSwitchError(null);
    try {
      await switchOrganization(org.id);
      window.location.reload();
    } catch (error) {
      setSwitchError(
        error instanceof Error ? error.message : "Failed to switch organization",
      );
      setBusy(false);
    }
  };

  const initial = activeOrganization.name.trim().charAt(0).toUpperCase() || "O";

  return (
    <>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-[8px] border border-transparent px-1.5 py-1.5 text-left transition-colors",
            menuOpen
              ? "border-border bg-surface"
              : "hover:border-border hover:bg-surface/65",
          )}
        >
          <div className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-fg text-[12px] font-semibold text-bg">
            {initial}
          </div>
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.015em] text-fg">
            {activeOrganization.name}
          </span>
          <span
            className={cn(
              "text-fg-muted transition-transform",
              menuOpen && "rotate-180",
            )}
          >
            <CaretIcon />
          </span>
        </button>

        {menuOpen ? (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-[10px] border border-border bg-surface shadow-[0_18px_40px_rgba(0,0,0,0.45)] animate-fade-up">
            <div className="px-3 pt-2.5 pb-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint">
              Workspaces
            </div>
            <div className="flex max-h-[260px] flex-col overflow-auto pb-1">
              {organizations.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-fg-faint">
                  Loading…
                </div>
              ) : (
                organizations.map((org) => {
                  const isActive = org.id === activeOrganization.id;
                  return (
                    <button
                      key={org.id}
                      type="button"
                      disabled={busy}
                      onClick={() => void handleSwitch(org)}
                      className={cn(
                        "flex h-9 items-center gap-2.5 px-3 text-left text-[13px] transition-colors",
                        isActive
                          ? "text-fg"
                          : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                        busy && "cursor-wait opacity-60",
                      )}
                    >
                      <div className="grid size-5 shrink-0 place-items-center rounded-[5px] bg-fg text-[10px] font-semibold text-bg">
                        {org.name.trim().charAt(0).toUpperCase() || "O"}
                      </div>
                      <span className="min-w-0 flex-1 truncate">{org.name}</span>
                      {isActive ? (
                        <span className="text-fg">
                          <CheckIcon size={13} />
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
            <div className="border-t border-border-subtle">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setMenuOpen(false);
                  setCreateOpen(true);
                }}
                className="flex h-9 w-full items-center gap-2.5 px-3 text-left text-[13px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-60"
              >
                <span className="grid size-5 shrink-0 place-items-center rounded-[5px] border border-border text-fg-muted">
                  <PlusIcon size={11} />
                </span>
                <span>Create organization</span>
              </button>
            </div>
            {switchError ? (
              <div className="border-t border-border-subtle px-3 py-2 text-[12px] text-danger">
                {switchError}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <CreateOrganizationDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </>
  );
}

function CreateOrganizationDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setError(null);
      setIsSaving(false);
    }
  }, [open]);

  const close = () => {
    if (isSaving) return;
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setIsSaving(true);
    setError(null);
    try {
      await createOrganization(trimmed);
      window.location.reload();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Failed to create organization",
      );
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={close}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Create organization</DialogTitle>
          <DialogClose onClose={close} />
        </DialogHeader>

        <DialogContent className="space-y-3 p-4">
          <Input
            autoFocus
            required
            maxLength={64}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Acme Inc."
            className="h-10 border-0 bg-transparent px-0 text-base focus-visible:ring-0"
          />
          {error ? (
            <p className="text-xs text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </DialogContent>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isSaving || !name.trim()}>
            {isSaving ? (
              <span className="flex items-center gap-2">
                <span className="inline-block size-3 animate-spin rounded-full border-2 border-bg/30 border-t-bg" />
                Creating…
              </span>
            ) : (
              "Create organization"
            )}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

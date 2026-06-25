import { useId, useState, type FormEvent } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Dialog, DialogClose, DialogContent } from "#/components/Dialog";
import { Spinner } from "#/components/ui/spinner";
import { cn } from "#/lib/cn";
import type { DeployRegion } from "#/lib/types";
import { fieldControlClass } from "#/components/deployments/deploy-shared";

const RAM_PRESETS = [
  { label: "512 MB", value: 512 },
  { label: "1 GB", value: 1024 },
  { label: "2 GB", value: 2048 },
  { label: "4 GB", value: 4096 },
] as const;

const CPU_PRESETS = [1, 2, 4, 8] as const;

export function CreateSandboxDialog({
  open,
  pending,
  regions,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  regions: DeployRegion[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: {
    name: string;
    slug?: string;
    region?: string;
    cpus?: number;
    ram_mb?: number;
    url_auth?: "sprite" | "public";
  }) => void;
}) {
  const nameId = useId();
  const slugId = useId();
  const regionId = useId();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [region, setRegion] = useState(regions[0]?.code ?? "fra");
  const [cpus, setCpus] = useState(1);
  const [ramMb, setRamMb] = useState(512);
  const [urlAuth, setUrlAuth] = useState<"sprite" | "public">("sprite");

  const reset = () => {
    setName("");
    setSlug("");
    setRegion(regions[0]?.code ?? "fra");
    setCpus(1);
    setRamMb(512);
    setUrlAuth("sprite");
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      slug: slug.trim() || undefined,
      region,
      cpus,
      ram_mb: ramMb,
      url_auth: urlAuth,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Create sandbox" description="Provision a persistent Sprites.dev environment.">
        <form
          className="space-y-4"
          onSubmit={handleSubmit}
          onReset={() => {
            reset();
            onOpenChange(false);
          }}
        >
          <div>
            <label htmlFor={nameId} className="text-[12px] text-[var(--color-fg-muted)]">
              Name
            </label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={cn("mt-1.5", fieldControlClass)}
              placeholder="Agent workspace"
              required
            />
          </div>
          <div>
            <label htmlFor={slugId} className="text-[12px] text-[var(--color-fg-muted)]">
              Slug (optional)
            </label>
            <Input
              id={slugId}
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              className={cn("mt-1.5", fieldControlClass)}
              placeholder="agent-workspace"
            />
          </div>
          <div>
            <label htmlFor={regionId} className="text-[12px] text-[var(--color-fg-muted)]">
              Region
            </label>
            <select
              id={regionId}
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              className={cn("mt-1.5 w-full", fieldControlClass)}
            >
              {regions.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.flag} {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[12px] text-[var(--color-fg-muted)]">CPUs</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {CPU_PRESETS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCpus(value)}
                    className={cn(
                      "rounded-[var(--radius-sm)] border px-2.5 py-1 text-[12px]",
                      cpus === value
                        ? "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)]"
                        : "border-[var(--color-border)] text-[var(--color-fg-muted)]",
                    )}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[12px] text-[var(--color-fg-muted)]">Memory</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {RAM_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setRamMb(preset.value)}
                    className={cn(
                      "rounded-[var(--radius-sm)] border px-2.5 py-1 text-[12px]",
                      ramMb === preset.value
                        ? "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)]"
                        : "border-[var(--color-border)] text-[var(--color-fg-muted)]",
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <p className="text-[12px] text-[var(--color-fg-muted)]">URL access</p>
            <div className="mt-1.5 flex gap-2">
              {(["sprite", "public"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setUrlAuth(value)}
                  className={cn(
                    "rounded-[var(--radius-sm)] border px-2.5 py-1 text-[12px] capitalize",
                    urlAuth === value
                      ? "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)]"
                      : "border-[var(--color-border)] text-[var(--color-fg-muted)]",
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="reset" variant="secondary" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" size="sm" disabled={pending || !name.trim()}>
              {pending && <Spinner className="size-3" />}
              Create sandbox
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

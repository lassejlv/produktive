import { useId, useState, type FormEvent } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Dialog, DialogClose, DialogContent } from "#/components/Dialog";
import { Spinner } from "#/components/ui/spinner";
import { cn } from "#/lib/cn";
import { OBJECT_STORAGE_REGIONS } from "#/lib/object-storage";
import { fieldControlClass } from "#/components/deployments/deploy-shared";

export function CreateBucketDialog({
  open,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: {
    name: string;
    slug?: string;
    region?: string;
    access?: "private" | "public";
  }) => void;
}) {
  const nameId = useId();
  const slugId = useId();
  const regionId = useId();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [region, setRegion] = useState(OBJECT_STORAGE_REGIONS[0]?.code ?? "ams");

  const reset = () => {
    setName("");
    setSlug("");
    setRegion(OBJECT_STORAGE_REGIONS[0]?.code ?? "ams");
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      slug: slug.trim() || undefined,
      region,
      // Buckets are always private; public access is disabled.
      access: "private",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Create bucket"
        description="Provision a Tigris object storage bucket for this workspace."
      >
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
              placeholder="Uploads"
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
              placeholder="uploads"
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
              {OBJECT_STORAGE_REGIONS.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.flag} {item.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-[12px] text-[var(--color-fg-muted)]">Access</p>
            <p className="mt-1.5 text-[13px] text-[var(--color-fg)]">Private</p>
            <p className="mt-1 text-[12px] text-[var(--color-fg-dim)]">
              Buckets are private. Public access is disabled.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose type="reset" disabled={pending}>
              Cancel
            </DialogClose>
            <Button type="submit" size="sm" disabled={pending || !name.trim()}>
              {pending ? <Spinner size={14} /> : "Create bucket"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

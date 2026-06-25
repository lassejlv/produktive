import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { Dialog, DialogClose, DialogContent } from "../components/Dialog";
import { cn } from "#/lib/cn";
import { toast } from "#/lib/toast";
import { useRequestDeployAccess } from "../lib/queries";
import type {
  DeployAccessStatus,
  DeployRegistryCredential,
  DeployRegistryKind,
  DeployResourcePreset,
} from "../lib/types";
import { fieldControlClass, parseKeyValues, RESOURCE_PRESETS } from "../components/deployments/deploy-shared";

export type { DeployDetailTab } from "#/lib/deployments";

export const Route = createFileRoute("/_authed/$wid/deployments")({
  component: () => <Outlet />,
});

export function RequestAccessOverlay({ wid, status }: { wid: string; status: DeployAccessStatus }) {
  const request = useRequestDeployAccess(wid);
  const pending = status === "pending";
  const denied = status === "denied";
  const disabled = status === "disabled";

  const title = disabled
    ? "Deployments disabled"
    : pending
      ? "Access requested"
      : "Deployments private preview";
  const description = disabled
    ? "Deployments are disabled on this Produktive deployment."
    : pending
      ? "Your request is in review. Deployments unlock for this workspace once approved."
      : denied
        ? "Your previous request was declined. You can submit a new request for review."
        : "Request access to deploy HTTP services from Docker images.";

  return (
    <div className="absolute inset-0 z-10 flex items-start justify-center px-4 pt-8 sm:pt-16">
      <div className="w-full max-w-md overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-pop)]">
        <div className="h-1 bg-[linear-gradient(90deg,var(--color-accent)_0%,color-mix(in_srgb,var(--color-accent)_40%,transparent)_100%)]" />
        <div className="p-6 text-center sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-row)] text-[var(--color-fg-muted)]">
            <Lock size={20} />
          </div>
          <h2 className="mt-5 text-[17px] font-medium tracking-tight text-[var(--color-fg)]">
            {title}
          </h2>
          <p className="mt-2 text-[13px] leading-6 text-[var(--color-fg-muted)]">{description}</p>
          <div className="mt-6">
            {pending || disabled ? (
              <Button type="button" variant="secondary" size="sm" disabled>
                {disabled ? "Unavailable" : "Request pending"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={request.isPending}
                onClick={() =>
                  request.mutate(undefined, {
                    onSuccess: () => toast.success("Access requested"),
                    onError: (err) => toast.error((err as Error).message),
                  })
                }
              >
                {request.isPending && <Spinner className="size-3" />}
                Request access
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CreateCredentialDialog({
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
    registry_kind: DeployRegistryKind;
    username: string;
    password: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [registryKind, setRegistryKind] = useState<DeployRegistryKind>("ghcr");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({ name, registry_kind: registryKind, username, password });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Registry credential"
        description="Credentials are encrypted before they are stored."
        footer={
          <>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              form="deploy-credential-form"
              variant="default"
              disabled={pending}
            >
              {pending && <Spinner className="size-3" />} Save credential
            </Button>
          </>
        }
      >
        <form id="deploy-credential-form" onSubmit={submit} className="space-y-4">
          <Field label="Name">
            <input
              className={cn(fieldControlClass, "h-9")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          <Field label="Registry">
            <select
              className={cn(fieldControlClass, "h-9")}
              value={registryKind}
              onChange={(e) => setRegistryKind(e.target.value as DeployRegistryKind)}
            >
              <option value="ghcr">GitHub Container Registry</option>
              <option value="docker_hub">Docker Hub</option>
            </select>
          </Field>
          <Field label="Username">
            <input
              className={cn(fieldControlClass, "h-9")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </Field>
          <Field label="Token / password">
            <input
              type="password"
              className={cn(fieldControlClass, "h-9")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateServiceDialog({
  open,
  credentials,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  credentials: DeployRegistryCredential[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: {
    name: string;
    image: string;
    registry_kind: DeployRegistryKind;
    registry_credential_id?: string | null;
    internal_port: number;
    env: Record<string, string>;
    secrets: Record<string, string>;
    environment: string;
    health_check_path: string;
    region: string;
    resource_preset: DeployResourcePreset;
  }) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [registryKind, setRegistryKind] = useState<DeployRegistryKind>("ghcr");
  const [credentialId, setCredentialId] = useState("");
  const [port, setPort] = useState(3000);
  const [environment, setEnvironment] = useState("production");
  const [region, setRegion] = useState("fra");
  const [health, setHealth] = useState("/");
  const [resourcePreset, setResourcePreset] = useState<DeployResourcePreset>("preview_small");
  const [envText, setEnvText] = useState("");
  const [secretText, setSecretText] = useState("");

  useEffect(() => {
    if (!open) setStep(1);
  }, [open]);

  const basicsValid = name.trim().length > 0 && image.trim().length > 0 && port >= 1 && port <= 65535;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (step === 1) {
      if (!basicsValid) return;
      setStep(2);
      return;
    }
    try {
      onSubmit({
        name,
        image,
        registry_kind: registryKind,
        registry_credential_id: credentialId || null,
        internal_port: port,
        env: parseKeyValues(envText),
        secrets: parseKeyValues(secretText),
        environment,
        health_check_path: health,
        region,
        resource_preset: resourcePreset,
      });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New deployment service"
        description={
          step === 1
            ? "Step 1 of 2 — image and connectivity."
            : "Step 2 of 2 — runtime, compute, and secrets."
        }
        size="lg"
        footer={
          <>
            {step === 2 ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => setStep(1)}
              >
                Back
              </Button>
            ) : (
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
            )}
            <Button
              type="submit"
              form="deploy-service-form"
              variant="default"
              disabled={pending || (step === 1 && !basicsValid)}
            >
              {pending && <Spinner className="size-3" />}
              {step === 1 ? "Continue" : "Create service"}
            </Button>
          </>
        }
      >
        <div className="mb-4 flex items-center gap-2">
          {[1, 2].map((n) => (
            <div
              key={n}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                n <= step ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]",
              )}
            />
          ))}
        </div>
        <form id="deploy-service-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {step === 1 ? (
            <>
              <Field label="Name">
                <input
                  className={cn(fieldControlClass, "h-9")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>
              <Field label="Image">
                <input
                  className={cn(fieldControlClass, "h-9")}
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="ghcr.io/acme/api:latest"
                  required
                />
              </Field>
              <Field label="Registry">
                <select
                  className={cn(fieldControlClass, "h-9")}
                  value={registryKind}
                  onChange={(e) => setRegistryKind(e.target.value as DeployRegistryKind)}
                >
                  <option value="ghcr">GHCR</option>
                  <option value="docker_hub">Docker Hub</option>
                </select>
              </Field>
              <Field label="Credential">
                <select
                  className={cn(fieldControlClass, "h-9")}
                  value={credentialId}
                  onChange={(e) => setCredentialId(e.target.value)}
                >
                  <option value="">No credential</option>
                  {credentials.map((credential) => (
                    <option key={credential.id} value={credential.id}>
                      {credential.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Port">
                <input
                  type="number"
                  min={1}
                  max={65535}
                  className={cn(fieldControlClass, "h-9")}
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  required
                />
              </Field>
              <Field label="Health path">
                <input
                  className={cn(fieldControlClass, "h-9")}
                  value={health}
                  onChange={(e) => setHealth(e.target.value)}
                  required
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Region">
                <input
                  className={cn(fieldControlClass, "h-9")}
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  required
                />
              </Field>
              <Field label="Environment">
                <input
                  className={cn(fieldControlClass, "h-9")}
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  required
                />
              </Field>
              <Field label="Compute" className="sm:col-span-2">
                <select
                  className={cn(fieldControlClass, "h-9")}
                  value={resourcePreset}
                  onChange={(e) => setResourcePreset(e.target.value as DeployResourcePreset)}
                >
                  {RESOURCE_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label} · {preset.detail}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Env vars">
                <textarea
                  className={cn(fieldControlClass, "min-h-28 resize-y py-2")}
                  value={envText}
                  onChange={(e) => setEnvText(e.target.value)}
                  placeholder={"LOG_LEVEL=info"}
                />
              </Field>
              <Field label="Secrets">
                <textarea
                  className={cn(fieldControlClass, "min-h-28 resize-y py-2")}
                  value={secretText}
                  onChange={(e) => setSecretText(e.target.value)}
                  placeholder={"DATABASE_URL=postgres://..."}
                />
              </Field>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[12px] font-medium text-[var(--color-fg-muted)]">{label}</span>
      {children}
    </label>
  );
}


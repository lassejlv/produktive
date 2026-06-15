const DEFAULT_APP_HOSTS = ["unstatus.app", "www.unstatus.app", "produktive.app", "www.produktive.app"];
const APP_HOSTS = new Set([...DEFAULT_APP_HOSTS, ...configuredAppHosts()]);

export function customStatusDomain(): string | null {
  if (typeof window === "undefined") return null;
  const hostname = window.location.hostname.trim().toLowerCase();
  if (!hostname || isLocalHost(hostname) || APP_HOSTS.has(hostname)) {
    return null;
  }
  return hostname;
}

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

function configuredAppHosts(): string[] {
  const raw = import.meta.env.VITE_APP_HOSTS;
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((host) => host.trim().replace(/\.+$/, "").toLowerCase())
    .filter(Boolean);
}

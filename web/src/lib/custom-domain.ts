const APP_HOSTS = new Set(["unstatus.app", "www.unstatus.app"]);

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

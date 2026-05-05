import { refreshTwoFactor } from "@/lib/auth-client";

export async function requestFreshTwoFactorIfNeeded(enabled: boolean) {
  if (!enabled) return;
  const code = window.prompt("Enter your 2FA code to continue.");
  if (!code?.trim()) {
    throw new Error("Fresh two-factor verification required");
  }
  await refreshTwoFactor(code.trim());
}

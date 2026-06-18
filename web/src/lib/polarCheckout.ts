import { PolarEmbedCheckout } from "@polar-sh/checkout/embed";
import type { Theme } from "#/lib/theme";
import type { BillingCheckoutResponse } from "./billing";

export type PolarCheckoutInstance = Awaited<ReturnType<typeof PolarEmbedCheckout.create>>;

export function checkoutUrlFromResponse(
  res: BillingCheckoutResponse | { payment_url?: string; url?: string },
): string | null {
  const target = res.payment_url ?? res.url;
  return target?.trim() ? target : null;
}

export interface OpenPolarCheckoutOptions {
  theme?: Theme;
  onSuccess?: () => void;
  onClose?: () => void;
}

export async function openPolarCheckout(
  checkoutUrl: string,
  options?: OpenPolarCheckoutOptions,
): Promise<PolarCheckoutInstance> {
  const theme = options?.theme ?? readDocumentTheme();
  const checkout = await PolarEmbedCheckout.create(checkoutUrl, { theme });

  checkout.addEventListener("success", (event) => {
    event.preventDefault();
    options?.onSuccess?.();
    checkout.close();
  });

  checkout.addEventListener("close", () => {
    options?.onClose?.();
  });

  return checkout;
}

function readDocumentTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "dark" ? "dark" : "light";
}

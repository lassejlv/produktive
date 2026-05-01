import { PolarEmbedCheckout } from "@polar-sh/checkout/embed";

type PolarCheckoutOptions = {
  onClose?: () => void;
  onSuccess?: () => void;
};

export async function openPolarCheckout(checkoutUrl: string, options: PolarCheckoutOptions = {}) {
  const checkout = await PolarEmbedCheckout.create(checkoutUrl, {
    theme: "dark",
  });

  if (options.onClose) {
    checkout.addEventListener("close", options.onClose);
  }

  if (options.onSuccess) {
    checkout.addEventListener("success", options.onSuccess);
  }

  return checkout;
}

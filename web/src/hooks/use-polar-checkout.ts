import { useCallback, useEffect, useRef } from "react";
import {
  checkoutUrlFromResponse,
  openPolarCheckout,
  type OpenPolarCheckoutOptions,
  type PolarCheckoutInstance,
} from "#/lib/polarCheckout";
import { useTheme } from "#/lib/theme";
import { toast } from "#/lib/toast";

export function usePolarCheckout() {
  const { theme } = useTheme();
  const instanceRef = useRef<PolarCheckoutInstance | null>(null);

  useEffect(() => {
    return () => {
      instanceRef.current?.close();
      instanceRef.current = null;
    };
  }, []);

  const openFromResponse = useCallback(
    async (
      res: { payment_url?: string; url?: string },
      handlers?: Pick<OpenPolarCheckoutOptions, "onSuccess" | "onClose">,
    ) => {
      const url = checkoutUrlFromResponse(res);
      if (!url) return false;

      try {
        instanceRef.current?.close();
        instanceRef.current = await openPolarCheckout(url, {
          theme,
          onSuccess: handlers?.onSuccess,
          onClose: () => {
            instanceRef.current = null;
            handlers?.onClose?.();
          },
        });
        return true;
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not open embedded checkout",
        );
        window.location.assign(url);
        return false;
      }
    },
    [theme],
  );

  return { openFromResponse };
}

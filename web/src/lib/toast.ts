import type { ReactNode } from "react";
import { toastManager } from "#/components/ui/toast";

export type ToastOptions = {
  description?: ReactNode;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
};

const DEFAULT_DURATION = 3500;

function show(
  type: string | undefined,
  message: string,
  options?: ToastOptions,
): string {
  return toastManager.add({
    type,
    title: message,
    description: options?.description,
    timeout: options?.duration ?? DEFAULT_DURATION,
    actionProps: options?.action
      ? {
          children: options.action.label,
          onClick: options.action.onClick,
        }
      : undefined,
  });
}

function toastFn(message: string, options?: ToastOptions): string {
  return show(undefined, message, options);
}

export const toast = Object.assign(toastFn, {
  success: (message: string, options?: ToastOptions) =>
    show("success", message, options),
  error: (message: string, options?: ToastOptions) =>
    show("error", message, options),
  info: (message: string, options?: ToastOptions) =>
    show("info", message, options),
  warning: (message: string, options?: ToastOptions) =>
    show("warning", message, options),
  message: (message: string, options?: ToastOptions) =>
    show(undefined, message, options),
});

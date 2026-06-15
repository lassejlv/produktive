import { isValidElement, type ReactElement, type ReactNode } from "react";
import { cn } from "#/lib/cn";
import {
  Dialog as DialogRoot,
  DialogClose as UIDialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger as UIDialogTrigger,
} from "#/components/ui/dialog";
import type { DialogPrimitive } from "#/components/ui/dialog";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogRoot>
  );
}

interface ContentProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap: Record<NonNullable<ContentProps["size"]>, string> = {
  sm: "max-w-[380px]",
  md: "max-w-[480px]",
  lg: "max-w-[640px]",
};

export function DialogContent({
  title,
  description,
  children,
  footer,
  className,
  size = "md",
}: ContentProps) {
  return (
    <DialogPopup
      showCloseButton={false}
      className={cn("w-[calc(100vw-32px)]", sizeMap[size], className)}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </DialogHeader>
      {children ? <DialogPanel scrollFade={false}>{children}</DialogPanel> : null}
      {footer ? <DialogFooter variant="bare">{footer}</DialogFooter> : null}
    </DialogPopup>
  );
}

type DialogCloseProps = DialogPrimitive.Close.Props & {
  asChild?: boolean;
};

export function DialogClose({ asChild, children, ...props }: DialogCloseProps) {
  if (asChild && isValidElement(children)) {
    return <UIDialogClose render={children as ReactElement} {...props} />;
  }

  return <UIDialogClose {...props}>{children}</UIDialogClose>;
}

export const DialogTrigger = UIDialogTrigger;

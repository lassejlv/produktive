import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { useMediaQuery } from "@/lib/use-media-query";
import { useOnboarding } from "./onboarding-context";
import { OnboardingTooltip } from "./onboarding-tooltip";
import { type TargetRect, useTargetRect } from "./use-onboarding-target";

const SPOTLIGHT_PADDING = 6;
const SPOTLIGHT_RADIUS = 10;

export function OnboardingOverlay() {
  const onboarding = useOnboarding();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || !onboarding.isActive || !onboarding.step) return null;
  if (typeof document === "undefined") return null;

  const tooltipProps = {
    step: onboarding.stepIndex + 1,
    total: onboarding.totalSteps,
    title: onboarding.step.title,
    body: onboarding.step.body,
    ctaLabel: onboarding.step.ctaLabel,
    onBack: onboarding.back,
    onNext: onboarding.next,
    onSkip: onboarding.skip,
    showBack: onboarding.stepIndex > 0,
  };

  return createPortal(
    isMobile ? (
      <MobileShell tooltipProps={tooltipProps} />
    ) : (
      <DesktopShell tooltipProps={tooltipProps} target={onboarding.step.target} placement={onboarding.step.placement} />
    ),
    document.body,
  );
}

type TooltipProps = ComponentProps<typeof OnboardingTooltip>;

function DesktopShell({
  tooltipProps,
  target,
  placement,
}: {
  tooltipProps: TooltipProps;
  target: string | null;
  placement?: "top" | "bottom" | "left" | "right";
}) {
  const rect = useTargetRect(target);

  if (target == null) {
    return (
      <>
        <FullDim />
        <CenterTooltip>
          <OnboardingTooltip {...tooltipProps} />
        </CenterTooltip>
      </>
    );
  }

  if (!rect) {
    return (
      <>
        <FullDim />
        <CenterTooltip>
          <OnboardingTooltip {...tooltipProps} />
        </CenterTooltip>
      </>
    );
  }

  return (
    <>
      <Spotlight rect={rect} />
      <Popover open>
        <PopoverAnchor asChild>
          <span
            aria-hidden
            style={{
              position: "fixed",
              top: rect.top + rect.height / 2,
              left: rect.left + rect.width / 2,
              width: 0,
              height: 0,
              pointerEvents: "none",
            }}
          />
        </PopoverAnchor>
        <PopoverContent
          side={placement ?? "bottom"}
          align="center"
          sideOffset={16}
          collisionPadding={20}
          avoidCollisions
          className="z-[71] border-0 bg-transparent p-0 shadow-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <OnboardingTooltip {...tooltipProps} />
        </PopoverContent>
      </Popover>
    </>
  );
}

function MobileShell({ tooltipProps }: { tooltipProps: TooltipProps }) {
  return (
    <>
      <FullDim />
      <div className="fixed inset-x-4 bottom-4 z-[71] flex justify-center">
        <OnboardingTooltip {...tooltipProps} />
      </div>
    </>
  );
}

function FullDim() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-[1px] animate-fade-in"
    />
  );
}

function CenterTooltip({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[71] grid place-items-center p-4">
      {children}
    </div>
  );
}

function Spotlight({ rect }: { rect: TargetRect }) {
  const x = Math.max(0, rect.left - SPOTLIGHT_PADDING);
  const y = Math.max(0, rect.top - SPOTLIGHT_PADDING);
  const w = rect.width + SPOTLIGHT_PADDING * 2;
  const h = rect.height + SPOTLIGHT_PADDING * 2;

  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[70] h-full w-full animate-fade-in motion-reduce:animate-none"
    >
      <defs>
        <mask id="produktive-onboarding-cutout">
          <rect width="100%" height="100%" fill="white" />
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            rx={SPOTLIGHT_RADIUS}
            ry={SPOTLIGHT_RADIUS}
            fill="black"
            style={{
              transition:
                "x 220ms ease-out, y 220ms ease-out, width 220ms ease-out, height 220ms ease-out",
            }}
          />
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="rgba(0, 0, 0, 0.55)"
        mask="url(#produktive-onboarding-cutout)"
      />
    </svg>
  );
}

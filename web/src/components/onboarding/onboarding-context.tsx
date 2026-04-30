import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { markOnboarding } from "@/lib/api";
import { refreshSession } from "@/lib/auth-client";
import {
  type OnboardingStep,
  type SignalName,
  type StepId,
  STEPS,
  stepIndex,
} from "./steps";

const SKIP_FLAG = "produktive-onboarding-deferred-this-session";

type OnboardingContextValue = {
  isActive: boolean;
  step: OnboardingStep | null;
  stepIndex: number;
  totalSteps: number;
  firstIssueId: string | null;
  start: (from?: StepId) => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  signal: (name: SignalName) => void;
  setFirstIssueId: (id: string | null) => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [activeStepId, setActiveStepId] = useState<StepId | null>(null);
  const [firstIssueId, setFirstIssueId] = useState<string | null>(null);
  const firstIssueIdRef = useRef<string | null>(null);
  firstIssueIdRef.current = firstIssueId;

  const idx = activeStepId ? stepIndex(activeStepId) : -1;
  const step = idx >= 0 ? STEPS[idx] : null;

  const persist = useCallback(
    async (patch: { completed?: boolean; step?: string }) => {
      try {
        await markOnboarding(patch);
        await refreshSession();
      } catch {
        // Non-fatal; tour still works in-session.
      }
    },
    [],
  );

  const handleNavigation = useCallback(
    async (target: OnboardingStep) => {
      if (!target.navigateBefore) return true;
      let to: string;
      if (target.navigateBefore === "/issues/$first") {
        const id = firstIssueIdRef.current;
        if (!id) return false;
        to = `/issues/${id}`;
      } else {
        to = target.navigateBefore;
      }
      if (pathname !== to) {
        await navigate({ to });
      }
      return true;
    },
    [navigate, pathname],
  );

  const goTo = useCallback(
    async (id: StepId) => {
      let target = STEPS[stepIndex(id)];
      while (target.requiresFirstIssue && !firstIssueIdRef.current) {
        const ni = stepIndex(target.id) + 1;
        if (ni >= STEPS.length) {
          target = STEPS[STEPS.length - 1];
          break;
        }
        target = STEPS[ni];
      }
      const ok = await handleNavigation(target);
      if (!ok) {
        target = STEPS[STEPS.length - 1];
      }
      setActiveStepId(target.id);
    },
    [handleNavigation],
  );

  const start = useCallback(
    (from?: StepId) => {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(SKIP_FLAG);
      }
      void goTo(from ?? "welcome");
    },
    [goTo],
  );

  const next = useCallback(() => {
    if (!step) return;
    const nextIdx = stepIndex(step.id) + 1;
    if (nextIdx >= STEPS.length) {
      setActiveStepId(null);
      void persist({ completed: true, step: "done" });
      return;
    }
    void goTo(STEPS[nextIdx].id);
  }, [goTo, persist, step]);

  const back = useCallback(() => {
    if (!step) return;
    const prevIdx = stepIndex(step.id) - 1;
    if (prevIdx < 0) return;
    void goTo(STEPS[prevIdx].id);
  }, [goTo, step]);

  const skip = useCallback(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(SKIP_FLAG, "1");
    }
    setActiveStepId(null);
    void persist({ completed: true });
  }, [persist]);

  const signal = useCallback(
    (name: SignalName) => {
      if (!step) return;
      if (typeof step.await === "object" && step.await.event === name) {
        if (step.successToast) toast.success(step.successToast);
        next();
      }
    },
    [next, step],
  );

  // Escape -> skip
  useEffect(() => {
    if (!activeStepId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        skip();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeStepId, skip]);

  const value: OnboardingContextValue = {
    isActive: activeStepId !== null,
    step,
    stepIndex: idx,
    totalSteps: STEPS.length,
    firstIssueId,
    start,
    next,
    back,
    skip,
    signal,
    setFirstIssueId,
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return ctx;
}

export const ONBOARDING_SKIP_FLAG = SKIP_FLAG;

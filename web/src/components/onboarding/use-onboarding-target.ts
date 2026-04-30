import { useEffect, useState } from "react";

export type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function useTargetRect(selector: string | null): TargetRect | null {
  const [rect, setRect] = useState<TargetRect | null>(null);

  useEffect(() => {
    if (!selector || typeof window === "undefined") {
      setRect(null);
      return;
    }

    let raf = 0;
    let pollTimer: number | null = null;
    let observer: ResizeObserver | null = null;
    let observedEl: Element | null = null;

    const compute = () => {
      raf = 0;
      const el = document.querySelector(selector);
      if (el !== observedEl) {
        if (observer && observedEl) observer.unobserve(observedEl);
        observedEl = el;
        if (observer && el) observer.observe(el);
      }
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        if (pollTimer !== null) {
          window.clearInterval(pollTimer);
          pollTimer = null;
        }
      } else {
        setRect(null);
        if (pollTimer === null) {
          pollTimer = window.setInterval(schedule, 150);
        }
      }
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(compute);
    };

    observer = new ResizeObserver(schedule);
    window.addEventListener("scroll", schedule, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", schedule);

    schedule();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (pollTimer !== null) window.clearInterval(pollTimer);
      observer?.disconnect();
      window.removeEventListener("scroll", schedule, {
        capture: true,
      } as EventListenerOptions);
      window.removeEventListener("resize", schedule);
    };
  }, [selector]);

  return rect;
}

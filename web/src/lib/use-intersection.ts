import { useEffect, type RefObject } from "react";

export function useIntersection(
  target: RefObject<Element | null>,
  callback: () => void,
  enabled: boolean,
  rootMargin = "240px",
) {
  useEffect(() => {
    if (!enabled) return;
    const element = target.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callback();
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [target, callback, enabled, rootMargin]);
}

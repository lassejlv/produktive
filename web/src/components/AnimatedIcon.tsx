import type { ComponentType } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { cn } from "#/lib/cn";

/** Any icon that takes a numeric `size` — lucide-react icons and our ProbeIcons. */
type IconLike = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

/**
 * Hover gestures, transform-only so they compose with any SVG icon (lucide or
 * our hand-rolled ProbeIcons) without touching its internal paths. Each is a
 * `rest`/`hover` variant pair; the transition rides inside the `hover` target.
 */
const GESTURES = {
  pop: {
    rest: { scale: 1 },
    hover: { scale: 1.18, transition: { type: "spring", stiffness: 400, damping: 12 } },
  },
  pulse: {
    rest: { scale: 1 },
    hover: { scale: [1, 1.2, 1], transition: { duration: 0.45, ease: "easeInOut" } },
  },
  spin: {
    rest: { rotate: 0 },
    hover: { rotate: 360, transition: { duration: 0.6, ease: "easeInOut" } },
  },
  wiggle: {
    rest: { rotate: 0 },
    hover: { rotate: [0, -12, 10, -6, 0], transition: { duration: 0.5, ease: "easeInOut" } },
  },
  slideX: {
    rest: { x: 0 },
    hover: { x: 3, transition: { type: "spring", stiffness: 500, damping: 18 } },
  },
  bounce: {
    rest: { y: 0 },
    hover: { y: [0, -3, 0], transition: { duration: 0.4, ease: "easeOut" } },
  },
} satisfies Record<string, Variants>;

export type IconGesture = keyof typeof GESTURES;

interface Props {
  icon: IconLike;
  animation?: IconGesture;
  size?: number;
  strokeWidth?: number;
  /** Applied to the icon itself (colour, etc.). */
  className?: string;
  /** Applied to the motion wrapper. */
  wrapClassName?: string;
  /**
   * "self" animates on the icon's own hover. "group" inherits the gesture from
   * an ancestor `<motion.*>` carrying `whileHover="hover"`, so a whole row or
   * button can drive it.
   */
  trigger?: "self" | "group";
}

export function AnimatedIcon({
  icon: Icon,
  animation = "pop",
  size = 16,
  strokeWidth,
  className,
  wrapClassName,
  trigger = "self",
}: Props) {
  const reduce = useReducedMotion();
  const variants = GESTURES[animation];
  const animProps =
    trigger === "group"
      ? { variants }
      : { variants, initial: "rest", animate: "rest", whileHover: "hover" };

  return (
    <motion.span
      aria-hidden
      className={cn("inline-flex shrink-0 leading-none", wrapClassName)}
      style={{ transformOrigin: "center" }}
      {...(reduce ? {} : animProps)}
    >
      <Icon size={size} strokeWidth={strokeWidth} className={className} />
    </motion.span>
  );
}

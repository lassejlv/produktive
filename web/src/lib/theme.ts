export type ThemeName =
  | "system"
  | "ember"
  | "slate"
  | "tokyo-night"
  | "midnight"
  | "vercel"
  | "light";

type AppliedThemeName = Exclude<ThemeName, "system">;

export const THEMES: Array<{
  id: ThemeName;
  label: string;
  hint: string;
  swatchBg: string;
  swatchAccent: string;
}> = [
  {
    id: "system",
    label: "System",
    hint: "Follows your device appearance.",
    swatchBg: "#0d0d0f",
    swatchAccent: "#faf7f2",
  },
  {
    id: "slate",
    label: "Slate",
    hint: "The cool dark — default.",
    swatchBg: "#0d0d0f",
    swatchAccent: "#f1c6aa",
  },
  {
    id: "ember",
    label: "Ember",
    hint: "Warm copper dark.",
    swatchBg: "#0b0a0c",
    swatchAccent: "#e07a3c",
  },
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    hint: "Soft navy with editor accents.",
    swatchBg: "#1a1b26",
    swatchAccent: "#7aa2f7",
  },
  {
    id: "midnight",
    label: "Midnight",
    hint: "Cobalt cool dark.",
    swatchBg: "#07080d",
    swatchAccent: "#6a8cff",
  },
  {
    id: "vercel",
    label: "Vercel",
    hint: "True black with electric blue.",
    swatchBg: "#000000",
    swatchAccent: "#0070f3",
  },
  {
    id: "light",
    label: "Light",
    hint: "Warm paper for daylight.",
    swatchBg: "#faf7f2",
    swatchAccent: "#b25624",
  },
];

export const DEFAULT_THEME: ThemeName = "slate";
const STORAGE_KEY = "produktive-theme";

const META_BG: Record<AppliedThemeName, string> = {
  ember: "#0b0a0c",
  slate: "#0d0d0f",
  "tokyo-night": "#1a1b26",
  midnight: "#07080d",
  vercel: "#000000",
  light: "#faf7f2",
};

const VALID = new Set<ThemeName>([
  "system",
  "ember",
  "slate",
  "tokyo-night",
  "midnight",
  "vercel",
  "light",
]);

let systemThemeCleanup: (() => void) | null = null;

export function readStoredTheme(): ThemeName {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw && VALID.has(raw as ThemeName)) return raw as ThemeName;
  // Migration: old key only stored "light" or null.
  if (raw === "light") return "light";
  return DEFAULT_THEME;
}

export function applyTheme(theme: ThemeName) {
  if (typeof document === "undefined") return;
  watchSystemTheme(theme);
  applyResolvedTheme(resolveTheme(theme));
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, theme);
  }
}

function resolveTheme(theme: ThemeName): AppliedThemeName {
  if (theme !== "system") return theme;
  if (typeof window === "undefined") return "slate";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "slate";
}

function applyResolvedTheme(theme: AppliedThemeName) {
  const root = document.documentElement;
  // Drop the old class, if any, from the legacy bootstrap.
  root.classList.remove("theme-light");
  root.setAttribute("data-theme", theme);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", META_BG[theme]);
}

function watchSystemTheme(theme: ThemeName) {
  if (typeof window !== "undefined") {
    systemThemeCleanup?.();
    systemThemeCleanup = null;

    if (theme === "system") {
      const media = window.matchMedia("(prefers-color-scheme: light)");
      const update = () => applyResolvedTheme(resolveTheme("system"));
      media.addEventListener("change", update);
      systemThemeCleanup = () => media.removeEventListener("change", update);
    }
  }
}

export type ThemeName = "ember" | "slate" | "midnight" | "light";

export const THEMES: Array<{
  id: ThemeName;
  label: string;
  hint: string;
  swatchBg: string;
  swatchAccent: string;
}> = [
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
    id: "midnight",
    label: "Midnight",
    hint: "Cobalt cool dark.",
    swatchBg: "#07080d",
    swatchAccent: "#6a8cff",
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

const META_BG: Record<ThemeName, string> = {
  ember: "#0b0a0c",
  slate: "#0d0d0f",
  midnight: "#07080d",
  light: "#faf7f2",
};

const VALID = new Set<ThemeName>(["ember", "slate", "midnight", "light"]);

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
  const root = document.documentElement;
  // Drop the old class, if any, from the legacy bootstrap.
  root.classList.remove("theme-light");
  root.setAttribute("data-theme", theme);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", META_BG[theme]);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, theme);
  }
}

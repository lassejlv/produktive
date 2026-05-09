const MIRRORED_PROPERTIES = [
  "boxSizing",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "fontSizeAdjust",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "textDecoration",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
  "MozTabSize",
] as const;

/**
 * Returns the viewport coordinates of the textarea's caret.
 *
 * Uses the mirror-div technique: render an off-screen div that exactly
 * mimics the textarea's text layout, place a 0-width marker where the
 * caret is, and read the marker's bounding rect. Translate by the
 * textarea's own rect + scroll.
 */
export function getCaretCoords(
  textarea: HTMLTextAreaElement,
): { left: number; top: number } {
  if (typeof document === "undefined") return { left: 0, top: 0 };

  const taRect = textarea.getBoundingClientRect();
  const computed = window.getComputedStyle(textarea);

  const mirror = document.createElement("div");
  const style = mirror.style;

  style.position = "absolute";
  style.visibility = "hidden";
  style.whiteSpace = "pre-wrap";
  style.wordWrap = "break-word";
  style.overflow = "hidden";
  style.top = "0";
  style.left = "-9999px";
  style.width = `${textarea.clientWidth}px`;
  style.height = "auto";

  for (const prop of MIRRORED_PROPERTIES) {
    style[prop as never] = computed[prop as never];
  }

  const value = textarea.value.slice(0, textarea.selectionStart ?? 0);
  mirror.textContent = value;

  const marker = document.createElement("span");
  marker.textContent = "​";
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  document.body.removeChild(mirror);

  const offsetLeft = markerRect.left - mirrorRect.left;
  const offsetTop = markerRect.top - mirrorRect.top;

  return {
    left: taRect.left + offsetLeft - textarea.scrollLeft,
    top: taRect.top + offsetTop - textarea.scrollTop,
  };
}

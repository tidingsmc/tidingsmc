import { useCallback, useState } from "react";

export type Theme = "system" | "light" | "dark";

/** Also read by the script in index.html, which applies the theme before the first paint. */
const KEY = "tidings.theme";

function load(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

/** The phone's status and navigation bars take the page's background, whichever theme it's in. */
function syncBarColor() {
  // index.html starts with one per system theme, for before this runs; one is enough once it does.
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => meta.remove());
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = getComputedStyle(document.body).backgroundColor;
  document.head.append(meta);
}

function apply(theme: Theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  syncBarColor();
}

export function initTheme() {
  apply(load());
  matchMedia("(prefers-color-scheme: dark)").addEventListener(
    "change",
    syncBarColor,
  );
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(load);
  const choose = useCallback((theme: Theme) => {
    try {
      if (theme === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      // Still applied for now; just not remembered.
    }
    apply(theme);
    setTheme(theme);
  }, []);
  return [theme, choose] as const;
}

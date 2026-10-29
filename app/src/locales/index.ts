// No window-only APIs here: the service worker imports this file.

import type { InitOptions } from "i18next";
import en from "./en.json";
import frJson from "./fr.json";

// Typed as English, so a key missing from a translation fails the build.
const fr: typeof en = frJson;

const resources = {
  en: { translation: en },
  fr: { translation: fr },
};

export type Locale = keyof typeof resources;
/** What the player picked in the app's settings; 'system' follows the browser's languages. */
export type Language = "system" | Locale;

/** Each language's name in that language, for the language picker. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  fr: "Français",
};

function isLocale(value: string): value is Locale {
  return Object.prototype.hasOwnProperty.call(resources, value);
}

export function isLanguage(value: unknown): value is Language {
  return value === "system" || (typeof value === "string" && isLocale(value));
}

/** The picked language, or the first of the browser's we have ("fr-CA" counts as "fr"); English otherwise. */
export function resolveLocale(
  language: Language,
  preferred: readonly string[],
): Locale {
  if (language !== "system") return language;
  for (const tag of preferred) {
    const base = tag.split("-")[0].toLowerCase();
    if (isLocale(base)) return base;
  }
  return "en";
}

/** For the app's i18next and the service worker's. */
export function i18nOptions(lng: Locale): InitOptions {
  return {
    lng,
    fallbackLng: "en",
    resources,
    // The translations are bundled, so it's ready right away.
    initAsync: false,
    // React escapes what it renders, and notifications are plain text.
    interpolation: { escapeValue: false },
  };
}

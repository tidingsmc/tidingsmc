import type { InitOptions } from "i18next";
import en from "./en.json";
import frJson from "./fr.json";

const fr: typeof en = frJson;

const resources = {
  en: { translation: en },
  fr: { translation: fr },
};

export type Locale = keyof typeof resources;

export type Language = "system" | Locale;

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

export function i18nOptions(lng: Locale): InitOptions {
  return {
    lng,
    fallbackLng: "en",
    resources,
    initAsync: false,
    interpolation: { escapeValue: false },
  };
}

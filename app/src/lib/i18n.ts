import i18next, { type TFunction } from "i18next";
import { useCallback, useState } from "react";
import { initReactI18next } from "react-i18next";
import {
  i18nOptions,
  isLanguage,
  resolveLocale,
  type Language,
} from "../locales";
import { saveLanguage } from "./workerStore";

const KEY = "tidings.language";

function load(): Language {
  try {
    const saved = localStorage.getItem(KEY);
    return isLanguage(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

function apply(language: Language) {
  i18next.changeLanguage(resolveLocale(language, navigator.languages));
  saveLanguage(language).catch(() => {});
}

export function initLanguage() {
  i18next.on(
    "languageChanged",
    (locale) => (document.documentElement.lang = locale),
  );
  const language = load();
  i18next
    .use(initReactI18next)
    .init(i18nOptions(resolveLocale(language, navigator.languages)));
  saveLanguage(language).catch(() => {});
  addEventListener("languagechange", () => apply(load()));
}

export function useLanguage() {
  const [language, setLanguage] = useState<Language>(load);
  const choose = useCallback((language: Language) => {
    try {
      if (language === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, language);
    } catch {
      // Still applied
    }
    apply(language);
    setLanguage(language);
  }, []);
  return [language, choose] as const;
}

/** An error whose text is translated where it's shown, so it follows a change of language */
export class TranslatedError extends Error {
  readonly text: (t: TFunction) => string;

  constructor(text: (t: TFunction) => string) {
    super(text(i18next.t));
    this.text = text;
  }
}

export function errorText(err: unknown, t: TFunction): string {
  if (err instanceof TranslatedError) return err.text(t);
  return err instanceof Error ? err.message : String(err);
}

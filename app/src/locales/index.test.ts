import { describe, expect, it } from "vitest";
import { isLanguage, resolveLocale } from ".";

describe("resolveLocale", () => {
  it("follows the phone's first language the app has", () => {
    expect(resolveLocale("system", ["fr-FR", "en-US"])).toBe("fr");
    expect(resolveLocale("system", ["de-DE", "fr-CA", "en"])).toBe("fr");
    expect(resolveLocale("system", ["EN-gb"])).toBe("en");
  });

  it("falls back to English", () => {
    expect(resolveLocale("system", ["de-DE", "ja"])).toBe("en");
    expect(resolveLocale("system", [])).toBe("en");
  });

  it("a language picked in the app wins over the phone's", () => {
    expect(resolveLocale("en", ["fr-FR"])).toBe("en");
  });
});

describe("isLanguage", () => {
  // Read back from localStorage and IndexedDB, which may hold anything.
  it("only accepts the app's languages", () => {
    expect(isLanguage("system")).toBe(true);
    expect(isLanguage("fr")).toBe(true);
    expect(isLanguage("de")).toBe(false);
    expect(isLanguage("toString")).toBe(false);
    expect(isLanguage(null)).toBe(false);
    expect(isLanguage(42)).toBe(false);
  });
});

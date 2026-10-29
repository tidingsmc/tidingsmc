// Only the version is bundled: Vite tree-shakes named imports from JSON.
import { version } from "../../package.json";
import type { ReactNode } from "react";
import { Moon, Smartphone, Sun } from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import { Dropdown, Screen } from "../components";
import { useLanguage } from "../lib/i18n";
import { paths } from "../lib/router";
import { useTheme, type Theme } from "../lib/theme";
import { LOCALE_NAMES, type Locale } from "../locales";

const themes: Record<Theme, { icon: ReactNode; next: Theme }> = {
  system: { icon: <Smartphone />, next: "light" },
  light: { icon: <Sun />, next: "dark" },
  dark: { icon: <Moon />, next: "system" },
};

/** Settings for the app itself, on this device; each server's are on its own settings screen. */
export function AppSettingsScreen() {
  const { t } = useTranslation();
  const [theme, setTheme] = useTheme();
  const [language, setLanguage] = useLanguage();

  return (
    <Screen title={t("common.settings")} back={paths.servers}>
      <div className="info-row">
        {t("appSettings.theme")}
        <button
          className="button theme-button"
          aria-label={t("common.labelValue", {
            label: t("appSettings.theme"),
            value: t(`appSettings.themes.${theme}`),
          })}
          onClick={() => setTheme(themes[theme].next)}
        >
          {/* All stacked, only the current one shown: the button keeps the widest one's width as it changes. */}
          {Object.entries(themes).map(([value, { icon }]) => (
            <span key={value} className="theme-option" hidden={value !== theme}>
              {icon} {t(`appSettings.themes.${value as Theme}`)}
            </span>
          ))}
        </button>
      </div>

      <div className="info-row">
        {t("appSettings.language")}
        <Dropdown
          label={t("appSettings.language")}
          value={language}
          onChange={setLanguage}
          options={[
            { value: "system", label: t("appSettings.systemLanguage") },
            // Each in its own language, so anyone can find theirs.
            ...Object.entries(LOCALE_NAMES).map(([locale, name]) => ({
              value: locale as Locale,
              label: name,
              lang: locale,
            })),
          ]}
        />
      </div>

      <p className="info-row">
        {t("appSettings.version")} <span className="muted">{version}</span>
      </p>

      {/* Required by Minecraft's usage guidelines for anything using its name. */}
      <p className="muted small footer-note">{t("appSettings.disclaimer")}</p>
    </Screen>
  );
}

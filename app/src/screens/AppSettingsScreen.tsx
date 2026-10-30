import { version } from "../../package.json";
import type { ReactNode } from "react";
import { Moon, Smartphone, Sun } from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import { Dropdown, NotificationsOff, Screen } from "../components";
import type { PairedServer } from "../lib/api";
import { useLanguage } from "../lib/i18n";
import { paths } from "../lib/router";
import { useTheme, type Theme } from "../lib/theme";
import { LOCALE_NAMES, type Locale } from "../locales";

const themes: Record<Theme, { icon: ReactNode; next: Theme }> = {
  system: { icon: <Smartphone />, next: "light" },
  light: { icon: <Sun />, next: "dark" },
  dark: { icon: <Moon />, next: "system" },
};

export function AppSettingsScreen({ servers }: { servers: PairedServer[] }) {
  const { t } = useTranslation();
  const [theme, setTheme] = useTheme();
  const [language, setLanguage] = useLanguage();

  return (
    <Screen title={t("common.settings")} back={paths.servers}>
      <NotificationsOff servers={servers} />
      <div className="settings-list">
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
            {Object.entries(themes).map(([value, { icon }]) => (
              <span
                key={value}
                className="theme-option"
                hidden={value !== theme}
              >
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
      </div>

      {/* Required by Minecraft's usage guidelines for anything using its name. */}
      <p className="muted small footer-note">{t("appSettings.disclaimer")}</p>
    </Screen>
  );
}

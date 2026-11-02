import { version } from "../../package.json";
import type { ReactNode } from "react";
import {
  BellOff,
  ChevronRight,
  Laptop,
  Moon,
  Smartphone,
  Sun,
} from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import { Dropdown, Screen } from "../components";
import { NotificationSettings } from "./NotificationSettingsScreen";
import { useLanguage } from "../lib/i18n";
import type { PairedServer } from "../lib/api";
import { usePushStates } from "../lib/notifications";
import { paths } from "../lib/router";
import { useTheme, type Theme } from "../lib/theme";
import { useWide } from "../lib/useWide";
import { LOCALE_NAMES, type Locale } from "../locales";

const themes: Record<Theme, { icon: ReactNode; next: Theme }> = {
  system: { icon: <Smartphone />, next: "light" },
  light: { icon: <Sun />, next: "dark" },
  dark: { icon: <Moon />, next: "system" },
};

export function AppSettingsScreen({ servers }: { servers: PairedServer[] }) {
  const { t } = useTranslation();
  const [theme, setTheme] = useTheme();
  const wide = useWide();
  const [language, setLanguage] = useLanguage();
  const { states } = usePushStates(servers);
  const pushStates = [...(states?.values() ?? [])];
  const notificationsOff = pushStates.some((state) => state !== "on");
  const canTurnOn = pushStates.includes("off");

  const languagePicker = (
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
  );

  if (wide) {
    return (
      <Screen title={t("common.settings")} back={paths.servers}>
        <section className="settings-section">
          <div className="settings-section-intro">
            <h2>{t("appSettings.appearance")}</h2>
          </div>
          <div className="settings-section-body">
            <div className="settings-group">
              <div className="settings-row">
                {t("appSettings.theme")}
                <div
                  className="segmented"
                  role="radiogroup"
                  aria-label={t("appSettings.theme")}
                >
                  {(Object.keys(themes) as Theme[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={value === theme}
                      onClick={() => setTheme(value)}
                    >
                      {/* "System" follows the computer's setting: a laptop, not a phone */}
                      {value === "system" ? <Laptop /> : themes[value].icon}
                      {t(`appSettings.themes.${value}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-row">
                {t("appSettings.language")}
                {languagePicker}
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-intro">
            <h2>{t("settings.notifications")}</h2>
            <p className="muted small">{t("appSettings.notificationsHelp")}</p>
          </div>
          <div className="settings-section-body">
            <NotificationSettings servers={servers} />
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-intro">
            <h2>{t("appSettings.about")}</h2>
          </div>
          <div className="settings-section-body">
            <div className="settings-group">
              <p className="settings-row">
                {t("appSettings.version")}
                <span className="muted">{version}</span>
              </p>
            </div>
          </div>
        </section>

        {/* Required by Minecraft's usage guidelines for anything using its name */}
        <p className="muted small footer-note">{t("appSettings.disclaimer")}</p>
      </Screen>
    );
  }

  return (
    <Screen title={t("common.settings")} back={paths.servers} narrow>
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
          {languagePicker}
        </div>

        <div className="info-row">
          {t("settings.notifications")}
          <a
            className={`button nav-button${notificationsOff ? " warning" : ""}`}
            href={paths.notificationSettings}
          >
            {notificationsOff && <BellOff aria-hidden />}
            {canTurnOn ? t("push.turnOn") : t("appSettings.manage")}
            <ChevronRight aria-hidden />
          </a>
        </div>

        <p className="info-row">
          {t("appSettings.version")} <span className="muted">{version}</span>
        </p>
      </div>

      {/* Required by Minecraft's usage guidelines for anything using its name */}
      <p className="muted small footer-note">{t("appSettings.disclaimer")}</p>
    </Screen>
  );
}

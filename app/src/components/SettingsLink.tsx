import { SettingsCog } from "pixelarticons/react";
import { useTranslation } from "react-i18next";

export function SettingsLink({ href }: { href: string }) {
  const { t } = useTranslation();
  return (
    <a className="icon-button" href={href} aria-label={t("common.settings")}>
      <SettingsCog />
    </a>
  );
}

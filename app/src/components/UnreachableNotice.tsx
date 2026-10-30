import { PowerOff } from "pixelarticons/react";
import { useTranslation } from "react-i18next";

export function UnreachableNotice({ help }: { help: string }) {
  const { t } = useTranslation();
  return (
    <div className="notice warn" role="status">
      <div className="notice-row">
        <span className="notice-icon" aria-hidden>
          <PowerOff />
        </span>
        <div className="notice-main">
          <p className="notice-title">{t("online.unreachable")}</p>
          <p className="muted small">{help}</p>
        </div>
      </div>
    </div>
  );
}

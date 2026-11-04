import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateAvailable } from "../lib/appUpdate";

export function UpdateAvailable() {
  const { t } = useTranslation();
  const available = useUpdateAvailable();
  const [dismissed, setDismissed] = useState(false);

  if (!available || dismissed) return null;
  return (
    <div className="notice update-toast" role="status">
      <p className="notice-title">{t("update.title")}</p>
      <div className="notice-actions">
        <button className="button" onClick={() => setDismissed(true)}>
          {t("update.later")}
        </button>
        <button className="button primary" onClick={() => location.reload()}>
          {t("update.reload")}
        </button>
      </div>
    </div>
  );
}

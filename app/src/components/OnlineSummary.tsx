import { useTranslation } from "react-i18next";
import type { OnlineState } from "../lib/useOnline";

export function OnlineSummary({ state }: { state: OnlineState }) {
  const { t } = useTranslation();
  if (state.status === "loading") {
    return (
      <div className="status">
        <span className="status-line muted">{t("common.checking")}</span>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="status">
        <span className="status-line">
          <span className="dot error" /> {t("online.unreachable")}
        </span>
      </div>
    );
  }
  const { players } = state.data;
  return (
    <div className="status">
      <span className="status-line">
        <span className={players.length > 0 ? "dot ok" : "dot"} />
        {players.length > 0
          ? t("online.count", { count: players.length })
          : t("online.nobody")}
      </span>
    </div>
  );
}

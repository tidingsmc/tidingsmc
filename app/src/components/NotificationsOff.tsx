import { useState } from "react";
import { BellOff } from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import type { PairedServer } from "../lib/api";
import { errorText } from "../lib/i18n";
import {
  enableNotifications,
  useNotificationsSnooze,
  usePushStates,
} from "../lib/notifications";

export function NotificationsOff({
  servers,
  snoozable,
}: {
  servers: PairedServer[];
  snoozable?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { states, refresh } = usePushStates(servers);
  const { snoozed, snooze } = useNotificationsSnooze();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<
    { server?: PairedServer; error: Error }[]
  >([]);

  if (!states || (snoozable && snoozed)) return null;
  const off = servers.filter((server) => {
    const state = states.get(server.id);
    return state !== undefined && state !== "on";
  });
  if (off.length === 0) return null;
  const state = states.get(off[0].id);

  async function turnOn() {
    setBusy(true);
    setErrors([]);
    const results = await Promise.allSettled(off.map(enableNotifications));
    const failures = off.flatMap((server, i) => {
      const result = results[i];
      return result.status === "rejected"
        ? [{ server, error: result.reason as Error }]
        : [];
    });
    if (Notification.permission === "denied") {
      setErrors([]);
    } else if (Notification.permission !== "granted") {
      setErrors(failures.slice(0, 1).map(({ error }) => ({ error })));
    } else {
      setErrors(failures);
    }
    setBusy(false);
    refresh();
  }

  let message;
  if (state === "unsupported") message = t("push.unsupported");
  else if (state === "blocked") message = t("push.blocked");
  else if (servers.length === 1) message = t("push.notYet");
  else if (off.length === servers.length) message = t("push.notYetAny");
  else
    message = t("push.notYetSome", {
      servers: new Intl.ListFormat(i18n.language).format(
        off.map((server) => server.name),
      ),
    });

  return (
    <div className="notice warn" role="status">
      <div className="notice-row">
        <span className="notice-icon" aria-hidden>
          <BellOff />
        </span>
        <div className="notice-main">
          <p className="notice-title">{t("push.title")}</p>
          <p className="muted small">{message}</p>
        </div>
      </div>
      {errors.map(({ server, error }, i) => (
        <p key={server?.id ?? i} className="error small">
          {server && servers.length > 1
            ? t("common.labelValue", {
                label: server.name,
                value: errorText(error, t),
              })
            : errorText(error, t)}
        </p>
      ))}
      {(snoozable || state === "off") && (
        <div className="notice-actions">
          {snoozable && (
            <button className="button" onClick={snooze}>
              {t("push.notNow")}
            </button>
          )}
          {state === "off" && (
            <button className="button primary" onClick={turnOn} disabled={busy}>
              {busy ? t("push.turningOn") : t("push.turnOn")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

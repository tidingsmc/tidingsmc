import { Fragment, useMemo, useState } from "react";
import { Plus, Trash } from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import { LinkedAs, NotificationsOff, Screen, Toggle } from "../components";
import {
  api,
  usingMockApi,
  type PairedServer,
  type QuietHours,
  type QuietPeriod,
} from "../lib/api";
import { errorText } from "../lib/i18n";
import { sendTestNotification, unregister } from "../lib/notifications";
import { paths } from "../lib/router";
import { useInfo } from "../lib/useInfo";
import { useSettings } from "../lib/useSettings";
import { FriendsSection } from "./FriendsSection";

export function SettingsScreen({
  server,
  onLeft,
}: {
  server: PairedServer;
  onLeft: () => void;
}) {
  const serverAsList = useMemo(() => [server], [server]);
  const { t } = useTranslation();
  const { settings, error, update } = useSettings(server);
  const info = useInfo(server);
  const [leaving, setLeaving] = useState(false);
  const [testError, setTestError] = useState<Error | null>(null);
  // The quiet period whose last change was refused.
  const [invalidPeriod, setInvalidPeriod] = useState<number | null>(null);

  // Demo mode only for now: real pushes need the mod.
  async function testNotification() {
    setTestError(null);
    try {
      const { players } = await api.online(server);
      await sendTestNotification(server, players[0]);
    } catch (err) {
      setTestError(err as Error);
    }
  }

  function updateQuietHours(changes: Partial<QuietHours>) {
    if (!settings) return;
    update({ quietHours: { ...settings.quietHours, ...changes } });
  }

  function updatePeriods(change: (periods: QuietPeriod[]) => QuietPeriod[]) {
    if (!settings) return;
    updateQuietHours({ periods: change(settings.quietHours.periods) });
  }

  /** Refuses a period that starts when it ends (the server would too); the input then goes back. */
  function updatePeriod(i: number, changes: Partial<QuietPeriod>) {
    if (!settings) return;
    const period = { ...settings.quietHours.periods[i], ...changes };
    if (period.start === period.end) {
      setInvalidPeriod(i);
      return;
    }
    setInvalidPeriod(null);
    updatePeriods((ps) => ps.map((p, j) => (j === i ? period : p)));
  }

  async function leave() {
    if (!confirm(t("settings.leaveConfirm", { server: server.name }))) return;
    setLeaving(true);
    // Best effort: forget the server locally even if it can't be reached.
    await api.unpair(server).catch(() => {});
    // Even if the server wasn't told, so its pushes stop arriving.
    await unregister(server.id).catch(() => {});
    onLeft();
  }

  return (
    <Screen title={t("common.settings")} back={paths.server(server.id)}>
      <section className="section">
        <h2>{t("settings.notifications")}</h2>
        <NotificationsOff servers={serverAsList} />
        {!settings && !error && <p className="muted">{t("common.loading")}</p>}
        {settings && (
          <div className="settings-group">
            <Toggle
              label={t("settings.joins")}
              checked={settings.notifyJoins}
              onChange={(notifyJoins) => update({ notifyJoins })}
            />
            <Toggle
              label={t("settings.leaves")}
              description={t("settings.leavesHelp")}
              checked={settings.notifyLeaves}
              onChange={(notifyLeaves) => update({ notifyLeaves })}
            />
            <Toggle
              label={t("settings.serverStatus")}
              checked={settings.notifyServerStatus}
              onChange={(notifyServerStatus) => update({ notifyServerStatus })}
            />
            <Toggle
              label={t("settings.quietWhileOnline")}
              description={t("settings.quietWhileOnlineHelp")}
              checked={settings.quietWhileOnline}
              disabled={
                !settings.notifyJoins &&
                !settings.notifyLeaves &&
                !settings.notifyServerStatus
              }
              onChange={(quietWhileOnline) => update({ quietWhileOnline })}
            />
          </div>
        )}
        {error && <p className="error">{errorText(error, t)}</p>}
        {usingMockApi && (
          <>
            <button className="button" onClick={testNotification}>
              {t("settings.test")}
            </button>
            {testError && <p className="error">{errorText(testError, t)}</p>}
          </>
        )}
      </section>

      {settings && (
        <FriendsSection
          server={server}
          friends={settings.friends}
          disabled={!settings.notifyJoins && !settings.notifyLeaves}
          onChange={(friends) => update({ friends })}
        />
      )}

      {settings && (
        <section className="section">
          <h2>{t("settings.quietHours")}</h2>
          <div className="settings-group">
            <Toggle
              label={t("settings.quietHours")}
              description={t("settings.quietHoursHelp")}
              checked={settings.quietHours.enabled}
              onChange={(enabled) => updateQuietHours({ enabled })}
            />
            {settings.quietHours.enabled && (
              <>
                {settings.quietHours.periods.map((period, i) => (
                  <Fragment key={i}>
                    <div className="time-row">
                      <label className="field">
                        {t("settings.from")}
                        <input
                          type="time"
                          value={period.start}
                          onChange={(e) =>
                            e.target.value &&
                            updatePeriod(i, { start: e.target.value })
                          }
                        />
                      </label>
                      <label className="field">
                        {t("settings.to")}
                        <input
                          type="time"
                          value={period.end}
                          onChange={(e) =>
                            e.target.value &&
                            updatePeriod(i, { end: e.target.value })
                          }
                        />
                      </label>
                      <button
                        className="icon-button remove-period"
                        aria-label={t("settings.removePeriod")}
                        onClick={() => {
                          setInvalidPeriod(null);
                          updatePeriods((ps) => ps.filter((_, j) => j !== i));
                        }}
                      >
                        <Trash />
                      </button>
                    </div>
                    {invalidPeriod === i && (
                      <p className="error small period-error">
                        {t("settings.samePeriod")}
                      </p>
                    )}
                  </Fragment>
                ))}
                <button
                  className="group-button"
                  onClick={() =>
                    updatePeriods((ps) => [
                      ...ps,
                      { start: "12:00", end: "14:00" },
                    ])
                  }
                >
                  <Plus /> {t("settings.addPeriod")}
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {info && (
        <section className="section">
          <h2>{t("settings.server")}</h2>
          <p>{t("settings.version", { version: info.version })}</p>
        </section>
      )}

      <section className="section">
        <h2>{t("settings.thisDevice")}</h2>
        <p>{server.deviceName}</p>
        <LinkedAs player={server.player} />
        <p className="muted small">
          {t("settings.pairedOn", { date: new Date(server.pairedAt) })}
        </p>
      </section>

      <button className="button danger" onClick={leave} disabled={leaving}>
        {leaving
          ? t("settings.leaving")
          : t("settings.leave", { server: server.name })}
      </button>
    </Screen>
  );
}

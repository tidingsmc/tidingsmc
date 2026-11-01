import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Plus, Trash } from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import {
  ConfirmDialog,
  LinkedAs,
  NotificationsOff,
  Screen,
  Toggle,
  UnreachableNotice,
} from "../components";
import {
  isUnreachable,
  type PairedServer,
  type QuietHours,
  type QuietPeriod,
} from "../lib/api";
import { errorText } from "../lib/i18n";
import { unregister } from "../lib/notifications";
import { leaveServer } from "../lib/pendingUnpairs";
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
  const { settings, error, live, update } = useSettings(server);
  const unreachable = !live && error !== null && isUnreachable(error);
  const info = useInfo(server);
  const [leaving, setLeaving] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [invalidPeriod, setInvalidPeriod] = useState<number | null>(null);
  // Any add-on may notify: each gets a switch.
  const addons = info?.addons ?? [];
  const mutedAddons = settings?.mutedAddons;

  function muteAddon(id: string, muted: boolean) {
    if (!mutedAddons) return; // settings not loaded yet
    update({
      mutedAddons: muted
        ? [...mutedAddons.filter((a) => a !== id), id]
        : mutedAddons.filter((a) => a !== id),
    });
  }

  function updateQuietHours(changes: Partial<QuietHours>) {
    if (!settings) return;
    update({ quietHours: { ...settings.quietHours, ...changes } });
  }

  function updatePeriods(change: (periods: QuietPeriod[]) => QuietPeriod[]) {
    if (!settings) return;
    updateQuietHours({ periods: change(settings.quietHours.periods) });
  }

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
    setConfirmingLeave(false);
    setLeaving(true);
    await leaveServer(server);
    await unregister(server.id).catch(() => {});
    onLeft();
  }

  return (
    <Screen title={t("common.settings")} back={paths.server(server.id)}>
      {unreachable && settings && (
        <UnreachableNotice help={t("settings.readOnly")} />
      )}

      {/* Read-only until the server answers: changes couldn't be saved. */}
      <fieldset className="settings-fields" disabled={!live}>
        <section className="section">
          <h2>{t("settings.notifications")}</h2>
          <NotificationsOff servers={serverAsList} />
          {!settings && !error && (
            <p className="muted">{t("common.loading")}</p>
          )}
          {settings && (
            <div className="settings-group">
              <Toggle
                label={t("settings.joins")}
                checked={settings.notifyJoins}
                onChange={(notifyJoins) => update({ notifyJoins })}
              />
              <Toggle
                label={t("settings.leaves")}
                checked={settings.notifyLeaves}
                onChange={(notifyLeaves) => update({ notifyLeaves })}
              />
              <Toggle
                label={t("settings.serverStatus")}
                checked={settings.notifyServerStatus}
                onChange={(notifyServerStatus) =>
                  update({ notifyServerStatus })
                }
              />
              <Toggle
                label={t("settings.quietWhileOnline")}
                checked={settings.quietWhileOnline}
                disabled={
                  !settings.notifyJoins &&
                  !settings.notifyLeaves &&
                  !settings.notifyServerStatus &&
                  // Until the server's add-ons are known, one of them may notify.
                  info !== null &&
                  // Older caches and mods have no mutedAddons: nothing is muted.
                  addons.every((a) => mutedAddons?.includes(a.id))
                }
                onChange={(quietWhileOnline) => update({ quietWhileOnline })}
              />
            </div>
          )}
          {mutedAddons && addons.length > 0 && (
            <details className="settings-collapsible">
              <summary className="settings-group-title">
                <ChevronDown
                  className="settings-collapsible-chevron"
                  aria-hidden
                />
                {t("settings.addons")}
              </summary>
              <div className="settings-group">
                {addons.map((addon) => (
                  <Toggle
                    key={addon.id}
                    label={addon.title}
                    checked={!mutedAddons.includes(addon.id)}
                    onChange={(on) => muteAddon(addon.id, !on)}
                  />
                ))}
              </div>
            </details>
          )}
          {settings && (
            <FriendsSection
              server={server}
              friends={settings.friends}
              disabled={!settings.notifyJoins && !settings.notifyLeaves}
              onChange={(friends) => update({ friends })}
            />
          )}
          {settings && (
            <div className="settings-group">
              <Toggle
                label={t("settings.quietHours")}
                checked={settings.quietHours.enabled}
                onChange={(enabled) => updateQuietHours({ enabled })}
              />
              {settings.quietHours.enabled && (
                <>
                  {settings.quietHours.periods.map((period, i) => (
                    <Fragment key={i}>
                      <div className="time-row">
                        <label className="time-field">
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
                        <label className="time-field">
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
                          className="icon-button"
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
          )}
          {error && !(unreachable && settings) && (
            <p className="error">{errorText(error, t)}</p>
          )}
        </section>
      </fieldset>

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

      <button
        className="button danger"
        onClick={() => setConfirmingLeave(true)}
        disabled={leaving}
      >
        {leaving
          ? t("settings.leaving")
          : t("settings.leave", { server: server.name })}
      </button>
      <ConfirmDialog
        open={confirmingLeave}
        title={t("settings.leaveConfirmTitle", { server: server.name })}
        message={t(
          unreachable
            ? "settings.leaveConfirmUnreachable"
            : "settings.leaveConfirm",
        )}
        confirmLabel={t("settings.leaveConfirmButton")}
        danger
        onConfirm={leave}
        onCancel={() => setConfirmingLeave(false)}
      />
    </Screen>
  );
}

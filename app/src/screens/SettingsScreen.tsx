import { useMemo, useState } from "react";
import { ChevronDown } from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import {
  ConfirmDialog,
  LinkedAs,
  NotificationsOff,
  Screen,
  Toggle,
  UnreachableNotice,
} from "../components";
import { isUnreachable, type PairedServer } from "../lib/api";
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

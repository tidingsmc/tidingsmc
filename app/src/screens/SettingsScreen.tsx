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
import { useWide } from "../lib/useWide";
import { FriendsSection } from "./FriendsSection";

export function SettingsScreen({
  server,
  onLeft,
}: {
  server: PairedServer;
  onLeft: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Screen title={t("common.settings")} back={paths.server(server.id)} narrow>
      <ServerSettings server={server} onLeft={onLeft} />
    </Screen>
  );
}

export function ServerSettings({
  server,
  onLeft,
}: {
  server: PairedServer;
  onLeft: () => void;
}) {
  const serverAsList = useMemo(() => [server], [server]);
  const { t } = useTranslation();
  const wide = useWide();
  const { settings, error, live, update } = useSettings(server);
  const unreachable = !live && error !== null && isUnreachable(error);
  const info = useInfo(server);
  const [leaving, setLeaving] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const addons = info?.addons ?? [];
  const mutedAddons = settings?.mutedAddons;

  function muteAddon(id: string, muted: boolean) {
    if (!mutedAddons) return; // not loaded yet
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

  const notifications = (
    <>
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
            checked={settings.notifyLeaves}
            onChange={(notifyLeaves) => update({ notifyLeaves })}
          />
          <Toggle
            label={t("settings.serverStatus")}
            checked={settings.notifyServerStatus}
            onChange={(notifyServerStatus) => update({ notifyServerStatus })}
          />
        </div>
      )}
      {mutedAddons && addons.length > 0 && (
        <details className="settings-collapsible">
          <summary className="settings-group-title">
            <ChevronDown className="settings-collapsible-chevron" aria-hidden />
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
    </>
  );

  const device = (
    <>
      <p>{server.deviceName}</p>
      <LinkedAs player={server.player} />
      <p className="muted small">
        {t("settings.pairedOn", { date: new Date(server.pairedAt) })}
      </p>
    </>
  );

  const leaveButton = (
    <button
      className="button danger"
      onClick={() => setConfirmingLeave(true)}
      disabled={leaving}
    >
      {leaving
        ? t("settings.leaving")
        : t("settings.leave", { server: server.name })}
    </button>
  );

  const confirmLeave = (
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
  );

  const readOnly = unreachable && settings && (
    <UnreachableNotice help={t("settings.readOnly")} />
  );

  if (wide) {
    return (
      <>
        {readOnly}
        <section className="settings-section">
          <div className="settings-section-intro">
            <h2>{t("settings.notifications")}</h2>
            <p className="muted small">
              {t("settings.notificationsHelp", { server: server.name })}
            </p>
          </div>
          <fieldset
            className="settings-fields settings-section-body"
            disabled={!live}
          >
            {notifications}
          </fieldset>
        </section>

        {info && (
          <section className="settings-section">
            <div className="settings-section-intro">
              <h2>{t("settings.server")}</h2>
            </div>
            <div className="settings-section-body">
              <div className="settings-group">
                <p className="settings-row">
                  {t("appSettings.version")}
                  <span className="muted">
                    {t("settings.version", { version: info.version })}
                  </span>
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="settings-section">
          <div className="settings-section-intro">
            <h2>{t("settings.thisDevice")}</h2>
          </div>
          <div className="settings-section-body">
            <div className="settings-group settings-card">{device}</div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-intro">
            <h2>{t("settings.leaveConfirmButton")}</h2>
            <p className="muted small">{t("settings.leaveConfirm")}</p>
          </div>
          <div className="settings-section-body">{leaveButton}</div>
        </section>
        {confirmLeave}
      </>
    );
  }

  return (
    <>
      {readOnly}

      <fieldset className="settings-fields" disabled={!live}>
        <section className="section">
          <h2>{t("settings.notifications")}</h2>
          {notifications}
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
        {device}
      </section>

      {leaveButton}
      {confirmLeave}
    </>
  );
}

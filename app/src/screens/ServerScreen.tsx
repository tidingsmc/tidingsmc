import { ChevronLeft, Home, SettingsCog } from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import {
  AddonIcon,
  Avatar,
  LoadingDots,
  Motd,
  Screen,
  ServerIcon,
  SettingsLink,
  UnreachableNotice,
} from "../components";
import { isAddonId, text } from "../lib/addons";
import { isUnreachable, type PairedServer, type ServerInfo } from "../lib/api";
import { errorText } from "../lib/i18n";
import { ImagesFrom } from "../lib/images";
import { cameFrom, paths, type AddonRoute } from "../lib/router";
import { useInfo } from "../lib/useInfo";
import { useOnline } from "../lib/useOnline";
import { useWide } from "../lib/useWide";
import { WorldCard } from "../world";
import { AddonTab } from "./AddonTab";
import { ServerSettings } from "./SettingsScreen";

export function ServerScreen({
  server,
  addon,
  settings,
}: {
  server: PairedServer;
  addon?: AddonRoute;
  settings?: { onLeft: () => void };
}) {
  const { t } = useTranslation();
  const wide = useWide();
  const info = useInfo(server);
  const addons = (info?.addons ?? []).filter((a) => isAddonId(a?.id));
  const current = addons.find((a) => a.id === addon?.id);
  const onOverview = !addon && !settings;

  return (
    <ImagesFrom server={server}>
      <Screen
        title={server.name}
        back={paths.servers}
        action={
          <SettingsLink
            href={wide ? paths.appSettings : paths.settings(server.id)}
          />
        }
      >
        {addons.length > 0 || addon || wide ? (
          <div className="binder">
            <nav className="tabs">
              <a
                href={paths.server(server.id)}
                aria-current={onOverview ? "page" : undefined}
                aria-label={t("server.overview")}
                title={t("server.overview")}
              >
                <Home aria-hidden />
                <span className="tab-label" aria-hidden>
                  {t("server.overview")}
                </span>
              </a>
              {addons.map((a) => {
                const title = text(a.title) || a.id;
                return (
                  <a
                    key={a.id}
                    href={paths.addon(server.id, { id: a.id })}
                    aria-current={
                      !settings && a.id === addon?.id ? "page" : undefined
                    }
                    aria-label={title}
                    title={title}
                  >
                    <AddonIcon name={a.icon} />
                    <span className="tab-label" aria-hidden>
                      {title}
                    </span>
                  </a>
                );
              })}
              {wide && (
                <a
                  className="tab-end"
                  href={paths.settings(server.id)}
                  aria-current={settings ? "page" : undefined}
                  aria-label={t("common.settings")}
                  title={t("common.settings")}
                >
                  <SettingsCog aria-hidden />
                  <span className="tab-label" aria-hidden>
                    {t("common.settings")}
                  </span>
                </a>
              )}
            </nav>
            <div className="tab-paper">
              {settings ? (
                <div className="tab-settings">
                  <ServerSettings server={server} onLeft={settings.onLeft} />
                </div>
              ) : addon ? (
                <>
                  <h2 className="tab-title">
                    {addon.view && (
                      <AddonBack server={server} addon={addon.id} />
                    )}
                    <AddonIcon name={current?.icon} />
                    {text(current?.title) || addon.id}
                  </h2>
                  <AddonTab key={addon.id} server={server} addon={addon} />
                </>
              ) : (
                <Overview server={server} info={info} />
              )}
            </div>
          </div>
        ) : (
          <Overview server={server} info={info} />
        )}
      </Screen>
    </ImagesFrom>
  );
}

function AddonBack({ server, addon }: { server: PairedServer; addon: string }) {
  const { t } = useTranslation();
  const tab = paths.addon(server.id, { id: addon });
  return (
    <a
      className="back tab-back"
      href={tab}
      aria-label={t("common.back")}
      title={t("common.back")}
      onClick={(e) => {
        const from = cameFrom();
        if (from === tab || from?.startsWith(`${tab}/`)) {
          e.preventDefault();
          history.back();
        }
      }}
    >
      <ChevronLeft />
    </a>
  );
}

function Overview({
  server,
  info,
}: {
  server: PairedServer;
  info: ServerInfo | null;
}) {
  const { t } = useTranslation();
  const online = useOnline(server);
  const unreachable = online.status === "error" && isUnreachable(online.error);

  return (
    <div className="overview">
      <div className="overview-server">
        <div className="server-header">
          <ServerIcon name={server.name} icon={info?.icon} size={64} />
          {info && <Motd segments={info.motd} />}
        </div>
        {online.status === "ok" && online.data.world && (
          <WorldCard world={online.data.world} receivedAt={online.receivedAt} />
        )}
      </div>

      {unreachable ? (
        <UnreachableNotice help={t("server.unreachableHelp")} />
      ) : (
        <section className="section online-section">
          {online.status === "ok" && (
            <h2>
              {t("server.onlineCount", { count: online.data.players.length })}
            </h2>
          )}
          {online.status === "loading" && (
            <LoadingDots label={t("common.checking")} />
          )}
          {online.status === "error" && (
            <p className="error">{errorText(online.error, t)}</p>
          )}
          {online.status === "ok" &&
            (online.data.players.length === 0 ? (
              <p className="muted">{t("server.nobodyOnline")}</p>
            ) : (
              <ul className="player-list">
                {online.data.players.map((player) => (
                  <li key={player.uuid} className="player">
                    <Avatar name={player.name} skinUrl={player.skinUrl} />
                    {player.name}
                    {player.uuid === server.player.uuid && (
                      <span className="you muted small">{t("server.you")}</span>
                    )}
                  </li>
                ))}
              </ul>
            ))}
        </section>
      )}
    </div>
  );
}

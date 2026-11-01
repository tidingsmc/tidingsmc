import { ChevronLeft, Home } from "pixelarticons/react";
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
import { cameFrom, paths, type AddonRoute } from "../lib/router";
import { useInfo } from "../lib/useInfo";
import { useOnline } from "../lib/useOnline";
import { WorldCard } from "../world";
import { AddonTab } from "./AddonTab";

export function ServerScreen({
  server,
  addon,
}: {
  server: PairedServer;
  addon?: AddonRoute;
}) {
  const { t } = useTranslation();
  const info = useInfo(server);
  const addons = (info?.addons ?? []).filter((a) => isAddonId(a?.id));
  const current = addons.find((a) => a.id === addon?.id);

  return (
    <Screen
      title={server.name}
      back={paths.servers}
      action={<SettingsLink href={paths.settings(server.id)} />}
    >
      {addons.length > 0 || addon ? (
        <div className="binder">
          <nav className="tabs">
            <a
              href={paths.server(server.id)}
              aria-current={addon ? undefined : "page"}
              aria-label={t("server.overview")}
              title={t("server.overview")}
            >
              <Home aria-hidden />
            </a>
            {addons.map((a) => {
              const title = text(a.title) || a.id;
              return (
                <a
                  key={a.id}
                  href={paths.addon(server.id, { id: a.id })}
                  aria-current={a.id === addon?.id ? "page" : undefined}
                  aria-label={title}
                  title={title}
                >
                  <AddonIcon name={text(a.icon)} />
                </a>
              );
            })}
          </nav>
          <div className="tab-paper">
            {addon ? (
              <>
                <h2 className="tab-title">
                  {addon.view && <AddonBack server={server} addon={addon.id} />}
                  <AddonIcon name={text(current?.icon)} />
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
  );
}

/**
 * Back to the page of the add-on that led here, like the back gesture; to the tab's first page when
 * none did, such as after opening a notification, so it never leaves the add-on.
 */
function AddonBack({ server, addon }: { server: PairedServer; addon: string }) {
  const { t } = useTranslation();
  const tab = paths.addon(server.id, { id: addon });
  return (
    <a
      className="back tab-back"
      href={tab}
      aria-label={t("common.back")}
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
    <>
      <div className="server-header">
        <ServerIcon name={server.name} icon={info?.icon} size={64} />
        {info && <Motd segments={info.motd} />}
      </div>
      {online.status === "ok" && online.data.world && (
        <WorldCard world={online.data.world} receivedAt={online.receivedAt} />
      )}

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
    </>
  );
}

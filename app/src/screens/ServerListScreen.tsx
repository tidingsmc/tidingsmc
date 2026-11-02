import { Plus, Unlink } from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import {
  Avatar,
  Motd,
  NotificationsOff,
  OnlineSummary,
  Screen,
  ServerIcon,
  SettingsLink,
} from "../components";
import type { PairedServer } from "../lib/api";
import { paths } from "../lib/router";
import { useInfo } from "../lib/useInfo";
import { useOnline } from "../lib/useOnline";
import { useWide } from "../lib/useWide";

interface Props {
  servers: PairedServer[];
  unpaired: PairedServer[];
  onDismissUnpaired: (server: PairedServer) => void;
}

export function ServerListScreen({
  servers,
  unpaired,
  onDismissUnpaired,
}: Props) {
  const { t } = useTranslation();
  const wide = useWide();
  return (
    <Screen
      title={wide ? t("serverList.title") : "Tidings"}
      logo
      action={<SettingsLink href={paths.appSettings} />}
    >
      {unpaired.map((server) => (
        <UnpairedNotice
          key={`${server.id}:${server.pairedAt}`}
          server={server}
          onDismiss={() => onDismissUnpaired(server)}
        />
      ))}
      {servers.length === 0 ? (
        <div className="empty">
          <p className="empty-title">{t("serverList.empty")}</p>
          <p>{t("serverList.emptyHelp")}</p>
        </div>
      ) : (
        <>
          <NotificationsOff servers={servers} snoozable />
          <ul className={wide ? "server-list dashboard" : "server-list"}>
            {servers.map((server) => (
              <li key={server.id}>
                {wide ? (
                  <DashboardCard server={server} />
                ) : (
                  <ServerCard server={server} />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {/* On a wide window the sidebar has it */}
      {!wide && (
        <div className="bottom-bar">
          <a className="button primary" href={paths.pair}>
            <Plus /> {t("serverList.pair")}
          </a>
        </div>
      )}
    </Screen>
  );
}

function ServerCard({ server }: { server: PairedServer }) {
  const online = useOnline(server);
  const info = useInfo(server);
  return (
    <a className="card" href={paths.server(server.id)}>
      <div className="card-row">
        <ServerIcon name={server.name} icon={info?.icon} />
        <div className="card-main">
          <span className="card-title">{server.name}</span>
          <OnlineSummary state={online} />
        </div>
      </div>
    </a>
  );
}

/** Faces stacked on a dashboard card before "+N" */
const SHOWN_PLAYERS = 5;

function DashboardCard({ server }: { server: PairedServer }) {
  const { t } = useTranslation();
  const online = useOnline(server);
  const info = useInfo(server);
  const players = online.status === "ok" ? online.data.players : [];

  return (
    <a className="card dashboard-card" href={paths.server(server.id)}>
      <div className="dashboard-head">
        <ServerIcon name={server.name} icon={info?.icon} size={48} />
        <div className="card-main">
          <span className="card-title">{server.name}</span>
          <OnlineSummary state={online} />
        </div>
        {players.length > 0 && (
          <ul className="head-stack">
            {players.slice(0, SHOWN_PLAYERS).map((player) => (
              <li
                key={player.uuid}
                title={
                  player.uuid === server.player.uuid
                    ? `${player.name} (${t("server.you")})`
                    : player.name
                }
              >
                <Avatar name={player.name} skinUrl={player.skinUrl} size={32} />
                <span className="visually-hidden">{player.name}</span>
              </li>
            ))}
            {players.length > SHOWN_PLAYERS && (
              <li className="head-stack-more">
                {t("serverList.morePlayers", {
                  count: players.length - SHOWN_PLAYERS,
                })}
              </li>
            )}
          </ul>
        )}
      </div>
      {info && info.motd.length > 0 && <Motd segments={info.motd} />}
    </a>
  );
}

function UnpairedNotice({
  server,
  onDismiss,
}: {
  server: PairedServer;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="notice warn" role="status">
      <div className="notice-row">
        <span className="notice-icon" aria-hidden>
          <Unlink />
        </span>
        <div className="notice-main">
          <p className="notice-title">
            {t("serverList.unpairedTitle", { server: server.name })}
          </p>
          <p className="muted small">{t("serverList.unpaired")}</p>
        </div>
      </div>
      <div className="notice-actions">
        <button className="button" onClick={onDismiss}>
          {t("common.ok")}
        </button>
      </div>
    </div>
  );
}

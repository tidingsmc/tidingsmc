import { useTranslation } from "react-i18next";
import {
  Avatar,
  Motd,
  NotificationsOff,
  Screen,
  ServerIcon,
  SettingsLink,
} from "../components";
import type { PairedServer } from "../lib/api";
import { errorText } from "../lib/i18n";
import { paths } from "../lib/router";
import { useInfo } from "../lib/useInfo";
import { useOnline } from "../lib/useOnline";
import { hostOf } from "../lib/util";
import { WorldCard } from "../world";

export function ServerScreen({ server }: { server: PairedServer }) {
  const { t } = useTranslation();
  const online = useOnline(server);
  const info = useInfo(server);

  return (
    <Screen
      title={server.name}
      back={paths.servers}
      action={<SettingsLink href={paths.settings(server.id)} />}
    >
      <p className="server-address">{hostOf(server.url)}</p>
      <div className="server-header">
        <ServerIcon name={server.name} icon={info?.icon} size={64} />
        {info && <Motd segments={info.motd} />}
      </div>
      <NotificationsOff server={server} />
      {online.status === "ok" && online.data.world && (
        <WorldCard world={online.data.world} receivedAt={online.receivedAt} />
      )}

      <section className="section">
        <h2>
          {t("server.onlineNow")}
          {online.status === "ok" &&
            ` · ${online.data.players.length}/${online.data.maxPlayers}`}
        </h2>
        {online.status === "loading" && (
          <p className="muted">{t("common.checking")}</p>
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
    </Screen>
  );
}

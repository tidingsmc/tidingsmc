import { Plus, Unlink } from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import {
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
  return (
    <Screen
      title="Tidings"
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
          <ul className="server-list">
            {servers.map((server) => (
              <li key={server.id}>
                <ServerCard server={server} />
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="bottom-bar">
        <a className="button primary" href={paths.pair}>
          <Plus /> {t("serverList.pair")}
        </a>
      </div>
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

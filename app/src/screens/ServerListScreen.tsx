import { Plus } from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import { OnlineSummary, Screen, ServerIcon, SettingsLink } from "../components";
import type { PairedServer } from "../lib/api";
import { paths } from "../lib/router";
import { useInfo } from "../lib/useInfo";
import { useOnline } from "../lib/useOnline";

export function ServerListScreen({ servers }: { servers: PairedServer[] }) {
  const { t } = useTranslation();
  return (
    <Screen
      title="Tidings"
      logo
      action={<SettingsLink href={paths.appSettings} />}
    >
      {servers.length === 0 ? (
        <div className="empty">
          <p className="empty-title">{t("serverList.empty")}</p>
          <p>{t("serverList.emptyHelp")}</p>
        </div>
      ) : (
        <ul className="server-list">
          {servers.map((server) => (
            <li key={server.id}>
              <ServerCard server={server} />
            </li>
          ))}
        </ul>
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

import { BellRing, Plus } from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import type { PairedServer } from "../lib/api";
import { paths, type Route } from "../lib/router";
import { useInfo } from "../lib/useInfo";
import { useOnline } from "../lib/useOnline";
import { OnlineSummary } from "./OnlineSummary";
import { ServerIcon } from "./ServerIcon";

/** For desktop */
export function Sidebar({
  servers,
  route,
}: {
  servers: PairedServer[];
  route: Route;
}) {
  const { t } = useTranslation();
  const currentId =
    route.name === "server" || route.name === "settings" ? route.id : null;

  return (
    <aside className="sidebar">
      <a className="sidebar-brand" href={paths.servers}>
        <BellRing className="logo" aria-hidden />
        Tidings
      </a>
      <nav className="sidebar-nav" aria-label={t("serverList.title")}>
        <h2 className="sidebar-heading">{t("serverList.title")}</h2>
        {servers.length === 0 ? (
          <p className="muted small sidebar-empty">{t("serverList.empty")}</p>
        ) : (
          <ul className="sidebar-list">
            {servers.map((server) => (
              <li key={server.id}>
                <SidebarServer
                  server={server}
                  current={server.id === currentId}
                />
              </li>
            ))}
          </ul>
        )}
      </nav>
      <a
        className="button primary sidebar-pair"
        href={paths.pair}
        aria-current={route.name === "pair" ? "page" : undefined}
      >
        <Plus aria-hidden /> {t("serverList.pair")}
      </a>
    </aside>
  );
}

function SidebarServer({
  server,
  current,
}: {
  server: PairedServer;
  current: boolean;
}) {
  const online = useOnline(server);
  const info = useInfo(server);
  return (
    <a
      className="sidebar-item"
      href={paths.server(server.id)}
      aria-current={current ? "page" : undefined}
    >
      <ServerIcon name={server.name} icon={info?.icon} size={36} />
      <span className="sidebar-item-main">
        <span className="sidebar-item-title">{server.name}</span>
        <OnlineSummary state={online} />
      </span>
    </a>
  );
}

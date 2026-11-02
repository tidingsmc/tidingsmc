import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Screen, Sidebar } from "./components";
import { onUnpaired, type PairedServer } from "./lib/api";
import { navigate, parseRoute, paths, useRoute } from "./lib/router";
import { unregister, useSubscriptionSync } from "./lib/notifications";
import { useUnpairRetry } from "./lib/pendingUnpairs";
import { useAppWideSettingsSync } from "./lib/appWideSettings";
import { useServers } from "./lib/storage";
import { useWide } from "./lib/useWide";
import { AppSettingsScreen } from "./screens/AppSettingsScreen";
import { NotificationSettingsScreen } from "./screens/NotificationSettingsScreen";
import { PairScreen } from "./screens/PairScreen";
import { ServerListScreen } from "./screens/ServerListScreen";
import { ServerScreen } from "./screens/ServerScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

export default function App() {
  const { t } = useTranslation();
  const route = useRoute();
  const wide = useWide();

  const { servers, upsert, remove, removePairing } = useServers();
  const serversRef = useRef(servers);
  serversRef.current = servers;

  useAppWideSettingsSync(servers);
  useSubscriptionSync(servers);
  useUnpairRetry();

  // Servers that unpaired this device
  const [unpaired, setUnpaired] = useState<PairedServer[]>([]);

  useEffect(
    () =>
      onUnpaired((server) => {
        const current = serversRef.current.find((s) => s.id === server.id);
        if (current?.token !== server.token) return;
        removePairing(server);
        unregister(server.id).catch(() => {});
        setUnpaired((list) =>
          list.some((s) => s.id === server.id && s.pairedAt === server.pairedAt)
            ? list
            : [...list, server],
        );
        const route = parseRoute(location.hash);
        if (
          (route.name === "server" || route.name === "settings") &&
          route.id === server.id
        ) {
          navigate(paths.servers, { replace: true });
        }
      }),
    [removePairing],
  );

  let screen;
  switch (route.name) {
    case "appSettings":
      screen = <AppSettingsScreen servers={servers} />;
      break;
    case "notificationSettings":
      screen = wide ? (
        <AppSettingsScreen servers={servers} />
      ) : (
        <NotificationSettingsScreen servers={servers} />
      );
      break;
    case "pair":
      screen = (
        <PairScreen
          key={`${route.url}|${route.code}`}
          step={route.step}
          initialUrl={route.url}
          initialCode={route.code}
          servers={servers}
          onPaired={(server) => {
            upsert(server);
            navigate(paths.server(server.id), { replace: true });
          }}
        />
      );
      break;
    case "server":
    case "settings": {
      const server = servers.find((s) => s.id === route.id);
      screen = !server ? (
        <Screen title={t("server.notFound")} back={paths.servers}>
          <p className="muted">{t("server.notPaired")}</p>
        </Screen>
      ) : route.name === "settings" && wide ? (
        <ServerScreen
          key={server.id}
          server={server}
          settings={{
            onLeft: () => {
              remove(server.id);
              navigate(paths.servers, { replace: true });
            },
          }}
        />
      ) : route.name === "settings" ? (
        <SettingsScreen
          key={server.id}
          server={server}
          onLeft={() => {
            remove(server.id);
            navigate(paths.servers, { replace: true });
          }}
        />
      ) : (
        <ServerScreen
          key={server.id}
          server={server}
          addon={route.name === "server" ? route.addon : undefined}
        />
      );
      break;
    }
    default:
      screen = (
        <ServerListScreen
          servers={servers}
          unpaired={unpaired}
          onDismissUnpaired={(server) =>
            setUnpaired((list) => list.filter((s) => s !== server))
          }
        />
      );
  }

  return (
    <div className="shell">
      {wide && <Sidebar servers={servers} route={route} />}
      <div className="main">{screen}</div>
    </div>
  );
}

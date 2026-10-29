import { useTranslation } from "react-i18next";
import { Screen } from "./components";
import { navigate, paths, useRoute } from "./lib/router";
import { useSubscriptionSync } from "./lib/notifications";
import { useServers } from "./lib/storage";
import { useTimeZoneSync } from "./lib/timeZone";
import { AppSettingsScreen } from "./screens/AppSettingsScreen";
import { PairScreen } from "./screens/PairScreen";
import { ServerListScreen } from "./screens/ServerListScreen";
import { ServerScreen } from "./screens/ServerScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

export default function App() {
  const { t } = useTranslation();
  const route = useRoute();
  const { servers, upsert, remove } = useServers();
  useTimeZoneSync(servers);
  useSubscriptionSync(servers);

  let screen;
  switch (route.name) {
    case "appSettings":
      screen = <AppSettingsScreen servers={servers} />;
      break;
    case "pair":
      screen = (
        <PairScreen
          key={`${route.url}|${route.code}`}
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
      ) : route.name === "settings" ? (
        <SettingsScreen
          // Keyed so moving between servers doesn't show the previous one's data while loading.
          key={server.id}
          server={server}
          onLeft={() => {
            remove(server.id);
            navigate(paths.servers, { replace: true });
          }}
        />
      ) : (
        <ServerScreen key={server.id} server={server} />
      );
      break;
    }
    default:
      screen = <ServerListScreen servers={servers} />;
  }

  return screen;
}

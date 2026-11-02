import type { TFunction } from "i18next";
import type { AddonLink } from "./addons";
import { paths } from "./paths";

export interface PushMessage {
  kind:
    | "player_joined"
    | "player_left"
    | "server_started"
    | "server_stopping"
    | "addon";
  player?: { uuid: string; name: string; skinUrl?: string };
  addon?: string;
  text?: string;
  link?: AddonLink;
}

export interface NotificationContent {
  title: string;
  body: string;
  tag: string;
  path: string;
}

export function notificationContent(
  message: PushMessage,
  server: { id: string; name: string },
  t: TFunction,
): NotificationContent {
  const { kind, player } = message;
  const { id: serverId, name: serverName } = server;
  const name = player?.name ?? t("notification.someone");
  const playerTag = `${serverId}:player:${player?.uuid ?? "someone"}`;
  const serverPath = paths.server(serverId);

  switch (kind) {
    case "player_joined":
      return {
        title: serverName,
        body: t("notification.joined", { name }),
        tag: playerTag,
        path: serverPath,
      };
    case "player_left":
      return {
        title: serverName,
        body: t("notification.left", { name }),
        tag: playerTag,
        path: serverPath,
      };
    case "server_started":
      return {
        title: serverName,
        body: t("notification.serverStarted"),
        tag: `${serverId}:status`,
        path: serverPath,
      };
    case "server_stopping":
      return {
        title: serverName,
        body: t("notification.serverStopping"),
        tag: `${serverId}:status`,
        path: serverPath,
      };
    case "addon": {
      const addon = message.addon ?? "";
      return {
        title: serverName,
        body: message.text ?? "",
        tag: `${serverId}:addon:${addon}:${player?.uuid ?? "news"}`,
        path: paths.addon(serverId, { id: addon, ...message.link }),
      };
    }
  }
}

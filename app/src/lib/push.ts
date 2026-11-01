// What the mod sends in a Web Push, and how the service worker shows it.
// No window-only APIs here: the service worker imports this file.

import type { TFunction } from "i18next";
import type { AddonLink } from "./addons";
import { paths } from "./paths";

/**
 * The JSON payload of a push from the mod. Kept small: Web Push payloads are limited to about 4 KB,
 * so the player's face is drawn on the phone from their skin rather than sent.
 * Which server sent it isn't part of it: the service worker that receives it is that server's.
 */
export interface PushMessage {
  /** Mirrors the mod's NotificationKind. */
  kind:
    | "player_joined"
    | "player_left"
    | "server_started"
    | "server_stopping"
    | "addon";
  /** For player_joined and player_left; for addon, who it's about, if anyone. */
  player?: { uuid: string; name: string; skinUrl?: string };
  /** For addon: the add-on's ID. */
  addon?: string;
  /** For addon: the notification's body, plain text written by the add-on. */
  text?: string;
  /** For addon: the add-on's view to open when it's tapped, else its first view. */
  link?: AddonLink;
}

export interface NotificationContent {
  title: string;
  body: string;
  /** Notifications with the same tag replace each other instead of piling up. */
  tag: string;
  /** The app's route to open when it's tapped. */
  path: string;
}

/** `server` comes from this device's own list of paired servers. */
export function notificationContent(
  message: PushMessage,
  server: { id: string; name: string },
  t: TFunction,
): NotificationContent {
  const { kind, player } = message;
  const { id: serverId, name: serverName } = server;
  const name = player?.name ?? t("notification.someone");
  // One notification per player: their leave replaces their join, so the latest news is what's shown.
  // Keyed on the UUID, which survives name changes.
  const playerTag = `${serverId}:player:${player?.uuid ?? "someone"}`;
  const serverPath = paths.server(serverId);
  // The server comes first, so notifications from several servers are easy to tell apart.
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
      // sw.ts only lets an addon message through with its ID and text.
      const addon = message.addon ?? "";
      return {
        title: serverName,
        body: message.text ?? "",
        // An add-on's news about a player replaces its previous news about them, not their join.
        tag: `${serverId}:addon:${addon}:${player?.uuid ?? "news"}`,
        path: paths.addon(serverId, { id: addon, ...message.link }),
      };
    }
  }
}

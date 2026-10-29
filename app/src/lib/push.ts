// What the mod sends in a Web Push, and how the service worker shows it.
// No window-only APIs here: the service worker imports this file.

import type { TFunction } from 'i18next';

/**
 * The JSON payload of a push from the mod. Kept small: Web Push payloads are limited to about 4 KB,
 * so the player's face is drawn on the phone from their skin rather than sent.
 * Which server sent it isn't part of it: the service worker that receives it is that server's.
 */
export interface PushMessage {
  /** Mirrors the mod's NotificationKind. */
  kind: 'player_joined' | 'player_left' | 'server_started' | 'server_stopping';
  /** For player_joined and player_left. */
  player?: { uuid: string; name: string; skinUrl?: string };
}

export interface NotificationContent {
  title: string;
  body: string;
  /** Notifications with the same tag replace each other instead of piling up. */
  tag: string;
}

/** `server` comes from this device's own list of paired servers. */
export function notificationContent(
  message: PushMessage,
  server: { id: string; name: string },
  t: TFunction,
): NotificationContent {
  const { kind, player } = message;
  const { id: serverId, name: serverName } = server;
  const name = player?.name ?? t('notification.someone');
  // One notification per player: their leave replaces their join, so the latest news is what's shown.
  // Keyed on the UUID, which survives name changes.
  const playerTag = `${serverId}:player:${player?.uuid ?? 'someone'}`;
  // The server comes first, so notifications from several servers are easy to tell apart.
  switch (kind) {
    case 'player_joined':
      return { title: serverName, body: t('notification.joined', { name }), tag: playerTag };
    case 'player_left':
      return { title: serverName, body: t('notification.left', { name }), tag: playerTag };
    case 'server_started':
      return { title: serverName, body: t('notification.serverStarted'), tag: `${serverId}:status` };
    case 'server_stopping':
      return { title: serverName, body: t('notification.serverStopping'), tag: `${serverId}:status` };
  }
}

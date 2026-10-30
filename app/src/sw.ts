import i18next from "i18next";
import { notificationContent, type PushMessage } from "./lib/push";
import { skinFace } from "./lib/skin";
import { safeSkinUrl } from "./lib/util";
import { savedLanguage, serverName } from "./lib/workerStore";
import { i18nOptions, resolveLocale } from "./locales";

declare const self: ServiceWorkerGlobalScope;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

self.addEventListener("push", (event) => {
  const message = parse(event.data);
  event.waitUntil(message ? show(message) : showFallback());
});

const KINDS: PushMessage["kind"][] = [
  "player_joined",
  "player_left",
  "server_started",
  "server_stopping",
];

function parse(data: PushMessageData | null): PushMessage | undefined {
  try {
    const message = data?.json();
    return KINDS.includes(message?.kind) ? message : undefined;
  } catch {
    return undefined;
  }
}

async function showFallback() {
  const t = await translator();
  await self.registration.showNotification("Tidings", {
    body: t("notification.unknown"),
    icon: NO_ICON,
    data: { serverId: serverIdOfScope() },
  });
}

const i18n = i18next.createInstance();
const i18nReady = i18n.init(i18nOptions("en"));

async function translator() {
  const language = await savedLanguage().catch(() => "system" as const);
  await i18nReady;
  return i18n.getFixedT(resolveLocale(language, self.navigator.languages));
}

function serverIdOfScope(): string {
  const parts = new URL(self.registration.scope).pathname.split("/");
  return decodeURIComponent(parts[parts.length - 2]);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { serverId } = event.notification.data as { serverId: string };
  event.waitUntil(openServer(serverId));
});

async function openServer(serverId: string) {
  const app = new URL("../../", self.registration.scope).href;
  const path = `#/server/${encodeURIComponent(serverId)}`;
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const open = windows.find((client) => new URL(".", client.url).href === app);
  if (open) {
    await open.focus();
    open.postMessage({ type: "open", path });
  } else {
    await self.clients.openWindow(app + path);
  }
}

async function show(message: PushMessage) {
  const serverId = serverIdOfScope();
  const name = (await serverName(serverId).catch(() => undefined)) ?? "Tidings";
  const { title, body, tag } = notificationContent(
    message,
    { id: serverId, name },
    await translator(),
  );
  await self.registration.showNotification(title, {
    body,
    tag,
    renotify: true,
    icon: await playerIcon(message),
    data: { serverId },
  } as NotificationOptions & { renotify: boolean });
}

/**
 * A transparent 1×1 PNG. Without an icon, Chrome on Android makes one up from the first letter of the
 * app's address: only news about a player gets a picture, their face.
 */
const NO_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";

async function playerIcon(message: PushMessage): Promise<string> {
  const src = safeSkinUrl(message.player?.skinUrl);
  if (!src) return NO_ICON;
  try {
    return await skinFace(src);
  } catch {
    return NO_ICON;
  }
}

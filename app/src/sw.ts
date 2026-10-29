// Registered once per paired server, at "<app>/s/<serverId>/", each with that server's push subscription.
// Built to sw.js at the app's root; see the serviceWorker plugin in vite.config.ts.

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

// Every push must show a notification: browsers show a generic one otherwise, and Safari can cancel
// the subscription after a few silent pushes.
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

/** For a push we can't read (empty, or from a newer mod). */
async function showFallback() {
  const t = await translator();
  await self.registration.showNotification("Tidings", {
    body: t("notification.unknown"),
    data: { serverId: serverIdOfScope() },
  });
}

const i18n = i18next.createInstance();
const i18nReady = i18n.init(i18nOptions("en"));

/** Texts in the language picked in the app, or else the browser's. Checked for each notification: it can change. */
async function translator() {
  const language = await savedLanguage().catch(() => "system" as const);
  await i18nReady;
  // Fixed to this locale, so pushes handled at the same time can't switch each other's language.
  return i18n.getFixedT(resolveLocale(language, self.navigator.languages));
}

/** The scope is "<app>/s/<serverId>/". */
function serverIdOfScope(): string {
  const parts = new URL(self.registration.scope).pathname.split("/");
  return decodeURIComponent(parts[parts.length - 2]);
}

// Lets the app show a notification exactly as a push would, to test without a server.
self.addEventListener("message", (event) => {
  if (event.data?.type === "test-push")
    event.waitUntil(show(event.data.message));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { serverId } = event.notification.data as { serverId: string };
  event.waitUntil(openServer(serverId));
});

/** Reuses the app's window if it's open, rather than opening another one. */
async function openServer(serverId: string) {
  // The scope is "<app>/s/<serverId>/", so the app is two levels up.
  const app = new URL("../../", self.registration.scope).href;
  const path = `#/server/${encodeURIComponent(serverId)}`;
  // Uncontrolled too: the app's page is outside every registration's scope. Filtered on the app's
  // folder because other sites can share the origin (GitHub Pages); "." drops index.html, query and hash.
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
  // Never from the push itself, so a server can't pass itself off as another or replace its notifications.
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
    // Still ring when replacing a notification with the same tag (someone joining again).
    renotify: true,
    icon: await playerIcon(message),
    data: { serverId },
  } as NotificationOptions & { renotify: boolean }); // missing from TypeScript's types
}

async function playerIcon(message: PushMessage): Promise<string | undefined> {
  const src = safeSkinUrl(message.player?.skinUrl);
  if (!src) return undefined;
  try {
    return await skinFace(src);
  } catch {
    return undefined;
  }
}

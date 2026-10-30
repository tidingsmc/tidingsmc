import { useCallback, useEffect, useRef, useState } from "react";
import { api, type PairedServer } from "./api";
import { TranslatedError } from "./i18n";
import { navigate } from "./router";
import { sentToServers } from "./storage";

export function pushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Each server gets its own service worker registration, so each can have its own push subscription. */
function scopeOf(serverId: string): string {
  return new URL(`./s/${encodeURIComponent(serverId)}/`, location.href).href;
}

/** Registers the server's service worker, if it isn't yet, and waits until it runs. */
async function register(serverId: string): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register(
    new URL("./sw.js", location.href),
    {
      scope: scopeOf(serverId),
      // In dev, Vite serves the worker as an ES module.
      type: import.meta.env.DEV ? "module" : "classic",
    },
  );
  // The newest worker, so a just-updated one is used rather than the one it replaces.
  const worker =
    registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) throw new TranslatedError((t) => t("push.couldntStart"));
  if (worker.state === "activated") return registration;
  return new Promise((resolve, reject) => {
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") resolve(registration);
      // Failed to install, or replaced by a newer one before activating.
      if (worker.state === "redundant")
        reject(new TranslatedError((t) => t("push.couldntStart")));
    });
  });
}

/** The server's own registration, if any; getRegistration alone would also return one of an enclosing scope. */
async function ownRegistration(
  serverId: string,
): Promise<ServiceWorkerRegistration | undefined> {
  const scope = scopeOf(serverId);
  const registration = await navigator.serviceWorker?.getRegistration(scope);
  return registration?.scope === scope ? registration : undefined;
}

/** The endpoint of the push subscription each pairing last sent its server. */
const sentSubscriptions = sentToServers("tidings.sentSubscriptions");

/** Fires "change" each time a server is sent a new subscription, so push states are checked again. */
const subscriptionChanges = new EventTarget();

/**
 * Asks for permission to notify, unless already answered. Call it while handling a tap: iPhones only ask then.
 * @returns whether notifications are allowed
 */
export async function askPermission(): Promise<boolean> {
  if (!pushSupported()) return false;
  return (await Notification.requestPermission()) === "granted";
}

/**
 * Subscribes to the server's pushes, unless already subscribed, and sends it the subscription if it hasn't
 * got this one yet. Needs notification permission.
 */
export async function subscribe(server: PairedServer): Promise<void> {
  const registration = await register(server.id);
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(server.vapidPublicKey),
    }));
  if (sentSubscriptions.get(server) === subscription.endpoint) return;
  await api.updatePush(server, subscription.toJSON());
  sentSubscriptions.set(server, subscription.endpoint);
  subscriptionChanges.dispatchEvent(new Event("change"));
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const base64 = s
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(s.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** Asks for permission and subscribes, with a message saying why if it can't. Call it while handling a tap. */
export async function enableNotifications(server: PairedServer): Promise<void> {
  if (!pushSupported()) throw new TranslatedError((t) => t("push.unsupported"));
  if (!(await askPermission()))
    throw new TranslatedError((t) => t("push.blocked"));
  await subscribe(server);
}

/**
 * Browsers can renew or drop push subscriptions, and don't reliably tell the service worker. So each time
 * the app comes to the foreground, subscribe again where needed and send servers the subscriptions they
 * haven't got. Does nothing until notifications are allowed: asking needs a tap.
 */
export function useSubscriptionSync(servers: PairedServer[]) {
  useEffect(() => {
    const sync = () => {
      if (
        document.visibilityState !== "visible" ||
        !pushSupported() ||
        Notification.permission !== "granted"
      )
        return;
      sentSubscriptions.keepOnly(servers);
      for (const server of servers) {
        subscribe(server).catch(() => {}); // tried again next time the app is opened
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [servers]);
}

/** 'on' once the server has this device's current subscription. */
export type PushState = "unsupported" | "blocked" | "off" | "on";

async function pushState(server: PairedServer): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "off";
  const subscription = await (
    await ownRegistration(server.id)
  )?.pushManager.getSubscription();
  return subscription && sentSubscriptions.get(server) === subscription.endpoint
    ? "on"
    : "off";
}

/**
 * Whether this device gets each server's notifications, by server id; null while checking.
 * Checked again when the app comes back to the foreground, as notifications may have been allowed meanwhile,
 * and whenever a server is sent a new subscription, as useSubscriptionSync may still be sending it.
 * `servers` must keep its identity between renders.
 */
export function usePushStates(servers: PairedServer[]) {
  const [states, setStates] = useState<Map<string, PushState> | null>(null);
  // Only the latest check's result is kept: an older one finishing last would undo a change.
  const latest = useRef(0);
  const refresh = useCallback(async () => {
    const check = ++latest.current;
    const list = await Promise.all(
      servers.map((server) => pushState(server).catch((): PushState => "off")),
    );
    if (check !== latest.current) return;
    setStates(new Map(servers.map((server, i) => [server.id, list[i]])));
  }, [servers]);
  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    subscriptionChanges.addEventListener("change", refresh);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      subscriptionChanges.removeEventListener("change", refresh);
    };
  }, [refresh]);
  return { states, refresh };
}

const SNOOZE_KEY = "tidings.notificationsSnoozedUntil";
/** How long "Not now" hides the reminder to turn notifications on. */
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

/** Whether the reminder to turn notifications on was put off, and a way to put it off. */
export function useNotificationsSnooze() {
  const [snoozedUntil, setSnoozedUntil] = useState(() => {
    try {
      return Number(localStorage.getItem(SNOOZE_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  const snooze = useCallback(() => {
    const until = Date.now() + SNOOZE_MS;
    try {
      localStorage.setItem(SNOOZE_KEY, String(until));
    } catch {
      // Hidden until the app is opened again, then.
    }
    setSnoozedUntil(until);
  }, []);
  return { snoozed: snoozedUntil > Date.now(), snooze };
}

/**
 * Tapping a notification while the app is open focuses it and asks it to show the server (see sw.ts).
 * The app's page isn't under any registration's scope, so the worker can't navigate it itself.
 */
export function listenForNotificationClicks() {
  navigator.serviceWorker?.addEventListener("message", (event) => {
    if (event.data?.type === "open") navigate(event.data.path);
  });
}

/**
 * Stops this device getting the server's pushes, even if the server couldn't be told: its push service
 * then answers 410 to the server, which forgets the device.
 */
export async function unregister(serverId: string) {
  const registration = await ownRegistration(serverId);
  if (!registration) return;
  await (await registration.pushManager.getSubscription())?.unsubscribe();
  await registration.unregister();
}

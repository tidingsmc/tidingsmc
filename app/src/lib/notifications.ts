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

/** Each server gets its own service worker registration so each can have its own push subscription */
function scopeOf(serverId: string): string {
  return new URL(`./s/${encodeURIComponent(serverId)}/`, location.href).href;
}

async function register(serverId: string): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register(
    new URL("./sw.js", location.href),
    {
      scope: scopeOf(serverId),
      type: import.meta.env.DEV ? "module" : "classic",
    },
  );
  const worker =
    registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) throw new TranslatedError((t) => t("push.couldntStart"));
  if (worker.state === "activated") {
    registration.update().catch(() => {});
    return registration;
  }
  return new Promise((resolve, reject) => {
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") resolve(registration);
      if (worker.state === "redundant")
        reject(new TranslatedError((t) => t("push.couldntStart")));
    });
  });
}

async function ownRegistration(
  serverId: string,
): Promise<ServiceWorkerRegistration | undefined> {
  const scope = scopeOf(serverId);
  const registration = await navigator.serviceWorker?.getRegistration(scope);
  return registration?.scope === scope ? registration : undefined;
}

const sentSubscriptions = sentToServers("tidings.sentSubscriptions");

const subscriptionChanges = new EventTarget();

export async function askPermission(): Promise<boolean> {
  if (!pushSupported()) return false;
  return (await Notification.requestPermission()) === "granted";
}

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

export async function enableNotifications(server: PairedServer): Promise<void> {
  if (!pushSupported()) throw new TranslatedError((t) => t("push.unsupported"));
  if (!(await askPermission()))
    throw new TranslatedError((t) => t("push.blocked"));
  await subscribe(server);
}

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

export function usePushStates(servers: PairedServer[]) {
  const [states, setStates] = useState<Map<string, PushState> | null>(null);
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
    let status: PermissionStatus | undefined;
    let cancelled = false;
    navigator.permissions
      ?.query({ name: "notifications" })
      .then((s) => {
        if (cancelled) return;
        status = s;
        status.addEventListener("change", refresh);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      subscriptionChanges.removeEventListener("change", refresh);
      status?.removeEventListener("change", refresh);
    };
  }, [refresh]);
  return { states, refresh };
}

const SNOOZE_KEY = "tidings.notificationsSnoozedUntil";
/** How long "Not now" hides the reminder to turn notifications on */
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

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
      // Hidden
    }
    setSnoozedUntil(until);
  }, []);
  return { snoozed: snoozedUntil > Date.now(), snooze };
}

export function listenForNotificationClicks() {
  navigator.serviceWorker?.addEventListener("message", (event) => {
    if (event.data?.type === "open") navigate(event.data.path);
  });
}

export async function unregister(serverId: string) {
  const registration = await ownRegistration(serverId);
  if (!registration) return;
  await (await registration.pushManager.getSubscription())?.unsubscribe();
  await registration.unregister();
}

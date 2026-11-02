import { useCallback, useEffect, useRef, useState } from "react";
import { api, type DeviceSettings, type PairedServer } from "./api";
import { pairingKey } from "./serverCache";
import { sentToServers } from "./storage";

export type AppWideSettings = Pick<
  DeviceSettings,
  "quietHours" | "quietWhileOnline"
>;

const KEY = "tidings.appWideSettings";

const synced = sentToServers("tidings.syncedAppWideSettings");

function save(settings: AppWideSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Still sent to the servers
  }
}

function isValid(value: unknown): value is AppWideSettings {
  const v = value as AppWideSettings | null;
  return (
    typeof v?.quietWhileOnline === "boolean" &&
    typeof v.quietHours?.enabled === "boolean" &&
    Array.isArray(v.quietHours.periods) &&
    v.quietHours.periods.every(
      (p) => typeof p?.start === "string" && typeof p.end === "string",
    )
  );
}

function load(): AppWideSettings {
  try {
    const raw = localStorage.getItem(KEY);
    const saved: unknown = raw && JSON.parse(raw);
    if (isValid(saved)) return saved;
  } catch {
    // fall through
  }
  return {
    quietHours: {
      enabled: false,
      periods: [{ start: "22:00", end: "08:00" }],
    },
    quietWhileOnline: true,
  };
}

const queues = new Map<string, Promise<unknown>>();

async function sync(servers: PairedServer[]): Promise<SyncFailure[]> {
  try {
    synced.keepOnly(servers);
  } catch {
    // can wait
  }
  const results = await Promise.all(
    servers.map((server) => {
      const key = pairingKey(server);
      const run = (queues.get(key) ?? Promise.resolve()).then(async () => {
        const settings = load();
        const value = JSON.stringify(settings);
        if (synced.get(server) === value) return null;
        try {
          await api.updateSettings(server, settings);
        } catch (error) {
          return { server, error };
        }
        try {
          synced.set(server, value);
        } catch {
          // can wait
        }
        return null;
      });
      queues.set(
        key,
        run.catch(() => {}),
      );
      return run.catch((error: unknown): SyncFailure => ({ server, error }));
    }),
  );
  return results.filter((r): r is SyncFailure => r !== null);
}

export function useAppWideSettingsSync(servers: PairedServer[]) {
  useEffect(() => {
    const syncVisible = () => {
      if (document.visibilityState === "visible") sync(servers);
    };
    syncVisible();
    document.addEventListener("visibilitychange", syncVisible);
    window.addEventListener("online", syncVisible);
    return () => {
      document.removeEventListener("visibilitychange", syncVisible);
      window.removeEventListener("online", syncVisible);
    };
  }, [servers]);
}

export type SyncFailure = { server: PairedServer; error: unknown };

export function useAppWideSettings(servers: PairedServer[]) {
  const [settings, setSettings] = useState(() => load());
  const [failures, setFailures] = useState<SyncFailure[]>([]);
  const latest = useRef(0);
  const update = useCallback(
    async (changes: Partial<AppWideSettings>) => {
      const change = ++latest.current;
      const settings = { ...load(), ...changes };
      save(settings);
      setSettings(settings);
      setFailures([]);
      const failed = await sync(servers);
      if (change === latest.current) setFailures(failed);
    },
    [servers],
  );
  return { settings, update, failures };
}

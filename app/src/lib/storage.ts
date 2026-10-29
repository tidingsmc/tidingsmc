import { useCallback, useEffect, useState } from "react";
import { mockServers, usingMockApi, type PairedServer } from "./api";
import { saveServerNames } from "./workerStore";

const KEY = "tidings.servers";

function load(): PairedServer[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null && usingMockApi) return mockServers();
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Paired servers, persisted on this device.
 * Their names are also copied to IndexedDB, for the service worker (see workerStore.ts).
 */
export function useServers() {
  const [servers, setServers] = useState<PairedServer[]>(load);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(servers));
    // Notifications then show the server as "Tidings": not worth bothering the player about.
    saveServerNames(servers).catch(() => {});
  }, [servers]);

  const upsert = useCallback(
    (server: PairedServer) =>
      setServers((list) =>
        list.some((s) => s.id === server.id)
          ? list.map((s) => (s.id === server.id ? server : s))
          : [...list, server],
      ),
    [],
  );
  const remove = useCallback(
    (id: string) => setServers((list) => list.filter((s) => s.id !== id)),
    [],
  );

  return { servers, upsert, remove };
}

/** Keyed by pairing rather than server, so pairing with a server again starts afresh. */
const pairingKey = (server: PairedServer) => `${server.id}:${server.pairedAt}`;

/**
 * What this device last told each of its servers about something (its time zone, its push subscription),
 * so it's only sent again once it changes.
 */
export function sentToServers(key: string) {
  const load = (): Record<string, string> => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "{}");
    } catch {
      return {};
    }
  };
  const save = (sent: Record<string, string>) =>
    localStorage.setItem(key, JSON.stringify(sent));

  return {
    get: (server: PairedServer): string | undefined =>
      load()[pairingKey(server)],
    set: (server: PairedServer, value: string) =>
      save({ ...load(), [pairingKey(server)]: value }),
    /** Forgets pairings that are gone (left, or paired again). */
    keepOnly(servers: PairedServer[]) {
      const current = new Set(servers.map(pairingKey));
      save(
        Object.fromEntries(
          Object.entries(load()).filter(([key]) => current.has(key)),
        ),
      );
    },
  };
}

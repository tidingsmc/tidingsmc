import { useCallback, useEffect, useState } from "react";
import type { PairedServer } from "./api";
import { infoCache } from "./useInfo";
import { keepOnlineOnly } from "./useOnline";
import { pairingKey } from "./serverCache";
import { settingsCache } from "./useSettings";
import { saveServerNames } from "./workerStore";

const KEY = "tidings.servers";

function load(): PairedServer[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useServers() {
  const [servers, setServers] = useState<PairedServer[]>(load);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(servers));
    saveServerNames(servers).catch(() => {});
    infoCache.keepOnly(servers);
    settingsCache.keepOnly(servers);
    keepOnlineOnly(servers);
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
  const removePairing = useCallback(
    (server: PairedServer) =>
      setServers((list) =>
        list.filter((s) => s.id !== server.id || s.token !== server.token),
      ),
    [],
  );

  return { servers, upsert, remove, removePairing };
}

export function sentToServers(key: string) {
  const load = (): Record<string, string> => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "{}");
    } catch {
      return {};
    }
  };
  const save = (sent: Record<string, string>) => {
    try {
      localStorage.setItem(key, JSON.stringify(sent));
    } catch {
      // Sent again next time
    }
  };

  return {
    get: (server: PairedServer): string | undefined =>
      load()[pairingKey(server)],
    set: (server: PairedServer, value: string) =>
      save({ ...load(), [pairingKey(server)]: value }),
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

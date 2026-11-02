import type { PairedServer } from "./api";

/** Keyed by pairing rather than server, so pairing with a server again starts afresh */
export const pairingKey = (server: PairedServer) =>
  `${server.id}:${server.pairedAt}`;

export function cachedPerServer<T>(prefix: string) {
  return {
    load(server: PairedServer): T | null {
      try {
        const raw = localStorage.getItem(prefix + pairingKey(server));
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    save(server: PairedServer, value: T) {
      try {
        localStorage.setItem(
          prefix + pairingKey(server),
          JSON.stringify(value),
        );
      } catch {
        // storage full or blocked: the cache is only a nicety
      }
    },
    keepOnly(servers: PairedServer[]) {
      try {
        const kept = new Set(
          servers.map((server) => prefix + pairingKey(server)),
        );
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith(prefix) && !kept.has(key))
            localStorage.removeItem(key);
        }
      } catch {
        // storage blocked: nothing to sweep
      }
    },
  };
}

import { useEffect, useState } from "react";
import { api, type PairedServer, type ServerInfo } from "./api";
import { cachedPerServer } from "./serverCache";

export const infoCache = cachedPerServer<ServerInfo>("tidings.info.");

/**
 * The server's icon, description and version. Fetched once per screen: they rarely change.
 * The last ones received are kept on the device, so they still show while the server is unreachable.
 */
export function useInfo(server: PairedServer): ServerInfo | null {
  const [info, setInfo] = useState<ServerInfo | null>(() =>
    infoCache.load(server),
  );

  useEffect(() => {
    let cancelled = false;
    api.info(server).then(
      (data) => {
        // Not once the screen is gone: the server may have been left meanwhile, and its cache swept.
        if (cancelled) return;
        infoCache.save(server, data);
        setInfo(data);
      },
      () => {}, // the screens work without it
    );
    return () => {
      cancelled = true;
    };
  }, [server]);

  return info;
}

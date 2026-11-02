import { useEffect, useState } from "react";
import { api, type PairedServer, type ServerInfo } from "./api";
import { cachedPerServer } from "./serverCache";

export const infoCache = cachedPerServer<ServerInfo>("tidings.info.");

export function useInfo(server: PairedServer): ServerInfo | null {
  const [info, setInfo] = useState<ServerInfo | null>(() =>
    infoCache.load(server),
  );

  useEffect(() => {
    let cancelled = false;
    api.info(server).then(
      (data) => {
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

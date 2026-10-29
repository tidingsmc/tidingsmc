import { useEffect, useState } from "react";
import { api, type PairedServer, type ServerInfo } from "./api";

/** The server's icon, description and version. Fetched once: they rarely change. */
export function useInfo(server: PairedServer): ServerInfo | null {
  const [info, setInfo] = useState<ServerInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.info(server).then(
      (data) => !cancelled && setInfo(data),
      () => {}, // the screens work without it
    );
    return () => {
      cancelled = true;
    };
  }, [server]);

  return info;
}

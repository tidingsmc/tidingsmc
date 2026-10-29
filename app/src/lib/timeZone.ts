import { useEffect } from "react";
import { api, type PairedServer } from "./api";
import { sentToServers } from "./storage";
import { currentTimeZone } from "./util";

/** Which time zone each pairing last told its server. */
const synced = sentToServers("tidings.syncedTimeZones");

/**
 * Servers apply quiet hours in this device's time zone. When it changes (travelling), tell every server,
 * checking again each time the app comes back to the foreground. Unreachable servers are retried then too.
 */
export function useTimeZoneSync(servers: PairedServer[]) {
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState === "visible") syncTimeZone(servers);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [servers]);
}

async function syncTimeZone(servers: PairedServer[]) {
  const zone = currentTimeZone();
  synced.keepOnly(servers);
  await Promise.all(
    servers
      .filter((server) => synced.get(server) !== zone)
      .map(async (server) => {
        try {
          await api.updateSettings(server, { timeZone: zone });
          synced.set(server, zone);
        } catch {
          // Tried again next time the app is opened.
        }
      }),
  );
}

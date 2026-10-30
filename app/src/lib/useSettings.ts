import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  worthRetrying,
  type DeviceSettings,
  type PairedServer,
} from "./api";
import { TranslatedError, errorText } from "./i18n";
import { cachedPerServer, pairingKey } from "./serverCache";

export const settingsCache =
  cachedPerServer<DeviceSettings>("tidings.settings.");

const RETRY_MS = 30_000;

/**
 * This device's settings on a server. Changes show immediately; once every save has answered,
 * the screen shows what the server last confirmed, so failed changes roll back without undoing newer ones.
 * The last confirmed settings are kept on the device, so they still show while the server is unreachable;
 * `live` tells whether the server answered, and so whether they can be changed.
 */
export function useSettings(server: PairedServer) {
  const [settings, setSettings] = useState<DeviceSettings | null>(() =>
    settingsCache.load(server),
  );
  const [error, setError] = useState<Error | null>(null);
  const [live, setLive] = useState(false);
  // Settings as the server last confirmed them, and which save confirmed them (answers can arrive out of order).
  const confirmed = useRef<{ settings: DeviceSettings; save: number } | null>(
    null,
  );
  const saves = useRef({ sent: 0, pending: 0 });
  const pairing = useRef(pairingKey(server));

  useEffect(() => {
    // Pairing with the server again: what the previous pairing confirmed no longer holds.
    if (pairing.current !== pairingKey(server)) {
      pairing.current = pairingKey(server);
      confirmed.current = null;
      setSettings(settingsCache.load(server));
      setError(null);
      setLive(false);
    }
    let cancelled = false;
    let loading = false;
    // Answers that won't change by asking again (403, 400…) stop the retries.
    let gaveUp = false;
    // Tried again every so often, and when the app comes back to the foreground or the device back online, until the server answers.
    const load = () => {
      if (
        loading ||
        gaveUp ||
        confirmed.current ||
        document.visibilityState !== "visible"
      )
        return;
      loading = true;
      api
        .settings(server)
        .finally(() => (loading = false))
        .then(
          (data) => {
            if (cancelled || confirmed.current) return;
            confirmed.current = { settings: data, save: 0 };
            settingsCache.save(server, data);
            setSettings(data);
            setError(null);
            setLive(true);
          },
          (err: Error) => {
            if (cancelled || confirmed.current) return;
            gaveUp = !worthRetrying(err);
            setError(err);
          },
        );
    };
    load();
    const timer = setInterval(load, RETRY_MS);
    document.addEventListener("visibilitychange", load);
    window.addEventListener("online", load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
      window.removeEventListener("online", load);
    };
  }, [server]);

  const update = useCallback(
    async (changes: Partial<DeviceSettings>) => {
      if (!confirmed.current) return;
      const save = ++saves.current.sent;
      saves.current.pending++;
      setSettings((s) => s && { ...s, ...changes });
      setError(null);
      try {
        const saved = await api.updateSettings(server, changes);
        if (save > confirmed.current.save) {
          confirmed.current = { settings: saved, save };
          settingsCache.save(server, saved);
        }
      } catch (err) {
        setError(
          new TranslatedError((t) =>
            t("errors.couldntSave", { reason: errorText(err, t) }),
          ),
        );
      }
      if (--saves.current.pending === 0)
        setSettings(confirmed.current.settings);
    },
    [server],
  );

  return { settings, error, live, update };
}

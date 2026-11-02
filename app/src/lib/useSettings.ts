import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  worthRetrying,
  type DeviceSettings,
  type PairedServer,
} from "./api";
import { TranslatedError, errorText } from "./i18n";
import { cachedPerServer, pairingKey } from "./serverCache";
import { whenVisible } from "./whenVisible";

export const settingsCache =
  cachedPerServer<DeviceSettings>("tidings.settings.");

const RETRY_MS = 30_000;

export function useSettings(server: PairedServer) {
  const [settings, setSettings] = useState<DeviceSettings | null>(() =>
    settingsCache.load(server),
  );
  const [error, setError] = useState<Error | null>(null);
  const [live, setLive] = useState(false);

  const confirmed = useRef<{ settings: DeviceSettings; save: number } | null>(
    null,
  );
  const saves = useRef({ sent: 0, pending: 0 });
  const pairing = useRef(pairingKey(server));

  useEffect(() => {
    if (pairing.current !== pairingKey(server)) {
      pairing.current = pairingKey(server);
      confirmed.current = null;
      setSettings(settingsCache.load(server));
      setError(null);
      setLive(false);
    }
    let cancelled = false;
    let loading = false;
    let gaveUp = false;
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
    const timer = setInterval(load, RETRY_MS);
    const stopWatching = whenVisible(load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      stopWatching();
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

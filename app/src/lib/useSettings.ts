import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type DeviceSettings, type PairedServer } from './api';
import { TranslatedError, errorText } from './i18n';

/**
 * This device's settings on a server. Changes show immediately; once every save has answered,
 * the screen shows what the server last confirmed, so failed changes roll back without undoing newer ones.
 */
export function useSettings(server: PairedServer) {
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const [error, setError] = useState<Error | null>(null);
  // Settings as the server last confirmed them, and which save confirmed them (answers can arrive out of order).
  const confirmed = useRef<{ settings: DeviceSettings; save: number } | null>(null);
  const saves = useRef({ sent: 0, pending: 0 });

  useEffect(() => {
    let cancelled = false;
    api.settings(server).then(
      (data) => {
        if (cancelled) return;
        confirmed.current = { settings: data, save: 0 };
        setSettings(data);
      },
      (err: Error) => !cancelled && setError(err),
    );
    return () => {
      cancelled = true;
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
        if (save > confirmed.current.save) confirmed.current = { settings: saved, save };
      } catch (err) {
        setError(new TranslatedError((t) => t('errors.couldntSave', { reason: errorText(err, t) })));
      }
      if (--saves.current.pending === 0) setSettings(confirmed.current.settings);
    },
    [server],
  );

  return { settings, error, update };
}

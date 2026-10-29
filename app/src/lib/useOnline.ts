import { useEffect, useState } from 'react';
import { api, type OnlineResponse, type PairedServer } from './api';

export type OnlineState =
  | { status: 'loading' }
  | { status: 'ok'; data: OnlineResponse; receivedAt: number }
  | { status: 'error'; message: string };

const REFRESH_MS = 30_000;

/** Who's online on a server, refreshed periodically while the app is visible. */
export function useOnline(server: PairedServer): OnlineState {
  const [state, setState] = useState<OnlineState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      api.online(server).then(
        (data) => !cancelled && setState({ status: 'ok', data, receivedAt: Date.now() }),
        (err: Error) => !cancelled && setState({ status: 'error', message: err.message }),
      );
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    document.addEventListener('visibilitychange', load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, [server]);

  return state;
}

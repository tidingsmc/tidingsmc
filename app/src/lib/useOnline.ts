import { useEffect, useState } from "react";
import { api, type OnlineResponse, type PairedServer } from "./api";
import { pairingKey } from "./serverCache";
import { whenVisible } from "./whenVisible";

export type OnlineState =
  | { status: "loading" }
  | { status: "ok"; data: OnlineResponse; receivedAt: number }
  | { status: "error"; error: Error };

const REFRESH_MS = 30_000;
const SHARED_MS = 5_000;

const lastStates = new Map<string, { state: OnlineState; at: number }>();
const pending = new Set<string>();
const listeners = new Map<string, Set<(state: OnlineState) => void>>();

function recentState(server: PairedServer): OnlineState | null {
  const last = lastStates.get(pairingKey(server));
  return last && Date.now() - last.at < REFRESH_MS ? last.state : null;
}

export function keepOnlineOnly(servers: PairedServer[]) {
  const kept = new Set(servers.map(pairingKey));
  for (const key of lastStates.keys())
    if (!kept.has(key)) lastStates.delete(key);
}

function check(server: PairedServer) {
  const key = pairingKey(server);
  const last = lastStates.get(key);
  if (pending.has(key) || (last && Date.now() - last.at < SHARED_MS)) return;
  pending.add(key);
  const settle = (state: OnlineState) => {
    pending.delete(key);
    lastStates.set(key, { state, at: Date.now() });
    listeners.get(key)?.forEach((listener) => listener(state));
  };
  api.online(server).then(
    (data) => settle({ status: "ok", data, receivedAt: Date.now() }),
    (err: Error) => settle({ status: "error", error: err }),
  );
}

export function useOnline(server: PairedServer): OnlineState {
  const [state, setState] = useState<OnlineState>(
    () => recentState(server) ?? { status: "loading" },
  );

  useEffect(() => {
    const key = pairingKey(server);
    let forKey = listeners.get(key);
    if (!forKey) listeners.set(key, (forKey = new Set()));
    forKey.add(setState);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") check(server);
    }, REFRESH_MS);
    const stopWatching = whenVisible(() => check(server));
    return () => {
      forKey.delete(setState);
      if (forKey.size === 0) listeners.delete(key);
      clearInterval(timer);
      stopWatching();
    };
  }, [server]);

  return state;
}

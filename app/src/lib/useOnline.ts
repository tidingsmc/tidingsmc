import { useEffect, useState } from "react";
import { api, type OnlineResponse, type PairedServer } from "./api";
import { pairingKey } from "./serverCache";

export type OnlineState =
  | { status: "loading" }
  | { status: "ok"; data: OnlineResponse; receivedAt: number }
  | { status: "error"; error: Error };

const REFRESH_MS = 30_000;

/**
 * Each pairing's last answer, so a screen opened soon after opens on it rather than on "Checking…".
 * Checking again doesn't show: the state only changes once the server answers, or doesn't.
 */
const lastStates = new Map<string, { state: OnlineState; at: number }>();

function recentState(server: PairedServer): OnlineState | null {
  const last = lastStates.get(pairingKey(server));
  return last && Date.now() - last.at < REFRESH_MS ? last.state : null;
}

/** Forgets servers this device left. */
export function keepOnlineOnly(servers: PairedServer[]) {
  const kept = new Set(servers.map(pairingKey));
  for (const key of lastStates.keys())
    if (!kept.has(key)) lastStates.delete(key);
}

/** Who's online on a server, refreshed periodically while the app is visible. */
export function useOnline(server: PairedServer): OnlineState {
  const [state, setState] = useState<OnlineState>(
    () => recentState(server) ?? { status: "loading" },
  );

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      const settle = (state: OnlineState) => {
        lastStates.set(pairingKey(server), { state, at: Date.now() });
        if (!cancelled) setState(state);
      };
      api.online(server).then(
        (data) => settle({ status: "ok", data, receivedAt: Date.now() }),
        (err: Error) => settle({ status: "error", error: err }),
      );
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [server]);

  return state;
}

import { useEffect } from "react";
import { api, worthRetrying, type PairedServer } from "./api";

const KEY = "tidings.pendingUnpairs";

/** Past this, the server is most likely gone for good: no point telling it anymore. */
const GIVE_UP_MS = 30 * 24 * 60 * 60 * 1000;

/** A pairing left while its server couldn't be told. */
interface PendingUnpair {
  server: PairedServer;
  leftAt: number;
}

function load(): PendingUnpair[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(pending: PendingUnpair[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    // storage full or blocked: the server just never hears this device left
  }
}

/**
 * Leaves a server: tells it, or if that fails, tells it later (see `useUnpairRetry`) so its player
 * doesn't keep seeing this device listed in game.
 */
export async function leaveServer(server: PairedServer) {
  if (!(await tell(server))) save([...load(), { server, leftAt: Date.now() }]);
}

/** Whether there's no point telling the server again: it knows, or refused for good. */
async function tell(server: PairedServer): Promise<boolean> {
  try {
    await api.unpair(server);
    return true;
  } catch (err) {
    return !worthRetrying(err);
  }
}

/** The retry under way, so the events that start one at the same time don't send it twice. */
let retrying: Promise<void> | null = null;

function retry() {
  retrying ??= tellPending().finally(() => (retrying = null));
  return retrying;
}

async function tellPending() {
  const pending = load();
  if (pending.length === 0) return;
  const told = await Promise.all(
    pending.map(
      ({ server, leftAt }) => Date.now() - leftAt > GIVE_UP_MS || tell(server),
    ),
  );
  const done = new Set(
    pending.filter((_, i) => told[i]).map(({ server }) => server.token),
  );
  save(load().filter(({ server }) => !done.has(server.token)));
}

/** Tells servers left while unreachable, each time the app is opened or the device gets back online. */
export function useUnpairRetry() {
  useEffect(() => {
    const run = () => {
      if (document.visibilityState === "visible") retry();
    };
    run();
    document.addEventListener("visibilitychange", run);
    window.addEventListener("online", run);
    return () => {
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("online", run);
    };
  }, []);
}

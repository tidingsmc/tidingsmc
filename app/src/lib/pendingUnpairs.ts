import { useEffect } from "react";
import { api, worthRetrying, type PairedServer } from "./api";
import { whenVisible } from "./whenVisible";

const KEY = "tidings.pendingUnpairs";
const GIVE_UP_MS = 30 * 24 * 60 * 60 * 1000;

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
    // storage full or blocked
  }
}

export async function leaveServer(server: PairedServer) {
  if (!(await tell(server))) save([...load(), { server, leftAt: Date.now() }]);
}

async function tell(server: PairedServer): Promise<boolean> {
  try {
    await api.unpair(server);
    return true;
  } catch (err) {
    return !worthRetrying(err);
  }
}

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

export function useUnpairRetry() {
  useEffect(() => whenVisible(retry), []);
}

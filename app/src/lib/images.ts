import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, worthRetrying, type PairedServer } from "./api";
import { IMAGE_REF } from "./icons";

/**
 * Add-ons' images come by reference: views carry `image:<hash>` and the app fetches each image
 * once, from the server that sent it, then keeps it. A hash always means the same bytes, so what's
 * kept never goes stale. Older servers still send `data:` URLs, which are used as they are
 */

const TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

const CACHE = "tidings-images";
// Images kept across visits; the least recently used go first
const MAX_KEPT = 1000;
// Cache entries are keyed by a made-up URL: they're never requested as such
const keyUrl = (serverId: string, hash: string) =>
  `https://images.tidings.invalid/${encodeURIComponent(serverId)}/${hash}`;

// Images fetched from servers at once, so a map full of new faces doesn't flood the relay
const MAX_FETCHING = 6;
// How long an image nothing shows stays in memory, in case it comes back
const KEEP_UNUSED_MS = 30_000;
// Waits before fetching again an image that failed, doubling each time
const FIRST_RETRY_MS = 2_000;
const LAST_RETRY_MS = 60_000;

export function imageHash(src: string): string | null {
  return IMAGE_REF.exec(src)?.[1] ?? null;
}

// "missing": the server doesn't let this device have it, until a view of it comes in. "failed":
// unreachable or busy, worth another try. "broken": it never will be
type Loaded = { url: string } | "missing" | "failed" | "broken";

// Object URLs by server and hash, while something shows them and for a while after
interface Entry {
  url: string | null;
  users: number;
  timer?: ReturnType<typeof setTimeout>;
}
const entries = new Map<string, Entry>();

function entry(key: string): Entry {
  let e = entries.get(key);
  if (!e) {
    e = { url: null, users: 0 };
    entries.set(key, e);
  }
  return e;
}

function forgetLater(key: string, e: Entry) {
  clearTimeout(e.timer);
  e.timer = setTimeout(() => {
    if (e.users > 0 || entries.get(key) !== e) return;
    if (e.url) URL.revokeObjectURL(e.url);
    entries.delete(key);
  }, KEEP_UNUSED_MS);
}

/** Keeps the image in memory until the returned function is called */
function hold(key: string): () => void {
  const e = entry(key);
  clearTimeout(e.timer);
  e.timer = undefined;
  e.users++;
  return () => {
    e.users--;
    if (e.users === 0) forgetLater(key, e);
  };
}

// Fetches in progress, so a map full of the same face asks once
const loading = new Map<string, Promise<Loaded>>();

function persistent(): CacheStorage | null {
  return typeof caches === "undefined" ? null : caches;
}

// Keys put back in the cache since the app started, see fromCache
const bumped = new Set<string>();

async function fromCache(serverId: string, key: string): Promise<Blob | null> {
  try {
    const res = await persistent()?.match(key);
    if (!res) return null;
    const blob = await res.blob();
    // Put back, so it's the most recent and goes last: once a visit is enough
    if (!bumped.has(key)) {
      bumped.add(key);
      void toCache(serverId, key, blob);
    }
    return blob;
  } catch {
    return null;
  }
}

// IDs of the paired servers, once known: images of others aren't kept
let pairedIds: Set<string> | null = null;
const serverPrefix = (serverId: string) => keyUrl(serverId, "");

async function toCache(serverId: string, key: string, blob: Blob) {
  try {
    if (pairedIds && !pairedIds.has(serverId)) return;
    const cache = await persistent()?.open(CACHE);
    if (!cache) return;
    await cache.put(
      key,
      new Response(blob, { headers: { "content-type": blob.type } }),
    );
    trimLater();
  } catch {
    // storage full or blocked: the image is fetched again next visit
  }
}

let trimTimer: ReturnType<typeof setTimeout> | undefined;

// Once the images of a page are in, drops the least recently used beyond MAX_KEPT
function trimLater() {
  clearTimeout(trimTimer);
  trimTimer = setTimeout(async () => {
    try {
      const cache = await persistent()?.open(CACHE);
      if (!cache) return;
      const keys = await cache.keys();
      await Promise.all(
        keys
          .slice(0, Math.max(0, keys.length - MAX_KEPT))
          .map((old) => cache.delete(old)),
      );
    } catch {
      // storage blocked: nothing to trim
    }
  }, 2_000);
}

let fetching = 0;
const waiting: (() => void)[] = [];

async function limited<T>(task: () => Promise<T>): Promise<T> {
  // A waiting task gets the slot of the one that's done, so none can take it in between
  if (fetching < MAX_FETCHING) fetching++;
  else await new Promise<void>((resolve) => waiting.push(resolve));
  try {
    return await task();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else fetching--;
  }
}

function toBlob({ type, data }: { type: unknown; data: unknown }): Blob {
  if (
    typeof type !== "string" ||
    !TYPES.has(type) ||
    typeof data !== "string" ||
    !BASE64.test(data)
  )
    throw new Error("Not an image");
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function fetchImage(server: PairedServer, hash: string): Promise<Loaded> {
  const key = keyUrl(server.id, hash);
  let blob = await fromCache(server.id, key);
  if (!blob) {
    try {
      blob = toBlob(await limited(() => api.image(server, hash)));
    } catch (err) {
      if (worthRetrying(err)) return "failed";
      return err instanceof ApiError && err.status === 404
        ? "missing"
        : "broken";
    }
    void toCache(server.id, key, blob);
  }
  const e = entry(key);
  if (!e.url) e.url = URL.createObjectURL(blob);
  if (e.users === 0) forgetLater(key, e);
  return { url: e.url };
}

function loadImage(server: PairedServer, hash: string): Promise<Loaded> {
  const key = keyUrl(server.id, hash);
  let pending = loading.get(key);
  if (!pending) {
    pending = fetchImage(server, hash).finally(() => loading.delete(key));
    loading.set(key, pending);
  }
  return pending;
}

// Loads of images their server said it didn't have, by server, run again when a view comes in
const retryOnView = new Map<string, Set<() => void>>();

function retryOn(serverId: string): Set<() => void> {
  let loads = retryOnView.get(serverId);
  if (!loads) {
    loads = new Set();
    retryOnView.set(serverId, loads);
  }
  return loads;
}

/**
 * A view of `server` just came in: it lets the device fetch its images again, even ones it said
 * it didn't have, such as after a restart or when this device's earlier view of them was forgotten
 */
export function retryMissingImages(server: PairedServer) {
  for (const load of [...(retryOnView.get(server.id) ?? [])]) load();
}

let sweptFor: string | null = null;

/** Forgets the images of servers no longer paired */
export async function keepImagesOnly(servers: PairedServer[]) {
  pairedIds = new Set(servers.map((s) => s.id));
  // Only pairing and unpairing change what's kept, not other changes to servers
  const ids = [...pairedIds].sort().join(" ");
  if (ids === sweptFor) return;
  sweptFor = ids;
  try {
    const cache = await persistent()?.open(CACHE);
    if (!cache) return;
    const kept = servers.map((s) => serverPrefix(s.id));
    await Promise.all(
      (await cache.keys())
        .filter((request) => !kept.some((p) => request.url.startsWith(p)))
        .map((request) => cache.delete(request)),
    );
  } catch {
    // storage blocked: nothing to sweep
  }
}

const ImageServer = createContext<PairedServer | null>(null);

/** The server whose add-ons' images are drawn inside */
export function ImagesFrom({
  server,
  children,
}: {
  server: PairedServer;
  children: ReactNode;
}) {
  return createElement(ImageServer.Provider, { value: server }, children);
}

/**
 * Something an `<img>` can show for `src`, an image reference or a `data:` URL: undefined while
 * it's loading, null if it can't be. One that failed is fetched again, a while later, and one the
 * server didn't have when a view comes in, see {@link retryMissingImages}: both wait longer each
 * time
 */
export function useImage(src: string | null): string | null | undefined {
  const server = useContext(ImageServer);
  // The server object changes with its details: only its ID matters to what's loaded
  const serverRef = useRef(server);
  serverRef.current = server;
  const serverId = server?.id ?? null;
  const hash = src ? imageHash(src) : null;
  const key = serverId && hash ? keyUrl(serverId, hash) : null;
  // The key it last heard back about, so a new image shows or an unavailable one falls back
  const [settled, setSettled] = useState<{ key: string } | null>(null);

  useEffect(() => {
    if (!serverId || !hash || !key) return;
    const release = hold(key);
    const onView = retryOn(serverId);
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let wait = FIRST_RETRY_MS;
    // Views can come every few seconds: one that can't help yet doesn't count
    let notBefore = 0;
    const load = () => {
      const current = serverRef.current;
      if (Date.now() < notBefore || !current || current.id !== serverId) return;
      onView.delete(load);
      loadImage(current, hash).then((result) => {
        if (cancelled) return;
        setSettled({ key });
        if (result === "failed") {
          retry = setTimeout(load, wait);
        } else if (result === "missing") {
          notBefore = Date.now() + wait;
          onView.add(load);
        }
        if (result === "failed" || result === "missing")
          wait = Math.min(wait * 2, LAST_RETRY_MS);
      });
    };
    if (!entries.get(key)?.url) load();
    return () => {
      cancelled = true;
      clearTimeout(retry);
      onView.delete(load);
      release();
    };
  }, [serverId, hash, key]);

  if (!src) return null;
  if (!hash) return src;
  if (!key) return null;
  return entries.get(key)?.url ?? (settled?.key === key ? null : undefined);
}

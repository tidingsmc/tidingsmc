import { useEffect, useState } from "react";
import { isAddonId, readLink } from "./addons";
import type { AddonRoute, PairStep } from "./paths";

export { paths, type AddonRoute, type PairStep } from "./paths";

export type Route =
  | { name: "servers" }
  | { name: "appSettings" }
  | { name: "server"; id: string; addon?: AddonRoute }
  | { name: "settings"; id: string }
  | { name: "pair"; step?: PairStep; url?: string; code?: string };

/**
 * Hash-based routes, so the app works from any static host (GitHub Pages) without server config.
 * Pairing links from the in-game QR code look like `#pair=<server url>&code=<token>`. The mod must
 * URL-encode the server URL (Java's URLEncoder): an address containing "&" or "#" breaks the link otherwise.
 */
export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, "");
  if (h.startsWith("pair=")) {
    const params = new URLSearchParams(h);
    return {
      name: "pair",
      url: params.get("pair") ?? undefined,
      code: params.get("code") ?? undefined,
    };
  }
  // Only the first "?" starts the query: the rest of it, other "?" included, is the query's.
  const q = h.indexOf("?");
  const route = q < 0 ? h : h.slice(0, q);
  const query = q < 0 ? "" : h.slice(q + 1);
  const [, first, second, third, fourth, fifth] = route.split("/");
  if (first === "pair")
    return second === "scan" || second === "code"
      ? { name: "pair", step: second }
      : { name: "pair" };
  if (first === "settings") return { name: "appSettings" };
  // A hand-typed or cut link can have a broken escape: it opens the list rather than throwing.
  const id = second ? decode(second) : undefined;
  if (first === "server" && id && third === "settings")
    return { name: "settings", id };
  if (first === "server" && id && third === "addon" && isAddonId(fourth)) {
    const view = fifth ? decode(fifth) : undefined;
    const link = view ? readLink({ view, params: queryParams(query) }) : null;
    return {
      name: "server",
      id,
      addon: link ? { id: fourth, ...link } : { id: fourth },
    };
  }
  if (first === "server" && id) return { name: "server", id };
  return { name: "servers" };
}

function decode(part: string): string | undefined {
  try {
    return decodeURIComponent(part);
  } catch {
    return undefined;
  }
}

function queryParams(query: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(query));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

/**
 * Each history entry remembers the route that led to it, in `history.state.from`, so a back button
 * can tell whether going back stays where it is. A replaced entry keeps what led to the one it
 * replaces, as going back skips it.
 */
let currentHash = typeof location === "undefined" ? "" : location.hash;
if (typeof window !== "undefined") {
  // The entry the app opened on came from outside it, such as a tapped notification. Marked now, or
  // coming back to it would look like a new entry and take the page it was left for as its own.
  if (history.state === null) history.replaceState({ from: "" }, "");
  addEventListener("hashchange", () => {
    // A new entry: entries revisited with back or forward keep theirs.
    if (history.state === null) history.replaceState({ from: currentHash }, "");
    currentHash = location.hash;
  });
}

/** The route that led to the current one, if the app was on one. */
export function cameFrom(): string | undefined {
  const from = (history.state as { from?: unknown } | null)?.from;
  return typeof from === "string" && from ? from : undefined;
}

/** `replace` keeps one-time links (like a pairing link) out of the back history. */
export function navigate(path: string, { replace = false } = {}) {
  if (replace) {
    history.replaceState({ from: cameFrom() ?? "" }, "", path);
    dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    location.hash = path;
  }
}

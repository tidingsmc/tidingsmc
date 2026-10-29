import { useEffect, useState } from "react";

export type Route =
  | { name: "servers" }
  | { name: "appSettings" }
  | { name: "server"; id: string }
  | { name: "settings"; id: string }
  | { name: "pair"; url?: string; code?: string };

/**
 * Hash-based routes, so the app works from any static host (GitHub Pages) without server config.
 * Pairing links from the in-game QR code look like `#pair=<server url>&code=<code>`. The mod must
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
  const [, first, second, third] = h.split("/");
  if (first === "pair") return { name: "pair" };
  if (first === "settings") return { name: "appSettings" };
  if (first === "server" && second && third === "settings")
    return { name: "settings", id: decodeURIComponent(second) };
  if (first === "server" && second)
    return { name: "server", id: decodeURIComponent(second) };
  return { name: "servers" };
}

export const paths = {
  servers: "#/",
  pair: "#/pair",
  appSettings: "#/settings",
  server: (id: string) => `#/server/${encodeURIComponent(id)}`,
  settings: (id: string) => `#/server/${encodeURIComponent(id)}/settings`,
};

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

/** `replace` keeps one-time links (like a pairing link) out of the back history. */
export function navigate(path: string, { replace = false } = {}) {
  if (replace) {
    history.replaceState(null, "", path);
    dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    location.hash = path;
  }
}

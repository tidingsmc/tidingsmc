import { useEffect, useState } from "react";
import { isAddonId, readLink } from "./addons";
import type { AddonRoute, PairStep } from "./paths";

export { paths, type AddonRoute, type PairStep } from "./paths";

export type Route =
  | { name: "servers" }
  | { name: "appSettings" }
  | { name: "notificationSettings" }
  | { name: "server"; id: string; addon?: AddonRoute }
  | { name: "settings"; id: string }
  | { name: "pair"; step?: PairStep; url?: string; code?: string };

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
  const q = h.indexOf("?");
  const route = q < 0 ? h : h.slice(0, q);
  const query = q < 0 ? "" : h.slice(q + 1);
  const [, first, second, third, fourth, fifth] = route.split("/");
  if (first === "pair")
    return second === "scan" || second === "code"
      ? { name: "pair", step: second }
      : { name: "pair" };
  if (first === "settings")
    return second === "notifications"
      ? { name: "notificationSettings" }
      : { name: "appSettings" };
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

let currentHash = typeof location === "undefined" ? "" : location.hash;
if (typeof window !== "undefined") {
  if (history.state === null) history.replaceState({ from: "" }, "");
  addEventListener("hashchange", () => {
    if (history.state === null) history.replaceState({ from: currentHash }, "");
    currentHash = location.hash;
  });
}

export function cameFrom(): string | undefined {
  const from = (history.state as { from?: unknown } | null)?.from;
  return typeof from === "string" && from ? from : undefined;
}

export function navigate(path: string, { replace = false } = {}) {
  if (replace) {
    history.replaceState({ from: cameFrom() ?? "" }, "", path);
    dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    location.hash = path;
  }
}

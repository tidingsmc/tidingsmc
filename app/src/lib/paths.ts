// The app's routes as links, without React: the service worker imports this file too.
// router.ts parses them back.

/** An add-on's tab on a server's page; without `view`, the tab's first view. */
export interface AddonRoute {
  id: string;
  view?: string;
  params?: Record<string, string>;
}

/** The pairing wizard's steps that have their own route, so the back gesture goes between them. */
export type PairStep = "scan" | "code";

export const paths = {
  servers: "#/",
  pair: "#/pair",
  pairStep: (step: PairStep) => `#/pair/${step}`,
  appSettings: "#/settings",
  server: (id: string) => `#/server/${encodeURIComponent(id)}`,
  addon: (id: string, addon: AddonRoute) => {
    const tab = `#/server/${encodeURIComponent(id)}/addon/${addon.id}`;
    if (!addon.view) return tab;
    const query = new URLSearchParams(addon.params).toString();
    return `${tab}/${encodeURIComponent(addon.view)}${query && `?${query}`}`;
  },
  settings: (id: string) => `#/server/${encodeURIComponent(id)}/settings`,
};

export interface AddonRoute {
  id: string;
  view?: string;
  params?: Record<string, string>;
}

export type PairStep = "scan" | "code";

export const paths = {
  servers: "#/",
  pair: "#/pair",
  pairStep: (step: PairStep) => `#/pair/${step}`,
  appSettings: "#/settings",
  notificationSettings: "#/settings/notifications",
  server: (id: string) => `#/server/${encodeURIComponent(id)}`,
  addon: (id: string, addon: AddonRoute) => {
    const tab = `#/server/${encodeURIComponent(id)}/addon/${addon.id}`;
    if (!addon.view) return tab;
    const query = new URLSearchParams(addon.params).toString();
    return `${tab}/${encodeURIComponent(addon.view)}${query && `?${query}`}`;
  },
  settings: (id: string) => `#/server/${encodeURIComponent(id)}/settings`,
};

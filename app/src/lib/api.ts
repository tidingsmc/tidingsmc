import type { TFunction } from "i18next";
import type { ActionResult, AddonInfo, AddonLink, AddonView } from "./addons";
import { TranslatedError } from "./i18n";
import { currentTimeZone, hashString, hostOf } from "./util";

export interface PairedServer {
  id: string;
  name: string;
  url: string;
  token: string;
  vapidPublicKey: string;
  deviceName: string;
  pairedAt: number;
  player: LinkedPlayer;
}

export interface LinkedPlayer {
  uuid: string;
  name: string;
  skinUrl?: string;
}

export interface OnlinePlayer {
  uuid: string;
  name: string;
  skinUrl?: string;
}

export interface PairResponse {
  serverId: string;
  serverName?: string;
  token: string;
  vapidPublicKey: string;
  player: LinkedPlayer;
}

export interface OnlineResponse {
  players: OnlinePlayer[];
  world?: WorldInfo;
}

export interface MotdSegment {
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
}

export interface ServerInfo {
  motd: MotdSegment[];
  icon?: string;
  version: string;
  addons?: AddonInfo[];
}

export interface WorldInfo {
  dayTime: number;
  day: number;
  weather: "clear" | "rain" | "thunder";
}

export interface PlayersResponse {
  players: OnlinePlayer[];
}

export interface DeviceSettings {
  notifyJoins: boolean;
  notifyLeaves: boolean;
  notifyServerStatus: boolean;
  quietWhileOnline: boolean;
  friends: FriendFilter;
  quietHours: QuietHours;
  timeZone: string;
  mutedAddons: string[];
}

export interface FriendFilter {
  enabled: boolean;
  players: Friend[];
}

export interface Friend {
  uuid: string;
  name: string;
}

export interface QuietHours {
  enabled: boolean;
  periods: QuietPeriod[];
}

export interface QuietPeriod {
  start: string;
  end: string;
}

export type Approval =
  "approved" | "pending" | "denied" | "expired" | "playerOffline";

export interface TidingsApi {
  pair(url: string, code: string, deviceName: string): Promise<PairResponse>;
  approval(server: PairedServer): Promise<Approval>;
  askApproval(server: PairedServer): Promise<void>;
  info(server: PairedServer): Promise<ServerInfo>;
  online(server: PairedServer): Promise<OnlineResponse>;
  players(server: PairedServer): Promise<PlayersResponse>;
  settings(server: PairedServer): Promise<DeviceSettings>;
  updateSettings(
    server: PairedServer,
    changes: Partial<DeviceSettings>,
  ): Promise<DeviceSettings>;
  updatePush(
    server: PairedServer,
    subscription: PushSubscriptionJSON,
  ): Promise<void>;
  addonView(
    server: PairedServer,
    addon: string,
    link: AddonLink | null,
    locale: string,
  ): Promise<AddonView>;
  addonAction(
    server: PairedServer,
    addon: string,
    action: AddonAction,
    locale: string,
  ): Promise<ActionResult>;
  unpair(server: PairedServer): Promise<void>;
}

export interface AddonAction {
  action: string;
  params?: Record<string, string>;
  values?: Record<string, string>;
}

export class ApiError extends TranslatedError {
  readonly status?: number;
  readonly reason?: string;

  constructor(
    text: (t: TFunction) => string,
    status?: number,
    reason?: string,
  ) {
    super(text);
    this.status = status;
    this.reason = reason;
  }
}

export function isUnreachable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  const { status } = err;
  return (
    status === undefined ||
    (status >= 502 && status <= 504) ||
    (status >= 520 && status <= 530)
  );
}

export function worthRetrying(err: unknown): boolean {
  if (isUnreachable(err)) return true;
  const status = err instanceof ApiError ? err.status : undefined;
  return status === 429 || (status !== undefined && status >= 500);
}

export function normalizeServerUrl(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) {
    s = /^localhost(:|\/|$)/i.test(s) ? `http://${s}` : `https://${s}`;
  }
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new ApiError((t) => t("errors.invalidAddress"));
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new ApiError((t) => t("errors.httpsRequired"));
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
}

const TIMEOUT_MS = 6_000;

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...init,
    });
  } catch {
    throw new ApiError((t) => t("errors.unreachable"));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error;
    throw new ApiError(
      typeof message === "string"
        ? () => message
        : (t) => t("errors.serverAnswered", { status: res.status }),
      res.status,
      typeof body?.reason === "string" ? body.reason : undefined,
    );
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const auth = (server: PairedServer) => ({
  authorization: `Bearer ${server.token}`,
});

const unpairedListeners = new Set<(server: PairedServer) => void>();
const leftTokens = new Set<string>();

export function onUnpaired(listener: (server: PairedServer) => void) {
  unpairedListeners.add(listener);
  return () => {
    unpairedListeners.delete(listener);
  };
}

async function authed<T>(
  server: PairedServer,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  try {
    return await request<T>(`${server.url}${path}`, {
      ...init,
      headers: { ...init.headers, ...auth(server) },
    });
  } catch (err) {
    if (
      err instanceof ApiError &&
      err.status === 401 &&
      err.reason === "unpaired" &&
      !leftTokens.has(server.token)
    ) {
      unpairedListeners.forEach((listener) => listener(server));
    }
    throw err;
  }
}

const httpApi: TidingsApi = {
  pair: (url, code, deviceName) =>
    request(`${url}/api/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, deviceName }),
    }),
  async approval(server) {
    try {
      const { approval } = await request<{ approval: Approval }>(
        `${server.url}/api/devices/me/approval`,
        { headers: auth(server) },
      );
      return approval;
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 401 &&
        err.reason === "unpaired"
      )
        return "expired";
      throw err;
    }
  },
  askApproval: (server) =>
    request(`${server.url}/api/devices/me/approval`, {
      method: "POST",
      headers: auth(server),
    }),
  info: (server) => authed(server, "/api/info"),
  online: (server) => authed(server, "/api/online"),
  players: (server) => authed(server, "/api/players"),
  settings: (server) => authed(server, "/api/devices/me/settings"),
  updateSettings: (server, changes) =>
    authed(server, "/api/devices/me/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(changes),
    }),
  updatePush: (server, subscription) =>
    authed(server, "/api/devices/me/push", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(subscription),
    }),
  addonView: (server, addon, link, locale) =>
    authed(server, `/api/addons/${addon}/view`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...link, locale }),
    }),
  addonAction: (server, addon, action, locale) =>
    authed(server, `/api/addons/${addon}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...action, locale }),
    }),
  unpair: (server) => {
    // Requests still on their way would get a 401 too.
    leftTokens.add(server.token);
    return request(`${server.url}/api/devices/me`, {
      method: "DELETE",
      headers: auth(server),
      keepalive: true,
    });
  },
};

// Demo mode: fake servers and players, so the app can be developed without a running mod.

const skin = (hash: string) => `http://textures.minecraft.net/texture/${hash}`;
// Real accounts with their real skins (Notch's is an old 64×32 skin with a solid hat area),
// plus players without skins, like on offline-mode servers.
const MOCK_PLAYERS: { name: string; skinUrl?: string }[] = [
  {
    name: "Poppy2105",
    skinUrl: skin(
      "5937297dc3b25ac3c6027bf1783f2aadc9a7f23389cf3f426c64216228e8655d",
    ),
  },
  {
    name: "Notch",
    skinUrl: skin(
      "292009a4925b58f02c77dadc3ecef07ea4c7472f64e0fdc32ce5522489362680",
    ),
  },
  {
    name: "jeb_",
    skinUrl: skin(
      "7fd9ba42a7c81eeea22f1524271ae85a8e045ce0af5a6ae16c6406ae917e68b5",
    ),
  },
  { name: "Steve" },
  { name: "Alex" },
];
const mockPlayer = (p: (typeof MOCK_PLAYERS)[number]): LinkedPlayer => ({
  uuid: `mock-${p.name}`,
  ...p,
});
/** Who the demo servers are paired as. Always online, so the app can show "you" in the list. */
export const MOCK_ME = mockPlayer(MOCK_PLAYERS[0]);
/**
 * A real P-256 public key (its private key was thrown away), so demo servers subscribe to pushes
 * like real ones do. Nothing can ever be sent to those subscriptions.
 */
const MOCK_VAPID_KEY =
  "BP39TOvu9eBZ5Aw4AUbx7xMxSio5HyM0Ay1ml5kRlmJ4zbu9dU2k1lbtRDsqIFgr9N1vfjl_t3i0k47zs-MHfvY"; // gitleaks:allow (public key, no private half)
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const mockApi: TidingsApi = {
  async pair(url, code) {
    await delay(600);
    const valid = /^\d{6}$/.test(code) || /^[\w-]{22,}$/.test(code);
    if (!valid || code === "000000")
      throw new ApiError((t) => t("errors.invalidCode"), 403);
    const host = hostOf(url);
    return {
      serverId: mockServerId(host),
      serverName: mockServerName(host),
      token: crypto.randomUUID(),
      vapidPublicKey: MOCK_VAPID_KEY,
      // In game, whoever ran /tidings pair; here the code picks a player.
      player: mockPlayer(MOCK_PLAYERS[hashString(code) % MOCK_PLAYERS.length]),
    };
  },
  async approval() {
    // As if the player clicked [Approve] in game.
    await delay(2000);
    return "approved";
  },
  async askApproval() {
    await delay(200);
  },
  async info(server) {
    await delay(200 + (hashString(server.id) % 300));
    if (server.url.includes("offline"))
      throw new ApiError((t) => t("errors.unreachable"));
    return {
      motd: [
        { text: "Welcome to ", color: "gray" },
        { text: server.name, color: "gold", bold: true },
        { text: "!\n", color: "gray" },
        { text: "Survival", color: "green" },
        { text: " · ", color: "dark_gray" },
        { text: "Season 3", color: "#ff88cc", italic: true },
        { text: " · ", color: "dark_gray" },
        { text: "new spawn", color: "aqua", underlined: true },
      ],
      version: "1.20.1 (Forge 47.4.10)",
    };
  },
  async online(server) {
    await delay(300 + (hashString(server.id) % 500));
    if (server.url.includes("offline"))
      throw new ApiError((t) => t("errors.unreachable"));
    // Changes every minute, so refreshing shows players coming and going.
    let seed = hashString(server.id) + Math.floor(Date.now() / 60_000);
    // Poppy2105 is always online; the others come and go.
    const players = MOCK_PLAYERS.filter(
      (_, i) =>
        i === 0 || (seed = (seed * 1103515245 + 12345) % 2 ** 31) % 3 === 0,
    );
    return {
      players: players.map(mockPlayer),
      world: mockWorld(server),
    };
  },
  async players(server) {
    await delay(300);
    if (server.url.includes("offline"))
      throw new ApiError((t) => t("errors.unreachable"));
    return { players: MOCK_PLAYERS.map(mockPlayer) };
  },
  async settings(server) {
    await delay(250);
    if (server.url.includes("offline"))
      throw new ApiError((t) => t("errors.unreachable"));
    return mockSettings(server);
  },
  async updateSettings(server, changes) {
    await delay(250);
    const saved = { ...mockSettings(server), ...changes };
    localStorage.setItem(
      `tidings.mock.settings.${server.id}`,
      JSON.stringify(saved),
    );
    return saved;
  },
  async updatePush() {
    await delay(200);
  },
  // Demo servers have no add-ons: test them on a server with Tidings Vanilla. Answers like a mod
  // whose add-on was removed, for a link to one.
  async addonView() {
    await delay(300);
    throw new ApiError(() => "This server doesn't have this tab anymore", 404);
  },
  async addonAction() {
    await delay(400);
    throw new ApiError(() => "This server doesn't have this tab anymore", 404);
  },
  async unpair(server) {
    await delay(200);
    if (server.url.includes("offline"))
      throw new ApiError((t) => t("errors.unreachable"));
    localStorage.removeItem(`tidings.mock.settings.${server.id}`);
  },
};

function mockServerId(host: string): string {
  return `mock-${hashString(host).toString(36)}`;
}

function mockServerName(host: string): string {
  const label = host.split(".")[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Demo servers paired on first launch, each showing a different time of day and weather.
const MOCK_WORLDS: Record<string, Pick<WorldInfo, "dayTime" | "weather">> = {
  "survival.example.com": { dayTime: 6000, weather: "clear" }, // noon
  "creative.example.com": { dayTime: 18000, weather: "clear" }, // midnight, stars
};

const mockStartedAt = Date.now();

/** Demo servers start at their scenario's time, then time passes like in game (a day lasts 20 minutes). */
function mockWorld(server: PairedServer): WorldInfo {
  const host = hostOf(server.url);
  const scenario = MOCK_WORLDS[host];
  const elapsedTicks = Math.floor((Date.now() - mockStartedAt) / 50);
  const ticks =
    (scenario?.dayTime ?? hashString(host) % 24000) +
    elapsedTicks +
    24000 * (hashString(host) % 300);
  const weathers = ["clear", "clear", "rain", "thunder"] as const;
  return {
    dayTime: ticks % 24000,
    day: Math.floor(ticks / 24000),
    weather: scenario?.weather ?? weathers[hashString(host) % weathers.length],
  };
}

export function mockServers(): PairedServer[] {
  return Object.keys(MOCK_WORLDS).map((host) => ({
    id: mockServerId(host),
    name: mockServerName(host),
    url: `https://${host}`,
    token: "mock",
    vapidPublicKey: MOCK_VAPID_KEY,
    deviceName: "Demo device",
    pairedAt: Date.now(),
    player: MOCK_ME,
  }));
}

function mockSettings(server: PairedServer): DeviceSettings {
  const defaults: DeviceSettings = {
    notifyJoins: true,
    notifyLeaves: false,
    notifyServerStatus: true,
    quietWhileOnline: true,
    friends: { enabled: false, players: [] },
    quietHours: { enabled: false, periods: [{ start: "22:00", end: "08:00" }] },
    timeZone: currentTimeZone(),
    mutedAddons: [],
  };
  const saved = localStorage.getItem(`tidings.mock.settings.${server.id}`);
  return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
}

export const usingMockApi = import.meta.env.VITE_MOCK_API === "true";
export const api: TidingsApi = usingMockApi ? mockApi : httpApi;

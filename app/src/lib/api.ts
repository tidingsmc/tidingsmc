import type { TFunction } from "i18next";
import { TranslatedError } from "./i18n";
import { currentTimeZone, hashString, hostOf } from "./util";

/** A server this device is paired with, as stored on the device. */
export interface PairedServer {
  /** Stable ID chosen by the mod; survives changes of `url`. */
  id: string;
  name: string;
  /** The mod's public URL, e.g. https://mc.example.com */
  url: string;
  /** Device token, sent as `Authorization: Bearer <token>`. */
  token: string;
  /** The server's VAPID public key, used to subscribe to its pushes. */
  vapidPublicKey: string;
  deviceName: string;
  pairedAt: number;
  /** The Minecraft account that paired this device (the one that ran /tidings pair). */
  player: LinkedPlayer;
}

/** A server has at most one pairing per device, for one Minecraft account. */
export interface LinkedPlayer {
  uuid: string;
  name: string;
  skinUrl?: string;
}

export interface OnlinePlayer {
  uuid: string;
  name: string;
  /** Skin texture from the player's game profile (textures.minecraft.net). Absent on offline-mode servers. */
  skinUrl?: string;
}

// The HTTP contract the mod implements. Errors answer `{ error, reason? }`: `error` is shown as is,
// `reason: "unpaired"` (with 401) means the mod doesn't know this device's token anymore, and
// `reason: "pending"` (with 403) that the player hasn't approved this device in game yet.

/**
 * POST {url}/api/pair  body: { code, deviceName }
 * The token works once the player approves the device in game, see `TidingsApi.approval`.
 */
export interface PairResponse {
  serverId: string;
  /** The name the server's owner chose for it, if any: suggested when naming the server. */
  serverName?: string;
  token: string;
  vapidPublicKey: string;
  /** Who got the pairing code. */
  player: LinkedPlayer;
}

/** GET {url}/api/online  (authenticated) */
export interface OnlineResponse {
  players: OnlinePlayer[];
  world?: WorldInfo;
}

/** A piece of the server description, with Minecraft formatting. */
export interface MotdSegment {
  /** May contain "\n" (the MOTD has up to two lines). */
  text: string;
  /** A Minecraft color name ("gold", "dark_aqua"…) or "#rrggbb". */
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
}

/** GET {url}/api/info  (authenticated): what the multiplayer server list shows. */
export interface ServerInfo {
  motd: MotdSegment[];
  /** server-icon.png as "data:image/png;base64,…", absent if the server has none. */
  icon?: string;
  version: string;
}

/** The overworld's state, as seen in game. */
export interface WorldInfo {
  /** Time of day in ticks, 0–23999. 0 is sunrise (6:00), 6000 is noon. */
  dayTime: number;
  /** Days since the world was created. */
  day: number;
  weather: "clear" | "rain" | "thunder";
}

/** GET {url}/api/players  (authenticated): everyone who has played on the server, to pick friends from. */
export interface PlayersResponse {
  players: OnlinePlayer[];
}

/**
 * GET / PATCH {url}/api/devices/me/settings  (authenticated). The mod uses these to decide whom to notify.
 * PATCH replaces each field it contains as a whole: sending `quietHours` replaces all of its periods.
 */
export interface DeviceSettings {
  notifyJoins: boolean;
  notifyLeaves: boolean;
  /** The server started or stopped. */
  notifyServerStatus: boolean;
  /** No notifications while this device's player is on the server themselves: they see it in game. */
  quietWhileOnline: boolean;
  friends: FriendFilter;
  quietHours: QuietHours;
  /** IANA time zone of the device, e.g. "Europe/Paris". Quiet hours are in this zone. */
  timeZone: string;
}

/** Join/leave notifications only for these players. The list is kept while the filter is off. */
export interface FriendFilter {
  enabled: boolean;
  players: Friend[];
}

/** The name is only for showing the list; the mod matches players on their UUID. */
export interface Friend {
  uuid: string;
  name: string;
}

/** No notifications at all during these daily periods. */
export interface QuietHours {
  enabled: boolean;
  periods: QuietPeriod[];
}

/** "HH:MM" times in the device's time zone. A period may cross midnight (22:00 → 08:00). */
export interface QuietPeriod {
  start: string;
  end: string;
}

/**
 * Where a new pairing stands: the player approves it in game, or denies it, or lets it expire, or
 * isn't in game to be asked.
 */
export type Approval =
  "approved" | "pending" | "denied" | "expired" | "playerOffline";

export interface TidingsApi {
  pair(url: string, code: string, deviceName: string): Promise<PairResponse>;
  /**
   * GET {url}/api/devices/me/approval  with the token from pairing: `{ approval }`. Answers 401
   * "unpaired" once the server forgot the request (it restarted, or the request ended long ago).
   */
  approval(server: PairedServer): Promise<Approval>;
  /**
   * POST {url}/api/devices/me/approval  with the token from pairing, once the player named the server.
   * The mod asks them in game to approve this device; `approval` then tells when they did.
   */
  askApproval(server: PairedServer): Promise<void>;
  info(server: PairedServer): Promise<ServerInfo>;
  online(server: PairedServer): Promise<OnlineResponse>;
  players(server: PairedServer): Promise<PlayersResponse>;
  settings(server: PairedServer): Promise<DeviceSettings>;
  /** Returns the settings as saved by the server. */
  updateSettings(
    server: PairedServer,
    changes: Partial<DeviceSettings>,
  ): Promise<DeviceSettings>;
  /**
   * PUT {url}/api/devices/me/push  (authenticated)  body: the subscription as JSON,
   * `{ endpoint, expirationTime, keys: { p256dh, auth } }`. Replaces the device's push subscription.
   * Sent after pairing, and again whenever the browser changes the subscription. Until then the mod
   * has nowhere to send this device's notifications. The mod forgets a subscription its push service
   * says expired (404 or 410), and keeps the device paired: the next one sent here replaces it.
   */
  updatePush(
    server: PairedServer,
    subscription: PushSubscriptionJSON,
  ): Promise<void>;
  /**
   * DELETE {url}/api/devices/me  (authenticated, or a pairing waiting for approval: withdraws it)
   * The app also drops its push subscription, even if this call fails: the mod then gets 404 or 410
   * from its push service and drops that subscription. The device stays listed in game until its
   * player unpairs it there.
   */
  unpair(server: PairedServer): Promise<void>;
}

export class ApiError extends TranslatedError {
  readonly status?: number;
  /** The mod's machine-readable reason, e.g. "unpaired". */
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

/**
 * The server couldn't be reached at all, or only the proxy in front of it answered (502–504, and
 * Cloudflare's 52x): it's most likely stopped, or this device is offline.
 */
export function isUnreachable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  const { status } = err;
  return (
    status === undefined ||
    (status >= 502 && status <= 504) ||
    (status >= 520 && status <= 530)
  );
}

/** Asking again later may get another answer: the server is unreachable, busy, or failed this time. */
export function worthRetrying(err: unknown): boolean {
  if (isUnreachable(err)) return true;
  const status = err instanceof ApiError ? err.status : undefined;
  return status === 429 || (status !== undefined && status >= 500);
}

/** Turns what the player typed ("mc.example.com") into the URL we call. */
export function normalizeServerUrl(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) {
    // A server on this machine (testing) has no HTTPS.
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

/** A stopped server can leave a request hanging for a minute or more: past this, it's unreachable. */
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
/** Tokens of pairings this device left itself: their 401s are expected. */
const leftTokens = new Set<string>();

/**
 * Calls `listener` when a server says it doesn't know this device anymore: unpaired in game, or
 * the server lost its data. Not for leaving a server from the app. Returns the unsubscribe function.
 */
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
    // Only the mod says "unpaired": a 401 from a proxy in front of it doesn't mean the pairing is gone.
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
  // Not through authed(): a denied pairing isn't one the player had, to tell them it's gone.
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
  // Not through authed(): a pairing that expired meanwhile isn't one the player had, to tell them it's gone.
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
  // Not through authed(): leaving a server the mod already forgot isn't news to the player.
  unpair: (server) => {
    // Requests still on their way would get a 401 too.
    leftTokens.add(server.token);
    return request(`${server.url}/api/devices/me`, {
      method: "DELETE",
      headers: auth(server),
      // Also sent while the page is closing: a pairing left unfinished gets cancelled that way.
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
    if (!/^\d{6}$/.test(code) || code === "000000")
      throw new ApiError((t) => t("errors.invalidCode"), 403);
    const host = hostOf(url);
    return {
      serverId: mockServerId(host),
      serverName: mockServerName(host),
      token: crypto.randomUUID(),
      vapidPublicKey: MOCK_VAPID_KEY,
      // In game, whoever ran /tidings pair; here the code picks a player.
      player: mockPlayer(MOCK_PLAYERS[Number(code) % MOCK_PLAYERS.length]),
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
  };
  const saved = localStorage.getItem(`tidings.mock.settings.${server.id}`);
  return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
}

export const usingMockApi = import.meta.env.VITE_MOCK_API === "true";
export const api: TidingsApi = usingMockApi ? mockApi : httpApi;

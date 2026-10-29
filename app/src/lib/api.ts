import { currentTimeZone, hashString, hostOf } from './util';

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

// The HTTP contract the mod implements.

/** POST {url}/api/pair  body: { code, deviceName } */
export interface PairResponse {
  serverId: string;
  serverName: string;
  token: string;
  vapidPublicKey: string;
  /** Who got the pairing code. */
  player: LinkedPlayer;
}

/** GET {url}/api/online  (authenticated) */
export interface OnlineResponse {
  players: OnlinePlayer[];
  maxPlayers: number;
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
  weather: 'clear' | 'rain' | 'thunder';
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

export interface TidingsApi {
  pair(url: string, code: string, deviceName: string): Promise<PairResponse>;
  info(server: PairedServer): Promise<ServerInfo>;
  online(server: PairedServer): Promise<OnlineResponse>;
  players(server: PairedServer): Promise<PlayersResponse>;
  settings(server: PairedServer): Promise<DeviceSettings>;
  /** Returns the settings as saved by the server. */
  updateSettings(server: PairedServer, changes: Partial<DeviceSettings>): Promise<DeviceSettings>;
  /**
   * PUT {url}/api/devices/me/push  (authenticated)  body: the subscription as JSON,
   * `{ endpoint, expirationTime, keys: { p256dh, auth } }`. Replaces the device's push subscription.
   * Sent after pairing, and again whenever the browser changes the subscription. Until then the mod
   * has nowhere to send this device's notifications.
   */
  updatePush(server: PairedServer, subscription: PushSubscriptionJSON): Promise<void>;
  /**
   * DELETE {url}/api/devices/me  (authenticated)
   * The app also drops its push subscription, even if this call fails; the mod must then forget
   * the device once its push service answers 404 or 410.
   */
  unpair(server: PairedServer): Promise<void>;
}

export class ApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/** Turns what the player typed ("mc.example.com") into the URL we call. */
export function normalizeServerUrl(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new ApiError('Not a valid server address');
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new ApiError('The server address must start with https://');
  }
  return url.origin + url.pathname.replace(/\/+$/, '');
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError('Server unreachable');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error ?? `Server answered ${res.status}`, res.status);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const auth = (server: PairedServer) => ({ authorization: `Bearer ${server.token}` });

const httpApi: TidingsApi = {
  pair: (url, code, deviceName) =>
    request(`${url}/api/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, deviceName }),
    }),
  info: (server) => request(`${server.url}/api/info`, { headers: auth(server) }),
  online: (server) => request(`${server.url}/api/online`, { headers: auth(server) }),
  players: (server) => request(`${server.url}/api/players`, { headers: auth(server) }),
  settings: (server) => request(`${server.url}/api/devices/me/settings`, { headers: auth(server) }),
  updateSettings: (server, changes) =>
    request(`${server.url}/api/devices/me/settings`, {
      method: 'PATCH',
      headers: { ...auth(server), 'content-type': 'application/json' },
      body: JSON.stringify(changes),
    }),
  updatePush: (server, subscription) =>
    request(`${server.url}/api/devices/me/push`, {
      method: 'PUT',
      headers: { ...auth(server), 'content-type': 'application/json' },
      body: JSON.stringify(subscription),
    }),
  unpair: (server) => request(`${server.url}/api/devices/me`, { method: 'DELETE', headers: auth(server) }),
};

// Demo mode: fake servers and players, so the app can be developed without a running mod.

const skin = (hash: string) => `http://textures.minecraft.net/texture/${hash}`;
// Real accounts with their real skins (Notch's is an old 64×32 skin with a solid hat area),
// plus players without skins, like on offline-mode servers.
const MOCK_PLAYERS: { name: string; skinUrl?: string }[] = [
  { name: 'Poppy2105', skinUrl: skin('5937297dc3b25ac3c6027bf1783f2aadc9a7f23389cf3f426c64216228e8655d') },
  { name: 'Notch', skinUrl: skin('292009a4925b58f02c77dadc3ecef07ea4c7472f64e0fdc32ce5522489362680') },
  { name: 'jeb_', skinUrl: skin('7fd9ba42a7c81eeea22f1524271ae85a8e045ce0af5a6ae16c6406ae917e68b5') },
  { name: 'Dinnerbone', skinUrl: skin('50c410fad8d9d8825ad56b0e443e2777a6b46bfa20dacd1d2f55edc71fbeb06d') },
  { name: 'Steve' },
  { name: 'Alex' },
  { name: 'Kai' },
  { name: 'Zuri' },
  { name: 'Noor' },
];
const mockPlayer = (p: (typeof MOCK_PLAYERS)[number]): LinkedPlayer => ({ uuid: `mock-${p.name}`, ...p });
/** Who the demo servers are paired as. Always online, so the app can show "you" in the list. */
export const MOCK_ME = mockPlayer(MOCK_PLAYERS[0]);
/**
 * A real P-256 public key (its private key was thrown away), so demo servers subscribe to pushes
 * like real ones do. Nothing can ever be sent to those subscriptions.
 */
const MOCK_VAPID_KEY = 'BP39TOvu9eBZ5Aw4AUbx7xMxSio5HyM0Ay1ml5kRlmJ4zbu9dU2k1lbtRDsqIFgr9N1vfjl_t3i0k47zs-MHfvY';
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const mockApi: TidingsApi = {
  async pair(url, code) {
    await delay(600);
    if (!/^\d{6}$/.test(code) || code === '000000') throw new ApiError('Invalid or expired pairing code', 403);
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
  async info(server) {
    await delay(200 + (hashString(server.id) % 300));
    if (server.url.includes('offline')) throw new ApiError('Server unreachable');
    return {
      motd: [
        { text: 'Welcome to ', color: 'gray' },
        { text: server.name, color: 'gold', bold: true },
        { text: '!\n', color: 'gray' },
        { text: 'Survival', color: 'green' },
        { text: ' · ', color: 'dark_gray' },
        { text: 'Season 3', color: '#ff88cc', italic: true },
        { text: ' · ', color: 'dark_gray' },
        { text: 'new spawn', color: 'aqua', underlined: true },
      ],
      version: '1.20.1 (Forge 47.4.10)',
    };
  },
  async online(server) {
    await delay(300 + (hashString(server.id) % 500));
    if (server.url.includes('offline')) throw new ApiError('Server unreachable');
    // Changes every minute, so refreshing shows players coming and going.
    let seed = hashString(server.id) + Math.floor(Date.now() / 60_000);
    // Poppy2105 is always online; the others come and go.
    const players = MOCK_PLAYERS.filter(
      (_, i) => i === 0 || (seed = (seed * 1103515245 + 12345) % 2 ** 31) % 3 === 0,
    );
    return {
      players: players.map(mockPlayer),
      maxPlayers: 20,
      world: mockWorld(server),
    };
  },
  async players(server) {
    await delay(300);
    if (server.url.includes('offline')) throw new ApiError('Server unreachable');
    return { players: MOCK_PLAYERS.map(mockPlayer) };
  },
  async settings(server) {
    await delay(250);
    return mockSettings(server);
  },
  async updateSettings(server, changes) {
    await delay(250);
    const saved = { ...mockSettings(server), ...changes };
    localStorage.setItem(`tidings.mock.settings.${server.id}`, JSON.stringify(saved));
    return saved;
  },
  async updatePush() {
    await delay(200);
  },
  async unpair(server) {
    await delay(200);
    localStorage.removeItem(`tidings.mock.settings.${server.id}`);
  },
};

function mockServerId(host: string): string {
  return `mock-${hashString(host).toString(36)}`;
}

function mockServerName(host: string): string {
  const label = host.split('.')[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Demo servers paired on first launch, each showing a different time of day and weather.
const MOCK_WORLDS: Record<string, Pick<WorldInfo, 'dayTime' | 'weather'>> = {
  'survival.example.com': { dayTime: 6000, weather: 'clear' }, // noon
  'creative.example.com': { dayTime: 18000, weather: 'clear' }, // midnight, stars
  'skyblock.example.com': { dayTime: 12300, weather: 'rain' }, // sunset
  'hardcore.example.com': { dayTime: 16000, weather: 'thunder' }, // night
  'modded.example.com': { dayTime: 23300, weather: 'clear' }, // sunrise
  'adventure.example.com': { dayTime: 3000, weather: 'rain' }, // morning
  'offline.example.com': { dayTime: 0, weather: 'clear' }, // unreachable
};

const mockStartedAt = Date.now();

/** Demo servers start at their scenario's time, then time passes like in game (a day lasts 20 minutes). */
function mockWorld(server: PairedServer): WorldInfo {
  const host = hostOf(server.url);
  const scenario = MOCK_WORLDS[host];
  const elapsedTicks = Math.floor((Date.now() - mockStartedAt) / 50);
  const ticks = (scenario?.dayTime ?? hashString(host) % 24000) + elapsedTicks + 24000 * (hashString(host) % 300);
  const weathers = ['clear', 'clear', 'rain', 'thunder'] as const;
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
    token: 'mock',
    vapidPublicKey: MOCK_VAPID_KEY,
    deviceName: 'Demo device',
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
    quietHours: { enabled: false, periods: [{ start: '22:00', end: '08:00' }] },
    timeZone: currentTimeZone(),
  };
  const saved = localStorage.getItem(`tidings.mock.settings.${server.id}`);
  return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
}

export const usingMockApi = import.meta.env.VITE_MOCK_API === 'true';
export const api: TidingsApi = usingMockApi ? mockApi : httpApi;

import type { TFunction } from "i18next";
import type { ActionResult, AddonInfo, AddonLink, AddonView } from "./addons";
import { TranslatedError } from "./i18n";

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

export const api: TidingsApi = {
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

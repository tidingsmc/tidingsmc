// Add-ons: tabs that other mods add to a server's page. The mod describes each page as blocks
// (mirrors dev.tidings.core.addon), and the app draws them: add-ons run no code on the device,
// can only link to their own pages, and never see the device's token.

/** In GET {url}/api/info's `addons`. */
export interface AddonInfo {
  /** The mod's ID: 1 to 64 of a-z 0-9 _ - */
  id: string;
  /** For screen readers: the tab shows `icon`. */
  title: string;
  /** dev.tidings.core.addon.Icon, such as "trophy". Ones this app doesn't know draw "default". */
  icon?: string;
}

/** The blocks this app knows. A page from a newer mod may use others: they show "update Tidings". */
export const VIEW_VERSION = 1;

/** Opens one of the same add-on's views. */
export interface AddonLink {
  view: string;
  params?: Record<string, string>;
}

/**
 * POST {url}/api/addons/<id>/view  (authenticated)  body: { view?, params?, locale }
 * Without `view`, the add-on's first one: the tab's.
 */
export interface AddonView {
  version: number;
  title?: string;
  blocks: Block[];
}

/**
 * POST {url}/api/addons/<id>/action  (authenticated)  body: { action, params?, values?, locale }
 * Errors answer `{ error }` like the rest of the API, the add-on's own message to show (400), or
 * 404 if it doesn't exist anymore. Then the app shows `message`, and opens `link` or reloads the view.
 */
export interface ActionResult {
  message?: string;
  link?: AddonLink;
}

export type Block =
  | { type: "heading"; text: string }
  | { type: "text"; text: string; muted?: boolean }
  | { type: "stats"; items: { label: string; value: string }[] }
  | { type: "list"; items: ListItem[]; empty?: string }
  | { type: "progress"; label: string; value: number; max: number }
  | {
      type: "choices";
      items: { label: string; link: AddonLink; selected?: boolean }[];
    }
  | ButtonBlock
  | FormBlock
  | { type: "card"; blocks: Block[] };

export interface ListItem {
  title: string;
  subtitle?: string;
  trailing?: string;
  player?: { uuid: string; name: string; skinUrl?: string };
  link?: AddonLink;
}

/** Has either `action` (with its `params`) or `link`. */
export interface ButtonBlock {
  type: "button";
  label: string;
  action?: string;
  params?: Record<string, string>;
  link?: AddonLink;
  style?: "primary" | "danger";
  /** Asked first, in a dialog. */
  confirm?: string;
}

/** Calls `action` with `params`, and what the player filled in as `values`, by field name. */
export interface FormBlock {
  type: "form";
  action: string;
  params?: Record<string, string>;
  submit: string;
  fields: Field[];
}

/** A toggle's value reaches the action as "true" or "false". */
export type Field =
  | {
      type: "text";
      name: string;
      label: string;
      value?: string;
      placeholder?: string;
      maxLength: number;
    }
  | { type: "toggle"; name: string; label: string; value: boolean }
  | {
      type: "select";
      name: string;
      label: string;
      options: { value: string; label: string }[];
      value: string;
    };

const NAME = /^[A-Za-z0-9_-]{1,64}$/;
const ADDON_ID = /^[a-z0-9_-]{1,64}$/;
const MAX_PARAMS = 16;
const MAX_PARAM_LENGTH = 256;

export const isAddonId = (id: unknown): id is string =>
  typeof id === "string" && ADDON_ID.test(id);

/** Only what the mod could have sent: anything else in a link is dropped, not followed. */
export function readLink(link: unknown): AddonLink | null {
  if (typeof link !== "object" || link === null) return null;
  const { view, params } = link as Record<string, unknown>;
  if (typeof view !== "string" || !NAME.test(view)) return null;
  const read = readParams(params);
  return read === null ? null : { view, params: read };
}

export function readParams(params: unknown): Record<string, string> | null {
  if (params === undefined) return {};
  if (typeof params !== "object" || params === null) return null;
  const entries = Object.entries(params);
  if (entries.length > MAX_PARAMS) return null;
  for (const [name, value] of entries) {
    if (!NAME.test(name) || typeof value !== "string") return null;
    if (value.length > MAX_PARAM_LENGTH) return null;
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

/** Text from the mod, or nothing: never markup, and never something other than a string. */
export const text = (value: unknown): string =>
  typeof value === "string" ? value : "";

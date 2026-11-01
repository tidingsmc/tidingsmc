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
export const VIEW_VERSION = 2;

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
  /** Who the page is about: their face shows next to the title. */
  player?: { uuid: string; name: string; skinUrl?: string };
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
  | { type: "card"; blocks: Block[] }
  | { type: "tree"; nodes: TreeNode[] };

export interface ListItem {
  title: string;
  subtitle?: string;
  trailing?: string;
  player?: { uuid: string; name: string; skinUrl?: string };
  link?: AddonLink;
}

/** A node of a tree block, listed after its parent; children show in the order given. */
export interface TreeNode {
  /** Unique within its tree. */
  id: string;
  /** Absent for a top-level node. */
  parent?: string;
  title: string;
  subtitle?: string;
  trailing?: string;
  /** Drawn as an icon: done, the next to do, or still out of reach. */
  state?: "done" | "available" | "locked";
  /** A short tag next to the title, such as "Challenge". */
  badge?: string;
  link?: AddonLink;
}

export interface TreeItem {
  node: TreeNode;
  children: TreeItem[];
  /** It names itself as its parent: shown at the top level, with an arrow back to itself. */
  loops?: boolean;
}

/**
 * Nests a tree block's nodes under their parents. The mod lists parents first; a node whose parent
 * isn't listed before it shows at the top level, one that is its own parent too, and one whose ID
 * is already taken is dropped, so a broken tree still shows everything once and can't loop.
 */
export function buildTree(nodes: unknown): TreeItem[] {
  if (!Array.isArray(nodes)) return [];
  const roots: TreeItem[] = [];
  const byId = new Map<string, TreeItem>();
  for (const node of nodes) {
    if (typeof node !== "object" || node === null) continue;
    const { id, parent } = node as TreeNode;
    if (typeof id !== "string" || !id || byId.has(id)) continue;
    // Looked up before it's added, so a node can't be its own child.
    const under = typeof parent === "string" ? byId.get(parent) : undefined;
    const item: TreeItem = { node, children: [] };
    if (parent === id) item.loops = true;
    byId.set(id, item);
    (under ? under.children : roots).push(item);
  }
  return roots;
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

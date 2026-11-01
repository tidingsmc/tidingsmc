export interface AddonInfo {
  id: string;
  title: string;
  icon?: string;
}

export const VIEW_VERSION = 3;

export interface AddonLink {
  view: string;
  params?: Record<string, string>;
}

export interface AddonView {
  version: number;
  title?: string;
  player?: { uuid: string; name: string; skinUrl?: string };
  blocks: Block[];
}

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
  | { type: "tree"; nodes: TreeNode[] }
  /** `icon` as in lib/icons: a pixelarticons name, or a small base64 image. */
  | { type: "icon"; icon: string; label?: string }
  | ImageBlock;

export interface ImageBlock {
  type: "image";
  src: string;
  alt: string;
  width?: number;
  pixelated?: boolean;
}

export interface ListItem {
  title: string;
  subtitle?: string;
  trailing?: string;
  player?: { uuid: string; name: string; skinUrl?: string };
  link?: AddonLink;
  icon?: string;
}

export interface TreeNode {
  id: string;
  parent?: string;
  title: string;
  subtitle?: string;
  trailing?: string;
  state?: "done" | "available" | "locked";
  badge?: string;
  link?: AddonLink;
  icon?: string;
}

export interface TreeItem {
  node: TreeNode;
  children: TreeItem[];
  loops?: boolean;
}

export function buildTree(nodes: unknown): TreeItem[] {
  if (!Array.isArray(nodes)) return [];
  const roots: TreeItem[] = [];
  const byId = new Map<string, TreeItem>();
  for (const node of nodes) {
    if (typeof node !== "object" || node === null) continue;
    const { id, parent } = node as TreeNode;
    if (typeof id !== "string" || !id || byId.has(id)) continue;
    // Looked up before it's added so a node can't be its own child
    const under = typeof parent === "string" ? byId.get(parent) : undefined;
    const item: TreeItem = { node, children: [] };
    if (parent === id) item.loops = true;
    byId.set(id, item);
    (under ? under.children : roots).push(item);
  }
  return roots;
}

export interface ButtonBlock {
  type: "button";
  label: string;
  action?: string;
  params?: Record<string, string>;
  link?: AddonLink;
  style?: "primary" | "danger";
  confirm?: string;
}

export interface FormBlock {
  type: "form";
  action: string;
  params?: Record<string, string>;
  submit: string;
  fields: Field[];
}

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

export const text = (value: unknown): string =>
  typeof value === "string" ? value : "";

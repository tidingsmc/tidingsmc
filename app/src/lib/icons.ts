export type IconSource =
  { kind: "name"; name: string } | { kind: "image"; src: string };

const MAX_ICON_BYTES = 16 * 1024;
const MAX_IMAGE_BYTES = 64 * 1024;
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const IMAGE = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
/** What newer servers send instead of the bytes, with the hash; see lib/images */
export const IMAGE_REF = /^image:([A-Za-z0-9_-]{22})$/;

export const ALIASES: Record<string, string> = {
  default: "layout",
  book: "book-open",
};

export function readIcon(value: unknown): IconSource {
  const src = readImage(value, MAX_ICON_BYTES);
  if (src) return { kind: "image", src };
  if (typeof value === "string" && value.length <= 64 && NAME.test(value))
    return { kind: "name", name: ALIASES[value] ?? value };
  return { kind: "name", name: ALIASES.default };
}

/** An image reference or a base64 `data:` URL, for lib/images' useImage */
export function readImage(
  value: unknown,
  maxBytes = MAX_IMAGE_BYTES,
): string | null {
  if (typeof value !== "string") return null;
  if (IMAGE_REF.test(value)) return value;
  const image = IMAGE.exec(value);
  return image && image[2].length <= Math.ceil(maxBytes / 3) * 4 ? value : null;
}

// Skins are "unfolded" textures: the face is the 8×8 square at (8, 8) and the hat layer
// (hair, helmets…) the 8×8 square at (40, 8), scaled up for HD skins.
// Only uses APIs that also exist in the service worker, which draws faces for notifications.

/** Faces are drawn at this size, a whole multiple of every skin's face, so pixels stay sharp. */
const FACE_SIZE = 128;

const faces = new Map<string, Promise<string>>();

/**
 * The face of a skin, hat layer included, as a PNG data URL. Cached per skin.
 * Rejects if the skin can't be loaded or its pixels can't be read (CORS).
 */
export function skinFace(src: string): Promise<string> {
  let face = faces.get(src);
  if (!face) {
    face = renderFace(src);
    // Forget failures so a later render can retry.
    face.catch(() => faces.delete(src));
    faces.set(src, face);
  }
  return face;
}

async function renderFace(src: string): Promise<string> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Skin answered ${res.status}`);
  const img = await createImageBitmap(await res.blob());

  const scale = img.width / 64;
  const face = new OffscreenCanvas(FACE_SIZE, FACE_SIZE);
  const ctx = face.getContext('2d')!;
  // Big blocky pixels, like in game, rather than a blur.
  ctx.imageSmoothingEnabled = false;
  const draw = (x: number, y: number) =>
    ctx.drawImage(img, x * scale, y * scale, 8 * scale, 8 * scale, 0, 0, FACE_SIZE, FACE_SIZE);

  draw(8, 8);
  // Like Minecraft: old 64×32 skins often have a solid hat area, which the game ignores.
  const legacy = img.height * 2 === img.width;
  if (!(legacy && isOpaque(img, scale))) draw(40, 8);
  return toDataUrl(await face.convertToBlob());
}

function isOpaque(img: ImageBitmap, scale: number): boolean {
  const size = 8 * scale;
  const hat = new OffscreenCanvas(size, size).getContext('2d')!;
  hat.drawImage(img, 40 * scale, 8 * scale, size, size, 0, 0, size, size);
  const { data } = hat.getImageData(0, 0, size, size);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return false;
  return true;
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

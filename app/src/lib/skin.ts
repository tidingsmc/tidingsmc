const FACE_SIZE = 128;

const faces = new Map<string, Promise<string>>();

export function skinFace(src: string): Promise<string> {
  let face = faces.get(src);
  if (!face) {
    face = renderFace(src);
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
  const ctx = face.getContext("2d")!;

  ctx.imageSmoothingEnabled = false;
  const draw = (x: number, y: number) =>
    ctx.drawImage(
      img,
      x * scale,
      y * scale,
      8 * scale,
      8 * scale,
      0,
      0,
      FACE_SIZE,
      FACE_SIZE,
    );

  draw(8, 8);
  // old 64×32 skins often have a solid hat area
  const legacy = img.height * 2 === img.width;
  if (!(legacy && isOpaque(img, scale))) draw(40, 8);
  return toDataUrl(await face.convertToBlob());
}

function isOpaque(img: ImageBitmap, scale: number): boolean {
  const size = 8 * scale;
  const hat = new OffscreenCanvas(size, size).getContext("2d")!;
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

import { useEffect, useState } from "react";
import { skinFace } from "../lib/skin";
import { hashString, safeSkinUrl } from "../lib/util";

export function Avatar({
  name,
  skinUrl,
  size = 32,
}: {
  name: string;
  skinUrl?: string;
  size?: number;
}) {
  const src = safeSkinUrl(skinUrl);
  const [face, setFace] = useState<{ src: string; url: string } | null>(null);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    skinFace(src).then(
      (url) => !cancelled && setFace({ src, url }),
      () => {}, // keep the letter
    );
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (src && face?.src === src) {
    return (
      <img
        className="avatar skin"
        src={face.url}
        alt=""
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size / 2,
        background: `hsl(${hashString(name) % 360} 45% 42%)`,
      }}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

import { text, type ImageBlock } from "../../lib/addons";
import { readImage } from "../../lib/icons";
import { useImage } from "../../lib/images";

export function ImageView({ block }: { block: ImageBlock }) {
  const src = useImage(readImage(block.src));
  if (!src) return null;
  const width = Number(block.width);
  return (
    <img
      className="addon-image"
      src={src}
      alt={text(block.alt)}
      data-pixelated={block.pixelated === true || undefined}
      style={width >= 1 && width <= 1024 ? { width } : undefined}
    />
  );
}

import { text, type Block } from "../../lib/addons";

export function ProgressView({
  block,
}: {
  block: Extract<Block, { type: "progress" }>;
}) {
  const max = Number(block.max);
  const value = Number(block.value);
  if (!(max > 0 && value >= 0 && value <= max)) return null;
  return (
    <div className="addon-progress">
      <div className="info-row">
        <span>{text(block.label)}</span>
        <span className="muted">
          {value} / {max}
        </span>
      </div>
      <progress value={value} max={max} aria-label={text(block.label)} />
    </div>
  );
}

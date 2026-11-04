import { list, text, type Block } from "../../lib/addons";

export function StatsView({
  block,
}: {
  block: Extract<Block, { type: "stats" }>;
}) {
  return (
    <dl className="addon-stats">
      {list(block.items).map((item, i) => (
        <div key={i} className="addon-stat">
          <dd>{text(item.value)}</dd>
          <dt className="muted small">{text(item.label)}</dt>
        </div>
      ))}
    </dl>
  );
}

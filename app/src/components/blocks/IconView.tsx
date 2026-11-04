import { AddonIcon } from "../AddonIcon";
import { text, type Block } from "../../lib/addons";

export function IconView({
  block,
}: {
  block: Extract<Block, { type: "icon" }>;
}) {
  const label = text(block.label);
  return (
    <p className="addon-icon-block">
      <AddonIcon name={block.icon} />
      {label && <span>{label}</span>}
    </p>
  );
}

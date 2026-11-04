import { ChevronRight } from "pixelarticons/react";
import { AddonIcon } from "../AddonIcon";
import { Avatar } from "../Avatar";
import {
  list,
  readLink,
  text,
  type Block,
  type ListItem,
} from "../../lib/addons";
import type { BlockContext } from "./context";

export function ListView({
  block,
  context,
}: {
  block: Extract<Block, { type: "list" }>;
  context: BlockContext;
}) {
  const items = list(block.items);
  if (items.length === 0) {
    const empty = text(block.empty);
    return empty ? <p className="muted">{empty}</p> : null;
  }
  return (
    <ul className="addon-list">
      {items.map((item, i) => (
        <Row key={i} item={item} context={context} />
      ))}
    </ul>
  );
}

function Row({ item, context }: { item: ListItem; context: BlockContext }) {
  const link = readLink(item.link);
  const player = item.player;
  const subtitle = text(item.subtitle);
  const trailing = text(item.trailing);
  const content = (
    <>
      {item.icon !== undefined ? (
        <AddonIcon name={item.icon} />
      ) : (
        player &&
        typeof player.name === "string" && (
          <Avatar name={player.name} skinUrl={text(player.skinUrl)} />
        )
      )}
      <span className="card-main">
        <span className="addon-row-title">{text(item.title)}</span>
        {subtitle && <span className="muted small">{subtitle}</span>}
      </span>
      {trailing && <span className="addon-row-trailing">{trailing}</span>}
      {link && <ChevronRight className="muted" aria-hidden />}
    </>
  );
  return (
    <li>
      {link ? (
        <a className="addon-row" href={context.href(link)}>
          {content}
        </a>
      ) : (
        <div className="addon-row">{content}</div>
      )}
    </li>
  );
}

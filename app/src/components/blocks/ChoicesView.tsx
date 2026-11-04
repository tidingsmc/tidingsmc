import { list, readLink, text, type Block } from "../../lib/addons";
import { navigate } from "../../lib/router";
import type { BlockContext } from "./context";

export function ChoicesView({
  block,
  context,
}: {
  block: Extract<Block, { type: "choices" }>;
  context: BlockContext;
}) {
  return (
    <nav className="addon-choices">
      {list(block.items).map((item, i) => {
        const link = readLink(item.link);
        return link ? (
          <a
            key={i}
            href={context.href(link)}
            aria-current={item.selected ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate(context.href(link), { replace: true });
            }}
          >
            {text(item.label)}
          </a>
        ) : null;
      })}
    </nav>
  );
}

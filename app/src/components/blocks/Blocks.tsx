import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { text, type Block } from "../../lib/addons";
import { ActionButton } from "./ActionButton";
import { AddonForm } from "./AddonForm";
import { ChatBox } from "./ChatBox";
import { ChoicesView } from "./ChoicesView";
import type { BlockContext } from "./context";
import { IconView } from "./IconView";
import { ImageView } from "./ImageView";
import { ListView } from "./ListView";
import { MapView } from "./MapView";
import { ProgressView } from "./ProgressView";
import { StatsView } from "./StatsView";
import { Tree } from "./Tree";

export function Blocks({
  blocks,
  context,
  nested,
}: {
  blocks: unknown;
  context: BlockContext;
  nested: boolean;
}) {
  if (!Array.isArray(blocks)) return null;
  const views: ReactNode[] = [];
  let cards: ReactNode[] = [];
  const endCards = (at: number) => {
    if (cards.length > 1) {
      views.push(
        <div key={`cards-${at}`} className="addon-cards">
          {cards}
        </div>,
      );
    } else {
      views.push(...cards);
    }
    cards = [];
  };
  blocks.forEach((block: Block, i) => {
    const view = (
      <BlockView key={i} block={block} context={context} nested={nested} />
    );
    if (!nested && block?.type === "card") {
      cards.push(view);
    } else if (
      !nested &&
      block?.type === "progress" &&
      blocks[i - 1]?.type === "choices"
    ) {
      endCards(i);
      const choices = views.pop();
      views.push(
        <div key={`split-${i}`} className="addon-split">
          {choices}
          {view}
        </div>,
      );
    } else {
      endCards(i);
      views.push(view);
    }
  });
  endCards(blocks.length);
  return views;
}

function BlockView({
  block,
  context,
  nested,
}: {
  block: Block;
  context: BlockContext;
  nested: boolean;
}) {
  const { t } = useTranslation();
  switch (block?.type) {
    case "heading":
      return <h3 className="addon-heading">{text(block.text)}</h3>;
    case "text":
      return <p className={block.muted ? "muted" : ""}>{text(block.text)}</p>;
    case "stats":
      return <StatsView block={block} />;
    case "list":
      return <ListView block={block} context={context} />;
    case "progress":
      return <ProgressView block={block} />;
    case "choices":
      return <ChoicesView block={block} context={context} />;
    case "button":
      return <ActionButton block={block} context={context} />;
    case "form":
      return <AddonForm block={block} context={context} />;
    case "chat":
      return <ChatBox block={block} context={context} />;
    case "tree":
      return <Tree nodes={block.nodes} context={context} />;
    case "icon":
      return <IconView block={block} />;
    case "image":
      return <ImageView block={block} />;
    case "map":
      return <MapView block={block} context={context} />;
    case "card":
      return nested ? null : (
        <div className="card addon-card">
          <Blocks blocks={block.blocks} context={context} nested />
        </div>
      );
    default:
      return context.newer ? (
        <p className="muted small">{t("addon.updateApp")}</p>
      ) : null;
  }
}

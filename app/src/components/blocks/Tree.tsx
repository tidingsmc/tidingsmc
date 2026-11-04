import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Lock,
} from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import { AddonIcon } from "../AddonIcon";
import { buildTree, readLink, text, type TreeItem } from "../../lib/addons";
import { layoutTree } from "../../lib/treeLayout";
import { useWide } from "../../lib/useWide";
import type { BlockContext } from "./context";

interface TreeGeometry {
  cardWidth: number;
  cardHeight: number;
  columnGap: number;
  rowGap: number;
  offsetY: number;
  minHeight: number;
}

const PHONE_TREE: TreeGeometry = {
  cardWidth: 136,
  cardHeight: 64,
  columnGap: 28,
  rowGap: 10,
  offsetY: 0,
  minHeight: 0,
};
const TREE_BOTTOM_ROOM = 96;
const TREE_PADDING = 12;
const OPEN_CARD_HEIGHT = 170;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function fittedTree(
  width: number,
  height: number,
  columns: number,
  rows: number,
): TreeGeometry {
  const room = width - 2 * TREE_PADDING;
  const cardWidth = clamp(
    Math.floor((room - 40 * (columns - 1)) / columns),
    136,
    200,
  );
  const columnGap =
    columns > 1
      ? clamp(Math.floor((room - cardWidth * columns) / (columns - 1)), 28, 72)
      : 28;
  const roomY = height - 2 * TREE_PADDING;
  const cardHeight = clamp(
    Math.floor((roomY - 16 * (rows - 1)) / rows),
    72,
    104,
  );
  const rowGap =
    rows > 1
      ? clamp(Math.floor((roomY - cardHeight * rows) / (rows - 1)), 12, 48)
      : 12;
  const used = rows * cardHeight + (rows - 1) * rowGap;
  return {
    cardWidth,
    cardHeight,
    columnGap,
    rowGap,
    offsetY: Math.max(0, Math.floor((roomY - used) / 2)),
    minHeight: height,
  };
}

const cardX = (g: TreeGeometry, column: number) =>
  TREE_PADDING + column * (g.cardWidth + g.columnGap);
const cardY = (g: TreeGeometry, row: number) =>
  TREE_PADDING + g.offsetY + row * (g.cardHeight + g.rowGap);

// Like Minecraft's advancement screen
export function Tree({
  nodes,
  context,
}: {
  nodes: unknown;
  context: BlockContext;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const layout = useMemo(() => layoutTree(buildTree(nodes)), [nodes]);
  const next = layout.nodes.find((n) => n.item.node.state === "available");
  const nextColumn = next?.column ?? 0;
  const wide = useWide();
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = scrollerRef.current;
    if (!wide || !el) return;
    const measure = () => {
      const width = el.clientWidth;
      const height = Math.max(
        0,
        innerHeight -
          (el.getBoundingClientRect().top + scrollY) -
          TREE_BOTTOM_ROOM,
      );
      setAvailable((a) =>
        a.width === width && a.height === height ? a : { width, height },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      removeEventListener("resize", measure);
    };
  }, [wide]);
  const measuring = wide && available.width === 0;
  const g = useMemo(
    () =>
      wide && available.width > 0
        ? fittedTree(
            available.width,
            available.height,
            layout.columns,
            layout.rows,
          )
        : PHONE_TREE,
    [wide, available, layout.columns, layout.rows],
  );

  const updateEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((e) =>
      e.left === left && e.right === right ? e : { left, right },
    );
  }, []);

  const scrolled = useRef(false);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || scrolled.current || measuring) return;
    scrolled.current = true;
    el.scrollLeft = cardX(g, nextColumn) + g.cardWidth / 2 - el.clientWidth / 2;
    updateEdges();
  }, [g, measuring, nextColumn, updateEdges]);

  useEffect(() => {
    updateEdges();
    addEventListener("resize", updateEdges);
    return () => removeEventListener("resize", updateEdges);
  }, [updateEdges, layout.columns, g]);

  if (layout.nodes.length === 0) return null;
  const width = cardX(g, layout.columns) - g.columnGap + TREE_PADDING;
  const opened = layout.nodes.find((n) => n.item.node.id === selected);
  const height = Math.max(
    cardY(g, layout.rows) - g.rowGap + TREE_PADDING,
    opened ? cardY(g, opened.row) + OPEN_CARD_HEIGHT + TREE_PADDING : 0,
    g.minHeight,
  );
  const scrollBy = (direction: 1 | -1) =>
    scrollerRef.current?.scrollBy({
      left: direction * (g.cardWidth + g.columnGap) * 2,
      behavior: "smooth",
    });

  return (
    <div className="addon-tree">
      {(edges.left || edges.right) && (
        <div className="addon-tree-scroll">
          <button
            type="button"
            className="icon-button"
            aria-label={t("addon.scrollLeft")}
            title={t("addon.scrollLeft")}
            disabled={!edges.left}
            onClick={() => scrollBy(-1)}
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={t("addon.scrollRight")}
            title={t("addon.scrollRight")}
            disabled={!edges.right}
            onClick={() => scrollBy(1)}
          >
            <ChevronRight />
          </button>
        </div>
      )}
      <div
        className="addon-tree-scroller"
        ref={scrollerRef}
        onScroll={updateEdges}
      >
        <div className="addon-tree-canvas" style={{ width, height }}>
          <svg
            className="addon-tree-arrows"
            width={width}
            height={height}
            aria-hidden
          >
            {layout.edges.map(({ from, to }) => {
              const parent = layout.nodes[from];
              const child = layout.nodes[to];
              if (from === to) {
                const left = cardX(g, child.column);
                const right = left + g.cardWidth;
                const y = cardY(g, child.row) + g.cardHeight / 2;
                const top = cardY(g, child.row) - g.rowGap / 2;
                const out = right + g.columnGap / 2;
                const back = left - 8;
                return (
                  <path
                    key={to}
                    data-state={child.item.node.state}
                    d={`M${right} ${y}H${out}V${top}H${back}V${y}H${left - 1}M${left - 6} ${y - 4}L${left - 1} ${y}L${left - 6} ${y + 4}`}
                  />
                );
              }
              const x1 = cardX(g, parent.column) + g.cardWidth;
              const y1 = cardY(g, parent.row) + g.cardHeight / 2;
              const x2 = cardX(g, child.column);
              const y2 = cardY(g, child.row) + g.cardHeight / 2;
              const middle = x1 + g.columnGap / 2;
              return (
                <path
                  key={to}
                  data-state={child.item.node.state}
                  d={`M${x1} ${y1}H${middle}V${y2}H${x2 - 1}M${x2 - 6} ${y2 - 4}L${x2 - 1} ${y2}L${x2 - 6} ${y2 + 4}`}
                />
              );
            })}
          </svg>
          {layout.nodes.map(({ item, column, row }) => (
            <TreeCard
              key={item.node.id}
              item={item}
              context={context}
              open={item.node.id === selected}
              onToggle={() =>
                setSelected((id) => (id === item.node.id ? null : item.node.id))
              }
              left={cardX(g, column)}
              top={cardY(g, row)}
              width={g.cardWidth}
              height={g.cardHeight}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TreeCard({
  item,
  context,
  open,
  onToggle,
  left,
  top,
  width,
  height,
}: {
  item: TreeItem;
  context: BlockContext;
  open: boolean;
  onToggle: () => void;
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  const { t } = useTranslation();
  const { node } = item;
  const badge = text(node.badge);
  const subtitle = text(node.subtitle);
  const trailing = text(node.trailing);
  const link = readLink(node.link);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open)
      ref.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
  }, [open]);
  return (
    <div
      ref={ref}
      className="addon-tree-node"
      data-state={node.state}
      data-open={open || undefined}
      style={{ left, top, width, minHeight: height }}
    >
      <button
        type="button"
        className="addon-tree-card"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="addon-tree-card-head">
          <TreeState state={node.state} icon={node.icon} />
          <span className="addon-tree-card-title">{text(node.title)}</span>
        </span>
        {open && subtitle && (
          <span className="addon-tree-card-text small">{subtitle}</span>
        )}
        {open && trailing && (
          <span className="addon-tree-card-text muted small">{trailing}</span>
        )}
      </button>
      {open && link && (
        <a className="addon-tree-open small" href={context.href(link)}>
          {t("addon.open")}
        </a>
      )}
      {badge && (
        <span className="addon-tree-badge addon-tree-corner">{badge}</span>
      )}
    </div>
  );
}

function TreeState({ state, icon: own }: { state: unknown; icon?: unknown }) {
  const { t } = useTranslation();
  const ownIcon = own !== undefined ? <AddonIcon name={own} /> : null;
  const symbol =
    state === "done" ? (
      <Check />
    ) : state === "available" ? (
      <Circle />
    ) : state === "locked" ? (
      <Lock />
    ) : null;
  if (!symbol) return ownIcon;
  const name =
    state === "done"
      ? t("addon.done")
      : state === "available"
        ? t("addon.available")
        : t("addon.locked");
  return (
    <>
      <span
        className="addon-tree-state"
        data-state={state as string}
        role="img"
        aria-label={name}
      >
        {symbol}
      </span>
      {ownIcon}
    </>
  );
}

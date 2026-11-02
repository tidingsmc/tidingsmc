import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Lock,
  Send,
  User,
} from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import {
  AddonIcon,
  Avatar,
  ConfirmDialog,
  Dropdown,
  LoadingDots,
  Toggle,
  UnreachableNotice,
} from "../components";
import {
  buildTree,
  CHAT_VALUE,
  chatTime,
  readLink,
  readParams,
  refreshDelay,
  splitMentions,
  text,
  VIEW_VERSION,
  type AddonLink,
  type AddonView,
  type Block,
  type ButtonBlock,
  type ChatBlock,
  type Field,
  type FormBlock,
  type ImageBlock,
  type ListItem,
  type TreeItem,
} from "../lib/addons";
import {
  api,
  isUnreachable,
  type AddonAction,
  type PairedServer,
} from "../lib/api";
import { errorText } from "../lib/i18n";
import { readImage } from "../lib/icons";
import { navigate, paths, type AddonRoute } from "../lib/router";
import { layoutTree } from "../lib/treeLayout";
import { useWide } from "../lib/useWide";

type ViewState =
  | { status: "loading" }
  | { status: "ok"; view: AddonView; for: string; reload: number }
  | { status: "error"; error: Error; for: string };

interface Context {
  href: (link: AddonLink) => string;
  run: (action: AddonAction) => Promise<void>;
  busy: boolean;
  newer: boolean;
}

export function AddonTab({
  server,
  addon,
}: {
  server: PairedServer;
  addon: AddonRoute;
}) {
  const { t, i18n } = useTranslation();

  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [reloads, setReloads] = useState(0);
  const [refreshes, setRefreshes] = useState(0);
  const [busy, setBusy] = useState(false);

  const link = addon.view ? { view: addon.view, params: addon.params } : null;
  const linkKey = JSON.stringify(link);

  const [message, setMessage] = useState<{
    text: string;
    error?: boolean;
    on: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.addonView(server, addon.id, JSON.parse(linkKey), i18n.language).then(
      (view) =>
        !cancelled &&
        setState({ status: "ok", view, for: linkKey, reload: reloads }),
      (error: Error) =>
        !cancelled &&
        setState((previous) =>
          previous.status === "ok" && previous.for === linkKey
            ? { ...previous }
            : { status: "error", error, for: linkKey },
        ),
    );
    return () => {
      cancelled = true;
    };
  }, [server, addon.id, linkKey, i18n.language, reloads, refreshes]);

  const delay =
    state.status === "ok" && state.for === linkKey
      ? refreshDelay(state.view)
      : null;
  useEffect(() => {
    if (delay === null || busy) return;
    let due = false;
    const refresh = () => setRefreshes((n) => n + 1);
    const timer = window.setTimeout(() => {
      if (document.hidden) due = true;
      else refresh();
    }, delay);
    const onVisible = () => {
      if (due && !document.hidden) {
        due = false;
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [state, delay, busy]);

  const context: Context = {
    href: (link) => paths.addon(server.id, { id: addon.id, ...link }),
    busy,
    newer: state.status === "ok" && state.view.version > VIEW_VERSION,
    async run(action) {
      setBusy(true);
      setMessage(null);
      try {
        const result = await api.addonAction(
          server,
          addon.id,
          action,
          i18n.language,
        );
        const next = readLink(result.link);
        const message = text(result.message);
        if (message)
          setMessage({
            text: message,
            on: next ? JSON.stringify(next) : linkKey,
          });
        const href = next && context.href(next);
        if (href && href !== paths.addon(server.id, addon)) navigate(href);
        else setReloads((n) => n + 1);
      } catch (err) {
        setMessage({
          text: errorText(err as Error, t),
          error: true,
          on: linkKey,
        });
      } finally {
        setBusy(false);
      }
    },
  };

  if (state.status === "loading" || state.for !== linkKey) {
    return <LoadingDots label={t("common.loading")} />;
  }
  if (state.status === "error") {
    return isUnreachable(state.error) ? (
      <UnreachableNotice help={t("server.unreachableHelp")} />
    ) : (
      <p className="error">{errorText(state.error, t)}</p>
    );
  }
  const title = text(state.view.title);
  const player = state.view.player;
  return (
    <div className="addon">
      {title && (
        <h3 className="addon-title">
          {player && typeof player.name === "string" && (
            <Avatar name={player.name} skinUrl={text(player.skinUrl)} />
          )}
          {title}
        </h3>
      )}
      {message?.on === linkKey && (
        <p
          className={message.error ? "error" : "addon-message"}
          role={message.error ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}
      <Fragment key={`${state.reload} ${linkKey}`}>
        <Blocks blocks={state.view.blocks} context={context} nested={false} />
      </Fragment>
    </div>
  );
}

function Blocks({
  blocks,
  context,
  nested,
}: {
  blocks: unknown;
  context: Context;
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
  context: Context;
  nested: boolean;
}) {
  const { t } = useTranslation();
  switch (block?.type) {
    case "heading":
      return <h3 className="addon-heading">{text(block.text)}</h3>;
    case "text":
      return <p className={block.muted ? "muted" : ""}>{text(block.text)}</p>;
    case "stats":
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
    case "list": {
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
    case "progress": {
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
    case "choices":
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
    case "button":
      return <ActionButton block={block} context={context} />;
    case "form":
      return <AddonForm block={block} context={context} />;
    case "chat":
      return <ChatBox block={block} context={context} />;
    case "tree":
      return <Tree nodes={block.nodes} context={context} />;
    case "icon": {
      const label = text(block.label);
      return (
        <p className="addon-icon-block">
          <AddonIcon name={block.icon} />
          {label && <span>{label}</span>}
        </p>
      );
    }
    case "image":
      return <ImageView block={block} />;
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

// Only base64 images
function ImageView({ block }: { block: ImageBlock }) {
  const src = readImage(block.src);
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

function list<T>(items: T[] | undefined): T[] {
  return Array.isArray(items)
    ? items.filter((i) => typeof i === "object" && i !== null)
    : [];
}

function Row({ item, context }: { item: ListItem; context: Context }) {
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
function Tree({ nodes, context }: { nodes: unknown; context: Context }) {
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
  context: Context;
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

function buttonClass(style: unknown) {
  return style === "primary" || style === "danger"
    ? `button ${style}`
    : "button";
}

function ActionButton({
  block,
  context,
}: {
  block: ButtonBlock;
  context: Context;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const label = text(block.label);
  const link = readLink(block.link);
  if (link) {
    return (
      <a className={buttonClass(block.style)} href={context.href(link)}>
        {label}
      </a>
    );
  }
  const params = readParams(block.params);
  if (typeof block.action !== "string" || params === null) return null;
  const action = { action: block.action, params };
  const confirm = text(block.confirm);
  return (
    <>
      <button
        type="button"
        className={buttonClass(block.style)}
        disabled={context.busy}
        onClick={() => (confirm ? setConfirming(true) : context.run(action))}
      >
        {label}
      </button>
      {confirm && (
        <ConfirmDialog
          open={confirming}
          title={label}
          message={confirm}
          confirmLabel={label || t("common.ok")}
          danger={block.style === "danger"}
          onConfirm={() => {
            setConfirming(false);
            context.run(action);
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}

function initialValues(fields: Field[]): Record<string, string> {
  return Object.fromEntries(
    fields.map((f) => [
      f.name,
      f.type === "toggle" ? String(f.value === true) : text(f.value),
    ]),
  );
}

function AddonForm({ block, context }: { block: FormBlock; context: Context }) {
  const fields = list(block.fields).filter(
    (f) =>
      typeof f.name === "string" &&
      (f.type === "text" || f.type === "toggle" || f.type === "select"),
  );
  const [values, setValues] = useState(() => initialValues(fields));
  const params = readParams(block.params);
  if (typeof block.action !== "string" || params === null) return null;
  const action = block.action;
  const formParams = params;
  const set = (name: string, value: string) =>
    setValues((v) => ({ ...v, [name]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    await context.run({ action, params: formParams, values });
  }

  return (
    <form className="form addon-form" onSubmit={submit}>
      {fields.map((field) => {
        const label = text(field.label);
        switch (field.type) {
          case "text":
            return (
              <label key={field.name} className="field">
                {label}
                <input
                  value={values[field.name] ?? ""}
                  placeholder={text(field.placeholder)}
                  maxLength={Number(field.maxLength) || undefined}
                  onChange={(e) => set(field.name, e.target.value)}
                />
              </label>
            );
          case "toggle":
            return (
              <Toggle
                key={field.name}
                label={label}
                checked={values[field.name] === "true"}
                onChange={(checked) => set(field.name, String(checked))}
              />
            );
          case "select":
            return (
              <div key={field.name} className="field">
                {label}
                <Dropdown
                  label={label}
                  value={values[field.name] ?? ""}
                  options={list(field.options).map((o) => ({
                    value: text(o.value),
                    label: text(o.label),
                  }))}
                  onChange={(value) => set(field.name, value)}
                />
              </div>
            );
        }
      })}
      <button type="submit" className="button primary" disabled={context.busy}>
        {text(block.submit)}
      </button>
    </form>
  );
}

function useChatOption(
  key: string,
  initial: boolean,
): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? initial : saved === "on";
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (on: boolean) => {
      try {
        localStorage.setItem(key, on ? "on" : "off");
      } catch {
        // Remembered until the page is closed only
      }
      setOn(on);
    },
    [key],
  );
  return [on, set];
}

// Like Minecraft's chat
function ChatBox({ block, context }: { block: ChatBlock; context: Context }) {
  const { t } = useTranslation();

  const [value, setValue] = useState("");
  const [timesShown, setTimesShown] = useChatOption("tidings.chatTimes", true);
  const [heads, setHeads] = useChatOption("tidings.chatHeads", false);

  const scroller = useRef<HTMLOListElement>(null);
  const atBottom = useRef(true);
  const lines = list(block.lines).filter((l) => typeof l.text === "string");
  const last = lines.length ? JSON.stringify(lines[lines.length - 1]) : "";
  
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [lines.length, last]);

  const params = readParams(block.params);
  const action =
    typeof block.action === "string" && params !== null ? block.action : null;
  const empty = text(block.empty);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!action || !value.trim()) return;
    atBottom.current = true;
    await context.run({
      action,
      params: params ?? {},
      values: { [CHAT_VALUE]: value },
    });
  }

  return (
    <>
      <div className="mc-chat-tools">
        <button
          type="button"
          className="mc-button mc-toggle"
          aria-pressed={timesShown}
          aria-label={t("addon.chatTimes")}
          title={t("addon.chatTimes")}
          onClick={() => setTimesShown(!timesShown)}
        >
          <Clock aria-hidden />
        </button>
        <button
          type="button"
          className="mc-button mc-toggle"
          aria-pressed={heads}
          aria-label={t("addon.chatHeads")}
          title={t("addon.chatHeads")}
          onClick={() => setHeads(!heads)}
        >
          <User aria-hidden />
        </button>
      </div>
      <div className="mc-chat">
        {lines.length === 0 ? (
          <p className="mc-chat-empty">{empty}</p>
        ) : (
          <ol
            ref={scroller}
            className="mc-chat-lines"
            role="log"
            onScroll={(e) => {
              const el = e.currentTarget;
              atBottom.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 8;
            }}
          >
            {lines.map((line, i) => {
              const name = text(line.name);
              const tag = text(line.tag);
              const time = timesShown ? chatTime(line.time) : "";
              const player = line.player;
              const face =
                heads && name && typeof player?.name === "string" ? (
                  <span className="mc-head">
                    <Avatar
                      name={player.name}
                      skinUrl={text(player.skinUrl)}
                      size={18}
                    />
                    <span className="visually-hidden">{name}</span>
                  </span>
                ) : null;
              return (
                <li
                  key={i}
                  className={
                    !name
                      ? "mc-system"
                      : line.whisper === true
                        ? "mc-whisper"
                        : undefined
                  }
                >
                  {time && <span className="mc-chat-time">{time} </span>}
                  {tag && <span className="mc-gray">[{tag}] </span>}
                  {face ? <>{face} </> : name && <>&lt;{name}&gt; </>}
                  {splitMentions(line.text).map((part, j) =>
                    part.mention ? (
                      <span key={j} className="mc-yellow">
                        {part.text}
                      </span>
                    ) : (
                      <Fragment key={j}>{part.text}</Fragment>
                    ),
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {action && (
          <form className="mc-chat-input" onSubmit={submit}>
            <input
              value={value}
              placeholder={text(block.placeholder)}
              maxLength={Number(block.maxLength) || undefined}
              aria-label={t("addon.chatMessage")}
              enterKeyHint="send"
              onChange={(e) => setValue(e.target.value)}
            />
            <button
              type="submit"
              className="mc-button"
              disabled={context.busy || !value.trim()}
              aria-label={t("addon.chatSend")}
              title={t("addon.chatSend")}
            >
              <Send aria-hidden />
            </button>
          </form>
        )}
      </div>
    </>
  );
}

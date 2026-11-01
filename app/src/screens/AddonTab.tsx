import { Fragment, useEffect, useState, type FormEvent } from "react";
import { ChevronRight } from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import {
  Avatar,
  ConfirmDialog,
  Dropdown,
  LoadingDots,
  Toggle,
  UnreachableNotice,
} from "../components";
import {
  readLink,
  readParams,
  text,
  VIEW_VERSION,
  type AddonLink,
  type AddonView,
  type Block,
  type ButtonBlock,
  type Field,
  type FormBlock,
  type ListItem,
} from "../lib/addons";
import {
  api,
  isUnreachable,
  type AddonAction,
  type PairedServer,
} from "../lib/api";
import { errorText } from "../lib/i18n";
import { navigate, paths, type AddonRoute } from "../lib/router";

/**
 * `for` is the link it was loaded for: another one is still loading. `reload` counts the reloads
 * after actions, so that forms start anew only once the new view is there.
 */
type ViewState =
  | { status: "loading" }
  | { status: "ok"; view: AddonView; for: string; reload: number }
  | { status: "error"; error: Error; for: string };

/** What the blocks need from the tab: where links go, and how actions run. */
interface Context {
  href: (link: AddonLink) => string;
  run: (action: AddonAction) => Promise<void>;
  busy: boolean;
  /** The page comes from a newer mod: blocks this app doesn't know say to update it. */
  newer: boolean;
}

/** One of a server's add-on tabs: the page its mod describes, drawn with the app's own blocks. */
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
  const [busy, setBusy] = useState(false);
  const link = addon.view ? { view: addon.view, params: addon.params } : null;
  const linkKey = JSON.stringify(link);
  /** The last action's message, for the view it was on or it opened. */
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
        // A failed reload after an action keeps the view, and the action's message, on screen.
        setState((previous) =>
          previous.status === "ok" && previous.for === linkKey
            ? previous
            : { status: "error", error, for: linkKey },
        ),
    );
    return () => {
      cancelled = true;
    };
  }, [server, addon.id, linkKey, i18n.language, reloads]);

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
        // The same link as the open view doesn't change the hash: reload it instead.
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
  return (
    <div className="addon">
      {title && <h3 className="addon-title">{title}</h3>}
      {message?.on === linkKey && (
        <p
          className={message.error ? "error" : "addon-message"}
          role={message.error ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}
      {/* Anew for each view, and after an action: forms start from their initial values again. */}
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
  return blocks.map((block, i) => (
    <BlockView key={i} block={block} context={context} nested={nested} />
  ));
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
                // Choosing another one replaces it: back leaves the page rather than going through each.
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
    case "card":
      return nested ? null : (
        <div className="card addon-card">
          <Blocks blocks={block.blocks} context={context} nested />
        </div>
      );
    default:
      // A page from a newer mod: the rest of it still shows.
      return context.newer ? (
        <p className="muted small">{t("addon.updateApp")}</p>
      ) : null;
  }
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
      {player && typeof player.name === "string" && (
        <Avatar name={player.name} skinUrl={text(player.skinUrl)} />
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

import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Avatar,
  Blocks,
  LoadingDots,
  UnreachableNotice,
  type BlockContext,
} from "../components";
import {
  readLink,
  refreshDelay,
  text,
  VIEW_VERSION,
  type AddonView,
} from "../lib/addons";
import { api, isUnreachable, type PairedServer } from "../lib/api";
import { errorText } from "../lib/i18n";
import { retryMissingImages } from "../lib/images";
import { navigate, paths, type AddonRoute } from "../lib/router";

type ViewState =
  | { status: "loading" }
  | { status: "ok"; view: AddonView; for: string; reload: number }
  | { status: "error"; error: Error; for: string };

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
      (view) => {
        if (cancelled) return;
        setState({ status: "ok", view, for: linkKey, reload: reloads });
        retryMissingImages(server);
      },
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

  const context: BlockContext = {
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

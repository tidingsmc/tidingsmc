import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  BellOff,
  BellRing,
  Check,
  ChevronDown,
  ChevronLeft,
  SettingsCog,
} from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import type { LinkedPlayer, MotdSegment, PairedServer } from "./lib/api";
import { errorText } from "./lib/i18n";
import {
  enableNotifications,
  useNotificationsSnooze,
  usePushStates,
} from "./lib/notifications";
import { skinFace } from "./lib/skin";
import type { OnlineState } from "./lib/useOnline";
import { hashString, safeSkinUrl } from "./lib/util";

interface ScreenProps {
  title: string;
  back?: string;
  /** Shown at the right of the top bar. */
  action?: ReactNode;
  /** Shows the app's icon before the title, for the home screen. */
  logo?: boolean;
  children: ReactNode;
}

export function Screen({ title, back, action, logo, children }: ScreenProps) {
  const { t } = useTranslation();
  return (
    <>
      <header className="topbar">
        {back && (
          <a className="back" href={back} aria-label={t("common.back")}>
            <ChevronLeft />
          </a>
        )}
        {logo && <BellRing className="logo" aria-hidden />}
        <h1>{title}</h1>
        {action}
      </header>
      <main className="content">{children}</main>
    </>
  );
}

export function SettingsLink({ href }: { href: string }) {
  const { t } = useTranslation();
  return (
    <a className="icon-button" href={href} aria-label={t("common.settings")}>
      <SettingsCog />
    </a>
  );
}

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: ToggleProps) {
  return (
    <label className="toggle-row">
      <span className="toggle-text">
        {label}
        {description && <span className="muted small">{description}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

interface DropdownOption<T extends string> {
  value: T;
  label: string;
  /** The option's own language, if it's written in one (a language's name). */
  lang?: string;
}

interface DropdownProps<T extends string> {
  /** What is being picked, for screen readers. */
  label: string;
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
}

/**
 * A button that opens a list to pick one option from, drawn by the app rather than the phone's own picker.
 * Works like a native select from the keyboard: arrows to move, Enter to pick, Escape to close.
 */
export function Dropdown<T extends string>({
  label,
  value,
  options,
  onChange,
}: DropdownProps<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const selected = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    // A tap anywhere else closes it, like a native picker.
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function show() {
    setActive(selected);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    button.current?.focus();
  }

  function choose(i: number) {
    onChange(options[i].value);
    close();
  }

  function onListKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        setActive((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        setActive((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        setActive(0);
        break;
      case "End":
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        choose(active);
        break;
      case "Escape":
        close();
        break;
      case "Tab":
        setOpen(false);
        return;
      default:
        return;
    }
    e.preventDefault();
  }

  return (
    <div className="dropdown" ref={root}>
      <button
        ref={button}
        type="button"
        className="button dropdown-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={t("common.labelValue", {
          label,
          value: options[selected].label,
        })}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            show();
          }
        }}
      >
        {/* All stacked, only the current one shown: the button keeps the widest one's width as it changes. */}
        <span className="dropdown-values">
          {options.map((option, i) => (
            <span key={option.value} lang={option.lang} hidden={i !== selected}>
              {option.label}
            </span>
          ))}
        </span>
        <ChevronDown className="dropdown-chevron" aria-hidden />
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          className="dropdown-menu"
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${id}-${active}`}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
        >
          {options.map((option, i) => (
            <li
              key={option.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === selected}
              lang={option.lang}
              className={
                i === active ? "dropdown-option active" : "dropdown-option"
              }
              onPointerMove={() => setActive(i)}
              onClick={() => choose(i)}
            >
              {option.label}
              {/* Kept in place when hidden, so labels line up. */}
              <Check
                aria-hidden
                style={{ visibility: i === selected ? "visible" : "hidden" }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The player's face from their skin, or a colored letter until it loads or if there's no skin. */
export function Avatar({
  name,
  skinUrl,
  size = 32,
}: {
  name: string;
  skinUrl?: string;
  size?: number;
}) {
  const src = safeSkinUrl(skinUrl);
  const [face, setFace] = useState<{ src: string; url: string } | null>(null);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    skinFace(src).then(
      (url) => !cancelled && setFace({ src, url }),
      () => {}, // keep the letter
    );
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (src && face?.src === src) {
    return (
      <img
        className="avatar skin"
        src={face.url}
        alt=""
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size / 2,
        background: `hsl(${hashString(name) % 360} 45% 42%)`,
      }}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * The server's icon, or its first letter if it has none.
 * Only inline PNGs are accepted, so a server can't make the app load URLs.
 */
export function ServerIcon({
  name,
  icon,
  size = 48,
}: {
  name: string;
  icon?: string;
  size?: number;
}) {
  const style = { width: size, height: size };
  if (icon?.startsWith("data:image/png;base64,")) {
    return <img className="server-icon" src={icon} alt="" style={style} />;
  }
  return (
    <span
      className="server-icon letter"
      style={{
        ...style,
        background: `hsl(${hashString(name) % 360} 40% 38%)`,
        fontSize: size / 2,
      }}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

// Minecraft's chat colors.
const MC_COLORS: Record<string, string> = {
  black: "#000000",
  dark_blue: "#0000AA",
  dark_green: "#00AA00",
  dark_aqua: "#00AAAA",
  dark_red: "#AA0000",
  dark_purple: "#AA00AA",
  gold: "#FFAA00",
  gray: "#AAAAAA",
  dark_gray: "#555555",
  blue: "#5555FF",
  green: "#55FF55",
  aqua: "#55FFFF",
  red: "#FF5555",
  light_purple: "#FF55FF",
  yellow: "#FFFF55",
  white: "#FFFFFF",
};

function mcColor(color?: string): string | undefined {
  if (!color) return undefined;
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  return MC_COLORS[color];
}

/** The server description, drawn like Minecraft's server list: colored text on a dark background. */
export function Motd({ segments }: { segments: MotdSegment[] }) {
  return (
    <p className="motd">
      {segments.map((s, i) => (
        <span
          key={i}
          style={{
            color: mcColor(s.color),
            fontWeight: s.bold ? 700 : undefined,
            fontStyle: s.italic ? "italic" : undefined,
            textDecoration:
              [s.underlined && "underline", s.strikethrough && "line-through"]
                .filter(Boolean)
                .join(" ") || undefined,
          }}
        >
          {s.text}
        </span>
      ))}
    </p>
  );
}

/** Which Minecraft account this device is paired as: a small face and "as <name>". */
export function LinkedAs({ player }: { player: LinkedPlayer }) {
  const { t } = useTranslation();
  return (
    <span className="linked-as">
      <Avatar name={player.name} skinUrl={player.skinUrl} size={16} />
      {t("common.linkedAs", { name: player.name })}
    </span>
  );
}

/** Compact status for a server card, under its name: a dot and the player count. */
export function OnlineSummary({ state }: { state: OnlineState }) {
  const { t } = useTranslation();
  if (state.status === "loading") {
    return (
      <div className="status">
        <span className="status-line muted">{t("common.checking")}</span>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="status">
        <span className="status-line">
          <span className="dot error" /> {t("online.unreachable")}
        </span>
      </div>
    );
  }
  const { players } = state.data;
  return (
    <div className="status">
      <span className="status-line">
        <span className={players.length > 0 ? "dot ok" : "dot"} />
        {players.length > 0
          ? t("online.count", { count: players.length })
          : t("online.nobody")}
      </span>
    </div>
  );
}

/**
 * Says when this device doesn't get some of the servers' notifications, with a button to turn them on if
 * it can. Permission is the whole app's, so one banner covers every server. `servers` must keep its identity.
 * A snoozable banner can be put off for a few days with "Not now".
 */
export function NotificationsOff({
  servers,
  snoozable,
}: {
  servers: PairedServer[];
  snoozable?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { states, refresh } = usePushStates(servers);
  const { snoozed, snooze } = useNotificationsSnooze();
  const [busy, setBusy] = useState(false);
  // Each with the server it's for, unless it's the same for all.
  const [errors, setErrors] = useState<
    { server?: PairedServer; error: Error }[]
  >([]);

  if (!states || (snoozable && snoozed)) return null;
  // A server just added has no state until it's been checked: not counted as off meanwhile.
  const off = servers.filter((server) => {
    const state = states.get(server.id);
    return state !== undefined && state !== "on";
  });
  if (off.length === 0) return null;
  // Unsupported and blocked are the browser's, so the same for every server.
  const state = states.get(off[0].id);

  async function turnOn() {
    setBusy(true);
    setErrors([]);
    // All started within the tap, so the permission prompt is allowed; it's only shown once.
    const results = await Promise.allSettled(off.map(enableNotifications));
    const failures = off.flatMap((server, i) => {
      const result = results[i];
      return result.status === "rejected"
        ? [{ server, error: result.reason as Error }]
        : [];
    });
    if (Notification.permission === "denied") {
      // The banner then says notifications are blocked.
      setErrors([]);
    } else if (Notification.permission !== "granted") {
      // The prompt was dismissed: the same error for every server.
      setErrors(failures.slice(0, 1).map(({ error }) => ({ error })));
    } else {
      setErrors(failures);
    }
    setBusy(false);
    refresh();
  }

  let message;
  if (state === "unsupported") message = t("push.unsupported");
  else if (state === "blocked") message = t("push.blocked");
  else if (servers.length === 1) message = t("push.notYet");
  else if (off.length === servers.length) message = t("push.notYetAny");
  else
    message = t("push.notYetSome", {
      servers: new Intl.ListFormat(i18n.language).format(
        off.map((server) => server.name),
      ),
    });

  return (
    <div className="notice warn" role="status">
      <div className="notice-row">
        <span className="notice-icon" aria-hidden>
          <BellOff />
        </span>
        <div className="notice-main">
          <p className="notice-title">{t("push.title")}</p>
          <p className="muted small">{message}</p>
        </div>
      </div>
      {errors.map(({ server, error }, i) => (
        <p key={server?.id ?? i} className="error small">
          {server && servers.length > 1
            ? t("common.labelValue", {
                label: server.name,
                value: errorText(error, t),
              })
            : errorText(error, t)}
        </p>
      ))}
      {(snoozable || state === "off") && (
        <div className="notice-actions">
          {snoozable && (
            <button className="button" onClick={snooze}>
              {t("push.notNow")}
            </button>
          )}
          {state === "off" && (
            <button className="button primary" onClick={turnOn} disabled={busy}>
              {busy ? t("push.turningOn") : t("push.turnOn")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

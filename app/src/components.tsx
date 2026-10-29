import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  BellRing,
  Check,
  ChevronDown,
  ChevronLeft,
  SettingsCog,
} from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import type { LinkedPlayer, MotdSegment, PairedServer } from "./lib/api";
import { errorText } from "./lib/i18n";
import { enableNotifications, usePushState } from "./lib/notifications";
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

/** Says when this device doesn't get the server's notifications, with a button to turn them on if it can. */
export function NotificationsOff({ server }: { server: PairedServer }) {
  const { t } = useTranslation();
  const { state, refresh } = usePushState(server);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  if (state === null || state === "on") return null;

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      await enableNotifications(server);
    } catch (err) {
      setError(err as Error);
    }
    setBusy(false);
    refresh();
  }

  return (
    <div className="notice">
      <p className="warning">
        {state === "unsupported"
          ? t("push.unsupported")
          : state === "blocked"
            ? t("push.blocked")
            : t("push.notYet")}
      </p>
      {state === "off" && (
        <button className="button" onClick={turnOn} disabled={busy}>
          {busy ? t("push.turningOn") : t("push.turnOn")}
        </button>
      )}
      {error && <p className="error small">{errorText(error, t)}</p>}
    </div>
  );
}

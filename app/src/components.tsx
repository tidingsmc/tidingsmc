import { useEffect, useState, type ReactNode } from 'react';
import { BellRing, ChevronLeft, SettingsCog } from 'pixelarticons/react';
import type { LinkedPlayer, MotdSegment, PairedServer } from './lib/api';
import { BLOCKED_MESSAGE, UNSUPPORTED_MESSAGE, enableNotifications, usePushState } from './lib/notifications';
import { skinFace } from './lib/skin';
import type { OnlineState } from './lib/useOnline';
import { hashString, safeSkinUrl } from './lib/util';

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
  return (
    <>
      <header className="topbar">
        {back && (
          <a className="back" href={back} aria-label="Back">
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
  return (
    <a className="icon-button" href={href} aria-label="Settings">
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

export function Toggle({ label, description, checked, disabled, onChange }: ToggleProps) {
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

/** The player's face from their skin, or a colored letter until it loads or if there's no skin. */
export function Avatar({ name, skinUrl, size = 32 }: { name: string; skinUrl?: string; size?: number }) {
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
    return <img className="avatar skin" src={face.url} alt="" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size / 2, background: `hsl(${hashString(name) % 360} 45% 42%)` }}
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
export function ServerIcon({ name, icon, size = 48 }: { name: string; icon?: string; size?: number }) {
  const style = { width: size, height: size };
  if (icon?.startsWith('data:image/png;base64,')) {
    return <img className="server-icon" src={icon} alt="" style={style} />;
  }
  return (
    <span
      className="server-icon letter"
      style={{ ...style, background: `hsl(${hashString(name) % 360} 40% 38%)`, fontSize: size / 2 }}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

// Minecraft's chat colors.
const MC_COLORS: Record<string, string> = {
  black: '#000000',
  dark_blue: '#0000AA',
  dark_green: '#00AA00',
  dark_aqua: '#00AAAA',
  dark_red: '#AA0000',
  dark_purple: '#AA00AA',
  gold: '#FFAA00',
  gray: '#AAAAAA',
  dark_gray: '#555555',
  blue: '#5555FF',
  green: '#55FF55',
  aqua: '#55FFFF',
  red: '#FF5555',
  light_purple: '#FF55FF',
  yellow: '#FFFF55',
  white: '#FFFFFF',
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
            fontStyle: s.italic ? 'italic' : undefined,
            textDecoration: [s.underlined && 'underline', s.strikethrough && 'line-through'].filter(Boolean).join(' ') || undefined,
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
  return (
    <span className="linked-as">
      <Avatar name={player.name} skinUrl={player.skinUrl} size={16} />
      as {player.name}
    </span>
  );
}

/** Compact status for a server card, under its name: a dot and the player count. */
export function OnlineSummary({ state }: { state: OnlineState }) {
  if (state.status === 'loading') {
    return (
      <div className="status">
        <span className="status-line muted">Checking…</span>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="status">
        <span className="status-line">
          <span className="dot error" /> Unreachable
        </span>
      </div>
    );
  }
  const { players } = state.data;
  return (
    <div className="status">
      <span className="status-line">
        <span className={players.length > 0 ? 'dot ok' : 'dot'} />
        {players.length > 0 ? `${players.length} online` : 'Nobody online'}
      </span>
    </div>
  );
}

/** Says when this device doesn't get the server's notifications, with a button to turn them on if it can. */
export function NotificationsOff({ server }: { server: PairedServer }) {
  const { state, refresh } = usePushState(server);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state === null || state === 'on') return null;

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      await enableNotifications(server);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
    refresh();
  }

  return (
    <div className="notice">
      <p className="warning">
        {state === 'unsupported'
          ? UNSUPPORTED_MESSAGE
          : state === 'blocked'
            ? BLOCKED_MESSAGE
            : "This device doesn't get this server's notifications yet."}
      </p>
      {state === 'off' && (
        <button className="button" onClick={turnOn} disabled={busy}>
          {busy ? 'Turning on…' : 'Turn on notifications'}
        </button>
      )}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}

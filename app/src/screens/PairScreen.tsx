import { useState, type FormEvent } from 'react';
import { LinkedAs, Screen } from '../components';
import { api, normalizeServerUrl, usingMockApi, type PairedServer } from '../lib/api';
import { askPermission, subscribe } from '../lib/notifications';
import { paths } from '../lib/router';
import { defaultDeviceName, hostOf } from '../lib/util';

interface Props {
  /** Filled in when the app was opened from the in-game QR code. */
  initialUrl?: string;
  initialCode?: string;
  /** The servers this device is already paired with: at most one pairing per server. */
  servers: PairedServer[];
  onPaired: (server: PairedServer) => void;
}

/** The pairing this device already has with the server at `address`, if any. */
function pairedAt(servers: PairedServer[], address: string): PairedServer | undefined {
  try {
    const url = normalizeServerUrl(address);
    return servers.find((s) => s.url === url);
  } catch {
    return undefined;
  }
}

export function PairScreen({ initialUrl, initialCode, servers, onPaired }: Props) {
  const fromLink = Boolean(initialUrl && initialCode);
  const [address, setAddress] = useState(initialUrl ?? '');
  const [code, setCode] = useState(initialCode ?? '');
  const [deviceName, setDeviceName] = useState(defaultDeviceName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // From the QR code we can tell right away; a typed address is checked when submitting.
  const [alreadyPaired, setAlreadyPaired] = useState(() =>
    fromLink ? pairedAt(servers, initialUrl!) : undefined,
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const existing = pairedAt(servers, address);
    if (existing) {
      setAlreadyPaired(existing);
      return;
    }
    // Asked right away, while handling the tap: iPhones don't ask later. Pairing goes ahead either way.
    const notificationsAllowed = askPermission();
    setBusy(true);
    try {
      const url = normalizeServerUrl(address);
      const name = deviceName.trim() || defaultDeviceName();
      const res = await api.pair(url, code.trim(), name);
      // Same server under another address: the server ID is what identifies it.
      const sameServer = servers.find((s) => s.id === res.serverId);
      if (sameServer) {
        // Best effort: don't leave the pairing we just made dangling on the server.
        await api.unpair({ ...sameServer, url, token: res.token }).catch(() => {});
        setAlreadyPaired(sameServer);
        setBusy(false);
        return;
      }
      const server: PairedServer = {
        id: res.serverId,
        name: res.serverName,
        url,
        token: res.token,
        vapidPublicKey: res.vapidPublicKey,
        deviceName: name,
        pairedAt: Date.now(),
        player: res.player,
      };
      // Without it, the server screen says notifications are off and offers to turn them on.
      if (await notificationsAllowed) await subscribe(server).catch(() => {});
      onPaired(server);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (alreadyPaired) {
    return (
      <Screen title="Pair a server" back={paths.servers}>
        <p>
          This device is already paired with <strong>{alreadyPaired.name}</strong>:
        </p>
        <LinkedAs player={alreadyPaired.player} />
        <p className="muted">
          A device can only be paired once with each server. To pair it as someone else, leave{' '}
          {alreadyPaired.name} in its settings first, then pair again.
        </p>
        <a className="button" href={paths.settings(alreadyPaired.id)}>
          Open {alreadyPaired.name}'s settings
        </a>
      </Screen>
    );
  }

  return (
    <Screen title="Pair a server" back={paths.servers}>
      {fromLink ? (
        <p>
          Pair this device with <strong>{hostOf(initialUrl!)}</strong>?
        </p>
      ) : (
        <p className="muted">
          In Minecraft, run <code>/tidings pair</code> to get a code.
        </p>
      )}

      <form className="form" onSubmit={submit}>
        {!fromLink && (
          <>
            <label className="field">
              Server address
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="mc.example.com"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </label>
            <label className="field">
              Pairing code
              <input
                className="code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                required
              />
            </label>
          </>
        )}
        <label className="field">
          Name of this device
          <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} maxLength={40} />
        </label>

        {error && <p className="error">{error}</p>}

        <button className="button primary" disabled={busy}>
          {busy ? 'Pairing…' : 'Pair'}
        </button>
      </form>

      {usingMockApi && (
        <p className="muted small">
          Demo mode: any address and any 6-digit code work. <code>000000</code> is rejected, and an address
          containing "offline" acts unreachable.
        </p>
      )}
    </Screen>
  );
}

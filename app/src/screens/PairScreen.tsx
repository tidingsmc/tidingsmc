import { useState, type FormEvent } from "react";
import { Trans, useTranslation } from "react-i18next";
import { LinkedAs, Screen } from "../components";
import { api, normalizeServerUrl, type PairedServer } from "../lib/api";
import { errorText } from "../lib/i18n";
import { askPermission, subscribe } from "../lib/notifications";
import { parseRoute, paths } from "../lib/router";
import { defaultDeviceName, hostOf } from "../lib/util";
import { QrScanner } from "../qrScanner";

/** Camera access needs HTTPS (or localhost) and a browser that has it at all. */
const canScan = Boolean(navigator.mediaDevices?.getUserMedia);

interface Props {
  /** Filled in when the app was opened from the in-game QR code. */
  initialUrl?: string;
  initialCode?: string;
  /** The servers this device is already paired with: at most one pairing per server. */
  servers: PairedServer[];
  onPaired: (server: PairedServer) => void;
}

/** The pairing this device already has with the server at `address`, if any. */
function pairedAt(
  servers: PairedServer[],
  address: string,
): PairedServer | undefined {
  try {
    const url = normalizeServerUrl(address);
    return servers.find((s) => s.url === url);
  } catch {
    return undefined;
  }
}

export function PairScreen({
  initialUrl,
  initialCode,
  servers,
  onPaired,
}: Props) {
  const { t } = useTranslation();
  const [address, setAddress] = useState(initialUrl ?? "");
  const [code, setCode] = useState(initialCode ?? "");
  // Opened from the QR code with the phone's camera, or scanned here: address and code are known.
  const [fromLink, setFromLink] = useState(Boolean(initialUrl && initialCode));
  const [scanError, setScanError] = useState<string>();
  const [serverName, setServerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // From the QR code we can tell right away; a typed address is checked when submitting.
  const [alreadyPaired, setAlreadyPaired] = useState(() =>
    initialUrl && initialCode ? pairedAt(servers, initialUrl) : undefined,
  );

  /** The QR code holds the same pairing link the phone's camera app would open. */
  function scanned(text: string) {
    let route;
    try {
      route = parseRoute(new URL(text).hash);
    } catch {
      route = null;
    }
    if (route?.name !== "pair" || !route.url || !route.code) {
      setScanError(t("pair.notPairingQr"));
      return;
    }
    setScanError(undefined);
    setAddress(route.url);
    setCode(route.code);
    setFromLink(true);
    setAlreadyPaired(pairedAt(servers, route.url));
  }

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
      // Not asked: only a label the server could show in a device list, so the detected one will do.
      const deviceName = defaultDeviceName(t);
      const res = await api.pair(url, code.trim(), deviceName);
      // Same server under another address: the server ID is what identifies it.
      const sameServer = servers.find((s) => s.id === res.serverId);
      if (sameServer) {
        // Best effort: don't leave the pairing we just made dangling on the server.
        await api
          .unpair({ ...sameServer, url, token: res.token })
          .catch(() => {});
        setAlreadyPaired(sameServer);
        setBusy(false);
        return;
      }
      const server: PairedServer = {
        id: res.serverId,
        name: serverName.trim() || res.serverName,
        url,
        token: res.token,
        vapidPublicKey: res.vapidPublicKey,
        deviceName,
        pairedAt: Date.now(),
        player: res.player,
      };
      // Without it, the server list and settings say notifications are off and offer to turn them on.
      if (await notificationsAllowed) await subscribe(server).catch(() => {});
      onPaired(server);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  if (alreadyPaired) {
    return (
      <Screen title={t("pair.title")} back={paths.servers}>
        <p>
          <Trans
            i18nKey="pair.alreadyPaired"
            values={{ server: alreadyPaired.name }}
            components={{ strong: <strong /> }}
          />
        </p>
        <LinkedAs player={alreadyPaired.player} />
        <p className="muted">
          {t("pair.onlyOnce", { server: alreadyPaired.name })}
        </p>
        <a className="button" href={paths.settings(alreadyPaired.id)}>
          {t("pair.openSettings", { server: alreadyPaired.name })}
        </a>
      </Screen>
    );
  }

  return (
    <Screen title={t("pair.title")} back={paths.servers}>
      {fromLink ? (
        <p>
          <Trans
            i18nKey="pair.confirm"
            values={{ host: hostOf(address) }}
            components={{ strong: <strong /> }}
          />
        </p>
      ) : (
        <p className="muted">
          <Trans i18nKey="pair.howTo" components={{ code: <code /> }} />
        </p>
      )}

      <form className="form" onSubmit={submit}>
        <label className="field">
          {t("pair.serverName")}
          <input
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
            maxLength={40}
            required
          />
        </label>
        {!fromLink && canScan && (
          <>
            <QrScanner onScan={scanned} error={scanError} />
            <p className="or">{t("pair.or")}</p>
          </>
        )}
        {!fromLink && (
          <label className="field">
            {t("pair.address")}
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
        )}
        {!fromLink && (
          <label className="field">
            {t("pair.code")}
            <input
              className="code-input"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              required
            />
          </label>
        )}

        {error != null && <p className="error">{errorText(error, t)}</p>}

        <div className="bottom-bar">
          <button className="button primary" disabled={busy}>
            {busy ? t("pair.submitting") : t("pair.submit")}
          </button>
        </div>
      </form>
    </Screen>
  );
}

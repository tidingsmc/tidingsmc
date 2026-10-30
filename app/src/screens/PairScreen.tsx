import { Hourglass, Keyboard, QrCode } from "pixelarticons/react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import { LinkedAs, Screen } from "../components";
import {
  api,
  ApiError,
  normalizeServerUrl,
  type PairedServer,
} from "../lib/api";
import { errorText } from "../lib/i18n";
import { askPermission, subscribe } from "../lib/notifications";
import { parseRoute, paths, type PairStep } from "../lib/router";
import { defaultDeviceName, hostOf } from "../lib/util";
import { QrScanDialog } from "../qrScanner";

/** Camera access needs HTTPS (or localhost) and a browser that has it at all. */
const canScan = Boolean(navigator.mediaDevices?.getUserMedia);

type Field = "serverName" | "address" | "code";

interface Props {
  /** Scanning or typing a code; none to pick one. */
  step?: PairStep;
  /** Filled in when the app was opened from the in-game QR code. */
  initialUrl?: string;
  initialCode?: string;
  /** The servers this device is already paired with: at most one pairing per server. */
  servers: PairedServer[];
  /** Approved and named: pairing is done. Until then, leaving cancels it. */
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

/** Tells the server to forget the unfinished pairing in `unfinished`, if any. Best effort. */
function withdraw(unfinished: RefObject<PairedServer | undefined>) {
  const server = unfinished.current;
  unfinished.current = undefined;
  if (server) api.unpair(server).catch(() => {});
}

/**
 * A wizard: pick scanning or a code, scan or type it, name the server, then wait for the player
 * to approve this device in game. One trip back to the game, at the end.
 */
export function PairScreen({
  step,
  initialUrl,
  initialCode,
  servers,
  onPaired,
}: Props) {
  const { t } = useTranslation();
  const fromLink = Boolean(initialUrl && initialCode);
  // Without a camera, typing a code is the only way: no choice to make.
  const currentStep = step ?? (canScan ? undefined : "code");
  const [address, setAddress] = useState(initialUrl ?? "");
  const [code, setCode] = useState(initialCode ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Fields left empty or wrong, shown under each: the browser's own bubbles don't match the app.
  const [invalid, setInvalid] = useState<ReadonlySet<Field>>(new Set());
  const idPrefix = useId();
  const fieldId = (field: Field) => `${idPrefix}-${field}`;
  // The code worked: left to name the server, then the player approves this device in game.
  const [toName, setToName] = useState<PairedServer>();
  const [serverName, setServerName] = useState("");
  // Named: paired, but not until the player approves it in game.
  const [awaitingApproval, setAwaitingApproval] = useState<PairedServer>();
  const notificationsAllowed = useRef<Promise<boolean>>(Promise.resolve(false));
  // The pairing under way, waiting for approval or a name: cancelled if the player leaves.
  const unfinished = useRef<PairedServer>(undefined);
  // The step it started from: going back from there leaves it too.
  const pairingStep = useRef<PairStep>(undefined);
  // The parent's callback changes on each render; waiting for approval shouldn't start over.
  const onPairedRef = useRef(onPaired);
  useEffect(() => {
    onPairedRef.current = onPaired;
  });
  // From the QR code we can tell right away; a typed address is checked when submitting.
  const [alreadyPaired, setAlreadyPaired] = useState(() =>
    fromLink ? pairedAt(servers, initialUrl!) : undefined,
  );

  useEffect(() => {
    const server = awaitingApproval;
    if (!server) return;
    let stopped = false;
    (async () => {
      while (!stopped) {
        let approval;
        try {
          approval = await api.approval(server);
        } catch (err) {
          if (stopped) return;
          // Unreachable for a moment (no status), or the proxy in front of it is: keep waiting, the
          // server says when it's over.
          const blip =
            err instanceof ApiError &&
            (err.status === undefined ||
              err.status === 429 ||
              err.status >= 500);
          if (!blip) {
            // Or the player could still approve a device that no longer has its token.
            withdraw(unfinished);
            setAwaitingApproval(undefined);
            setError(err);
            return;
          }
          approval = "pending" as const;
        }
        if (stopped) return;
        if (approval === "approved") {
          unfinished.current = undefined;
          // Without it, the server list and settings say notifications are off and offer to turn them on.
          if (await notificationsAllowed.current)
            await subscribe(server).catch(() => {});
          onPairedRef.current(server);
          return;
        }
        if (approval !== "pending") {
          unfinished.current = undefined;
          setAwaitingApproval(undefined);
          setError(
            new ApiError((t) =>
              t(`pair.${approval}`, { player: server.player.name }),
            ),
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    })();
    return () => {
      stopped = true;
    };
  }, [awaitingApproval]);

  // Leaving the screen or the app, or going back a step, cancels a pairing not finished yet. Not
  // switching apps: that's how players get to the game to approve it.
  useEffect(() => {
    const onPageHide = () => withdraw(unfinished);
    addEventListener("pagehide", onPageHide);
    return () => {
      removeEventListener("pagehide", onPageHide);
      withdraw(unfinished);
    };
  }, []);
  useEffect(() => {
    if (!unfinished.current || step === pairingStep.current) return;
    cancel();
  }, [step]);

  function cancel() {
    withdraw(unfinished);
    setAwaitingApproval(undefined);
    setToName(undefined);
  }

  function scanned(text: string) {
    history.back();
    let route;
    try {
      route = parseRoute(new URL(text).hash);
    } catch {
      route = null;
    }
    if (route?.name !== "pair" || !route.url || !route.code) {
      setError(new ApiError((t) => t("pair.notPairingQr")));
      return;
    }
    navigator.vibrate?.(40);
    setAddress(route.url);
    setCode(route.code);
    pair(route.url, route.code, undefined);
  }

  function fixed(field: Field) {
    if (!invalid.has(field)) return;
    setInvalid((fields) => new Set([...fields].filter((f) => f !== field)));
  }

  function showProblems(problems: Set<Field>): boolean {
    setInvalid(problems);
    const first = (["serverName", "address", "code"] as const).find((f) =>
      problems.has(f),
    );
    if (first) document.getElementById(fieldId(first))?.focus();
    return !first;
  }

  function fieldError(field: Field, message: string) {
    return (
      invalid.has(field) && (
        <span
          id={`${fieldId(field)}-error`}
          className="error small field-error"
        >
          {message}
        </span>
      )
    );
  }

  function validation(field: Field) {
    return {
      id: fieldId(field),
      "aria-invalid": invalid.has(field),
      "aria-describedby": invalid.has(field)
        ? `${fieldId(field)}-error`
        : undefined,
    };
  }

  function submitCode(event: FormEvent) {
    event.preventDefault();
    const problems = new Set<Field>();
    if (!address.trim()) problems.add("address");
    if (!/^\d{6}$/.test(code)) problems.add("code");
    if (showProblems(problems)) pair(address, code, "code");
  }

  function submitLink(event: FormEvent) {
    event.preventDefault();
    pair(address, code, step);
  }

  async function pair(
    address: string,
    code: string,
    fromStep: PairStep | undefined,
  ) {
    setError(null);
    const existing = pairedAt(servers, address);
    if (existing) {
      setAlreadyPaired(existing);
      return;
    }
    notificationsAllowed.current = askPermission();
    setBusy(true);
    try {
      const url = normalizeServerUrl(address);
      const deviceName = await defaultDeviceName(t);
      const res = await api.pair(url, code.trim(), deviceName);
      const sameServer = servers.find((s) => s.id === res.serverId);
      if (sameServer) {
        await api
          .unpair({ ...sameServer, url, token: res.token })
          .catch(() => {});
        setAlreadyPaired(sameServer);
        return;
      }
      // The name the owner chose, if any; otherwise the player names it.
      setServerName(res.serverName ?? "");
      const server: PairedServer = {
        id: res.serverId,
        name: res.serverName ?? "",
        url,
        token: res.token,
        vapidPublicKey: res.vapidPublicKey,
        deviceName,
        pairedAt: Date.now(),
        player: res.player,
      };
      unfinished.current = server;
      pairingStep.current = fromStep;
      setToName(server);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function askApproval(event: FormEvent) {
    event.preventDefault();
    const problems = new Set<Field>();
    if (!serverName.trim()) problems.add("serverName");
    if (!showProblems(problems)) return;
    const server = { ...toName!, name: serverName.trim() };
    setError(null);
    setBusy(true);
    try {
      await api.askApproval(server);
      setToName(undefined);
      setAwaitingApproval(server);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const errorLine = error != null && (
    <p className="error">{errorText(error, t)}</p>
  );

  if (toName && !busy) {
    return (
      <Screen title={t("pair.title")} back={paths.servers}>
        <div className="centered">
          <p>
            <Trans
              i18nKey="pair.pairingWith"
              values={{ host: hostOf(toName.url) }}
              components={{ strong: <strong /> }}
            />
          </p>
          <LinkedAs player={toName.player} />
          <form className="form" onSubmit={askApproval} noValidate>
            <section className="section form-section">
              <h2 id={`${idPrefix}-name-heading`}>{t("pair.serverName")}</h2>
              <div className="field">
                <input
                  {...validation("serverName")}
                  aria-labelledby={`${idPrefix}-name-heading`}
                  value={serverName}
                  onChange={(e) => {
                    setServerName(e.target.value);
                    fixed("serverName");
                  }}
                  maxLength={40}
                  required
                />
                {fieldError("serverName", t("pair.missingName"))}
              </div>
            </section>
            <div className="bottom-bar">
              <button className="button primary">{t("pair.submit")}</button>
            </div>
          </form>
        </div>
      </Screen>
    );
  }

  if (awaitingApproval || busy) {
    return (
      <Screen title={t("pair.title")} back={paths.servers}>
        <div className="centered">
          {awaitingApproval && (
            <>
              <p>
                <Trans
                  i18nKey="pair.approveInGame"
                  values={{ server: hostOf(awaitingApproval.url) }}
                  components={{ strong: <strong /> }}
                />
              </p>
              <LinkedAs player={awaitingApproval.player} />
            </>
          )}
          <div className="waiting-box" role="status">
            <Hourglass width={48} height={48} aria-hidden />
            <strong>
              {awaitingApproval
                ? t("pair.waitingForApproval")
                : t("pair.submitting")}
            </strong>
            {awaitingApproval && (
              <span className="muted small">
                <Trans
                  i18nKey="pair.approveHelp"
                  components={{ code: <code /> }}
                />
              </span>
            )}
          </div>
          {awaitingApproval && (
            <div className="bottom-bar">
              <button type="button" className="button" onClick={cancel}>
                {t("common.cancel")}
              </button>
            </div>
          )}
        </div>
      </Screen>
    );
  }

  if (alreadyPaired) {
    return (
      <Screen title={t("pair.title")} back={paths.servers}>
        <div className="centered">
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
        </div>
      </Screen>
    );
  }

  if (fromLink) {
    return (
      <Screen title={t("pair.title")} back={paths.servers}>
        <div className="centered">
          <form className="form" onSubmit={submitLink}>
            <p>
              <Trans
                i18nKey="pair.confirm"
                values={{ host: hostOf(address) }}
                components={{ strong: <strong /> }}
              />
            </p>
            {errorLine}
            <div className="bottom-bar">
              <button className="button primary">{t("pair.next")}</button>
            </div>
          </form>
        </div>
      </Screen>
    );
  }

  if (currentStep === "code") {
    return (
      <Screen
        title={t("pair.title")}
        back={canScan ? paths.pair : paths.servers}
      >
        <p className="muted">
          <Trans i18nKey="pair.codeHowTo" components={{ code: <code /> }} />
        </p>
        <form className="form" onSubmit={submitCode} noValidate>
          <label className="field">
            {t("pair.address")}
            <input
              {...validation("address")}
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                fixed("address");
              }}
              placeholder="mc.example.com"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
            {fieldError("address", t("pair.missingAddress"))}
          </label>
          <label className="field">
            {t("pair.code")}
            <input
              {...validation("code")}
              className="code-input"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                fixed("code");
              }}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              required
            />
            {fieldError("code", t("pair.missingCode"))}
          </label>
          {errorLine}
          <div className="bottom-bar">
            <button className="button primary">{t("pair.next")}</button>
          </div>
        </form>
      </Screen>
    );
  }

  return (
    <Screen title={t("pair.title")} back={paths.servers}>
      <p className="muted">
        <Trans i18nKey="pair.howTo" components={{ code: <code /> }} />
      </p>
      <div className="centered on-screen">
        <div className="pair-options">
          <a
            className="pair-option"
            href={paths.pairStep("scan")}
            onClick={() => setError(null)}
          >
            <QrCode width={40} height={40} aria-hidden />
            <strong>{t("pair.scan")}</strong>
          </a>
          <p className="or">{t("pair.or")}</p>
          <a
            className="pair-option"
            href={paths.pairStep("code")}
            onClick={() => setError(null)}
          >
            <Keyboard width={40} height={40} aria-hidden />
            <strong>{t("pair.useCode")}</strong>
          </a>
          {errorLine}
        </div>
        <QrScanDialog
          open={currentStep === "scan"}
          onScan={scanned}
          onCameraProblem={(problem) => {
            history.back();
            setError(new ApiError((t) => t(`pair.${problem}`)));
          }}
          onClose={() => history.back()}
        />
      </div>
    </Screen>
  );
}

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
import { useWide } from "../lib/useWide";
import { defaultDeviceName, hostOf } from "../lib/util";
import { QrScanDialog } from "../qrScanner";

const canScan = Boolean(navigator.mediaDevices?.getUserMedia);

type Field = "serverName" | "address" | "code";

interface Props {
  step?: PairStep;
  initialUrl?: string;
  initialCode?: string;
  servers: PairedServer[];
  onPaired: (server: PairedServer) => void;
}

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

function withdraw(unfinished: RefObject<PairedServer | undefined>) {
  const server = unfinished.current;
  unfinished.current = undefined;
  if (server) api.unpair(server).catch(() => {});
}

export function PairScreen({
  step,
  initialUrl,
  initialCode,
  servers,
  onPaired,
}: Props) {
  const { t } = useTranslation();
  const fromLink = Boolean(initialUrl && initialCode);
  const wide = useWide();
  const scan = canScan && !wide;
  const currentStep = scan ? step : "code";

  const [address, setAddress] = useState(initialUrl ?? "");
  const [code, setCode] = useState(initialCode ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [invalid, setInvalid] = useState<ReadonlySet<Field>>(new Set());
  const idPrefix = useId();

  const fieldId = (field: Field) => `${idPrefix}-${field}`;

  const [toName, setToName] = useState<PairedServer>();
  const [serverName, setServerName] = useState("");
  const [awaitingApproval, setAwaitingApproval] = useState<PairedServer>();
  const notificationsAllowed = useRef<Promise<boolean>>(Promise.resolve(false));
  const unfinished = useRef<PairedServer>(undefined);
  const pairingStep = useRef<PairStep>(undefined);
  const onPairedRef = useRef(onPaired);

  useEffect(() => {
    onPairedRef.current = onPaired;
  });

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
          // Unreachable
          const blip =
            err instanceof ApiError &&
            (err.status === undefined ||
              err.status === 429 ||
              err.status >= 500);
          if (!blip) {
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
      <Screen title={t("pair.title")} back={paths.servers} narrow centered>
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
      <Screen title={t("pair.title")} back={paths.servers} narrow centered>
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
      <Screen title={t("pair.title")} back={paths.servers} narrow centered>
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
      <Screen title={t("pair.title")} back={paths.servers} narrow centered>
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
        back={scan ? paths.pair : paths.servers}
        narrow
        centered
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
    <Screen title={t("pair.title")} back={paths.servers} narrow centered>
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

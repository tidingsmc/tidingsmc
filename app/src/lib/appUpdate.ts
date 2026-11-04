import { useEffect, useState } from "react";
import { whenVisible } from "./whenVisible";

const CHECK_EVERY_MS = 10 * 60_000;

export async function deployedVersion(): Promise<string | undefined> {
  try {
    const res = await fetch("./version.json", { cache: "no-store" });
    if (!res.ok) return undefined;
    const { version } = await res.json();
    return typeof version === "string" ? version : undefined;
  } catch {
    return undefined;
  }
}

export function useUpdateAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD || available) return;
    let lastCheck = Date.now();
    const check = () => {
      if (Date.now() - lastCheck < CHECK_EVERY_MS) return;
      lastCheck = Date.now();
      void deployedVersion().then((version) => {
        if (version && version !== __APP_VERSION__) setAvailable(true);
      });
    };
    const stop = whenVisible(check);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") check();
    }, CHECK_EVERY_MS);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [available]);

  return available;
}

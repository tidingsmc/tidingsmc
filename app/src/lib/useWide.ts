import { useSyncExternalStore } from "react";

const WIDE = "(min-width: 900px)";

function subscribe(onChange: () => void) {
  const query = matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useWide(): boolean {
  return useSyncExternalStore(subscribe, () => matchMedia(WIDE).matches);
}

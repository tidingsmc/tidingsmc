/** Runs `run` now and whenever the app comes back to the foreground or the device back online, while visible */
export function whenVisible(run: () => void): () => void {
  const runIfVisible = () => {
    if (document.visibilityState === "visible") run();
  };
  runIfVisible();
  document.addEventListener("visibilitychange", runIfVisible);
  window.addEventListener("online", runIfVisible);
  return () => {
    document.removeEventListener("visibilitychange", runIfVisible);
    window.removeEventListener("online", runIfVisible);
  };
}

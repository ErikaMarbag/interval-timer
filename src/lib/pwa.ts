export function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return;
  void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
    /* silencioso */
  });
}

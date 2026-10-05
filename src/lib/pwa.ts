// Single guarded service-worker registrar. Never registers in dev / preview / iframe.
import { isDesktop } from "./platform";
export async function setupPwa() {
  if (isDesktop()) return;
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const h = location.hostname;
  let inIframe = true;
  try {
    inIframe = window.self !== window.top;
  } catch {
    /* cross-origin */
  }
  const refused =
    !import.meta.env.PROD ||
    inIframe ||
    h.startsWith("id-preview--") ||
    h.startsWith("preview--") ||
    new URLSearchParams(location.search).get("sw") === "off";
  if (refused) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => (r.active ?? r.installing ?? r.waiting)?.scriptURL.endsWith("/sw.js"))
        .map((r) => r.unregister()),
    );
    return;
  }
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
}

type WakeLockSentinelLike = { released: boolean; release: () => Promise<void> };
type WakeLockLike = { request: (type: "screen") => Promise<WakeLockSentinelLike> };

let sentinel: WakeLockSentinelLike | null = null;

function api(): WakeLockLike | null {
  if (typeof navigator === "undefined") return null;
  const wl = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
  return wl ?? null;
}

export function wakeLockSupported() {
  return api() !== null;
}

export async function requestWakeLock() {
  const wl = api();
  if (!wl) return;
  try {
    if (sentinel && !sentinel.released) return;
    sentinel = await wl.request("screen");
  } catch {
    sentinel = null;
  }
}

export async function releaseWakeLock() {
  try {
    if (sentinel && !sentinel.released) await sentinel.release();
  } catch {
    /* silencioso */
  }
  sentinel = null;
}

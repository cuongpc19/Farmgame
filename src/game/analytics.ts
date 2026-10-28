/**
 * Google Analytics 4, the way the sibling games send it (Pixel Flow, Marble Sort, Seat Jam; user
 * 2026-10-20). It feeds the Firebase console's Analytics screens: users in the last 30 minutes,
 * countries, daily users, retention, engagement time. Per-quest progress is NOT read from here but
 * from the Realtime Database (`telemetry.ts`, ANALYTICS.md): GA samples, lags 24-48 h in reports
 * and cannot hand back single rows.
 *
 * ⚠ gtag.js, not the Firebase SDK: firebase-app + firebase-analytics would put ~31 KB (gzip) into
 *   the bundle and then load the same 145 KB gtag.js anyway. Same GA4 stream, same measurement id.
 * ⚠ Loaded a few seconds AFTER the game is playable (`startAnalytics` from `telemetry.teleStart`), never on the
 *   boot path: CrazyGames grades time-to-gameplay.
 * ⚠ `gtag` must push `arguments`, not an array: gtag.js drops a real array without a word (that
 *   made Pixel Flow's first GA build send nothing). Hence a plain `function`, never an arrow.
 * ⚠ An adblocker or the host's CSP may refuse the script. Nothing here may throw because of it;
 *   `gaLoaded()` rides along in the telemetry beats so a blank GA can be told from a broken one.
 * ⚠ Test runs and dev machines never load it (`telemetry.isTestRun`, passed in): every dev reload
 *   would be a "new user".
 *   `?ga=log` keeps the calls in `window.dataLayer` without loading the script (headless checks).
 */
// Candy Miner (like Mars Miner, 2026-10-28): empty until it has its own GA4 property (G-5SBXQR5X6G is Quarry Crush's).
const GA_ID = "";

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

let started = false;
let loaded = false;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gtag(..._args: unknown[]): void {
  try {
    (window.dataLayer ??= []).push(arguments);
  } catch {
    /* no window */
  }
}

function mode(test: boolean): "on" | "log" | "off" {
  let q: string | null = null;
  try {
    q = new URLSearchParams(location.search).get("ga");
  } catch {
    /* no location */
  }
  if (q === "log") return "log";
  if (q === "0" || test) return "off";
  return "on";
}

/** Bring GA up (`test`: a dev machine or an automated run, which never loads it). Only the first call counts. */
export function startAnalytics(test: boolean): void {
  if (started) return;
  const m = mode(test);
  if (m === "off" || !GA_ID) return;
  started = true;
  try {
    gtag("js", new Date());
    // `beacon` so the last event still leaves when the tab closes.
    gtag("config", GA_ID, { transport_type: "beacon" });
    if (m === "log") return;
    const el = document.createElement("script");
    el.async = true;
    el.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    el.onload = () => (loaded = true);
    document.head.appendChild(el);
  } catch {
    /* no GA this session; the database still gets its rows */
  }
}

/** Did gtag.js actually arrive (adblock / CSP say no)? */
export function gaLoaded(): boolean {
  return loaded;
}

/** One event. Safe before the script lands: dataLayer queues it. Never throws. */
export function track(name: string, params: Record<string, unknown> = {}): void {
  if (!started) return;
  gtag("event", name, params);
}

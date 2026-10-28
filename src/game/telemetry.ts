import { S, markDirty, stageNumber } from "./state";
import { WORKER_PROFILES } from "./data";
import { BUILD_VERSION, getSetting } from "./settings";
import { events } from "./systems/Events";
import { platform } from "../platform";
import { gaLoaded, startAnalytics, track } from "./analytics";

/**
 * Play telemetry (user, 2026-10-20: "I need to see how far players get"). Rows go to the Realtime
 * Database of this game's own Firebase project (`.firebaserc`), node `/qc`, and are read on
 * `https://<project>.web.app/stats.html` (`site/stats.html`). Everything about reading them: ANALYTICS.md.
 *
 * One plain `fetch` per row (the database takes raw JSON over REST): no SDK in the bundle.
 * Fire and forget: nothing awaits a write, and a failed or blocked one is simply lost.
 *
 * Every row is a snapshot (stage, stage progress, quests done, cash, play time), so the furthest
 * point a player reached can be read from ANY of their rows, whatever window the dashboard loads.
 *
 * ⚠ The rules (`database.rules.json`) refuse unknown fields and unknown `ev` values, in silence.
 *   A new field or event needs `npx firebase-tools deploy --only database` BEFORE the build ships.
 * ⚠ `src/privacy.html` lists every field sent. Add one here and update that page the same day.
 * ⚠ `?tele=` does nothing on the claude.ai artifact (it never sees the query string).
 */

/**
 * The database. ⚠ The region is in the hostname (Singapore here); a database made elsewhere answers
 * on another one. The same URL is in `site/stats.html` (it cannot import this file): change both.
 * Empty = nothing is sent.
 */
// Candy Miner (2026-10-28, like Mars Miner): empty until its own Firebase project exists; Quarry Crush's `querry-crush` must not get its rows.
const DB = "";
const ENDPOINT = `${DB}/cm.json`;

/**
 * A test run: scripts/shot.mjs always adds `?gfx=` (and its Chrome does NOT report
 * `navigator.webdriver`), a host's QA bot usually does. Sends nothing unless `?tele=1`; rows sent
 * anyway carry `bot: 1`.
 */
const BOT = (() => {
  try {
    return navigator.webdriver || new URLSearchParams(location.search).has("gfx");
  } catch {
    return false;
  }
})();

/** `1` sends, `0` sends nothing, `log` keeps rows in `window.__tele` (headless checks). */
const MODE = (() => {
  let q: string | null = null;
  try {
    q = new URLSearchParams(location.search).get("tele");
  } catch {
    /* no location */
  }
  if (q === "log" || q === "0") return q;
  if (!DB) return "0";
  if (q === "1") return q;
  // Test runs would fill the table with fake players.
  return BOT ? "0" : "1";
})();

/** Rows per page load, at most: a bug that fires an event every frame must not flood the database. */
const MAX_ROWS = 400;
/** Play time only counts while someone is there: a touch or a key in the last 2 minutes. */
const IDLE_MS = 120_000;
/** Back after this long away (tab hidden, or a reload) = a new session. */
const SESSION_GAP_MS = 30 * 60_000;
/** First beat after 1 minute of visible play ("played over a minute"), then every 5 minutes. */
const BEAT_FIRST = 60;
const BEAT_EVERY = 300;

const BUILD = `${BUILD_VERSION}-${__BUILD__}`;

/**
 * The device code: random, made once per browser. ⚠ Outside the save (no `mm_` prefix): a
 * progress reset keeps it and the CrazyGames cloud save never carries it to another device.
 * `n` counts sessions on this device, `first` is when it was made (retention needs both).
 */
interface DeviceRec {
  id: string;
  first: number;
  n: number;
}
const DEVICE_KEY = "cm.device";

/** The session lives in sessionStorage, so the reload of a stage change or a reset continues it. */
interface SessionRec {
  id: string;
  t0: number;
  last: number;
}
const SESSION_KEY = "cm.session";

function code(n: number): string {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  const r = new Uint8Array(n);
  try {
    crypto.getRandomValues(r);
  } catch {
    for (let i = 0; i < n; i++) r[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < n; i++) s += abc[r[i] % abc.length];
  return s;
}

function readJson<T>(store: () => Storage, key: string): T | null {
  try {
    return JSON.parse(store().getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}
function writeJson(store: () => Storage, key: string, v: unknown): void {
  try {
    store().setItem(key, JSON.stringify(v));
  } catch {
    /* blocked storage: the codes just won't survive a reload */
  }
}
const local = () => localStorage;
const sess = () => sessionStorage;

const device: DeviceRec = (() => {
  const d = readJson<DeviceRec>(local, DEVICE_KEY);
  return d && typeof d.id === "string" && typeof d.first === "number" ? { id: d.id, first: d.first, n: d.n | 0 } : { id: code(10), first: Date.now(), n: 0 };
})();
let session: SessionRec = { id: "", t0: 0, last: 0 };

function newSession(): void {
  session = { id: code(8), t0: Date.now(), last: Date.now() };
  device.n++;
  writeJson(local, DEVICE_KEY, device);
  writeJson(sess, SESSION_KEY, session);
}
function touchSession(): void {
  session.last = Date.now();
  writeJson(sess, SESSION_KEY, session);
}

/** The device code shown on the privacy page (so a player can ask for their rows, and we can hide ours). */
export function deviceCode(): string {
  return device.id;
}

let progress: () => number = () => 0;
let rows = 0;
let started = false;
let bootFailed = false;

function hostname(): string {
  try {
    return (location.hostname || "?").slice(0, 64);
  } catch {
    return "?";
  }
}

/** Dev machines and tunnels: the same list the dashboard hides (site/stats.html TEST_HOST). */
const TEST_HOST = /^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1|\?$)|\.local$|trycloudflare\.com|claudeusercontent|claude\.ai|claude\.site/;

/** An automated run or a dev machine: rows still go out (filtered on read), Google Analytics never loads. */
export function isTestRun(): boolean {
  return BOT || TEST_HOST.test(hostname());
}

/** What every row carries: where the player is now. */
function snapshot(): Record<string, number | string> {
  let pct = 0;
  let st = 0;
  try {
    st = stageNumber();
    pct = Math.round(progress() * 10) / 10;
  } catch {
    /* the game is not up (boot failure) */
  }
  if (!S.sid) {
    S.sid = code(10);
    markDirty();
  }
  return {
    sid: S.sid,
    st,
    pct,
    qi: S.quest.index,
    cash: Math.floor(S.cash),
    pl: Math.round(S.played ?? 0),
    ss: session.t0 ? Math.round((Date.now() - session.t0) / 1000) : 0,
  };
}

function send(ev: string, extra: Record<string, unknown> = {}): void {
  if (MODE === "0" || rows >= MAX_ROWS) return;
  rows++;
  const row: Record<string, unknown> = {
    ev,
    dev: device.id,
    first: device.first,
    n: device.n,
    ses: session.id || "-",
    ...snapshot(),
    ...extra,
    build: BUILD,
    host: platform.name,
    from: hostname(),
    // The server's clock, not the player's: one time base for every row.
    at: { ".sv": "timestamp" },
  };
  if (BOT) row.bot = 1;
  if (MODE === "log") {
    const w = window as unknown as { __tele?: Record<string, unknown>[] };
    (w.__tele ??= []).push(row);
    return;
  }
  try {
    // No Content-Type header: text/plain keeps this a "simple" request with no CORS preflight,
    // which a `keepalive` send from a closing tab may not live long enough to finish.
    void fetch(ENDPOINT, { method: "POST", body: JSON.stringify(row), keepalive: true }).catch(() => undefined);
  } catch {
    /* no fetch: lose the row */
  }
}

/**
 * What the game was doing since the last report (user 2026-10-21: players stall on quest 26,
 * "clear 40 %", and the rows could not say why). `beat` and `hide` rows carry it, then it starts
 * over. Seconds count while the tab is visible (`tw`; `ta` = with a touch or key in the last 2 min).
 *   bp / bv / bw   blocks broken by the player on foot / a machine / the crew
 *   tv / td / tf   seconds driving a machine / driving on an empty tank / with a full back or machine
 *   tb             seconds pushing the wheelbarrow (not in tv since 2026-10-22)
 *   wk / wi / wr   worker-seconds blocked on the way / with no block or chunk to go to / tired or resting
 * plus, when sent: wn / wm crew size / miners, fr blocks with an open side you can stand at,
 * hb / hv median hits to break one of those with the player's hand tool / the machine (0 = none).
 */
export interface WorkProbe {
  /** Every counted frame. */
  frame(): { driving: boolean; barrow: boolean; dry: boolean; full: boolean; blocked: number; idle: number; rest: number };
  /** When a report goes out. */
  face(): { wn: number; wm: number; fr: number; hb: number; hv: number };
}
const work = { tw: 0, ta: 0, bp: 0, bv: 0, bw: 0, tv: 0, tb: 0, td: 0, tf: 0, wk: 0, wi: 0, wr: 0 };
let probe: WorkProbe | null = null;

/** Game, as a block breaks: who broke it. */
export function teleBroke(by: "bp" | "bv" | "bw"): void {
  work[by]++;
}

function workReport(): Record<string, number> {
  const r: Record<string, number> = {};
  for (const k of Object.keys(work) as (keyof typeof work)[]) {
    r[k] = Math.round(work[k]);
    work[k] = 0;
  }
  try {
    if (probe) Object.assign(r, probe.face());
  } catch {
    /* a broken probe must not cost the row */
  }
  return r;
}

/* ---------- boot: before the game exists ---------- */

let errors = 0;
function reportError(msg: string): void {
  if (errors >= 3 || !msg) return;
  errors++;
  send("err", { msg: msg.slice(0, 200) });
}

/**
 * First thing boot.ts does (after the platform is up): the session, and the error listeners, so
 * a game that never starts (no WebGL, a model that fails to parse) still says so.
 */
export function teleBoot(): void {
  const prev = readJson<SessionRec>(sess, SESSION_KEY);
  if (prev && typeof prev.id === "string" && Date.now() - prev.last < SESSION_GAP_MS) {
    session = prev;
    touchSession();
  } else newSession();
  window.addEventListener("error", (e) => {
    const where = e.filename ? ` @${e.filename.split("/").pop()}:${e.lineno}` : "";
    reportError(`${e.message}${where}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { message?: string } | undefined;
    reportError(`promise: ${r?.message ?? String(e.reason)}`);
  });
}

/** boot.ts: the game could not start. */
export function teleFail(msg: string): void {
  bootFailed = true;
  send("fail", { msg: msg.slice(0, 200), boot: Math.round(performance.now()) });
}

/* ---------- the game is up ---------- */

let lastInput = 0;
let visible = 0;
let nextBeat = BEAT_FIRST;
let fpsT = 0;
let fpsN = 0;
let hidden = false;

function openRow(): void {
  let tz = "";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    /* old browser */
  }
  send("open", {
    boot: Math.round(performance.now()),
    lang: (navigator.language || "").slice(0, 16),
    tz: tz.slice(0, 40),
    mob: matchMedia("(pointer: coarse)").matches ? 1 : 0,
    land: innerWidth > innerHeight ? 1 : 0,
    pm: getSetting("perfMode") ? 1 : 0,
  });
}

/** boot.ts, once the Game is built: the `open` row, then beats, quests, purchases and hides. */
export function teleStart(getProgress: () => number, workProbe?: WorkProbe): void {
  if (started || bootFailed) return;
  started = true;
  progress = getProgress;
  probe = workProbe ?? null;
  lastInput = performance.now();
  for (const t of ["pointerdown", "keydown", "touchstart", "wheel"])
    window.addEventListener(t, () => (lastInput = performance.now()), { capture: true, passive: true });
  openRow();
  // Google Analytics a few seconds into play, never on the boot path (analytics.ts).
  setTimeout(() => {
    startAnalytics(isTestRun());
    const st = stageNumber();
    track("level_start", { level: st, level_name: `Stage ${st}` });
  }, 4000);

  events.on("questDone", (e) => {
    send("quest", { qid: e.id, qt: e.text.slice(0, 60) });
    track("quest_complete", { quest_id: e.id, quest_index: e.index + 1, stage: stageNumber() });
  });
  events.on("stageCleared", (e) => {
    send("clear", { cl: e.stage });
    track("level_end", { level: e.stage, level_name: `Stage ${e.stage}`, success: true });
  });
  events.on("statUpgraded", (e) => send("buy", { kind: "up", key: e.key, lv: e.level }));
  events.on("lightEquipPurchased", (e) => send("buy", { kind: "tool", key: e.key }));
  events.on("heavyEquipRented", (e) => send("buy", { kind: "rent", key: e.key }));
  events.on("workerHired", (e) => {
    const p = WORKER_PROFILES.find((w) => w.id === e.profile);
    send("buy", { kind: "hire", key: p ? `${p.role}${p.tier}` : String(e.profile) });
  });
  events.on("managementUpgraded", (e) => send("buy", { kind: "hq", key: String(e.node) }));
  // `seen` (user 2026-10-22: a player sat on "Rent a Heavy Machine" for an hour with the cash for it,
  // and the rows could not say whether they ever went in): entering / leaving a building, the EQUIPMENT
  // list, an item card in the walk-in shop. Once per key per quest per page load (the row's `qi` says which).
  const seen = new Set<string>();
  const look = (key: string) => {
    const k = `${key}@${S.quest.index}`;
    if (seen.has(k)) return;
    seen.add(k);
    send("seen", { key });
  };
  events.on("buildingEntered", (e) => look(`building:${e.building}`));
  events.on("buildingLeft", (e) => look(`left:${e.building}`));
  events.on("panelOpened", (e) => look(`panel:${e.panel}`));
  events.on("shopCardShown", (e) => look(`card:${e.key}`));
  // Boost and gift offers: shown (once per page load) and taken (every time).
  events.on("boostOffered", (e) => look(`offer:${e.key}`));
  events.on("boostTaken", (e) => send("buy", { kind: "boost", key: e.key }));

  const hide = () => {
    if (hidden) return;
    hidden = true;
    touchSession();
    send("hide", workReport());
  };
  // pagehide catches iOS closing a tab and the reloads of a stage change; visibilitychange is
  // the net for Android, where switching apps fires no pagehide.
  window.addEventListener("pagehide", hide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") return hide();
    hidden = false;
    // A tab left in the background for half an hour and picked up again is a new visit.
    if (Date.now() - session.last > SESSION_GAP_MS) {
      newSession();
      visible = 0;
      nextBeat = BEAT_FIRST;
      openRow();
    } else touchSession();
  });
}

/**
 * Game.frame, every drawn frame: `real` seconds since the last one, `playing` = no menu, sheet or
 * dialogue up. Counts play time into the save, the visible time for beats, and the frame rate.
 */
export function teleFrame(real: number, playing: boolean): void {
  if (!started || document.hidden || real > 0.5) return;
  const active = performance.now() - lastInput < IDLE_MS;
  if (active) S.played = (S.played ?? 0) + real;
  work.tw += real;
  if (active) work.ta += real;
  if (probe) {
    try {
      const f = probe.frame();
      if (f.driving) work.tv += real;
      if (f.barrow) work.tb += real;
      if (f.driving && f.dry) work.td += real;
      if (f.full) work.tf += real;
      work.wk += f.blocked * real;
      work.wi += f.idle * real;
      work.wr += f.rest * real;
    } catch {
      /* never break the frame */
    }
  }
  if (playing) {
    fpsT += real;
    fpsN++;
  }
  visible += real;
  if (visible < nextBeat) return;
  nextBeat += BEAT_EVERY;
  touchSession();
  // `ga`: did gtag.js arrive (0 = blocked by an adblocker or the host, or a test run).
  const pm = getSetting("perfMode") ? 1 : 0;
  const ga = gaLoaded() ? 1 : 0;
  send("beat", { ...(fpsT > 5 ? { fps: Math.round(fpsN / fpsT) } : {}), pm, ga, ...workReport() });
  fpsT = 0;
  fpsN = 0;
}

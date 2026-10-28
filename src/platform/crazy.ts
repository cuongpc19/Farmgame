// CrazyGames. Loaded only by the `crazy` build (see index.ts). Ported from Ring Twist's
// `src/platform_crazy.js` (2026-10-18), the version that passed the portal's SDK detection.
// Every ⚠ below is a bug that was paid for once in a sibling game; none of them is theoretical.
//
// ⚠ Everything here has to survive the SDK never arriving. An adblocker that blocks
// `crazygames-sdk-v3.js` fires no `onerror`, so waiting on it without a timeout parks that whole
// class of player on the boot screen forever. init() owns its timeout and resolves either way;
// every method no-ops while `sdk` is null.

import { localStore, muteParam, type Platform, type PlatformStorage } from "./base";

/**
 * Boot budget. The host preloads the player's cloud save during init(); past this the game boots
 * on local data and the SDK is adopted later (see adoptLate).
 */
const INIT_TIMEOUT_MS = 2500;
/**
 * Budget for fetching the script alone, inside INIT_TIMEOUT_MS. Needed on top of onerror: an
 * adblocked request can hang without firing either handler. Measured from Vietnam: 7.9 s cold,
 * 1.0-1.4 s warm.
 */
const LOAD_TIMEOUT_MS = 2000;
/**
 * Their script. The crazy build also puts an ASYNC tag for it in <head> (vite.config.ts), so the
 * download starts with the page; loadSdkScript waits on that tag and only adds one if missing.
 * ⚠ Never a blocking tag: a slow answer from this host would stop the parser and the game.
 * The platform hosts the file and forbids bundling it.
 */
const SDK_URL = "https://sdk.crazygames.com/crazygames-sdk-v3.js";

type Sdk = {
  init(): Promise<void>;
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    happytime(): void;
    settings?: { muteAudio?: boolean };
    addSettingsChangeListener?(cb: (s: { muteAudio?: boolean }) => void): void;
  };
  data: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
  user?: { systemInfo?: { locale?: string } };
  ad: {
    requestAd(type: "rewarded" | "midgame", cb: { adStarted?(): void; adFinished?(): void; adError?(e: unknown): void }): void;
  };
};
type Win = { CrazyGames?: { SDK?: Sdk } };

let sdk: Sdk | null = null;
/**
 * The host's cloud save is used only when the SDK was live BEFORE the game read its save. An SDK
 * that turns up later gets the events and the ads; data syncs only if this device is newer.
 */
let sdkData = false;
/** In play right now, so an SDK that arrives late can be told at once. */
let playing = false;
/**
 * ⚠ The game calls loadingStart() before init() has finished. Remembered and replayed the moment
 * the SDK is live, or the host sees a loadingStop with no start.
 */
let loading = false;
let muted = false;
let mutedSeeded = false;
const muteListeners: ((m: boolean) => void)[] = [];

function loadSdkScript(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    try {
      if ((window as unknown as Win).CrazyGames) return done(true); // the <head> tag was quick
      let el = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
      if (!el) {
        el = document.createElement("script");
        el.src = SDK_URL;
        el.async = true;
        document.head.appendChild(el);
      }
      el.addEventListener("load", () => done(true));
      el.addEventListener("error", () => done(false));
      setTimeout(() => done(false), LOAD_TIMEOUT_MS);
    } catch {
      done(false);
    }
  });
}

/** ⚠ Seeded lazily from `?muteAudio=true` (their QA flag); an explicit SDK value outranks it. */
function seedMuted(): void {
  if (mutedSeeded) return;
  mutedSeeded = true;
  muted = muteParam();
}

function setMuted(v: boolean): void {
  mutedSeeded = true;
  if (v === muted) return;
  muted = v;
  for (const cb of muteListeners) {
    try {
      cb(v);
    } catch {
      /* one bad listener must not stop the rest */
    }
  }
}

/**
 * Write to BOTH stores; read whichever copy is NEWER, by a stamp written beside every value
 * (`<key>.t`). ⚠ "The host's copy first" lost progress in Ring Twist: a session whose SDK came
 * late saved locally only, and the next session read the OLDER cloud copy and wrote it back over
 * the local one. A copy with no stamp counts as 0; on a tie the host's copy wins.
 */
const T = (k: string) => k + ".t";
const stampOf = (v: string | null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const touched = new Set<string>();
function cloudGet(k: string): string | null {
  try {
    return sdk ? sdk.data.getItem(k) : null;
  } catch {
    return null;
  }
}
const dualStore: PlatformStorage = {
  getItem(k) {
    touched.add(k);
    const lv = localStore.getItem(k);
    if (!sdkData) return lv;
    const cv = cloudGet(k);
    if (cv == null) return lv;
    if (lv == null) return cv;
    return stampOf(localStore.getItem(T(k))) > stampOf(cloudGet(T(k))) ? lv : cv;
  },
  setItem(k, v) {
    touched.add(k);
    const t = String(Date.now());
    localStore.setItem(k, v);
    localStore.setItem(T(k), t);
    try {
      if (sdk && sdkData) {
        sdk.data.setItem(k, v);
        sdk.data.setItem(T(k), t);
      }
    } catch {
      /* the local write already happened */
    }
  },
  removeItem(k) {
    localStore.removeItem(k);
    localStore.removeItem(T(k));
    try {
      if (sdk && sdkData) {
        sdk.data.removeItem(k);
        sdk.data.removeItem(T(k));
      }
    } catch {
      /* as above */
    }
  },
};

/**
 * An SDK that came late: sync data too, but only when every copy this session used is KNOWN
 * newer here than on the host; then push the local copies up. Otherwise leave the host's copy
 * alone (this device's newer stamp still wins it back next session).
 */
function syncLate(): void {
  for (const k of touched) {
    const cv = cloudGet(k);
    if (cv != null && !(stampOf(localStore.getItem(T(k))) > stampOf(cloudGet(T(k))))) return;
  }
  sdkData = true;
  for (const k of touched) {
    const v = localStore.getItem(k);
    if (v == null) continue;
    try {
      sdk!.data.setItem(k, v);
      sdk!.data.setItem(T(k), localStore.getItem(T(k)) || String(Date.now()));
    } catch {
      /* the next write tries again */
    }
  }
}

/** ⚠ Read live from the SDK; the listener is only a mirror. */
function readMute(): boolean {
  seedMuted();
  try {
    const live = sdk?.game.settings?.muteAudio;
    if (typeof live === "boolean") return live;
  } catch {
    /* settings not exposed on this SDK build */
  }
  return muted;
}

/** ⚠ addSettingsChangeListener, not a window event: there is no volume event to listen for. */
function hookMute(): void {
  try {
    if (!sdk) return;
    setMuted(!!sdk.game.settings?.muteAudio || muteParam());
    sdk.game.addSettingsChangeListener?.((next) => setMuted(!!next?.muteAudio));
  } catch {
    /* older SDK: the in-game switches stay the only control */
  }
}

/**
 * ⚠ An SDK that missed the boot window is NOT given up on (CRAZYGAMES_RULES §2.2). Ring Twist's
 * first upload said "No detected SDK functionalities": from Vietnam the script plus init() took
 * longer than the boot budget and the whole session ran without the SDK.
 */
function adoptLate(found: Sdk, initP: Promise<void>): void {
  Promise.resolve(initP).then(
    () => {
      if (sdk) return;
      sdk = found;
      syncLate();
      hookMute();
      if (loading) {
        try {
          sdk.game.loadingStart();
        } catch {
          /* ignore */
        }
      }
      if (playing) {
        try {
          sdk.game.gameplayStart();
        } catch {
          /* ignore */
        }
      }
    },
    () => {
      /* init failed for good: stay without */
    },
  );
}

function waitLate(): void {
  const t0 = Date.now();
  const tick = () => {
    const s = (window as unknown as Win).CrazyGames?.SDK;
    if (s) {
      let p: Promise<void>;
      try {
        p = s.init();
      } catch {
        return;
      }
      adoptLate(s, p);
      return;
    }
    if (Date.now() - t0 < 60000) setTimeout(tick, 250);
  };
  tick();
}

const call = (f: (s: Sdk) => void) => {
  try {
    if (sdk) f(sdk);
  } catch {
    /* host hooks never break the game */
  }
};

export const platform: Platform = {
  name: "crazy",

  async init() {
    const start = Date.now();
    // Fetch first, then poll: onload does not mean window.CrazyGames.SDK is assigned yet.
    await loadSdkScript();
    const found = await new Promise<Sdk | null>((resolve) => {
      // ⚠ The rest of the budget, not a fresh one (the fetch may have used most of it).
      const timer = setTimeout(() => resolve(null), Math.max(0, INIT_TIMEOUT_MS - (Date.now() - start)));
      const tick = () => {
        const s = (window as unknown as Win).CrazyGames?.SDK;
        if (s) {
          clearTimeout(timer);
          resolve(s);
        } else if (Date.now() - start < INIT_TIMEOUT_MS) setTimeout(tick, 60);
      };
      tick();
    });
    if (!found) {
      waitLate(); // the script may still land: keep watching
      return;
    }
    try {
      // ⚠ `started` decides adoption, not the race finishing: a half-initialised SDK throws
      // "CrazySDK is not initialized yet" on every later call.
      let started = false;
      const initP = found.init();
      await Promise.race([
        initP.then(() => {
          started = true;
        }),
        new Promise<void>((r) => setTimeout(r, Math.max(0, INIT_TIMEOUT_MS - (Date.now() - start)))),
      ]);
      if (!started) {
        adoptLate(found, initP);
        return;
      }
      sdk = found;
      sdkData = true;
      if (loading) call((s) => s.game.loadingStart());
    } catch {
      sdk = null;
      sdkData = false;
    }
    hookMute();
  },

  storage: dualStore,

  loadingStart() {
    loading = true;
    call((s) => s.game.loadingStart());
  },
  loadingStop() {
    loading = false;
    call((s) => s.game.loadingStop());
  },
  gameplayStart() {
    playing = true;
    call((s) => s.game.gameplayStart());
  },
  gameplayStop() {
    playing = false;
    call((s) => s.game.gameplayStop());
  },
  happytime() {
    call((s) => s.game.happytime());
  },

  preferredLang() {
    // `locale`, not `countryCode`: where someone sits is not the language they read.
    try {
      const l = sdk?.user?.systemInfo?.locale;
      return l ? String(l).toLowerCase() : null;
    } catch {
      return null;
    }
  },

  hostMuted: readMute,
  onHostMuteChange(cb) {
    muteListeners.push(cb);
  },

  canReward: () => !!sdk,
  rewarded() {
    return new Promise((resolve) => {
      if (!sdk) return resolve(false);
      let done = false;
      const end = (ok: boolean) => {
        if (!done) {
          done = true;
          resolve(ok);
        }
      };
      try {
        sdk.ad.requestAd("rewarded", {
          adFinished: () => end(true),
          adError: () => end(false),
        });
      } catch {
        end(false);
      }
    });
  },
};

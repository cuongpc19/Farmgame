// The one door everything host-specific goes through (same shape as AstroBall / Ring Twist).
//
// ⚠ One interface, one implementation per target, chosen at BUILD time by a Vite alias
// (`virtual:platform`), never by a runtime `if`. CrazyGames forbids third-party ad networks, so
// the implementation you did not select must not even enter the module graph. Provable:
//
//   node scripts/build-target.mjs web && grep -rc crazygames dist/    # must be 0

/** Same shape as `localStorage`, so call sites do not care which one they got. */
export interface PlatformStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Platform {
  /** "web" | "crazy". For logging and wording only. */
  readonly name: string;

  /**
   * Bring the host SDK up. **Never throws and never hangs**: an adblocker that swallows the SDK
   * script fires no `onerror`, so the implementation owns its own timeout. An SDK that misses
   * the boot window is still adopted when it does arrive (CRAZYGAMES_RULES §2.2).
   */
  init(): Promise<void>;

  /**
   * Progress storage. ⚠ Nothing may read it before `init()` resolves: the host preloads the
   * player's cloud save during init, and an early read returns the local copy.
   */
  readonly storage: PlatformStorage;

  /** Bracket the asset load, so the host can show its own spinner. */
  loadingStart(): void;
  loadingStop(): void;

  /**
   * ⚠ Not telemetry: this is how the host knows when it may interrupt with an ad. Menus,
   * sheets, dialogue and ads are "stopped". Game emits these from one pause flag.
   */
  gameplayStart(): void;
  gameplayStop(): void;

  /** A flourish on the host page when the player does well (stage clear). */
  happytime(): void;

  /** The player's locale per the host (e.g. "vi-vn"), or null. */
  preferredLang(): string | null;

  /** ⚠ The host's mute outranks every in-game switch. `?muteAudio=true` counts as host mute. */
  hostMuted(): boolean;
  onHostMuteChange(cb: (muted: boolean) => void): void;

  /** A rewarded video can be requested right now. */
  canReward(): boolean;
  /** Resolves true only when the video ran to the end. The caller silences the game meanwhile. */
  rewarded(): Promise<boolean>;
}

/** A storage that works when `localStorage` throws (private mode, sandboxed frame). */
export const localStore: PlatformStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode: progress just will not persist */
    }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing to do */
    }
  },
};

/** `?muteAudio=true` is the flag CrazyGames QA opens games with; it must work without an SDK. */
export function muteParam(): boolean {
  try {
    return new URLSearchParams(location.search).get("muteAudio") === "true";
  } catch {
    return false;
  }
}

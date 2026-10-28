/**
 * Player settings (the ⚙ sheet), persisted as `mm_settings`.
 *
 * Kept apart from the save so "Reset progress" leaves them alone (`?reset=1` still wipes them,
 * like every `mm_` key). Storage can be blocked (private mode, sandboxed iframes); `save.ts`
 * wraps every access, and the in-memory copy is the truth for the current page load.
 * Importing `save.ts` also guarantees its `?reset=1` wipe runs before the settings are read.
 *
 * Perf. Mode is OFF (sharp) on every device until the player turns it on (user 2026-10-20). Before
 * that a hardware guess and a frame-rate fallback chose it per device (git history:
 * engine/deviceTier.ts); a `perfAuto` left in an old save is ignored. `perfUser`: the player chose.
 */
import { load, save } from "./save";

export interface Settings {
  /** Background music (`music.ts`; replaced the wind + machinery hum "ambience" on 2026-10-20). */
  music: boolean;
  /** One-shot sound effects. */
  sfx: boolean;
  /** Cheaper rendering: DPR ≤ 1, no shadows, no antialias, 30 fps. */
  perfMode: boolean;
}
export type SettingKey = keyof Settings;
/** The on/off settings (rows with a toggle). */
export type SettingFlag = "music" | "sfx" | "perfMode";

export const BUILD_VERSION = "0.9.0";

const KEY = "settings";
const DEFAULTS: Settings = { music: true, sfx: true, perfMode: false };

/** The player set Perf. Mode themselves. */
let perfUser = false;

function read(): Settings {
  const s: Settings = { ...DEFAULTS };
  const raw = load<unknown>(KEY, null);
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (const k of ["music", "sfx"] as const) if (typeof o[k] === "boolean") s[k] = o[k];
  perfUser = o.perfUser === true && typeof o.perfMode === "boolean";
  s.perfMode = perfUser ? (o.perfMode as boolean) : false;
  return s;
}

const cur = read();
type Listener = (key: SettingKey, all: Readonly<Settings>) => void;
const listeners = new Set<Listener>();

function persist(): void {
  save(KEY, { ...cur, perfUser });
}

function notify(k: SettingKey): void {
  for (const f of listeners) {
    try {
      f(k, cur);
    } catch (e) {
      console.error(e);
    }
  }
}

export function getSettings(): Readonly<Settings> {
  return cur;
}

export function getSetting<K extends SettingKey>(k: K): Settings[K] {
  return cur[k];
}

/** A change made by the player (the ⚙ sheet). Perf. Mode set here is never overridden. */
export function setSetting<K extends SettingKey>(k: K, v: Settings[K]): void {
  if (k === "perfMode") perfUser = true;
  if (cur[k] === v) {
    persist();
    return;
  }
  cur[k] = v;
  persist();
  notify(k);
}

export function toggleSetting(k: SettingFlag): boolean {
  setSetting(k, !cur[k]);
  return cur[k];
}

/** Called after every change; returns an unsubscribe function. */
export function onSettingsChange(f: Listener): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

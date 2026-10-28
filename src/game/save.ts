import { platform } from "../platform";

/**
 * Persistence through the platform door (`localStorage`; on CrazyGames also their cloud save).
 * Every key carries the `fv_` prefix so this game never reads another game's progress when they
 * share a domain (and vice versa).
 * ⚠ Never rename the prefix after launch: Progress Save restores keys verbatim, so renamed keys
 * would bring back a save the game no longer reads.
 * `?reset=1` in the URL wipes the save (headless test runs; not in the CrazyGames build).
 */
const PREFIX = "fv_";

function ls(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

if (__TARGET__ !== "crazy" && new URLSearchParams(location.search).has("reset")) {
  const s = ls();
  if (s) for (const k of Object.keys(s)) if (k.startsWith(PREFIX)) s.removeItem(k);
  // Drop the flag so a later reload (stage change) doesn't wipe the save again.
  const u = new URL(location.href);
  u.searchParams.delete("reset");
  history.replaceState(null, "", u.pathname + u.search + u.hash);
}

export function load<T>(key: string, dflt: T): T {
  try {
    const raw = platform.storage.getItem(PREFIX + key);
    return raw == null ? dflt : (JSON.parse(raw) as T);
  } catch {
    return dflt;
  }
}

/** Last text written per key: an unchanged save is not written again (autosave runs every few s). */
const written = new Map<string, string>();

export function save(key: string, value: unknown): void {
  try {
    const text = JSON.stringify(value);
    if (written.get(key) === text) return;
    written.set(key, text);
    platform.storage.setItem(PREFIX + key, text);
  } catch {
    /* storage full or blocked — progress just won't persist */
  }
}

export function remove(key: string): void {
  written.delete(key);
  platform.storage.removeItem(PREFIX + key);
}

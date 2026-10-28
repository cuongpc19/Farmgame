/**
 * Synthesised audio (WebAudio, no sample files — keeps the build tiny).
 *
 *   one-shot SFX ──────┐
 *   music loop ────────┴─ master (session mute) ─ speakers
 *
 * The Settings sheet drives two sound switches (`settings.ts`): SFX gates the one-shots, Music
 * starts/stops the background loop (`music.ts`). `setMuted()` is a separate master mute
 * for this page load only (silences everything; not persisted).
 *
 * Browsers only let audio start inside a user gesture. The context is created by `initAudio()`
 * (Game wires it to Input.onFirstPress) or by any tap/key anywhere on the page (capture
 * listeners below, so HUD buttons and sheets count too). Touch `pointerdown` is not an
 * activation event on Chrome/iOS, so a context born there may start suspended: the listeners
 * stay armed and resume it on the next pointerup/touchend/click. Before that every call is a no-op.
 */
import { getSetting, onSettingsChange } from "./settings";
import { funk, renderSliced } from "./music";

const MASTER_VOL = 0.55;
/**
 * Music bus levels (before master). 1 = the loop as rendered (as loud as the previews, about as
 * loud as the SFX). User 2026-10-20: 20 % of normal, then 5 %, then 2-5 % (2 % about 70 % of the
 * time, now and then 5 %: `swell`), then 4-8 %.
 */
const MUSIC_LOW = 0.04;
const MUSIC_HIGH = 0.08;
/** The loop is rendered at 22.05 kHz (half the work and memory); the context resamples it. */
const MUSIC_SR = 22050;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
const lastPlay: Record<string, number> = {};

export function initAudio(): void {
  if (!ctx) {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const c = new AC();
      master = c.createGain();
      master.gain.value = muted ? 0 : MASTER_VOL;
      master.connect(c.destination);
      c.onstatechange = () => {
        if (c.state === "running") {
          listen(false);
          syncMusic();
        } else listen(true); // suspended / iOS "interrupted": the next tap resumes it
      };
      ctx = c;
    } catch {
      ctx = null;
      master = null;
      return;
    }
  }
  wake();
}

/**
 * iPhone / iPad: Web Audio follows the ring/silent switch (the "ambient" session) unless the page
 * asks to play like a video does (user 2026-10-20: no sound in Chrome on an iPhone, every iOS
 * browser being WebKit). iOS 17+: the Audio Session API. Older: a looping silent <audio> started
 * in the gesture moves the session to playback. Side effect, as with a video: music from another
 * app pauses while the game plays sound.
 */
let session = false;
let silentEl: HTMLAudioElement | null = null;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
function playbackSession(): void {
  if (session) return;
  session = true;
  const nav = navigator as unknown as { audioSession?: { type: string } };
  if (nav.audioSession) {
    try {
      nav.audioSession.type = "playback";
      return;
    } catch {
      /* fall through to the silent loop */
    }
  }
  if (!isIOS) return;
  // 0.1 s of 8-bit silence, looped.
  const n = 800;
  const b = new Uint8Array(44 + n);
  const dv = new DataView(b.buffer);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => (b[o + i] = ch.charCodeAt(0)));
  str(0, "RIFF");
  dv.setUint32(4, 36 + n, true);
  str(8, "WAVEfmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true);
  dv.setUint32(28, 8000, true);
  dv.setUint16(32, 1, true);
  dv.setUint16(34, 8, true);
  str(36, "data");
  dv.setUint32(40, n, true);
  b.fill(128, 44);
  const el = document.createElement("audio");
  el.src = "data:audio/wav;base64," + btoa(String.fromCharCode(...b));
  el.loop = true;
  el.setAttribute("playsinline", "");
  el.setAttribute("x-webkit-airplay", "deny");
  silentEl = el;
  el.play().catch(() => {
    session = false; // not inside a gesture yet: try again on the next tap
  });
}

/** Resume a suspended context (only works inside a gesture, or after one on most browsers). */
function wake(): void {
  playbackSession();
  if (!ctx) return;
  if (ctx.state === "running") {
    listen(false);
    syncMusic();
    return;
  }
  if (document.hidden) return;
  try {
    ctx.resume().catch(() => {});
  } catch {
    /* very old WebKit: resume() missing */
  }
}

const GESTURES = ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const;
let listening = false;
function listen(on: boolean): void {
  if (on === listening) return;
  listening = on;
  for (const t of GESTURES) {
    if (on) window.addEventListener(t, initAudio, { capture: true, passive: true });
    else window.removeEventListener(t, initAudio, { capture: true });
  }
}
listen(true);

// Hidden tab: pause everything (the music must not keep playing in the background).
document.addEventListener("visibilitychange", () => {
  if (!ctx) return;
  if (document.hidden) {
    silentEl?.pause();
    try {
      ctx.suspend().catch(() => {});
    } catch {
      /* ignore */
    }
  } else {
    silentEl?.play().catch(() => {});
    wake();
  }
});

onSettingsChange((k) => {
  if (k === "music") syncMusic();
});

/** Why the game is silent right now: "host" (CrazyGames mute / ?muteAudio=true), "ad", "session". */
const muteReasons = new Set<string>();

/**
 * Master mute on top of the Settings switches, for this page load only (not persisted). Several
 * reasons can hold it; sound comes back when the last one lets go. ⚠ The host's mute outranks
 * the in-game switches, and an ad must never play over the game's own sound.
 */
export function muteFor(reason: string, on: boolean): void {
  if (on) muteReasons.add(reason);
  else muteReasons.delete(reason);
  const m = muteReasons.size > 0;
  if (m === muted) return;
  muted = m;
  if (ctx && master) master.gain.setTargetAtTime(m ? 0 : MASTER_VOL, ctx.currentTime, 0.03);
  syncMusic();
}

export function setMuted(m: boolean): void {
  muteFor("session", m);
}

export function isMuted(): boolean {
  return muted;
}


/** Rate-limit per sound so 30 chunks landing in one frame don't make 30 voices. */
function gate(name: string, ms: number): boolean {
  const now = performance.now();
  if ((lastPlay[name] ?? 0) + ms > now) return false;
  lastPlay[name] = now;
  return true;
}

/**
 * Where one-shots go, or null when they must not play: SFX off, muted, or the context not
 * running yet (sounds queued on a frozen clock would all fire at once when it resumes).
 */
function sfxOut(): GainNode | null {
  return ctx && master && ctx.state === "running" && !muted && getSetting("sfx") ? master : null;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
  const out = sfxOut();
  if (!ctx || !out) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, cutoff: number, delay = 0): void {
  const out = sfxOut();
  if (!ctx || !out) return;
  const t = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(out);
  src.start(t);
}

export const sfx = {
  // Candy Miner: a bright crunch on every hit and a pop with a sparkle when a block breaks (the rock ones were a
  // low thud and a rumble).
  hit(): void {
    if (!gate("hit", 55)) return;
    noise(0.05, 0.3, 4200);
    tone(460 + Math.random() * 80, 0.05, "triangle", 0.09, 320);
  },
  breakBlock(): void {
    if (!gate("break", 40)) return;
    noise(0.1, 0.32, 3600);
    tone(360, 0.13, "sine", 0.2, 900);
    tone(1320, 0.07, "triangle", 0.06, undefined, 0.07);
    tone(1760, 0.09, "triangle", 0.05, undefined, 0.12);
  },
  pickup(): void {
    if (!gate("pickup", 45)) return;
    tone(520 + Math.random() * 120, 0.06, "sine", 0.12, 760);
  },
  drop(): void {
    if (!gate("drop", 50)) return;
    tone(300, 0.07, "triangle", 0.12, 200);
  },
  coin(): void {
    if (!gate("coin", 45)) return;
    tone(1180, 0.05, "square", 0.05);
    tone(1580, 0.09, "square", 0.05, undefined, 0.05);
  },
  buy(): void {
    tone(440, 0.09, "triangle", 0.18, 660);
    tone(660, 0.14, "triangle", 0.18, 990, 0.08);
  },
  unlock(): void {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "triangle", 0.16, undefined, i * 0.07));
  },
  reward(): void {
    [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, "triangle", 0.15, undefined, i * 0.08));
  },
  engine(on: boolean): void {
    if (on && gate("engine", 400)) tone(70, 0.4, "sawtooth", 0.025, 62);
  },
  tap(): void {
    tone(700, 0.04, "sine", 0.1);
  },
  deny(): void {
    if (!gate("deny", 300)) return;
    tone(200, 0.12, "square", 0.08, 150);
  },
};


// ---------------------------------------------------------------------------------------------
// Background music: the "funk" loop from music.ts (user 2026-10-20), rendered once per page load in
// slices between frames, then played as a looping buffer.

let music: { out: GainNode; src: AudioBufferSourceNode; timer: number; high: boolean } | null = null;
let musicBuf: AudioBuffer | null = null;
let rendering = false;

function renderMusic(c: AudioContext): void {
  if (rendering) return;
  rendering = true;
  renderSliced(funk(MUSIC_SR))
    .then((pcm) => {
      const b = c.createBuffer(1, pcm.length, MUSIC_SR);
      b.getChannelData(0).set(pcm); // copyToChannel is missing on old WebKit
      musicBuf = b;
      syncMusic();
    })
    .catch((e) => console.error(e));
}

function startMusic(): void {
  if (!ctx || !master || music) return;
  if (!musicBuf) return renderMusic(ctx); // starts itself once rendered
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(MUSIC_LOW, t + 2);
  out.connect(master);
  const src = ctx.createBufferSource();
  src.buffer = musicBuf;
  src.loop = true;
  src.connect(out);
  src.start(t);
  music = { out, src, timer: 0, high: false };
  swell();
}

/**
 * The music sits at MUSIC_LOW and now and then swells to MUSIC_HIGH: quiet stretches of 40-70 s,
 * loud ones of 15-30 s (so about 70 % of the time at the low level), 4 s ramps between them.
 */
function swell(): void {
  const m = music;
  if (!m) return;
  const secs = m.high ? 15 + Math.random() * 15 : 40 + Math.random() * 30;
  m.timer = window.setTimeout(() => {
    if (music !== m || !ctx) return;
    m.high = !m.high;
    const t = ctx.currentTime;
    const g = m.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(m.high ? MUSIC_HIGH : MUSIC_LOW, t + 4);
    swell();
  }, secs * 1000);
}

function stopMusic(): void {
  if (!ctx || !music) return;
  const { out, src, timer } = music;
  music = null;
  clearTimeout(timer);
  const t = ctx.currentTime;
  out.gain.cancelScheduledValues(t);
  out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), t);
  out.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  src.stop(t + 0.65);
  src.onended = () => out.disconnect();
}

/** For headless checks (plan `music`): "off", "rendering", or "playing <bus gain>". */
export function musicState(): string {
  return music ? `playing ${music.out.gain.value.toFixed(3)}` : rendering && !musicBuf ? "rendering" : "off";
}

/** Start or stop the loop to match the Music switch / mute (no-op until audio is unlocked). */
function syncMusic(): void {
  if (!ctx) return;
  if (muted || !getSetting("music")) stopMusic();
  else if (ctx.state === "running") startMusic();
}

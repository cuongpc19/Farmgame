/**
 * Background music, synthesised sample by sample (no audio files; no one else's music). Each style
 * is a generator that yields every few notes, so the game can render it in slices between frames
 * (`renderSliced`; ~0.1 s of work on a laptop, several times that on a cheap phone) and turn the
 * samples into a looping AudioBuffer. scripts/music-preview.mts writes the very same samples to WAV.
 *
 * User 2026-10-20: "lively music, like workers on the job" instead of the wind + engine hum.
 * Three styles were offered; the user picked **funk** (the game imports only that one, so the
 * other two stay out of the bundle):
 *   folk  — banjo rolls, a strummed "chuck", a plucked bass, a whistled tune and a hammer on an
 *           anvil on the off-beat (124 BPM, G major).
 *   chip  — arcade 8-bit: pulse lead, triangle bass, noise drums (132 BPM, C major).
 *   funk  — workshop groove: bouncing bass, claps, metal clanks, organ stabs (108 BPM, A minor).
 * Each is 16 bars and loops seamlessly (notes ringing past the end wrap round to the start).
 */
export type MusicJob = Generator<void, Float32Array, void>;

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Deterministic noise, so the loop sounds the same every time. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

class Mix {
  readonly buf: Float32Array;
  readonly n: number;
  readonly sr: number;
  constructor(sr: number, seconds: number) {
    this.sr = sr;
    this.n = Math.round(sr * seconds);
    this.buf = new Float32Array(this.n);
  }
  /** Add a sample at absolute index i (wrapping round the loop). */
  add(i: number, v: number): void {
    this.buf[((i % this.n) + this.n) % this.n] += v;
  }

  /** Plucked string (Karplus-Strong): banjo, guitar chuck, upright bass. */
  pluck(t: number, f: number, dur: number, vol: number, bright = 0.5, seed = 1): void {
    const sr = this.sr;
    const N = Math.max(2, Math.round(sr / f));
    const line = new Float32Array(N);
    const r = rng(seed + Math.round(f * 7));
    let prev = 0;
    for (let k = 0; k < N; k++) {
      // Softer attack for a duller string: low-pass the initial noise burst.
      const x = r();
      prev = prev + (x - prev) * (0.25 + bright * 0.75);
      line[k] = prev;
    }
    const start = Math.round(t * sr);
    const len = Math.round(dur * sr);
    const decay = 0.996 - (1 - bright) * 0.004;
    let idx = 0;
    for (let k = 0; k < len; k++) {
      const a = line[idx];
      const b = line[(idx + 1) % N];
      line[idx] = (a + b) * 0.5 * decay;
      idx = (idx + 1) % N;
      const fade = k > len - 400 ? (len - k) / 400 : 1;
      this.add(start + k, a * vol * fade);
    }
  }

  /** Tonal voice with an envelope: sine / triangle / square (duty) / saw. */
  tone(t: number, f: number, dur: number, vol: number, shape: "sine" | "tri" | "square" | "saw", opts: { a?: number; r?: number; duty?: number; vib?: number; slide?: number } = {}): void {
    const sr = this.sr;
    const start = Math.round(t * sr);
    const len = Math.round(dur * sr);
    const att = Math.max(1, Math.round((opts.a ?? 0.01) * sr));
    const rel = Math.max(1, Math.round((opts.r ?? 0.05) * sr));
    const duty = opts.duty ?? 0.5;
    let ph = 0;
    let inc = f / sr;
    for (let k = 0; k < len + rel; k++) {
      // Vibrato and the slide into the note change slowly: work the pitch out every 32 samples
      // (per sample, the pow()s made the whistled hook the slowest part to render).
      if ((opts.vib || opts.slide) && (k & 31) === 0) {
        const time = k / sr;
        const vib = opts.vib ? Math.sin(time * 2 * Math.PI * 5.6) * opts.vib * Math.min(1, time / 0.15) : 0;
        const slide = opts.slide ? (opts.slide * Math.max(0, 0.06 - time)) / 0.06 : 0;
        inc = (f * Math.pow(2, slide / 12 + vib / 1200)) / sr;
      }
      ph += inc;
      ph -= Math.floor(ph);
      let v: number;
      if (shape === "sine") v = Math.sin(ph * 2 * Math.PI);
      else if (shape === "tri") v = 1 - 4 * Math.abs(ph - 0.5);
      else if (shape === "square") v = ph < duty ? 0.8 : -0.8;
      else v = 2 * ph - 1;
      const env = k < att ? k / att : k < len ? 1 : 1 - (k - len) / rel;
      this.add(start + k, v * vol * env);
    }
  }

  kick(t: number, vol: number): void {
    const sr = this.sr;
    const start = Math.round(t * sr);
    const len = Math.round(0.32 * sr);
    let ph = 0;
    for (let k = 0; k < len; k++) {
      const time = k / sr;
      const f = 45 + 110 * Math.exp(-time * 30);
      ph += f / sr;
      this.add(start + k, Math.sin(ph * 2 * Math.PI) * vol * Math.exp(-time * 9));
    }
  }

  /** Noise hit through a one-pole high-pass / low-pass pair: snare, clap, hat, shaker. */
  noise(t: number, dur: number, vol: number, hp: number, lp: number, seed: number, decay = 20): void {
    const sr = this.sr;
    const start = Math.round(t * sr);
    const len = Math.round(dur * sr);
    const r = rng(seed);
    const ah = Math.exp((-2 * Math.PI * hp) / sr);
    const al = 1 - Math.exp((-2 * Math.PI * lp) / sr);
    let hpPrevIn = 0;
    let hpOut = 0;
    let lpOut = 0;
    for (let k = 0; k < len; k++) {
      const x = r();
      hpOut = ah * (hpOut + x - hpPrevIn);
      hpPrevIn = x;
      lpOut += (hpOut - lpOut) * al;
      this.add(start + k, lpOut * vol * Math.exp(-(k / sr) * decay));
    }
  }

  snare(t: number, vol: number, seed: number): void {
    this.noise(t, 0.18, vol, 900, 7000, seed, 22);
    this.tone(t, 190, 0.04, vol * 0.5, "tri", { a: 0.001, r: 0.06 });
  }

  clap(t: number, vol: number, seed: number): void {
    for (let i = 0; i < 3; i++) this.noise(t + i * 0.011, 0.03, vol * 0.7, 1100, 5000, seed + i, 40);
    this.noise(t + 0.033, 0.2, vol, 1100, 5000, seed + 9, 14);
  }

  hat(t: number, vol: number, seed: number, open = false): void {
    this.noise(t, open ? 0.22 : 0.05, vol, 7000, 14000, seed, open ? 12 : 70);
  }

  /** Hammer on an anvil: inharmonic partials with a bright, fast decay. */
  clank(t: number, vol: number, base = 880): void {
    const sr = this.sr;
    const start = Math.round(t * sr);
    const len = Math.round(0.5 * sr);
    const parts: [number, number, number][] = [[1, 1, 9], [2.76, 0.6, 12], [5.4, 0.4, 16], [8.93, 0.25, 22]];
    for (const [ratio, amp, dec] of parts) {
      // sin(wt)·e^(−dt) by recurrence (rotate, then shrink): no sin/exp per sample, which made
      // a clank the slowest note to render on a slow phone.
      const w = (2 * Math.PI * base * ratio) / sr;
      const cw = Math.cos(w);
      const sw = Math.sin(w);
      const shrink = Math.exp(-dec / sr);
      let c = 1;
      let s = 0;
      let g = amp * vol * 0.4;
      for (let k = 0; k < len; k++) {
        this.add(start + k, s * g);
        const nc = c * cw - s * sw;
        s = s * cw + c * sw;
        c = nc;
        g *= shrink;
      }
    }
    this.noise(t, 0.02, vol * 0.6, 3000, 12000, Math.round(base), 90);
  }

  /** Peak-normalise and soft-clip (yielding every 8k samples). */
  *finish(peak = 0.85): MusicJob {
    let m = 0;
    for (let i = 0; i < this.n; i++) {
      m = Math.max(m, Math.abs(this.buf[i]));
      if ((i & 0x1fff) === 0x1fff) yield;
    }
    const g = m > 0 ? (peak * 1.25) / m : 1;
    for (let i = 0; i < this.n; i++) {
      this.buf[i] = Math.tanh(this.buf[i] * g) * 0.8;
      if ((i & 0x1fff) === 0x1fff) yield;
    }
    return this.buf;
  }
}

/** Notes as "midi:steps" (16 steps a bar); "r:steps" is a rest. */
function line(spec: string): [number | null, number][] {
  return spec
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [n, l] = tok.split(":");
      return [n === "r" ? null : Number(n), Number(l)];
    });
}

const G = { G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, Fs5: 78, G5: 79, A5: 81, B5: 83, C6: 84 };

export function* folk(sr: number): MusicJob {
  const bpm = 124;
  const step = 60 / bpm / 4;
  const bars = 16;
  const m = new Mix(sr, bars * 16 * step);
  // Chords per bar (root midi of the bass, chord tones).
  const chords: [number, number[]][] = [
    [43, [55, 59, 62]], [43, [55, 59, 62]], [48, [55, 60, 64]], [50, [57, 62, 66]],
    [43, [55, 59, 62]], [40, [52, 55, 59]], [48, [55, 60, 64]], [43, [55, 59, 62]],
    [48, [55, 60, 64]], [43, [55, 59, 62]], [50, [57, 62, 66]], [40, [52, 55, 59]],
    [48, [55, 60, 64]], [43, [55, 59, 62]], [50, [57, 62, 66]], [50, [57, 62, 66]],
  ];
  // Bar 7 splits C | D: second half on D.
  const half = (bar: number, s: number) => (bar === 6 && s >= 8 ? ([50, [57, 62, 66]] as [number, number[]]) : chords[bar]);
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * 16 * step;
    for (let s = 0; s < 16; s++) {
      const t = t0 + s * step;
      const [root, tones] = half(bar, s);
      // Drums: kick 1 & 3, brushy snare 2 & 4, shaker on the eighths, hammer on the anvil.
      if (s === 0 || s === 8 || (bar % 4 === 3 && s === 10)) m.kick(t, 0.9);
      if (s === 4 || s === 12) m.snare(t, 0.32, bar * 31 + s);
      if (s % 2 === 0) m.hat(t + step, 0.16 + (s % 4 === 2 ? 0.06 : 0), bar * 17 + s);
      if (s === 14 || (bar >= 8 && s === 6)) m.clank(t, 0.5, s === 6 ? 1046 : 880);
      // Bass: root on 1, fifth on 3, a walk-up into the next bar.
      if (s === 0) m.pluck(t, midi(root), 0.45, 0.85, 0.35, bar);
      if (s === 8) m.pluck(t, midi(root + 7), 0.45, 0.75, 0.35, bar + 50);
      if (s === 14 && bar % 2 === 1) m.pluck(t, midi(root + 4), 0.2, 0.6, 0.35, bar + 90);
      // Strummed chuck on 2 and 4 (and the "and" of 4).
      if (s === 4 || s === 12 || s === 14)
        tones.forEach((n, i) => m.pluck(t + i * 0.008, midi(n), 0.16, 0.22, 0.75, bar * 3 + i + s));
      // Banjo forward roll on the sixteenths, quietly underneath.
      const roll = [0, 1, 2, 0, 1, 2, 0, 3];
      const notes = [tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[0] + 24];
      m.pluck(t, midi(notes[roll[s % 8]]), 0.3, 0.12, 0.9, bar * 16 + s);
      yield;
    }
  }
  // The whistled tune.
  const tune = line(`
    ${G.D5}:4 ${G.B4}:2 ${G.D5}:2 ${G.G5}:4 ${G.D5}:4
    ${G.E5}:2 ${G.D5}:2 ${G.B4}:4 ${G.A4}:2 ${G.G4}:2 ${G.A4}:4
    ${G.C5}:4 ${G.E5}:2 ${G.C5}:2 ${G.G5}:4 ${G.E5}:4
    ${G.D5}:2 ${G.E5}:2 ${G.Fs5}:2 ${G.A5}:2 ${G.D5}:4 r:4
    ${G.D5}:4 ${G.B4}:2 ${G.D5}:2 ${G.G5}:4 ${G.G5}:4
    ${G.E5}:4 ${G.G5}:2 ${G.E5}:2 ${G.B4}:4 r:4
    ${G.C5}:2 ${G.E5}:2 ${G.G5}:4 ${G.D5}:2 ${G.Fs5}:2 ${G.A5}:4
    ${G.G5}:8 r:8
    ${G.E5}:2 ${G.G5}:2 ${G.E5}:2 ${G.C5}:2 ${G.E5}:8
    ${G.D5}:2 ${G.G5}:2 ${G.D5}:2 ${G.B4}:2 ${G.D5}:8
    ${G.A4}:2 ${G.D5}:2 ${G.Fs5}:2 ${G.D5}:2 ${G.A5}:4 ${G.Fs5}:4
    ${G.G5}:4 ${G.E5}:4 ${G.B4}:8
    ${G.C5}:2 ${G.E5}:2 ${G.G5}:2 ${G.C6}:2 ${G.G5}:4 ${G.E5}:4
    ${G.D5}:2 ${G.B4}:2 ${G.G4}:4 ${G.B4}:4 ${G.D5}:4
    ${G.Fs5}:2 ${G.A5}:2 ${G.Fs5}:2 ${G.D5}:2 ${G.A4}:4 ${G.D5}:4
    ${G.Fs5}:4 ${G.E5}:4 ${G.D5}:4 r:4`);
  let at = 0;
  for (const [n, l] of tune) {
    if (n !== null) {
      const t = at * step;
      m.tone(t, midi(n), l * step * 0.85, 0.3, "sine", { a: 0.025, r: 0.06, vib: 14, slide: -1 });
      m.noise(t, l * step * 0.6, 0.02, 2000, 6000, n * 13 + at, 6);
      yield;
    }
    at += l;
  }
  return yield* m.finish();
}

export function* chip(sr: number): MusicJob {
  const bpm = 132;
  const step = 60 / bpm / 4;
  const bars = 16;
  const m = new Mix(sr, bars * 16 * step);
  // C G Am F x2, then F G Em Am, F G C C.
  const prog: [number, number[]][] = [
    [48, [60, 64, 67]], [43, [55, 59, 62]], [45, [57, 60, 64]], [41, [53, 57, 60]],
    [48, [60, 64, 67]], [43, [55, 59, 62]], [45, [57, 60, 64]], [41, [53, 57, 60]],
    [41, [53, 57, 60]], [43, [55, 59, 62]], [40, [52, 55, 59]], [45, [57, 60, 64]],
    [41, [53, 57, 60]], [43, [55, 59, 62]], [48, [60, 64, 67]], [48, [60, 64, 67]],
  ];
  for (let bar = 0; bar < bars; bar++) {
    const [root, tones] = prog[bar];
    for (let s = 0; s < 16; s++) {
      const t = (bar * 16 + s) * step;
      if (s % 4 === 0) m.kick(t, 0.7);
      if (s === 4 || s === 12) m.noise(t, 0.12, 0.35, 1500, 9000, bar * 7 + s, 25);
      if (s % 2 === 1) m.noise(t, 0.03, 0.12, 8000, 15000, bar * 11 + s, 90);
      // Triangle bass bouncing octaves on the eighths.
      if (s % 2 === 0) m.tone(t, midi(root + (s % 4 === 2 ? 12 : 0)), step * 1.6, 0.45, "tri", { a: 0.003, r: 0.02 });
      // Fast arpeggio of the chord, quiet.
      m.tone(t, midi(tones[s % 3] + 12), step * 0.7, 0.07, "square", { duty: 0.125, a: 0.002, r: 0.01 });
      yield;
    }
  }
  const C = { C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81, B5: 83, C6: 84, D6: 86, E6: 88 };
  const tune = line(`
    ${C.E5}:2 ${C.G5}:2 ${C.C6}:4 ${C.G5}:2 ${C.E5}:2 ${C.G5}:4
    ${C.D5}:2 ${C.G5}:2 ${C.B5}:4 ${C.D6}:4 ${C.B5}:4
    ${C.C6}:2 ${C.A5}:2 ${C.E5}:4 ${C.A5}:2 ${C.C6}:2 ${C.E6}:4
    ${C.F5}:2 ${C.A5}:2 ${C.C6}:2 ${C.A5}:2 ${C.G5}:8
    ${C.E5}:2 ${C.G5}:2 ${C.C6}:4 ${C.G5}:2 ${C.E5}:2 ${C.G5}:4
    ${C.D5}:2 ${C.G5}:2 ${C.B5}:4 ${C.D6}:2 ${C.C6}:2 ${C.B5}:4
    ${C.A5}:4 ${C.C6}:4 ${C.E6}:4 ${C.C6}:4
    ${C.F5}:4 ${C.A5}:4 ${C.G5}:8
    ${C.A5}:2 ${C.G5}:2 ${C.F5}:2 ${C.A5}:2 ${C.C6}:8
    ${C.B5}:2 ${C.A5}:2 ${C.G5}:2 ${C.B5}:2 ${C.D6}:8
    ${C.G5}:2 ${C.E5}:2 ${C.G5}:2 ${C.B5}:2 ${C.E6}:4 ${C.D6}:4
    ${C.C6}:2 ${C.A5}:2 ${C.E5}:4 ${C.A5}:8
    ${C.A5}:2 ${C.C6}:2 ${C.A5}:2 ${C.F5}:2 ${C.C6}:4 ${C.A5}:4
    ${C.B5}:2 ${C.D6}:2 ${C.B5}:2 ${C.G5}:2 ${C.D6}:4 ${C.B5}:4
    ${C.C6}:4 ${C.E6}:4 ${C.G5}:4 ${C.E5}:4
    ${C.C6}:8 r:8`);
  let at = 0;
  for (const [n, l] of tune) {
    if (n !== null) m.tone(at * step, midi(n), l * step * 0.8, 0.22, "square", { duty: 0.25, a: 0.004, r: 0.04, vib: l >= 4 ? 18 : 0 });
    at += l;
  }
  return yield* m.finish();
}

export function* funk(sr: number): MusicJob {
  const bpm = 108;
  const step = 60 / bpm / 4;
  const bars = 16;
  const m = new Mix(sr, bars * 16 * step);
  // Am7 | D9 x4, then Fmaj7 | E7 x2, Am7 | D9 x2.
  const prog: [number, number[]][] = [];
  for (let i = 0; i < 8; i++) prog.push(i % 2 ? [38, [60, 62, 66]] : [45, [55, 60, 64]]);
  for (let i = 0; i < 4; i++) prog.push(i % 2 ? [40, [56, 59, 62]] : [41, [57, 60, 64]]);
  for (let i = 0; i < 4; i++) prog.push(i % 2 ? [38, [60, 62, 66]] : [45, [55, 60, 64]]);
  // Syncopated bass figure (step, semitones above root, length in steps).
  const bassFig: [number, number, number][] = [[0, 0, 3], [3, 12, 1], [6, 0, 2], [8, 7, 2], [10, 10, 2], [13, 12, 1], [14, 7, 2]];
  for (let bar = 0; bar < bars; bar++) {
    const [root, tones] = prog[bar];
    const t0 = bar * 16 * step;
    for (let s = 0; s < 16; s++) {
      const t = t0 + s * step;
      if (s === 0 || s === 7 || s === 10) m.kick(t, 0.85);
      if (s === 4 || s === 12) m.clap(t, 0.45, bar * 13 + s);
      m.hat(t, s % 2 ? 0.1 : 0.16, bar * 19 + s, s === 14);
      // Metal shop: two clanks a bar, pitched apart.
      if (s === 6) m.clank(t, 0.35, 1174);
      if (s === 15 && bar % 2 === 1) m.clank(t, 0.3, 784);
      yield;
    }
    for (const [s, semi, l] of bassFig) m.pluck(t0 + s * step, midi(root + semi), l * step * 1.1, 0.95, 0.55, bar * 7 + s);
    yield;
    // Organ stabs on the off-beats.
    for (const s of [2, 9, 11]) for (const n of tones) m.tone(t0 + s * step, midi(n), step * 0.9, 0.07, "square", { duty: 0.5, a: 0.004, r: 0.03 });
    yield;
  }
  // A short whistled hook every other bar.
  const A = { A4: 69, C5: 72, D5: 74, E5: 76, G5: 79, A5: 81 };
  const hook = line(`r:8 ${A.E5}:2 ${A.G5}:2 ${A.A5}:2 ${A.G5}:2 ${A.E5}:4 ${A.D5}:2 ${A.C5}:2 ${A.A4}:8`);
  for (let rep = 0; rep < bars / 2; rep++) {
    let at = rep * 32;
    for (const [n, l] of hook) {
      if (n !== null) m.tone(at * step, midi(n), l * step * 0.8, 0.2, "sine", { a: 0.02, r: 0.05, vib: 12, slide: -1 });
      at += l;
      yield;
    }
  }
  return yield* m.finish();
}

/** Run a style to the end in one go (the preview script): one loop, mono. */
export function renderNow(job: MusicJob): Float32Array {
  for (;;) {
    const r = job.next();
    if (r.done) return r.value;
  }
}

/**
 * Run a style a few milliseconds at a time between frames, so rendering never holds up the game.
 * Background tabs throttle the timer; the music only matters once the tab is back anyway.
 */
export function renderSliced(job: MusicJob, sliceMs = 5): Promise<Float32Array> {
  return new Promise((done, fail) => {
    const run = (): void => {
      try {
        const end = performance.now() + sliceMs;
        for (;;) {
          const r = job.next();
          if (r.done) return done(r.value);
          if (performance.now() >= end) break;
        }
        setTimeout(run, 0);
      } catch (e) {
        fail(e);
      }
    };
    setTimeout(run, 0);
  });
}

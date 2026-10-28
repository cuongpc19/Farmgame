// Listen to the background music styles outside the game: writes each loop twice in a row
// (so the seam can be heard) as WAV, and MP3 when ffmpeg is on PATH.
//   node scripts/music-preview.mts <out dir>
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { renderNow, folk, chip, funk } from "../src/game/music.ts";

const out = process.argv[2] ?? "music-preview";
mkdirSync(out, { recursive: true });
const sr = 44100;
for (const [style, make] of Object.entries({ folk, chip, funk })) {
  const t0 = performance.now();
  const loop = renderNow(make(sr));
  const ms = Math.round(performance.now() - t0);
  const n = loop.length * 2;
  const wav = Buffer.alloc(44 + n * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + n * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sr, 24);
  wav.writeUInt32LE(sr * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, loop[i % loop.length])) * 32767), 44 + i * 2);
  const f = join(out, `${style}.wav`);
  writeFileSync(f, wav);
  let mp3 = "";
  try {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", f, "-b:a", "128k", join(out, `${style}.mp3`)]);
    mp3 = ` + ${style}.mp3`;
  } catch {
    /* no ffmpeg */
  }
  console.log(`${style}: ${(loop.length / sr).toFixed(1)} s loop, rendered in ${ms} ms -> ${style}.wav${mp3}`);
}

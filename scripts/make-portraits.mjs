// Crew portraits from the game's own 3D workers (user 2026-10-24: the Job Board showed only ⛏️ / 📦, the
// reference shows each applicant's face): renders scripts/preview/portrait.html in the headless Chrome of
// scripts/shot.mjs and saves src/assets/workers/<id>.png (the player as player.png), cut down to a 256-colour
// palette with Pillow; ui/faces.ts inlines them. Re-run after changing a style in characters.ts CREW.
//   node scripts/make-portraits.mjs [ids...]     (dev server must run; no id = the player and workers 1-11)
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SIZE = 128;
const ids = process.argv.slice(2);
if (!ids.length) ids.push("player", ...Array.from({ length: 11 }, (_, i) => String(i + 1)));
const dir = "src/assets/workers";
mkdirSync(dir, { recursive: true });
const plan = join(process.env.TEMP ?? ".", "qc-portrait-plan.json");
writeFileSync(plan, JSON.stringify([{ eval: "window.__icon" }]));
// Back-to-back headless runs now and then fail to open a page (the last Chrome still closing): try again.
const shoot = (id) => {
  for (let k = 1; ; k++) {
    try {
      return execFileSync("node", ["scripts/shot.mjs", "--plan", plan, "--size", "400x400", "--boot-timeout", "120", "--ready", "!!(window.__game && window.__game.ready)"], {
        env: { ...process.env, QC_URL: `${process.env.QC_BASE ?? "http://localhost:5173"}/scripts/preview/portrait.html?id=${id}&size=${SIZE}` },
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch (e) {
      if (k >= 3) throw e;
      console.log(`${id}: retry ${k} (${String(e.message).split("\n").find((l) => l.startsWith("Error:")) ?? "failed"})`);
    }
  }
};
for (const id of ids) {
  const out = shoot(id);
  const m = out.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
  if (!m) throw new Error(`${id}: no image\n${out.slice(-2000)}`);
  const png = Buffer.from(m[1], "base64");
  const file = join(dir, `${id}.png`);
  writeFileSync(file, png);
  execFileSync("python", ["-I", "-c", "import sys; from PIL import Image; Image.open(sys.argv[1]).quantize(256, method=Image.Quantize.FASTOCTREE).save(sys.argv[1], optimize=True)", file]);
  console.log(`${id}: ${png.length} -> ${readFileSync(file).length} bytes -> ${file}`);
}

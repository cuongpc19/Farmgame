// Menu icons from the game's own 3D models: renders scripts/preview/icon.html in the headless
// Chrome of scripts/shot.mjs and saves each PNG to src/assets/icons/<key>.png: 128 px, cut down to a
// 256-colour palette with Pillow (about a quarter of the bytes; every icon is inlined in the build).
//   node scripts/make-icons.mjs hydraulicBreaker [more keys]   (dev server must run; no key = every machine)
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Everything that shows in the vehicle menu (user 2026-10-21: the emoji were confusing).
const MACHINES = ["hydraulicBreaker", "wheelLoader", "rollerCrusher", "dumpTruck", "allTerrainVehicle", "wheelbarrow",
  "drillCrusher", "crushHammer", "infernoBreaker", "haulTruck", "wheelCrusher", "fuelTruck"];
const SIZE = 128;
const keys = process.argv.slice(2);
if (!keys.length) keys.push(...MACHINES);
const dir = "src/assets/icons";
mkdirSync(dir, { recursive: true });
const plan = join(process.env.TEMP ?? ".", "qc-icon-plan.json");
writeFileSync(plan, JSON.stringify([{ eval: "window.__icon" }]));
for (const key of keys) {
  const out = execFileSync("node", ["scripts/shot.mjs", "--plan", plan, "--size", "400x400", "--ready", "!!(window.__game && window.__game.ready)"], {
    env: { ...process.env, QC_URL: `${process.env.QC_BASE ?? "http://localhost:5173"}/scripts/preview/icon.html?key=${key}&size=${SIZE}` },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const m = out.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
  if (!m) throw new Error(`${key}: no image\n${out.slice(-2000)}`);
  const png = Buffer.from(m[1], "base64");
  const file = join(dir, `${key}.png`);
  writeFileSync(file, png);
  execFileSync("python", ["-I", "-c", "import sys; from PIL import Image; Image.open(sys.argv[1]).quantize(256, method=Image.Quantize.FASTOCTREE).save(sys.argv[1], optimize=True)", file]);
  console.log(`${key}: ${png.length} -> ${readFileSync(file).length} bytes -> ${file}`);
}

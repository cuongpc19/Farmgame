// Reads the telemetry rows (/qc) straight from the database, as project OWNER through the Firebase
// CLI (no sign-in, no uid, the rules do not apply), and prints a short summary. Same numbers as
// site/stats.html, without the browser.
//
//   node scripts/stats/pull.mjs                 # last 7 days, test devices left out
//   node scripts/stats/pull.mjs --days 30 --all # every row, test devices included
//   node scripts/stats/pull.mjs --out site/rows.local.json   # then open stats.html?local=rows
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : true;
};
const days = Number(arg("days", 7));
const project = JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")).projects.default;
const since = Date.now() - days * 864e5;

const cli = ["-y", "firebase-tools", "database:get", "/qc", "--project", project, "--order-by", "at", "--start-at", String(Math.floor(since))];
const raw = execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", cli, { cwd: ROOT, maxBuffer: 1 << 30, shell: process.platform === "win32" }).toString();
const all = JSON.parse(raw || "null") ?? {};
if (arg("out", null)) {
  writeFileSync(join(ROOT, arg("out")), JSON.stringify(all));
  console.log(`wrote ${arg("out")} (${Object.keys(all).length} rows)`);
}

const TEST = /^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1|\?$)|\.local$|trycloudflare\.com|claudeusercontent|claude\.ai|claude\.site/;
const rows = Object.values(all).filter((r) => r && r.dev && (arg("all", false) || !(r.bot || TEST.test(r.from || ""))));
const devs = new Map();
for (const r of rows) {
  const d = devs.get(r.dev) ?? { qi: 0, st: 0, pct: 0, pl: 0, ses: new Set() };
  d.qi = Math.max(d.qi, r.qi ?? 0);
  if ((r.st ?? 0) > d.st) (d.st = r.st), (d.pct = 0);
  if (r.st === d.st) d.pct = Math.max(d.pct, r.pct ?? 0);
  d.pl = Math.max(d.pl, r.pl ?? 0);
  d.ses.add(r.ses);
  devs.set(r.dev, d);
}
const by = (k) => rows.reduce((m, r) => m.set(r[k], (m.get(r[k]) ?? 0) + 1), new Map());
console.log(`${project} /qc, last ${days} days${arg("all", false) ? " (test rows included)" : ""}: ${rows.length} rows, ${devs.size} players`);
console.log("rows by event:", Object.fromEntries(by("ev")));
console.log("rows by build:", Object.fromEntries(by("build")));
const D = [...devs.values()];
const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0);
console.log(`median play time ${Math.round(med(D.map((d) => d.pl)) / 60)} min, sessions per player ${(D.reduce((a, d) => a + d.ses.size, 0) / (D.length || 1)).toFixed(1)}`);
console.log("furthest quest reached (quests done -> players):");
const hist = new Map();
for (const d of D) hist.set(d.qi, (hist.get(d.qi) ?? 0) + 1);
for (const [qi, n] of [...hist].sort((a, b) => a[0] - b[0])) console.log(`  ${String(qi).padStart(3)}  ${"#".repeat(Math.min(60, n))} ${n}`);

// Build for one host, and check what a checklist would otherwise be trusted to remember.
//
//   node scripts/build-target.mjs crazy     (npm run build:crazy) -> dist/ = THE UPLOAD
//   node scripts/build-target.mjs web       (npm run build:web)
//
// A wrapper rather than `VITE_TARGET=crazy vite build` in package.json: that form is bash syntax
// and a syntax error in cmd.exe, which `npm run` uses on Windows. Rules behind every check:
// C:\CuongPC\Game\CRAZYGAMES_RULES.md and CRAZYGAMES.md in this repo.

import { execSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { privacyBody, privacyPage } from "./privacy-page.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TARGET = process.argv[2] ?? "web";
if (!["web", "crazy"].includes(TARGET)) {
  console.error(`target "${TARGET}" khong hop le - chon web | crazy`);
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_TARGET: TARGET } });

// dist/ is emptied first, so nothing stale rides into the upload (RULES 1.3).
const DIST = join(ROOT, "dist");
rmSync(DIST, { recursive: true, force: true });
run("npx tsc --noEmit");
run("npx vite build");

// The policy as a page of its own: the copy to host for the submission form's URL field.
// Same source as the in-game sheet (src/privacy.html), so the two cannot drift.
const policy = privacyBody(ROOT);
writeFileSync(join(DIST, "privacy.html"), privacyPage(ROOT));

// ── Checks ───────────────────────────────────────────────────────────────────

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(p);
  }
})(DIST);

const bytes = files.reduce((a, f) => a + statSync(f).size, 0);
const mb = (n) => (n / 1024 / 1024).toFixed(2) + " MB";
const text = (f) => (/\.(html|js|css|json|txt)$/.test(f) ? readFileSync(f, "utf8") : "");
const html = readFileSync(join(DIST, "index.html"), "utf8");
const js = files.filter((f) => f.endsWith(".js"));
// Absolute paths break inside the host's iframe; base "./" should make this impossible.
const absolute = html.match(/(?:src|href)="\/[^"]*"/g) ?? [];

const problems = [];
if (files.length > 1500) problems.push(`${files.length} file - tran la 1500`);
if (bytes > 250 * 1024 * 1024) problems.push(`${mb(bytes)} - tran la 250 MB`);
if (absolute.length) problems.push(`co duong dan tuyet doi: ${absolute.join(" ")}`);

// The platform split, proved rather than assumed. privacy.html may name CrazyGames (it is prose
// about a data processor, not code), so it is exempt, and only it.
const sdkFiles = files.filter((f) => !f.endsWith("privacy.html") && text(f).includes("sdk.crazygames.com"));
if (TARGET === "crazy") {
  // RULES 1.4: the async tag in <head> AND the loader in the game script.
  if (!html.includes('<script async src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>'))
    problems.push("index.html thieu the SDK async trong <head>");
  if (!js.some((f) => text(f).includes("sdk.crazygames.com"))) problems.push("script game khong co SDK CrazyGames");
  if (!html.includes('rel="modulepreload"')) problems.push("thieu modulepreload cho chunk game (tai cham sau SDK)");
} else if (sdkFiles.length) problems.push(`ban ${TARGET} con SDK CrazyGames trong ${sdkFiles.length} file`);

// Dev tools never reach a reviewer (RULES 1.3): preview pages, the headless harness, test handles.
const devFiles = files.filter((f) => /preview|shots|plans|\.map$/.test(relative(DIST, f)));
if (devFiles.length) problems.push(`cong cu dev lot vao dist: ${devFiles.map((f) => relative(DIST, f)).join(", ")}`);
if (TARGET === "crazy" && js.some((f) => /\.__game\s*=|"__game"/.test(text(f)))) problems.push("ban crazy con test handle window.__game");
if (/PASTE|TODO|lorem/i.test(policy)) problems.push("privacy policy con cho trong chua dien");

// No writing of the original game may ship (its dialogue, quest texts, blurbs, worker names,
// research / floor / boost titles, stage names): the bundle is searched for every such string
// of the decoded tables. They only live in src/data/orig, which the game must not import.
const ORIG_ECON = join(ROOT, "src/data/orig/economy.json");
try {
  const e = JSON.parse(readFileSync(ORIG_ECON, "utf8"));
  const prose = new Set();
  const add = (s, min = 12) => typeof s === "string" && s.trim().length >= min && prose.add(s.trim().slice(0, 40));
  for (const d of e.onboardingSequence) for (const l of d.dialogue ?? []) add(l.replace(/\s+/g, " "));
  // Quest labels under 16 characters are stock phrases ("Break Ores", "Clear Stage 1").
  for (const g of Object.values(e.quests)) if (Array.isArray(g)) for (const q of g) add(q.text, 16);
  for (const q of Object.values(e.equipment)) (add(q.description), add(q.detail));
  for (const p of e.workers.profiles) add(p.desc);
  for (const n of e.management.treeNodes) add(n.title);
  for (const b of e.rvBoosts.boosts) add(b.description);
  for (const g of Object.values(e.quests)) if (Array.isArray(g)) for (const q of g) if (q.guide?.type === "ToastMessage") add(q.guide.detail);
  // Every original stage name (stage1..10.json in src/data/orig).
  const stageNames = readdirSync(join(ROOT, "src/data/orig"))
    .filter((f) => /^staged+.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(ROOT, "src/data/orig", f), "utf8")).name)
    .filter(Boolean);
  const words = ["Bulldozer Master", "Supercent", ...stageNames, ...e.workers.profiles.map((p) => p.name)];
  // Plain phrases we chose to keep word for word ("Hire 3 Workers") live in text.json: not a leak.
  const ours = new Set();
  (function walk(o) {
    if (typeof o === "string") ours.add(o.trim().slice(0, 40));
    else if (o && typeof o === "object") Object.values(o).forEach(walk);
  })(JSON.parse(readFileSync(join(ROOT, "src/data/text.json"), "utf8")));
  const bundle = js.map(text).join("\n") + html;
  const hits = [...prose, ...words].filter((s) => !ours.has(s.trim()) && bundle.includes(s.trim()));
  if (hits.length) problems.push(`ban build con ${hits.length} chuoi chu cua game goc, vd "${hits[0]}" - game phai doc src/data/game + text.json`);
} catch {
  // src/data/orig gone: nothing to compare against.
}

// Not build errors, but reasons NOT to submit yet (the build still lands in dist/).
const blockers = [];
// What the shipped tables still take from the original (scripts/slimdata.py writes the list).
try {
  const origin = JSON.parse(readFileSync(join(ROOT, "src/data/game/ORIGIN.json"), "utf8"));
  for (const [file, what] of Object.entries(origin)) blockers.push(`src/data/game/${file}: ${what} - CLAUDE.md: thay truoc khi phat hanh`);
} catch {
  blockers.push("khong doc duoc src/data/game/ORIGIN.json (chay python -I scripts/slimdata.py)");
}

console.log("");
console.log(`Ban "${TARGET}": ${files.length} file · ${mb(bytes)}`);
console.log(bytes <= 20 * 1024 * 1024 ? "  OK  duoi 20 MB - du dieu kien len trang chu ban mobile" : "  !!  tren 20 MB - mat suat trang chu mobile");
console.log(`  OK  ${files.length} file - tran la 1500`);
console.log(absolute.length ? "  !!  co duong dan tuyet doi" : "  OK  duong dan tuong doi");
console.log(TARGET === "crazy" ? `  ${sdkFiles.length ? "OK" : "!!"}  co SDK CrazyGames (${sdkFiles.length} file)` : `  ${sdkFiles.length ? "!!" : "OK"}  khong co SDK CrazyGames`);
console.log("  OK  dist/privacy.html (ban de host cho o Privacy policy URL)");
for (const f of files) console.log(`      ${relative(DIST, f).replace(/\\/g, "/")}  ${mb(statSync(f).size)}`);

if (problems.length) {
  console.log("");
  for (const p of problems) console.log(`  XX  ${p}`);
  process.exit(1);
}
if (blockers.length) {
  console.log("");
  for (const b of blockers) console.log(`  XX  CHUA NEN NOP: ${b}`);
  console.log("      dist/ da build xong, nhung dung nop cho toi khi het dong tren.");
}

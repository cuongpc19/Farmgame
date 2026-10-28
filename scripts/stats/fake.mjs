// Made-up rows in the shape src/game/telemetry.ts sends, to look at site/stats.html without
// Firebase: http://localhost:5173/site/stats.html?local=sample (dev server running).
//
//   node scripts/stats/site.mjs && node scripts/stats/fake.mjs [players=400] [days=14]
//
// Writes site/sample.local.json (never deployed: firebase.json ignores *.local.json).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const { quests } = JSON.parse(readFileSync(join(ROOT, "site/quests.json"), "utf8"));
const PLAYERS = Number(process.argv[2] ?? 400);
const DAYS = Number(process.argv[3] ?? 14);
const NOW = Date.now();

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const id = (n) => Array.from({ length: n }, () => pick("abcdefghijkmnpqrstuvwxyz23456789")).join("");

/** Chance to give up on quest i: the tutorial and the "save up" quests lose the most. */
const quit = (q) => (q.index < 4 ? 0.09 : q.type === "HoldCurrency" ? 0.12 : q.type === "StageProgression" ? 0.1 : 0.04);
/**
 * The work report a beat carries (telemetry.ts WorkProbe), made up: the crew is hired at the
 * first HireWorker, and on the "clear N %" quests it gets stuck more and the rock gets harder.
 */
function work(q, crew, tw) {
  const grind = q.type === "StageProgression";
  const wm = Math.ceil(crew / 2);
  const ta = tw * (0.6 + rnd() * 0.4);
  return {
    tw, ta: Math.round(ta), bp: Math.round((ta / 60) * (grind ? 1.2 : 2.5) * rnd()), bv: Math.round((tw / 60) * (grind ? 2 : 3) * rnd()),
    bw: Math.round((tw / 60) * wm * (grind ? 0.4 : 1.1) * rnd()), tv: Math.round(tw * 0.4 * rnd()), tb: Math.round(tw * 0.15 * rnd()), td: Math.round(tw * 0.05 * rnd()),
    tf: Math.round(tw * 0.3 * rnd()), wk: Math.round(crew * tw * (grind ? 0.25 : 0.05) * rnd()), wi: Math.round(crew * tw * 0.1 * rnd()),
    wr: Math.round(crew * tw * 0.2 * rnd()), wn: crew, wm, fr: Math.round(60 + rnd() * 200), hb: Math.round((grind ? 14 : 8) + rnd() * 6), hv: crew ? Math.round(3 + rnd() * 3) : 0,
  };
}
/** Stage progress after finishing quest i (rough: 40 % at the first StageProgression, 80 % at the second). */
function pctAfter(i) {
  const q = quests[i];
  const inStage = quests.filter((x) => x.stage === q.stage);
  const k = inStage.indexOf(q) + 1;
  return Math.min(80, Math.round((k / inStage.length) * 85 * 10) / 10);
}

const rows = {};
let key = 0;
const put = (r) => (rows[`r${String(key++).padStart(7, "0")}`] = r);

for (let p = 0; p < PLAYERS; p++) {
  let dev = id(10);
  const sid = id(10);
  let crew = 0;
  const first = NOW - rnd() * DAYS * 864e5;
  const mob = rnd() < 0.62 ? 1 : 0;
  const tz = pick(["Asia/Ho_Chi_Minh", "Europe/Berlin", "America/New_York", "Europe/Paris", "Asia/Jakarta", "America/Sao_Paulo"]);
  const host = rnd() < 0.9 ? "crazy" : "web";
  const from = host === "crazy" ? "games.crazygames.com" : pick(["localhost", "192.168.1.9"]);
  const build = rnd() < 0.3 ? "0.9.0-643417b" : "0.9.0-a1b2c3d";
  let qi = 0, st = 1, pl = 0, cash = 0, n = 0, t = first;
  let alive = true;
  if (rnd() < 0.006) {
    put({ ev: "fail", dev, first, n: 1, ses: id(8), st: 1, pct: 0, qi: 0, cash: 0, pl: 0, ss: 0, msg: "WebGL: context could not be created", boot: 4200, build, host, from, at: t });
    continue;
  }
  while (alive && t < NOW) {
    n++;
    const ses = id(8);
    const len = 60 * (2 + rnd() * (n === 1 ? 14 : 30));
    const t0 = t;
    // Now and then the cloud save carries the player to another browser: a new device code, the same save code.
    if (n > 1 && rnd() < 0.1) dev = id(10);
    const base = () => ({ dev, sid, first, n, ses, st, pct: qi ? (quests[qi - 1]?.stage === st ? pctAfter(qi - 1) : 0) : 0, qi, cash: Math.round(cash), pl: Math.round(pl), ss: Math.round((t - t0) / 1000), build, host, from });
    put({ ev: "open", ...base(), boot: Math.round(1500 + rnd() * (mob ? 5000 : 2500)), lang: "en-US", tz, mob, land: mob ? 0 : 1, pm: mob && rnd() < 0.4 ? 1 : 0, at: t });
    let s = 0, nextBeat = 60;
    while (s < len && alive) {
      const q = quests[qi];
      if (!q) break;
      const need = 25 + rnd() * 60 * (1 + qi / 6);
      if (s + need > len) break;
      s += need; pl += need; t = t0 + s * 1000; cash += 40 + qi * 30 * rnd();
      while (nextBeat < s) {
        put({ ev: "beat", ...base(), ss: nextBeat, fps: Math.round(mob ? 22 + rnd() * 38 : 45 + rnd() * 15), pm: 0, ...work(q, crew, nextBeat === 60 ? 60 : 300), at: t0 + nextBeat * 1000 });
        nextBeat += 300;
      }
      if (rnd() < quit(q)) { alive = false; break; }
      qi++;
      put({ ev: "quest", ...base(), qid: q.id, qt: q.text, at: t });
      if (q.type === "StageCleared") put({ ev: "clear", ...base(), cl: q.stage, at: t + 1000 });
      if (q.type === "StageContract") st = Math.min(2, st + 1);
      if (rnd() < 0.6) put({ ev: "buy", ...base(), kind: "up", key: pick(["pickaxeAttackPower", "playerMoveSpeed", "woodenCarrierCargo", "smelterSmeltingSpeed"]), lv: 1 + Math.floor(qi / 3), at: t + 2000 });
      if (q.type === "PurchaseLightEquip") put({ ev: "buy", ...base(), kind: "tool", key: qi < 20 ? "sledgehammer" : "jackhammer", at: t + 500 });
      if (q.type === "EnterBuilding" && q.condition === 104) put({ ev: "seen", ...base(), key: "building:shop", at: t - 500 });
      if (q.type === "RentHeavyEquip" && rnd() < 0.8) put({ ev: "seen", ...base(), key: "card:hydraulicBreaker", at: t - 300 });
      if (q.type === "RentHeavyEquip") put({ ev: "buy", ...base(), kind: "rent", key: pick(["wheelbarrow", "hydraulicBreaker", "wheelLoader"]), at: t + 500 });
      if (q.type === "HireWorker") crew = Math.min(5, crew + 2);
      if (q.type === "HireWorker") put({ ev: "buy", ...base(), kind: "hire", key: pick(["Mining1", "Carrying1", "Mining2"]), at: t + 500 });
      if (rnd() < 0.004) put({ ev: "err", ...base(), msg: "TypeError: Cannot read properties of undefined (reading 'pos') @index.js:1", at: t + 100 });
    }
    t = t0 + Math.min(s, len) * 1000 + 5000;
    put({ ev: "hide", ...base(), at: t });
    if (!alive || rnd() < (n === 1 ? 0.55 : 0.35)) break;
    t += (rnd() < 0.5 ? 3600e3 : 864e5) * (0.5 + rnd() * 2);
  }
}
const out = Object.fromEntries(Object.entries(rows).filter(([, r]) => r.at <= NOW));
writeFileSync(join(ROOT, "site/sample.local.json"), JSON.stringify(out));
console.log(`site/sample.local.json: ${Object.keys(out).length} rows, ${PLAYERS} players over ${DAYS} days`);

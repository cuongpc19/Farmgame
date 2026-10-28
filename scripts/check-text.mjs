// Check src/data/text.json against the copy in git HEAD: same keys in every section (new sections allowed), dialogue
// entries with the same number of lines, the same {0}-style placeholders in each string, no Mars Miner (or older
// Quarry Crush) words left. Candy Miner names: docs/CANDY.md.
//
//   node scripts/check-text.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const now = JSON.parse(readFileSync("src/data/text.json", "utf8"));
const old = JSON.parse(execFileSync("git", ["show", "HEAD:src/data/text.json"]).toString());
const problems = [];
const walk = (a, b, path) => {
  if (typeof a === "string") {
    if (typeof b !== "string") return problems.push(`${path}: not a string any more`);
    const ph = (s) => (s.match(/\{\d+\}/g) ?? []).sort().join();
    if (ph(a) !== ph(b)) problems.push(`${path}: placeholders ${ph(a)} -> ${ph(b)}`);
    return;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return problems.push(`${path}: ${a.length} lines -> ${Array.isArray(b) ? b.length : "not a list"}`);
    a.forEach((x, i) => walk(x, b[i], `${path}[${i}]`));
    return;
  }
  if (a && typeof a === "object") {
    if (!b || typeof b !== "object") return problems.push(`${path}: missing`);
    for (const k of Object.keys(a)) {
      if (!(k in b)) problems.push(`${path}.${k}: missing`);
      else walk(a[k], b[k], `${path}.${k}`);
    }
  }
};
walk(old, now, "text");
// Mars Miner's space words (people, places, machines, fuel, ore names), then the Quarry Crush words before it.
// Not "truck": Candy Miner's machines are Smash Truck, Scoop Truck, … (docs/CANDY.md).
const banned = new RegExp(
  [
    String.raw`\brex\b`, String.raw`\bnova\b`, "captain", "commander", "rookie", "asteroid", "dig site", String.raw`\brovers?\b`,
    "hangar", "refin", "fuel", "regolith", "meteor", "space", String.raw`\bmars\b`, "cargo", "trade post", "canteen",
    "drone", "orbit", "crater", String.raw`\bmission\b`, String.raw`\bcrew quarters\b`, String.raw`\bupgrade lab\b`, String.raw`\blab\b`,
    String.raw`\bastro`, String.raw`\bmoons?\b`, String.raw`\bcomets?\b`, String.raw`\bplanet`, String.raw`\bgalax`, String.raw`\brocket`,
    String.raw`\bthruster`, String.raw`\bplasma\b`, String.raw`\blaser`, String.raw`\breactor`, String.raw`\blaunch`, String.raw`\bgrav`,
    String.raw`zero-?g\b`, String.raw`\btitan\b`, String.raw`\bion\b`, String.raw`\bpods?\b`, String.raw`\bbeam`, String.raw`\bxeno`,
    String.raw`\bvoid\b`, String.raw`\bexo\b`, String.raw`\bcadet`, String.raw`\bpilot`, String.raw`\bstation\b`, String.raw`\bbars?\b`,
    String.raw`\bores?\b`, "glowstone", "olivine",
    "quarry", "furnace", "machinery center", "foreman", String.raw`\bgus\b`, String.raw`\bmia\b`, "pizza", String.raw`\boil\b`,
    "wheelbarrow", "pickaxe", "sledgehammer", "jackhammer", "bulldozer",
  ].join("|"),
  "i",
);
const scan = (v, path) => {
  if (typeof v === "string") {
    if (path !== "text._note" && banned.test(v)) problems.push(`${path}: old word: ${v.match(banned)[0]} in "${v}"`);
  } else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) scan(x, `${path}.${k}`);
};
scan(now, "text");
if (problems.length) {
  console.log(problems.join("\n"));
  console.log(`${problems.length} problem(s)`);
  process.exit(1);
}
console.log("text.json OK");

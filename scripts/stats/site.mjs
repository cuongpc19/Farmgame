// Fills site/ (Firebase Hosting, firebase.json runs this before every hosting deploy):
//   site/privacy.html  the policy, from src/privacy.html (the URL for the CrazyGames form)
//   site/quests.json   the quest chain and readable names, for site/stats.html
// Both are generated: edit src/privacy.html and src/data/, never these.
//
//   node scripts/stats/site.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { privacyPage } from "../privacy-page.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SITE = join(ROOT, "site");
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

writeFileSync(join(SITE, "privacy.html"), privacyPage(ROOT));

const E = json("src/data/game/economy.json");
const T = json("src/data/text.json");

// The chain exactly as data.ts builds it (QUESTS): group 1, stages 1-4, without the idle-reward
// claims the game leaves out (the indices must match S.quest.index). "{0}" is an amount data.ts
// fills from the cheaper prices; the rows the game sends carry the real text and win over this one.
const quests = E.quests.group1
  .filter((q) => q.type !== "ClaimRndReward")
  .map((q, index) => ({
    index,
    id: q.id,
    stage: typeof q.stage === "number" ? q.stage : parseInt(String(q.stage), 10),
    type: q.type,
    text: (T.quests[String(q.id)] ?? `Quest ${q.id}`).replace("{0}", "…"),
  }));

// What a `buy` row's key means.
const names = {};
for (const [key, q] of Object.entries(E.equipment)) names[`tool:${key}`] = names[`rent:${key}`] = q.name;
for (const [key, u] of Object.entries(E.statUpgrades)) names[`up:${key}`] = `${u.target} · ${T.upgrades[key] ?? u.name}`;
for (const [id, title] of Object.entries(T.research)) names[`hq:${id}`] = title;
// Boost / gift offers (telemetry buy kind "boost"): floor tiles, HUD offers, facility buttons, gift cans, the quest-26 pizza party.
const WHERE = { 1001: "ô dưới đất", 1002: "ô dưới đất", 1003: "ô dưới đất", 3001: "nút HUD", 3002: "nút HUD", 3003: "nút HUD", 5001: "ở lò", 5002: "ở SELL", 5003: "ở xe pizza", 7001: "ATM trong cửa hàng" };
for (const [id, where] of Object.entries(WHERE)) names[`boost:${id}`] = `${T.boosts[id]?.title ?? id} · ${where}`;
for (const id of [1001, 1002, 1003]) names[`boost:gift${id}`] = `${T.boosts[id]?.title ?? id} · lon quà`;
names["boost:5003b"] = `${T.boosts[5003]?.title ?? 5003} · tặng ở quest 26`;
names["boost:3001b"] = `${T.boosts[3001]?.title ?? 3001} · tặng ở quest 26`;

writeFileSync(join(SITE, "quests.json"), JSON.stringify({ quests, names, stages: T.stages }, null, 1) + "\n");
console.log(`site/privacy.html, site/quests.json (${quests.length} quests, ${Object.keys(names).length} names)`);

/**
 * Typed access to the game data (src/data/game, made by scripts/slimdata.py + stagegen.py from
 * the decoded tables in src/data/orig, with none of the original's writing left in it; what is
 * still the original's is listed in src/data/game/ORIGIN.json). Every string the player reads
 * comes from src/data/text.json.
 *
 * Coordinates: the data uses map cells (x east, z north, 2.5 world units per cell). The
 * game uses three.js world space with the camera looking north, so data +z (north, into
 * the quarry) becomes world −z (up the screen). A block at cell (x, z) sits at world
 * ((x − 500)·2.5, 0, (500 − z)·2.5).
 */
// Stage 1's quarry is ours (a fan, scripts/stagegen.py); stages 2-10 are the decoded maps
// mirrored with their ores dealt again (scripts/stagevar.py).
import stage1Raw from "../data/game/stage1.json";
import stage2Raw from "../data/game/stage2.json";
import stage3Raw from "../data/game/stage3.json";
import stage4Raw from "../data/game/stage4.json";
import stage5Raw from "../data/game/stage5.json";
import stage6Raw from "../data/game/stage6.json";
import stage7Raw from "../data/game/stage7.json";
import stage8Raw from "../data/game/stage8.json";
import stage9Raw from "../data/game/stage9.json";
import stage10Raw from "../data/game/stage10.json";
import economyRaw from "../data/game/economy.json";
// Our own wording: the only source of quest, dialogue, blurb, worker, boost, HQ and stage texts.
import textRaw from "../data/text.json";

export const CELL = 2.5;
export const ORIGIN = 500;

import type { CandyPattern } from "./world/candyTex";

/* eslint-disable @typescript-eslint/no-explicit-any */
const E = economyRaw as any;

export type OreCategory = "rock" | "metal" | "jewel";
export interface OreDef {
  key: string;
  id: number;
  name: string;
  category: OreCategory;
  hp: number;
  mineralId: number;
  ingotId: number;
  ingotPrice: number;
  smeltSeconds: number;
  /** Our own palette (not from the original). */
  rock: number;
  vein?: number;
  ingot: number;
  /** Candy Miner: the block's candy pattern and its second colour (world/candyTex.ts). */
  pattern: CandyPattern;
  accent?: number;
  /** Colours the blocks of this kind are tinted with, one per block (sugar cubes). */
  tints?: number[];
}

/**
 * Visual palette per ore key: the candy each block is (Candy Miner; names in docs/CANDY.md). `rock` is the candy's
 * main colour, `accent` the second colour of its pattern, `vein` the colour of the little sweets stuck on the blocks
 * worth more (BlockField nuggets; hard and gem candies), `ingot` the cooked treat bar.
 */
const PALETTE: Record<string, { rock: number; vein?: number; ingot: number; pattern: CandyPattern; accent?: number; tints?: number[] }> = {
  // Sugar cubes in pastel colours, one per block (BlockField tints): the first 200 blocks are all sugar (the ladder).
  limestone: { pattern: "sugar", rock: 0xfdfbf8, ingot: 0xffd6e6, tints: [0xffb8d4, 0xaeeccf, 0xffe58f, 0xd2bdff, 0xaad8ff, 0xffc7a6] },
  sandstone: { pattern: "caramel", rock: 0xe9a55a, ingot: 0xf2b46a },
  dunite: { pattern: "swirl", rock: 0xeafff6, accent: 0x3fcf9a, ingot: 0x7fe8c0 },
  ice: { pattern: "crystal", rock: 0xcdefff, ingot: 0xe0f6ff },
  copper: { pattern: "caramel", rock: 0xc87a3e, accent: 0xffe2a8, vein: 0xffd08a, ingot: 0xdc8c4c },
  iron: { pattern: "licorice", rock: 0x2e2529, accent: 0xff6f9a, vein: 0xff6f9a, ingot: 0x45363e },
  manganese: { pattern: "gummy", rock: 0x9b5de5, vein: 0xe6d0ff, ingot: 0xb07cf0 },
  silver: { pattern: "pearl", rock: 0xdde3ee, vein: 0xffffff, ingot: 0xeef2fa },
  gold: { pattern: "honeycomb", rock: 0xf2b636, vein: 0xfff0b0, ingot: 0xffcc4a },
  amber: { pattern: "gummy", rock: 0xf29a2a, vein: 0xffd890, ingot: 0xffae45 },
  amethyst: { pattern: "gummy", rock: 0x8e3fb0, vein: 0xf2b0ff, ingot: 0xb05ad6 },
  emerald: { pattern: "gummy", rock: 0x5ed34a, vein: 0xdcffb8, ingot: 0x7ae866 },
  diamond: { pattern: "crystal", rock: 0xbff2ff, vein: 0xffffff, ingot: 0xd6f8ff },
  // Stages 3-10.
  bronzite: { pattern: "caramel", rock: 0xd29a4a, accent: 0x8a5a2a, vein: 0xf2d090, ingot: 0xdcaa5a },
  obsidian: { pattern: "choco", rock: 0x3d2319, vein: 0xff8fb8, ingot: 0x4e2d20 },
  bismuth: { pattern: "sprinkle", rock: 0xfff0fa, vein: 0xff8ad8, ingot: 0xffb8e6 },
  basalt: { pattern: "choco", rock: 0x7d4a2c, ingot: 0x8f5834 },
  aquamarine: { pattern: "gummy", rock: 0x3fb8f0, vein: 0xd0f4ff, ingot: 0x6ccaf6 },
  yooperlite: { pattern: "glow", rock: 0x2c2440, accent: 0xffa040, vein: 0xffb04a, ingot: 0xffa04a },
  opal: { pattern: "sprinkle", rock: 0xffe6f6, vein: 0xc8f0ff, ingot: 0xf6e0ff },
  zircon: { pattern: "swirl", rock: 0xd4f046, accent: 0xffffff, vein: 0xfbff9a, ingot: 0xe0f46a },
  ruby: { pattern: "swirl", rock: 0xe8243f, accent: 0xffffff, vein: 0xffb0c0, ingot: 0xf04060 },
  coal: { pattern: "choco", rock: 0x4a2a1e, ingot: 0x5c3424 },
  quartz: { pattern: "crystal", rock: 0xf4f8ff, vein: 0xffffff, ingot: 0xfafcff },
  lapisLazuli: { pattern: "gummy", rock: 0x4a5fd8, vein: 0xc8d0ff, ingot: 0x6a7ee8 },
  tanzanite: { pattern: "swirl", rock: 0xf6e8ff, accent: 0x7a4be0, vein: 0xd8c8ff, ingot: 0x9a74f0 },
  mystery: { pattern: "sprinkle", rock: 0xff8fd0, vein: 0xffe14a, ingot: 0xffe14a },
};

export const ORES: Record<string, OreDef> = {};
export const ORE_BY_ID = new Map<number, OreDef>();
for (const [key, o] of Object.entries<any>(E.ores)) {
  const pal = PALETTE[key] ?? { pattern: "sugar" as CandyPattern, rock: 0xffffff, ingot: 0xffe0ec };
  const def: OreDef = {
    key,
    id: o.id,
    // Display names are ours (text.json `ores`, Mars Miner); TEXT is declared further down, so the raw import here.
    name: (textRaw as { ores?: Record<string, string> }).ores?.[key] ?? o.name,
    category: o.category,
    hp: o.hp,
    mineralId: o.mineral.itemId,
    ingotId: o.ingot.itemId,
    ingotPrice: o.ingot.sellPrice,
    smeltSeconds: o.smeltSeconds,
    ...pal,
  };
  ORES[key] = def;
  ORE_BY_ID.set(def.id, def);
}

export const OIL_ITEM = 30000;
export type ItemKind = "mineral" | "ingot" | "oil";
export function itemKind(item: number): ItemKind {
  if (item >= 30000) return "oil";
  return item >= 20000 ? "ingot" : "mineral";
}
const oreOfItem = new Map<number, OreDef>();
for (const o of Object.values(ORES)) {
  oreOfItem.set(o.mineralId, o);
  oreOfItem.set(o.ingotId, o);
}
export function oreOfItemId(item: number): OreDef | undefined {
  return oreOfItem.get(item);
}
export function itemColor(item: number): number {
  if (item === OIL_ITEM) return 0x2b2f3a;
  const o = oreOfItem.get(item);
  if (!o) return 0xffffff;
  return itemKind(item) === "ingot" ? o.ingot : (o.vein ?? o.rock);
}
export function itemName(item: number): string {
  if (item === OIL_ITEM) return "Syrup Jar";
  const o = oreOfItem.get(item);
  return o ? `${o.name}${itemKind(item) === "ingot" ? " Ingot" : ""}` : "?";
}

/* ---------- stages ---------- */

export interface Placed {
  type: string;
  x: number;
  z: number;
  w: number;
  h: number;
  rotY: number;
  /** World centre. */
  wx: number;
  wz: number;
  groupId?: number;
  payType?: string;
  rail?: [number, number][];
  /** The raw stage record (structure-specific fields: bridge points, deposits, return point...). */
  raw?: any;
}

export interface StageDef {
  id: number;
  order: number;
  name: string;
  /** Which block layout this is ("orig" = the decoded one); saves of another layout restart the quarry. */
  layout: string;
  maxWorkers: number;
  clearPercent: number;
  totalDrops: number;
  rentMult: number;
  oreHpMult: number;
  keyOre: string;
  /** Contract card fields. */
  difficulty: string;
  client: string;
  cashTarget: number;
  cashback: { fraction: number; item: string; amount: number }[];
  reward: { item: string; amount: number }[];
  blocks: { cx: number; cz: number; ore: OreDef }[];
  /** `lawn`: grass beside the base where cliff walls used to stand (not walkable; stage 1, stagegen.py). */
  areas: { ground: Placed[]; home: Placed[]; obstacle: Placed[]; lawn: Placed[] };
  buildings: Placed[];
  structures: Placed[];
  spawns: Placed[];
  props: Placed[];
  cafeteria: Placed[];
}

export function cellToWorld(x: number, z: number): { x: number; z: number } {
  return { x: (x - ORIGIN) * CELL, z: (ORIGIN - z) * CELL };
}

function placed(p: any): Placed {
  const w = p.w ?? 1;
  const h = p.h ?? 1;
  const c = cellToWorld(p.x + (w - 1) / 2, p.z + (h - 1) / 2);
  return {
    type: p.type,
    x: p.x,
    z: p.z,
    w,
    h,
    rotY: p.rotY ?? 0,
    wx: c.x,
    wz: c.z,
    raw: p,
    groupId: p.structureGroupId,
    payType: p.expansion?.[0]?.payType,
    rail: p.railWaypoints,
  };
}

const TEXT = textRaw as {
  speakers: Record<string, string>;
  stages: Record<string, string>;
  quests: Record<string, string>;
  dialogue: Record<string, string[]>;
  equipment: Record<string, { name?: string; desc?: string; detail?: string }>;
  /** Ore display names by ore key (Mars Miner). */
  ores?: Record<string, string>;
  upgrades: Record<string, string>;
  workers: Record<string, { name: string; trait: string; desc: string }>;
  /** By boost id. */
  boosts: Record<string, { title: string; description: string }>;
  /** By HQ floor id. */
  floors: Record<string, { name: string; title: string | null }>;
  /** By HQ research node id. */
  research: Record<string, string>;
  /** Quest-guide toasts, by the key slimdata.py puts in the guide's `detail`. */
  toasts: Record<string, string>;
};
/**
 * Pacing knobs, all 1 = the original's economy and pace. Mars Miner (user 2026-10-28: "players should progress much
 * faster than before, reach the quests and get strong more easily"; Quarry Crush at 1 took a median 6 min to the
 * hammer quest, 35 to "Save 2500", 108 to stage 2): half prices, every step of the loop faster, half the counted
 * quests and 3x the quest cash. Quarry Crush history: 2026-10-19 prices x0.8 and faster mining; 2026-10-20 the
 * original's prices with every step of the loop x1.5 (trucks x2), then all 1 the same evening ("economy and progress
 * exactly like the original"). Move the loop's knobs together: mining alone faster made the wheelbarrow feel small.
 * What each one scales when it is not 1:
 * - `price`: everything the player pays (tools, rentals, upgrades, hires, HQ research, the cash
 *   quests and the cashback target that follow them) times this, rounded to a tidy step by
 *   `cheaper`. 1 = the decoded prices (it was 0.8 on 2026-10-19). Earnings are unchanged.
 * - `mining`: every miner (player, hired workers, vehicles) swings this much more often
 *   (`interval` in state.ts); it was 1.5 ("+15%", then "another 30% more chunks from the
 *   start", 1.15 x 1.3). Swing rate rather than damage: ore HP are
 *   multiples of 50, so more damage often saves no hit at the low levels (pickaxe 10 -> 11.5
 *   still needs 5 hits on a 50 HP limestone block). Keep the swing interval above the 0.5 s
 *   pickaxe animation (characters.ts SWING_END): 1 s / 1.5 = 0.67 s.
 * - `truck`: sales trucks drive in and out, load ingots and give up on a part load this much
 *   faster (SalesStand.driveTruck; it was 2).
 * - `pickup`: everything that jumps ONTO a back goes this much faster: chunks off the ground
 *   (Mining.collect delays, Drops pull flight) and the furnace tray, ore storage and oil rack
 *   (PICKUP_TRANSFER in base/common.ts), the auto digger's pile too.
 * - `unload`: everything that jumps OFF a back onto a pad goes this much faster: minerals onto
 *   REFINING, ingots onto SELL, minerals into a minecart (UNLOAD_TRANSFER). Workers too.
 * - `plant`: the furnace smelts, the oil station fills barrels and the auto digger digs this
 *   much faster.
 * - `cargo`: every ore carrier holds this many times the decoded number, upgrades and HQ
 *   research included (`cargo` in state.ts): the player's carriers, the wheelbarrow, loader and
 *   dump truck, carrier workers, the minecart (at 1.5: 5 -> 8, 25 -> 38, 100 -> 150). The menus
 *   show the real numbers. The ATV's oil rack is not an ore carrier and keeps its 5 barrels.
 * - `quest`: quests that count things (ore broken, carried, refined, sold, by category too) ask for this share of
 *   the decoded number, rounded to a multiple of 5 and at least 5 (100 -> 50, 10 metal ores -> 5); the tutorial's
 *   counts of 5 and under stay. Upgrade, hire and stage-progress quests are unchanged.
 * - `reward`: quest rewards paid in cash are this many times the decoded amount.
 */
export const PACE = { price: 0.5, mining: 1.25, truck: 2, pickup: 1.5, unload: 1.5, plant: 2, cargo: 1.5, quest: 0.5, reward: 3 };

export function cheaper(p: number): number {
  if (!(p > 0) || PACE.price === 1) return p;
  const v = p * PACE.price;
  const step = v < 50 ? 1 : v < 500 ? 5 : v < 5000 ? 25 : v < 50000 ? 250 : 2500;
  return Math.max(1, Math.round(v / step) * step);
}

/** Dialogue speaker names by speaker id ("hank" / "sofia" are the internal ids). */
export const SPEAKER_NAMES: Record<string, string> = TEXT.speakers;

function stageFrom(raw: any): StageDef {
  return {
    id: raw.id,
    order: raw.order,
    name: TEXT.stages[String(raw.order)] ?? `Stage ${raw.order}`,
    layout: raw.layoutId ?? "orig",
    maxWorkers: raw.maxWorkerCount,
    clearPercent: raw.clear.progressPercentRequired,
    totalDrops: raw.totals.resolved.dropItems,
    rentMult: raw.heavyEquipmentRentMultiplier ?? 1,
    oreHpMult: raw.oreHpMultiplier ?? 1,
    keyOre: raw.keyResourceOre,
    difficulty: String(raw.difficulty ?? "Normal"),
    client: String(raw.contractType ?? "Standard"),
    cashTarget: cheaper(raw.cashTarget ?? 120000),
    cashback: (raw.clear.cashbackMilestones ?? []).map((c: any) => ({
      fraction: c.cashSpentFractionOfCashTarget,
      item: c.reward?.item ?? "Gear",
      amount: c.reward?.amount ?? 0,
    })),
    reward: (raw.clear.rewardOnClear?.items ?? []).map((i: any) => ({ item: i.item, amount: i.amount })),
    blocks: raw.blocks.map((b: any) => ({ cx: b.x - ORIGIN, cz: ORIGIN - b.z, ore: ORES[b.ore] })),
    areas: {
      ground: raw.areas.ground.map(placed),
      home: raw.areas.home.map(placed),
      obstacle: raw.areas.obstacle.map(placed),
      lawn: (raw.areas.lawn ?? []).map(placed),
    },
    buildings: raw.buildings.map(placed),
    structures: raw.structures.map(placed),
    spawns: raw.spawns.map(placed),
    props: raw.props.map(placed),
    cafeteria: raw.cafeteria.map(placed),
  };
}

/** The ten main stages in order. Past stage 10 the game loops through them again (the original's
 * IsLooped) with harder ore and dearer rentals: see `stageMult`. */
export const STAGES: StageDef[] = [stage1Raw, stage2Raw, stage3Raw, stage4Raw, stage5Raw, stage6Raw, stage7Raw, stage8Raw, stage9Raw, stage10Raw]
  .map(stageFrom)
  .sort((a, b) => a.order - b.order);
/** Which map a stage level plays (1-based level, 10 maps, looped). */
export function stageIndexOf(level: number): number {
  return (Math.max(1, level) - 1) % STAGES.length;
}

/* ---------- equipment & upgrades ---------- */

export interface EquipDef {
  key: string;
  id: number;
  name: string;
  category: "HandTool" | "Vehicle" | "Character";
  sub: string;
  rental: boolean;
  price: number;
  unlock: { type: string; value: number };
  desc: string;
  detail: string;
  tier: number;
  stats: Record<string, number>;
}

export const EQUIP: Record<string, EquipDef> = {};
export const EQUIP_BY_ID = new Map<number, EquipDef>();
for (const [key, q] of Object.entries<any>(E.equipment)) {
  if (!q.reachableInStages1to2 && q.unlock?.type !== "ReachStage") continue;
  const stats: Record<string, number> = {};
  for (const [s, v] of Object.entries<any>(q.stats ?? {})) stats[s] = v.base;
  const d: EquipDef = {
    key,
    id: q.id,
    name: TEXT.equipment[key]?.name ?? q.name,
    category: q.category,
    sub: q.subCategory,
    rental: q.ownership === "Rental",
    price: cheaper(q.price),
    unlock: q.unlock,
    desc: TEXT.equipment[key]?.desc ?? "",
    detail: TEXT.equipment[key]?.detail ?? "",
    tier: q.tier ?? 0,
    stats,
  };
  EQUIP[key] = d;
  EQUIP_BY_ID.set(d.id, d);
}

/** Which upgrade keys belong to which equipment (shown once that equipment is owned/rented). */
export const UPGRADE_OWNER: Record<string, string> = {
  playerMoveSpeed: "player",
  pickaxeAttackPower: "pickaxe",
  sledgeHammerAttackPower: "sledgehammer",
  jackhammerAttackPower: "jackhammer",
  woodenCarrierCargo: "woodenCarrier",
  enhancedBackpackCargo: "cargoPack",
  wheelBarrowCargo: "wheelbarrow",
  smelterSmeltingSpeed: "furnace",
  salesTruckWeightMin: "salesStand",
  hydraulicBreakerAttackPower: "hydraulicBreaker",
  hydraulicBreakerMoveSpeed: "hydraulicBreaker",
  hydraulicBreakerFuelEfficiency: "hydraulicBreaker",
  wheelLoaderCargo: "wheelLoader",
  wheelLoaderMoveSpeed: "wheelLoader",
  wheelLoaderFuelEfficiency: "wheelLoader",
  rollerCrusherAttackPower: "rollerCrusher",
  rollerCrusherMoveSpeed: "rollerCrusher",
  rollerCrusherFuelEfficiency: "rollerCrusher",
  dumpTruckCargo: "dumpTruck",
  dumpTruckMoveSpeed: "dumpTruck",
  dumpTruckFuelEfficiency: "dumpTruck",
  atvMoveSpeed: "allTerrainVehicle",
  // Stages 3+.
  largeHandDrillAttackPower: "largeHandDrill",
  knuckleDrillerAttackPower: "knuckleDriller",
  knuckleDrillerOverheatAddAmount: "knuckleDriller",
  exoskeletonCarrierCargo: "exoCarrier",
  drillCrusherAttackPower: "drillCrusher",
  drillCrusherMoveSpeed: "drillCrusher",
  drillCrusherFuelEfficiency: "drillCrusher",
  crushHammerAttackPower: "crushHammer",
  crushHammerMoveSpeed: "crushHammer",
  crushHammerFuelEfficiency: "crushHammer",
  infernoBreakerAttackPower: "infernoBreaker",
  infernoBreakerMoveSpeed: "infernoBreaker",
  infernoBreakerFuelEfficiency: "infernoBreaker",
  haulTruckCargo: "haulTruck",
  haulTruckMoveSpeed: "haulTruck",
  haulTruckFuelEfficiency: "haulTruck",
  bucketWheelAttackPower: "wheelCrusher",
  bucketWheelCargo: "wheelCrusher",
  bucketWheelMoveSpeed: "wheelCrusher",
  bucketWheelFuelEfficiency: "wheelCrusher",
  fuelTruckFuelAmount: "fuelTruck",
  fuelTruckMoveSpeed: "fuelTruck",
};

export interface UpgradeDef {
  key: string;
  name: string;
  target: string;
  order: number;
  price: number[];
  value: number[];
  /** Second value (Sales Trucks: max load; value = min load). */
  value2?: number[];
}
/**
 * The pickaxe hits this many times harder than the original at every level (Mars Miner, user 2026-10-28: instead of
 * the BIG GIFT, "upgraded from the start: two hits and a limestone is done"). With START_LEVEL (Lv.6) that is
 * 12 x 2.1 = 25.2 power, so limestone (50 HP) takes 2 hits; each upgrade adds 0.84. Workers keep their own strength
 * (WorkerUnit.setGear divides it back out).
 */
export const PICKAXE_MUL = 2.1;
export const UPGRADES: Record<string, UpgradeDef> = {};
for (const [key, u] of Object.entries<any>(E.statUpgrades)) {
  const owner = UPGRADE_OWNER[key];
  if (!owner || !(owner === "player" || owner === "furnace" || owner === "salesStand" || EQUIP[owner])) continue;
  UPGRADES[key] = {
    key,
    name: TEXT.upgrades[key] ?? u.name,
    target: u.target,
    order: u.uiOrder ?? 0,
    price: (u.priceToReach as number[]).map(cheaper),
    value: key === "pickaxeAttackPower" ? (u.value as number[]).map((v) => Math.round(v * PICKAXE_MUL * 100) / 100) : u.value,
    value2: u.value2 ?? undefined,
  };
}



/* ---------- quests, dialogue, workers, boosts ---------- */

export interface QuestDef {
  id: number;
  stage: number;
  type: string;
  text: string;
  target: number;
  condition: number;
  reward: { item: string; amount: number };
  /** The reward grows with the stage level (QuestMultiplierData; groups 2 and 1000). */
  scaled: boolean;
  guide: { type: string; detail: string };
}
const COUNTED = new Set(["DestroyOre", "CollectMineral", "ReturnMineralToSmelter", "SellIngot", "DestroyOreByCategory", "SellIngotByCategory"]);
/** "Save {0} for …" follows the cheaper prices it is saving up for; counted quests ask for PACE.quest of their number. */
function questTarget(q: any): number {
  if (q.type === "HoldCurrency") return cheaper(q.target);
  if (COUNTED.has(q.type) && q.target > 5 && PACE.quest !== 1) return Math.max(5, Math.round((q.target * PACE.quest) / 5) * 5);
  return q.target;
}
const questOf = (q: any): QuestDef => ({
  id: q.id,
  stage: typeof q.stage === "number" ? q.stage : parseInt(String(q.stage), 10) || 0,
  type: q.type,
  text: (TEXT.quests[String(q.id)] ?? "").replace("{0}", questTarget(q).toLocaleString("en-US")),
  target: questTarget(q),
  condition: q.condition,
  reward: q.reward?.item === "Money" ? { ...q.reward, amount: Math.round(q.reward.amount * PACE.reward) } : q.reward,
  scaled: !!q.rewardScaledByQuestMultiplier,
  guide: q.guide?.type === "ToastMessage" ? { ...q.guide, detail: TEXT.toasts[q.guide.detail] ?? "" } : q.guide,
});
// Idle-reward claims belong to a meta system we don't have: those cards are left out.
const played = (g: any[]) => g.filter((q) => q.type !== "ClaimRndReward").map(questOf);
/**
 * The guide chain as the original runs it: group 1 (stages 1-4) once, group 2 six times, then
 * group 1000 for ever (here 60 rounds, far more than anyone plays). Saves keep an index into this
 * list, so it only ever grows at the end.
 */
export const QUESTS: QuestDef[] = [
  ...played(E.quests.group1),
  ...Array.from({ length: 6 }, () => played(E.quests.group2 ?? [])).flat(),
  ...Array.from({ length: 60 }, () => played(E.quests.group1000 ?? [])).flat(),
];
export const QUEST_MULT = (E.quests.multiplierByLevel_forUseMultiplierQuests ?? {}) as Record<string, number>;

export interface DialogueDef {
  id: number;
  type: string;
  lines: string[];
}
export const DIALOGUE: DialogueDef[] = (E.onboardingSequence as any[]).map((d) => ({
  id: d.id,
  type: d.type,
  // ⚠ Same number of lines as the source: some entries are played in parts by position.
  lines: TEXT.dialogue[String(d.id)] ?? [],
}));
// Ours: 1601 tells the player that letting go after mining walks on to the next rock (Game.autoMine).
DIALOGUE.push({ id: 1601, type: "AutoMine", lines: TEXT.dialogue["1601"] ?? [] });

export interface WorkerProfile {
  id: number;
  name: string;
  role: "Mining" | "Carrying";
  tier: number;
  price: number;
  trait: string;
  desc: string;
  stats: { moveSpeed: number; stamina: number; power: number; cargo: number };
  recommended: string[];
}
export const WORKER_PROFILES: WorkerProfile[] = (E.workers.profiles as any[]).map((p) => ({
  id: p.id,
  name: TEXT.workers[String(p.id)]?.name ?? "",
  role: p.role,
  tier: p.tier,
  price: cheaper(p.hirePrice),
  trait: TEXT.workers[String(p.id)]?.trait ?? "",
  desc: TEXT.workers[String(p.id)]?.desc ?? "",
  stats: {
    moveSpeed: p.stats.moveSpeed.value,
    stamina: p.stats.staminaAmount.value,
    power: p.stats.attackPower.value,
    cargo: p.stats.cargo.value,
  },
  recommended: Object.entries<any>(p.stats)
    .filter(([, v]) => v.recommended)
    .map(([k]) => k),
}));
export const WORKER_RULES = {
  hirePriceMult: E.workers.hirePriceStageMultiplier as Record<string, number>,
  recruit: (E.workers.recruit as any[]).find((r) => r.gameMode === "MainStage"),
  onboarding: E.workers.onboardingApplicants as { profileId: number; role: string }[],
  staminaRecoverSeconds: E.workers.staminaRecoverSeconds as number,
};

export const GAMEPLAY = E.gameplayConstants as {
  criticalDamageMultiplier: number;
  miningRangePlayerAndWorker: number;
  minecartCapacity: number;
  minecartLoadWaitSeconds: number;
  minecartUnloadIntervalSeconds: number;
  stackTransferIntervalSeconds: number;
  dropCollectDelaySeconds: number;
  oilStationMaxBarrels: number;
  fuelPerOilBarrel: number;
  oilAbsorbIntervalSeconds: number;
  extraOilStationGenerateIntervalSeconds?: number;
  autoDiggerDigIntervalSeconds: number;
  vehicleEmptyFuelMoveSpeedMulti: number;
  mainClearProgressPercent: number;
};

export const RV_BOOSTS = E.rvBoosts.boosts as any[];
for (const b of RV_BOOSTS) {
  const t = TEXT.boosts[String(b.id)];
  b.title = t?.title ?? "BOOST";
  b.description = t?.description ?? "";
}
export const RV_CONFIG = E.rvBoosts.remoteConfig as Record<string, string>;
export const MANAGEMENT = E.management as any;
for (const f of MANAGEMENT.floors ?? []) {
  const t = TEXT.floors[String(f.id)];
  f.name = t?.name ?? "";
  f.title = t?.title ?? null;
}
for (const n of MANAGEMENT.treeNodes ?? []) {
  n.title = TEXT.research[String(n.id)] ?? "";
  if (typeof n.price === "number") n.price = cheaper(n.price);
}
export const STAGE_MULT = E.stageMultipliers as Record<string, { oreHpMultiplier: number; heavyEquipmentRentMultiplier: number }>;
/** Ore HP / rental price multipliers of a stage level (the table ends at 21; later levels keep its last row). */
export function stageMult(level: number): { oreHpMultiplier: number; heavyEquipmentRentMultiplier: number } {
  const top = Math.max(...Object.keys(STAGE_MULT).map(Number));
  return STAGE_MULT[String(Math.min(Math.max(1, level), top))] ?? { oreHpMultiplier: 1, heavyEquipmentRentMultiplier: 1 };
}
export const ITEM_MULT = E.itemMultipliersByStage as any;
export const REWARDS = E.rewards as any;
/** Per stage ("stage3" …) and structure group: expansion levels, and the ore deposit of an auto digger. */
export const STRUCTURE_INFO = E.structures as Record<string, Record<string, any[]>>;

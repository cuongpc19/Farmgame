import { EQUIP, MANAGEMENT, ORIGIN, PACE, STAGES, UPGRADES, stageIndexOf, stageMult, type StageDef } from "./data";
import { load, save } from "./save";

/** Items in flight between machines, saved so a reload doesn't lose them. */
export interface Transit {
  /** Chunks on the ground, flattened [item, x, z, item, x, z, …]. */
  ground: number[];
  player: number[];
  vehicles: Record<string, { items: number[]; fuel: number }>;
  furnaceQueue: number[];
  furnaceOut: number[];
  /** The Forge's queue and tray (farm game; the Mill keeps the furnace fields). */
  forgeQueue?: number[];
  forgeOut?: number[];
  sellPile: number[];
  /** Cash waiting on the pallet by the SELL pad. */
  pallet: number;
  storage: number[];
  carts: number[][];
  /** Stage 2 save before 2026-10-20: the one auto digger's deposit. */
  diggerLeft?: number;
  /** Ore left in each auto digger's deposit, by structure group. */
  diggers?: Record<string, number>;
}

/** Everything that belongs to the current quarry and is reset when a new one is contracted. */
export interface StageRun {
  /** Which of the ten maps (STAGES index); follows from `level`. */
  stageIndex: number;
  /** Stage level, 1, 2, 3, … (after 10 the maps come round again, harder). Missing = stageIndex + 1. */
  level?: number;
  /** Ingots sold at the SELL pad this stage — the progress numerator. */
  sold: number;
  /** Destroyed block indices, packed as a bitset string. */
  broken: string;
  /** Heavy equipment rented (equipment keys), for this stage only: the contract leaves them behind, like the original. */
  rentals: string[];
  /** Cash spent this stage (cashback milestones). */
  spent: number;
  cashbackClaimed: number;
  /** Structure groups unlocked this stage (minecarts, auto digger). */
  structures: number[];
  /** Hired worker profile ids. */
  workers: number[];
  /** True once the 80 % clear dialogue has been shown. */
  clearHinted: boolean;
  /** Cash collected this stage (result screen). */
  earned: number;
  /** Blocks broken / minerals hauled to the furnace, by unit name (Top 4 Workers). */
  mined: Record<string, number>;
  hauled: Record<string, number>;
  /** Clear rewards already paid (a reload mid clear-flow must not pay twice). */
  rewarded?: boolean;
  /** Block layout `broken` refers to (StageDef.layout; missing = "orig"). */
  layout?: string;
  /** Current job applicants (profile ids), so a reload doesn't re-roll them. */
  applicants?: number[];
  /** "New Applications Received!" already announced this stage. */
  appsToast?: boolean;
  transit?: Transit;
  /** Boost offers whose free try was used on this stage (Boosts TRIALS; stage 1 keeps them in `dialogues`). */
  trials?: number[];
  /** Light tools lent to workers: worker profile id → tool key. */
  gear?: Record<string, string>;
  /** Extra cafeteria tables opened (by ad) beyond the first. */
  cafTables?: number;
}

export interface SaveData {
  v: 1;
  cash: number;
  gems: number;
  gear: number;
  upgrades: Record<string, number>;
  /** Permanently owned hand tools. */
  owned: string[];
  equipMining: string;
  equipCarrying: string;
  /**
   * `at`: play time (S.played) when this quest came up (Boosts: the quest-26 pizza party).
   * `begun`: "index@stage level" of the last quest whose start (camera pan, toast) was played.
   */
  quest: { index: number; progress: number; at?: number; begun?: string };
  dialogues: number[];
  /** Total equipment unlocked ever (for "rented once" gates). */
  unlocked: string[];
  /** Company HQ research: finished node ids + the one in progress. */
  mgmt: { done: number[]; research: { id: number; endsAt: number } | null };
  run: StageRun;
  /** Seconds of active play on this progress (telemetry.ts: visible, input in the last 2 min). */
  played?: number;
  /** Welcome boosts handed out so far (Boosts.ts gifts: speed, damage, magnet); 3 = done. */
  gift?: number;
  /** Cash the last stage's leftover ore and ingots fetched at the contract (Game.leftovers), said once on the new stage. */
  leftover?: number;
  /** Cash given because this quarry got a new map under the player (relayout, MAP_GIFT), said once on load. */
  mapGift?: number;
  /** Comeback.ts: when the supply drones store was last emptied (ms, Date.now()); unset until they open. */
  drones?: number;
  /** Comeback.ts: log-in calendar crates claimed so far, and the local date of the last one. */
  daily?: { n: number; on: string };
  /**
   * Telemetry's save code (telemetry.ts `sid`): made on the first row, carried by the CrazyGames
   * cloud save, so one player on two browsers counts once (the device code is per browser).
   */
  sid?: string;
}

export function freshRun(level: number): StageRun {
  const stageIndex = stageIndexOf(level);
  return { stageIndex, level, sold: 0, broken: "", rentals: [], spent: 0, cashbackClaimed: 0, structures: [], workers: [], clearHinted: false, earned: 0, mined: {}, hauled: {}, layout: STAGES[stageIndex]?.layout };
}

/** Cash for a player whose quarry got a new map under them (user 2026-10-24: $3,500, old build or new). */
export const MAP_GIFT = 3500;

/** The quarry was redrawn since this save: its layout id changed (2026-10-19 stage 1's fan, 2026-10-24 stages 2-10). */
function redrawn(run: StageRun): boolean {
  return (run.layout ?? "orig") !== (STAGES[run.stageIndex]?.layout ?? "orig");
}

/**
 * A redrawn quarry: `broken` holds block indices of the old layout and ground chunks lie where old blocks were.
 * The new one starts as far along as the old one was (user 2026-10-24): the same number of blocks broken,
 * the nearest to the base by walking first, as a player digs. On 2026-10-21 a quarry that restarted at 0 % sent a
 * player on "Clear 40 %" away in 9 s. Cash, upgrades, tools, quests and the rest of the run stay.
 */
function relayout(run: StageRun): StageRun {
  if (!redrawn(run)) return run;
  const st = STAGES[run.stageIndex];
  let n = 0;
  for (let i = 0; i < run.broken.length; i++) for (let c = run.broken.charCodeAt(i); c; c >>= 1) n += c & 1;
  return { ...run, layout: st.layout, broken: nearestBroken(st, n), transit: run.transit ? { ...run.transit, ground: [], carts: [], diggerLeft: undefined } : run.transit };
}

/** The broken-block bitset of `stage` with its `n` blocks nearest the base (walking from the home area, no bridges) broken. */
function nearestBroken(stage: StageDef, n: number): string {
  const N = stage.blocks.length;
  const key = (x: number, z: number) => x * 4096 + z;
  const walk = new Set<number>();
  const home: number[] = [];
  for (const [list, isHome] of [[stage.areas.ground, false], [stage.areas.home, true]] as const)
    for (const t of list)
      for (let i = 0; i < t.w; i++)
        for (let j = 0; j < t.h; j++) {
          const k = key(t.x + i, t.z + j);
          walk.add(k);
          if (isHome) home.push(k);
        }
  const cells = stage.blocks.map((b) => key(b.cx + ORIGIN, ORIGIN - b.cz));
  for (const k of cells) walk.add(k);
  const dist = new Map<number, number>(home.map((k) => [k, 0]));
  const queue = [...home];
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q];
    for (const d of [4096, -4096, 1, -1]) {
      const m = k + d;
      if (walk.has(m) && !dist.has(m)) (dist.set(m, dist.get(k)! + 1), queue.push(m));
    }
  }
  const order = cells.map((k, i) => [dist.get(k) ?? Infinity, i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const bits = new Uint8Array(Math.ceil(N / 8));
  for (const [, i] of order.slice(0, Math.min(n, N))) bits[i >> 3] |= 1 << (i & 7);
  return String.fromCharCode(...bits);
}

function fresh(): SaveData {
  return {
    v: 1,
    cash: 0,
    gems: 0,
    gear: 0,
    upgrades: {},
    owned: ["pickaxe", "woodenCarrier"],
    equipMining: "pickaxe",
    equipCarrying: "woodenCarrier",
    quest: { index: 0, progress: 0 },
    dialogues: [],
    unlocked: ["pickaxe", "woodenCarrier"],
    mgmt: { done: [], research: null },
    run: freshRun(1),
    gift: 0,
  };
}

export const S: SaveData = (() => {
  const d = load<SaveData | null>("save", null);
  if (!d || d.v !== 1) return fresh();
  const level = d.run?.level ?? (d.run?.stageIndex ?? 0) + 1;
  // gift: saves from before the welcome boosts are past the start; they get none.
  const run: StageRun = { ...freshRun(level), layout: undefined, ...d.run, level };
  const newMap = redrawn(run) ? { cash: (d.cash ?? 0) + MAP_GIFT, mapGift: MAP_GIFT } : {};
  return { ...fresh(), ...d, gift: d.gift ?? 3, run: relayout(run), ...newMap };
})();

let dirty = false;
export function markDirty(): void {
  dirty = true;
}
/** Called right before every save (the game snapshots items in transit). */
let beforeSave: (() => void) | null = null;
export function onBeforeSave(fn: () => void): void {
  beforeSave = fn;
}
/** Set by resetProgress: nothing may write the old progress back before the reload. */
let wiping = false;
export function flush(): void {
  if (!dirty || wiping) return;
  dirty = false;
  beforeSave?.();
  save("save", S);
}
setInterval(flush, 2000);
const flushNow = () => {
  dirty = true;
  flush();
};
window.addEventListener("pagehide", flushNow);
// Phones often kill a backgrounded tab without pagehide.
document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flushNow());

/**
 * Settings → Reset progress: a brand-new game (settings stay), then reload.
 * ⚠ Removing the key was not enough: the reload fires `pagehide`, whose emergency save wrote the
 * whole old progress straight back (reset did nothing until 2026-10-19). A fresh save is written
 * instead of a deletion so its newer stamp also beats an older cloud copy on CrazyGames.
 */
export function resetProgress(): void {
  wiping = true;
  save("save", fresh());
  location.reload();
}

export function stageDef() {
  return STAGES[S.run.stageIndex];
}
/** The stage level the player is on (1, 2, 3, …; it keeps counting past the tenth map). */
export function stageNumber(): number {
  return S.run.level ?? S.run.stageIndex + 1;
}

/* ---------- upgrades ---------- */

/**
 * Levels an upgrade starts at (ours). The wheelbarrow comes as if upgraded 4 times: Lv.5, cargo 29
 * (user 2026-10-22: next to the boosts it felt worth little). The pickaxe as if upgraded 5 times (Lv.6, power 12 x
 * PICKAXE_MUL = 25.2: limestone in 2 hits)
 * and the wooden carrier 4 times (Lv.5, cargo 9): user 2026-10-27, "from the first second, smash and carry more".
 * Saves below that are lifted to it.
 */
const START_LEVEL: Record<string, number> = { wheelBarrowCargo: 4, pickaxeAttackPower: 5, woodenCarrierCargo: 4 };

export function level(key: string): number {
  return Math.max(S.upgrades[key] ?? 0, START_LEVEL[key] ?? 0);
}
export function upValue(key: string): number {
  const u = UPGRADES[key];
  return u ? Number(u.value[Math.min(level(key), u.value.length - 1)]) : 0;
}
export function upValue2(key: string): number {
  const u = UPGRADES[key];
  return u?.value2 ? Number(u.value2[Math.min(level(key), u.value2.length - 1)]) : 0;
}
export function nextPrice(key: string): number | null {
  const u = UPGRADES[key];
  const L = level(key) + 1;
  return u && L < u.price.length ? u.price[L] : null;
}

/* ---------- equipment stats ---------- */

const POWER_KEY: Record<string, string> = {
  pickaxe: "pickaxeAttackPower",
  sledgehammer: "sledgeHammerAttackPower",
  jackhammer: "jackhammerAttackPower",
  hydraulicBreaker: "hydraulicBreakerAttackPower",
  rollerCrusher: "rollerCrusherAttackPower",
  largeHandDrill: "largeHandDrillAttackPower",
  knuckleDriller: "knuckleDrillerAttackPower",
  drillCrusher: "drillCrusherAttackPower",
  crushHammer: "crushHammerAttackPower",
  infernoBreaker: "infernoBreakerAttackPower",
  wheelCrusher: "bucketWheelAttackPower",
};
const CARGO_KEY: Record<string, string> = {
  woodenCarrier: "woodenCarrierCargo",
  cargoPack: "enhancedBackpackCargo",
  wheelbarrow: "wheelBarrowCargo",
  wheelLoader: "wheelLoaderCargo",
  dumpTruck: "dumpTruckCargo",
  exoCarrier: "exoskeletonCarrierCargo",
  haulTruck: "haulTruckCargo",
  wheelCrusher: "bucketWheelCargo",
};
const SPEED_KEY: Record<string, string> = {
  hydraulicBreaker: "hydraulicBreakerMoveSpeed",
  rollerCrusher: "rollerCrusherMoveSpeed",
  wheelLoader: "wheelLoaderMoveSpeed",
  dumpTruck: "dumpTruckMoveSpeed",
  allTerrainVehicle: "atvMoveSpeed",
  drillCrusher: "drillCrusherMoveSpeed",
  crushHammer: "crushHammerMoveSpeed",
  infernoBreaker: "infernoBreakerMoveSpeed",
  haulTruck: "haulTruckMoveSpeed",
  wheelCrusher: "bucketWheelMoveSpeed",
  fuelTruck: "fuelTruckMoveSpeed",
};
const FUEL_EFF_KEY: Record<string, string> = {
  hydraulicBreaker: "hydraulicBreakerFuelEfficiency",
  rollerCrusher: "rollerCrusherFuelEfficiency",
  wheelLoader: "wheelLoaderFuelEfficiency",
  dumpTruck: "dumpTruckFuelEfficiency",
  drillCrusher: "drillCrusherFuelEfficiency",
  crushHammer: "crushHammerFuelEfficiency",
  infernoBreaker: "infernoBreakerFuelEfficiency",
  haulTruck: "haulTruckFuelEfficiency",
  wheelCrusher: "bucketWheelFuelEfficiency",
};

/** Stat-name prefix of each equipment in the Company HQ research effects. */
const MGMT_PREFIX: Record<string, string> = {
  pickaxe: "Pickaxe",
  sledgehammer: "SledgeHammer",
  jackhammer: "Jackhammer",
  woodenCarrier: "WoodenCarrier",
  cargoPack: "EnhancedBackpack",
  wheelbarrow: "WheelBarrow",
  hydraulicBreaker: "HydraulicBreaker",
  rollerCrusher: "RollerCrusher",
  wheelLoader: "WheelLoader",
  dumpTruck: "DumpTruck",
  allTerrainVehicle: "Atv",
  largeHandDrill: "LargeHandDrill",
  knuckleDriller: "KnuckleDriller",
  exoCarrier: "ExoskeletonCarrier",
  drillCrusher: "DrillCrusher",
  crushHammer: "CrushHammer",
  infernoBreaker: "InfernoBreaker",
  haulTruck: "HaulTruck",
  wheelCrusher: "BucketWheel",
  fuelTruck: "FuelTruck",
};
/** Σ of finished HQ research effects for `${prefix}${kind}Multi`. */
export function mgmtMulti(equip: string, kind: string): number {
  const pre = MGMT_PREFIX[equip];
  if (!pre || !S.mgmt?.done.length) return 0;
  const want = `${pre}${kind}Multi`;
  let sum = 0;
  for (const n of MANAGEMENT.treeNodes as { id: number; effects: { stat: string; value: number }[] }[])
    if (S.mgmt.done.includes(n.id)) for (const e of n.effects) if (e.stat === want) sum += e.value;
  return sum;
}

export function power(equip: string): number {
  const k = POWER_KEY[equip];
  const base = k ? upValue(k) : (EQUIP[equip]?.stats.attackPower ?? 0);
  return base * (1 + mgmtMulti(equip, "AttackPower"));
}
/** Seconds between hits. `PACE.mining`: everyone swings faster than the original (data.ts). */
export function interval(equip: string): number {
  return (EQUIP[equip]?.stats.attackInterval ?? 1) / (1 + mgmtMulti(equip, "AttackInterval")) / PACE.mining;
}
/** Decoded cargo with upgrades and HQ research, before PACE.cargo. */
export function cargoBase(equip: string): number {
  const k = CARGO_KEY[equip];
  const base = k ? upValue(k) : (EQUIP[equip]?.stats.cargo ?? 0);
  return base * (1 + mgmtMulti(equip, "Cargo"));
}
export function cargo(equip: string): number {
  return Math.round(cargoBase(equip) * PACE.cargo);
}
export function absorb(equip: string): number {
  return EQUIP[equip]?.stats.absorbRange ?? 2;
}
export function moveSpeed(equip: string): number {
  if (equip === "player" || equip === "wheelbarrow") return upValue("playerMoveSpeed");
  const k = SPEED_KEY[equip];
  const base = k ? upValue(k) : (EQUIP[equip]?.stats.moveSpeed ?? 6);
  return base * (1 + mgmtMulti(equip, "MoveSpeed"));
}
export function fuelEff(equip: string): number {
  const k = FUEL_EFF_KEY[equip];
  const base = k ? upValue(k) : (EQUIP[equip]?.stats.fuelEfficiency ?? 1);
  return base * (1 + mgmtMulti(equip, "FuelEfficiency"));
}
/** HQ research that adds flat cargo (e.g. AtvCargoBase). */
export function mgmtBase(equip: string, kind: string): number {
  const pre = MGMT_PREFIX[equip];
  if (!pre || !S.mgmt?.done.length) return 0;
  const want = `${pre}${kind}Base`;
  let sum = 0;
  for (const n of MANAGEMENT.treeNodes as { id: number; effects: { stat: string; value: number }[] }[])
    if (S.mgmt.done.includes(n.id)) for (const e of n.effects) if (e.stat === want) sum += e.value;
  return sum;
}
export function fuelTank(equip: string): number {
  if (equip === "fuelTruck") return upValue("fuelTruckFuelAmount") * (1 + mgmtMulti(equip, "FuelAmount"));
  return EQUIP[equip]?.stats.fuelAmount ?? 0;
}

/** Rental / purchase price in the current stage (heavy equipment scales with stage). */
export function equipPrice(key: string): number {
  const e = EQUIP[key];
  if (!e) return 0;
  const m = e.rental ? stageMult(stageNumber()).heavyEquipmentRentMultiplier : 1;
  return Math.round(e.price * m);
}

/* ---------- currency ---------- */

export function addCash(n: number): void {
  S.cash += n;
  markDirty();
}
export function spendCash(n: number): boolean {
  if (S.cash < n) return false;
  S.cash -= n;
  S.run.spent += n;
  markDirty();
  return true;
}

/* ---------- broken-block bitset ---------- */

let brokenBits: Uint8Array | null = null;
export function brokenSet(count: number): Uint8Array {
  if (!brokenBits || brokenBits.length !== Math.ceil(count / 8)) {
    brokenBits = new Uint8Array(Math.ceil(count / 8));
    const s = S.run.broken;
    for (let i = 0; i < s.length && i < brokenBits.length; i++) brokenBits[i] = s.charCodeAt(i);
  }
  return brokenBits;
}
export function markBroken(i: number, count: number): void {
  const b = brokenSet(count);
  b[i >> 3] |= 1 << (i & 7);
  S.run.broken = String.fromCharCode(...b);
  markDirty();
}
export function isBroken(i: number, count: number): boolean {
  const b = brokenSet(count);
  return (b[i >> 3] & (1 << (i & 7))) !== 0;
}
export function resetBroken(): void {
  brokenBits = null;
}

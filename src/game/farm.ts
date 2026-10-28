/**
 * What every kind of cell is on the farm (user 2026-10-28: "harvest rice, chop trees of many kinds, old trees take
 * long; dig gold too"). The economy's ore keys stay the ids (stage data, saves, quests); this table says what each
 * one looks like and where it is processed. Names live in text.json `ores`; the story and the rest in docs/FARM.md.
 *
 * - `crop`: rice, cut in one swipe of the sickle whatever its HP (Game: crops break on any hit).
 * - `wood` / `fruit`: trees, chopped with the axe; old ones have more HP. Fruit trees drop fruit instead of logs.
 * - `ore` / `gem`: rocks with metal or crystals in them, dug with the pickaxe.
 * - `chest`: the mystery block, a treasure chest half buried.
 *
 * Processing (user 2026-10-28: "2 houses: rice and wood in one, gold, rare ores and diamonds in the other"): ores of
 * category `rock` go to the Mill, `metal` and `jewel` to the Forge (`houseOf`).
 */
// Type-only: data.ts imports this module (colours, names), so nothing here may need data.ts at run time.
import type { OreDef } from "./data";

export type FarmKind = "crop" | "wood" | "fruit" | "ore" | "gem" | "chest";

export interface FarmLook {
  kind: FarmKind;
  /** What it is, for the models (world/farmNodes.ts) and itemGeo.ts. */
  species: string;
  /** The model's main colour: stalk / bark / rock. */
  main: number;
  /** Its second colour: grain / leaves / blossom / metal vein / crystal. */
  crown: number;
  /** A third colour where the species has one: fruit, snow on the branches. */
  extra?: number;
  /** The raw item carried off it (sheaf, log, fruit, ore chunk, crystal). */
  raw: number;
  /** The product made of it (rice sack, planks, fruit crate, bar, cut gem). */
  product: number;
}

const tree = (species: string, main: number, crown: number, raw: number, product: number, extra?: number): FarmLook => ({ kind: "wood", species, main, crown, raw, product, extra });
const fruit = (species: string, crown: number, fruitColour: number, product: number): FarmLook => ({ kind: "fruit", species, main: 0x7a5230, crown, extra: fruitColour, raw: fruitColour, product });
const ore = (species: string, vein: number, bar: number): FarmLook => ({ kind: "ore", species, main: 0x8c8378, crown: vein, raw: vein, product: bar });
const gem = (species: string, colour: number): FarmLook => ({ kind: "gem", species, main: 0x7d756c, crown: colour, raw: colour, product: colour });

/** By ore key (economy.json). HP rises down the list within each group. */
export const FARM: Record<string, FarmLook> = {
  // Mill: rice and trees (category rock).
  limestone: { kind: "crop", species: "rice", main: 0xb8a443, crown: 0xf2c84b, raw: 0xe8c45a, product: 0xf1e6cc },
  sandstone: tree("bamboo", 0x8cc152, 0x6cbf47, 0xa8c860, 0xd9c27a),
  dunite: fruit("orange", 0x3f9a3a, 0xff9a1f, 0xffa53a),
  obsidian: tree("pine", 0x6b4426, 0x2f7d4a, 0x8a5a33, 0xe0b57a),
  coal: tree("maple", 0x5e3d26, 0xd9542b, 0x7a4a2c, 0xc98a55),
  granite: tree("birch", 0xeeeae0, 0x9ccc4a, 0xe8e2d2, 0xf0dcb0),
  bronzite: fruit("mango", 0x2f8a3e, 0xffc23a, 0xffcf5a),
  yooperlite: tree("cherry", 0x5a3a2e, 0xffb3cf, 0x7a4a3a, 0xd88f7a),
  basalt: tree("banyan", 0x6a5240, 0x3d7a34, 0x7d6248, 0xb58b5e),
  ice: tree("snowpine", 0x5d3f2a, 0x2f6b4a, 0x7a5236, 0xe6c08a, 0xffffff),
  cinnabar: tree("palm", 0x8a6a48, 0x4caf50, 0x9a7a52, 0xd8b07a),
  // Forge: metals and gems (categories metal and jewel).
  copper: ore("copper", 0xd9823a, 0xe08a4a),
  iron: ore("iron", 0xa9b1ba, 0x9aa3ad),
  manganese: ore("tin", 0xcfd3d6, 0xd8dcdf),
  silver: ore("silver", 0xeef2f8, 0xe6ebf2),
  gold: ore("gold", 0xffcc33, 0xffc933),
  bismuth: ore("platinum", 0xe5e4e2, 0xf0efed),
  cobalt: ore("cobalt", 0x3f6fd8, 0x4f7fe0),
  lapisLazuli: gem("lapis", 0x2f55c8),
  quartz: gem("quartz", 0xf4f4ff),
  amber: gem("amber", 0xffa53a),
  amethyst: gem("amethyst", 0x9b59d0),
  emerald: gem("emerald", 0x2ecc71),
  aquamarine: gem("aquamarine", 0x5fd3f0),
  opal: gem("opal", 0xf0e6ff),
  zircon: gem("topaz", 0xffc640),
  ruby: gem("ruby", 0xe0234a),
  tanzanite: gem("sapphire", 0x3456d8),
  diamond: gem("diamond", 0xd8f6ff),
  mystery: { kind: "chest", species: "chest", main: 0x8a5a2b, crown: 0xffd34a, raw: 0xffd34a, product: 0xffd34a },
};

const PLAIN: FarmLook = tree("oak", 0x6b4426, 0x4f9a3a, 0x8a5a33, 0xe0b57a);

export function farmLook(key: string): FarmLook {
  return FARM[key] ?? PLAIN;
}

/** Rice and other crops: cut in one swipe, a sweep takes the rice beside it too (Mining). */
export function isCrop(o: Pick<OreDef, "key">): boolean {
  return farmLook(o.key).kind === "crop";
}

export type House = "mill" | "forge";

/** Which processing house takes this ore's raw items. */
export function houseOf(o: Pick<OreDef, "category">): House {
  return o.category === "rock" ? "mill" : "forge";
}

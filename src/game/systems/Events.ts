/**
 * Game event bus. Gameplay code emits what happened; quests, dialogue and analytics
 * listen. Names follow the original's guide-quest counters (see docs/ORIGINAL_DATA.md §7).
 */
export interface GameEvents {
  oreDestroyed: { category: string; ore: string };
  mineralCollected: { count: number };
  mineralToSmelter: { count: number; by?: string };
  smeltDone: { item: number };
  ingotCollected: { count: number };
  ingotToSales: { count: number };
  ingotSold: { count: number; category: string; cash: number };
  cashCollected: { amount: number };
  buildingEntered: { building: string };
  /** Walked out of a building (telemetry `seen` left:<building>; only the walk-in shop has a way out). */
  buildingLeft: { building: string };
  /** A menu opened by its HUD button (telemetry `seen` panel:<name>). */
  panelOpened: { panel: string };
  statUpgraded: { key: string; level: number };
  lightEquipPurchased: { key: string };
  heavyEquipRented: { key: string };
  /**
   * A boost or gift offer came up / was taken (telemetry `seen` offer:<key> and `buy` boost <key>). Keys: the boost id
   * (floor tile, HUD offer, facility button), gift<id> (a gift can), 5003b (the quest-26 pizza party).
   */
  boostOffered: { key: string };
  boostTaken: { key: string };
  /** Walk-in shop: the player stepped onto an item's plate and its card came up (telemetry `seen`). */
  shopCardShown: { key: string };
  vehicleMounted: { key: string };
  workerHired: { profile: number };
  stageProgress: { percent: number };
  stageCleared: { stage: number };
  stageContracted: { stage: number };
  managementUpgraded: { node: number };
  /** A guide quest just paid out; `index` is its place in the chain (S.quest.index is already past it). */
  questDone: { id: number; index: number; text: string };
  cargoFull: Record<string, never>;
  fuelEmpty: { key: string };
}

type Handler<T> = (p: T) => void;

class Bus {
  private h = new Map<string, Handler<unknown>[]>();
  on<K extends keyof GameEvents>(k: K, f: Handler<GameEvents[K]>): void {
    const l = this.h.get(k) ?? [];
    l.push(f as Handler<unknown>);
    this.h.set(k, l);
  }
  emit<K extends keyof GameEvents>(k: K, p: GameEvents[K]): void {
    for (const f of this.h.get(k) ?? []) f(p);
  }
}

export const events = new Bus();

/** Repeating action at a fixed interval (pad transfers: one item every 0.2 s). */
export class Ticker {
  private t = 0;
  /** Calls `fn` once per `interval` elapsed; stops early when `fn` returns false. */
  tick(dt: number, interval: number, fn: () => boolean): void {
    this.t += dt;
    let guard = 0;
    while (this.t >= interval && guard++ < 20) {
      this.t -= interval;
      if (!fn()) {
        this.t = 0;
        return;
      }
    }
  }
  reset(): void {
    this.t = 0;
  }
}

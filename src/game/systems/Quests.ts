import type * as THREE from "three";
import { QUESTS, EQUIP_BY_ID, QUEST_MULT, WORKER_PROFILES, type QuestDef } from "../data";
import { S, markDirty, addCash } from "../state";
import { events } from "./Events";
import { sfx } from "../audio";
import type { Hud } from "../ui/Hud";

/** What the quest runner needs from the game. */
export interface QuestHost {
  hud: Hud;
  /** World point for a guide detail (MineBlock, Smelter, SalesStand, …) or null. */
  guideTarget(detail: string): THREE.Vector3 | null;
  /** Pan the camera to a point for a moment (CameraDirecting guide). */
  directCamera(p: THREE.Vector3): void;
  /** Whether a starting quest still pans the camera (routine ones stop after the tutorial). */
  pans?(q: QuestDef): boolean;
  progress(): number;
  stageNo(): number;
  /** Heavy equipment rented this stage. */
  rentals(): string[];
  /** Fired when a quest starts (dialogue hooks). */
  onQuestStart?(q: QuestDef): void;
  /** While a quest's start has to wait: the card to show meanwhile (null = start now). */
  waitCard?(q: QuestDef): string | null;
  /** Minerals currently carried (CollectMineral counts what's already on your back). */
  carriedMinerals(): number;
  /** Light equipment owned (forever). */
  owned(key: string): boolean;
  /** Workers hired this stage. */
  workersHired(): number;
  /** Key of the vehicle being driven, or null. */
  mountedKey(): string | null;
  /** Building the player is inside (the walk-in shop), or null. */
  inside(): "shop" | null;
}

const CATEGORY = ["", "rock", "metal", "jewel"];

/**
 * The guide-quest chain (QuestData group 1, NextId order): one card at a time, auto-
 * completes and pays its reward, then the next starts with its camera/toast guide.
 */
export class Quests {
  private cooldown = 0;
  private started = -1;
  /** The current quest's start is waiting (`QuestHost.waitCard`): no dialogue, pan or guide yet. */
  waiting = false;

  constructor(private host: QuestHost) {
    const add = (n: number) => this.add(n);
    events.on("oreDestroyed", (e) => {
      const q = this.cur();
      if (!q) return;
      if (q.type === "DestroyOre") add(1);
      else if (q.type === "DestroyOreByCategory" && CATEGORY[q.condition] === e.category) add(1);
    });
    events.on("mineralCollected", (e) => this.is("CollectMineral") && add(e.count));
    events.on("mineralToSmelter", (e) => this.is("ReturnMineralToSmelter") && add(e.count));
    events.on("ingotSold", (e) => {
      const q = this.cur();
      if (!q) return;
      if (q.type === "SellIngot") add(e.count);
      else if (q.type === "SellIngotByCategory" && CATEGORY[q.condition] === e.category) add(e.count);
    });
    events.on("buildingEntered", (e) => {
      const q = this.cur();
      if (q?.type === "EnterBuilding" && ((q.condition === 105 && e.building === "upgrade") || (q.condition === 104 && e.building === "shop"))) add(1);
    });
    events.on("statUpgraded", () => this.is("FieldUpgrade") && add(1));
    events.on("lightEquipPurchased", (e) => {
      const q = this.cur();
      if (q?.type === "PurchaseLightEquip" && (q.condition === 0 || EQUIP_BY_ID.get(q.condition)?.key === e.key)) add(1);
    });
    events.on("heavyEquipRented", (e) => {
      const q = this.cur();
      if (q?.type === "RentHeavyEquip" && q.condition !== 0 && EQUIP_BY_ID.get(q.condition)?.key === e.key) add(1);
    });
    events.on("vehicleMounted", (e) => {
      const q = this.cur();
      if (q?.type === "VehicleMounted" && (q.condition === 0 || EQUIP_BY_ID.get(q.condition)?.key === e.key)) add(1);
    });
    // Condition: 0 any worker, 1 a miner, 2 a hauler (WorkerType).
    events.on("workerHired", (e) => {
      const q = this.cur();
      if (q?.type !== "HireWorker") return;
      const role = WORKER_PROFILES.find((w) => w.id === e.profile)?.role;
      if (q.condition === 0 || (q.condition === 1 && role === "Mining") || (q.condition === 2 && role === "Carrying")) add(1);
    });
    events.on("stageCleared", () => this.is("StageCleared") && add(this.cur()!.target));
    events.on("stageContracted", () => this.is("StageContract") && add(1));
    events.on("managementUpgraded", () => this.is("ManagementUpgrade") && add(1));
  }

  cur(): QuestDef | null {
    return QUESTS[S.quest.index] ?? null;
  }

  private is(type: string): boolean {
    return this.cur()?.type === type;
  }

  private add(n: number): void {
    S.quest.progress += n;
    markDirty();
  }

  /**
   * Current value shown on the card. State that can already be true when a quest starts is
   * polled, not only counted from events — otherwise e.g. renting the Wheelbarrow before
   * "Rent Wheelbarrow" comes up leaves the quest stuck forever (the plate is SOLD OUT).
   */
  private value(q: QuestDef): number {
    const p = S.quest.progress;
    const keyOf = () => EQUIP_BY_ID.get(q.condition)?.key ?? "";
    switch (q.type) {
      case "HoldCurrency":
        return Math.floor(S.cash);
      case "StageProgression":
        // "Break 80% Ores on Stage 1" carried into stage 2 is already done.
        return this.host.stageNo() > q.condition ? q.target : Math.floor(this.host.progress());
      case "StageCleared":
      case "StageContract":
        return this.host.stageNo() > q.stage ? q.target : p;
      case "CollectMineral":
        // Completes the moment the carrier holds enough (reference: MAX → COMPLETE).
        return Math.max(p, this.host.carriedMinerals());
      case "RentHeavyEquip":
        if (q.condition === 0) return this.host.rentals().length;
        return this.host.rentals().includes(keyOf()) ? q.target : p;
      case "PurchaseLightEquip":
        return q.condition !== 0 && this.host.owned(keyOf()) ? q.target : p;
      case "HireWorker":
        return Math.max(p, this.host.workersHired());
      case "VehicleMounted": {
        const k = this.host.mountedKey();
        return k && (q.condition === 0 || k === keyOf()) ? Math.max(p, 1) : p;
      }
      case "EnterBuilding":
        return q.condition === 104 && this.host.inside() === "shop" ? q.target : p;
      default:
        return p;
    }
  }

  update(dt: number): void {
    const q = this.cur();
    if (!q) {
      this.host.hud.setQuest(null);
      return;
    }
    if (this.cooldown > 0) {
      // The finished card stays up briefly (flash); the next quest already counts events.
      this.cooldown -= dt;
      return;
    }
    if (this.started !== S.quest.index) {
      // A page load restarts the current quest: no camera pan again if its start already played
      // on this stage (user 2026-10-22: after a reload on 1004 the camera panned from the spawn to
      // the tray). A quest carried into a new stage starts again there.
      const mark = `${S.quest.index}@${this.host.stageNo()}`;
      const again = S.quest.begun === mark;
      const wait = again ? null : (this.host.waitCard?.(q) ?? null);
      this.waiting = !!wait && this.value(q) < q.target;
      if (wait && this.waiting) {
        this.host.hud.setQuest(wait, 0, 1);
        return;
      }
      this.started = S.quest.index;
      S.quest.begun = mark;
      markDirty();
      this.begin(q, again);
    }
    const v = this.value(q);
    const r = this.reward(q);
    const icon = r.item === "Gem" ? `<i class="ico gem"></i>` : r.item === "Gear" ? `<i class="ico gear"></i>` : `<i class="ico cash"></i>`;
    this.host.hud.setQuest(q.text, v, q.target, `${icon}<b>${r.amount}</b>`);
    if (v >= q.target) this.complete(q);
  }

  private begin(q: QuestDef, noPan = false): void {
    this.host.onQuestStart?.(q);
    if (q.guide.type === "ToastMessage") this.host.hud.toast(q.guide.detail);
    else if (!noPan && (this.host.pans?.(q) ?? true)) {
      const p = this.host.guideTarget(q.guide.detail);
      if (p) this.host.directCamera(p);
    }
  }

  /** Reward as paid: groups 2 / 1000 grow with the stage level (QuestMultiplierData, up to ×2). */
  private reward(q: QuestDef): { item: string; amount: number } {
    if (!q.scaled) return q.reward;
    const top = Math.max(1, ...Object.keys(QUEST_MULT).map(Number));
    const m = QUEST_MULT[String(Math.min(top, this.host.stageNo()))] ?? 1;
    return { item: q.reward.item, amount: Math.round(q.reward.amount * m) };
  }

  private complete(q: QuestDef): void {
    const r = this.reward(q);
    if (r.item === "Gem") S.gems += r.amount;
    else if (r.item === "Gear") S.gear += r.amount;
    else if (r.item === "Money") addCash(r.amount);
    this.host.hud.setQuest(q.text, q.target, q.target, `<b>✓</b>`);
    S.quest.index++;
    S.quest.progress = 0;
    S.quest.at = S.played ?? 0;
    markDirty();
    events.emit("questDone", { id: q.id, index: S.quest.index - 1, text: q.text });
    sfx.unlock();
    this.host.hud.questDone(r);
    this.cooldown = 0.9;
  }

  /** The quest the guide arrow works for (null while a finished card is still flashing). */
  guided(): QuestDef | null {
    return this.cooldown > 0 ? null : this.cur();
  }
}

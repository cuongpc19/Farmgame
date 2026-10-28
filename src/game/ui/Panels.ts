import { EQUIP, PACE, UPGRADES, UPGRADE_OWNER, type EquipDef } from "../data";
import { S, level, nextPrice, upValue, upValue2, equipPrice, stageNumber } from "../state";
import { fmt } from "./Hud";
import breakerPic from "../../assets/icons/hydraulicBreaker.png?inline";
import loaderPic from "../../assets/icons/wheelLoader.png?inline";
import rollerPic from "../../assets/icons/rollerCrusher.png?inline";
import dumpPic from "../../assets/icons/dumpTruck.png?inline";
import atvPic from "../../assets/icons/allTerrainVehicle.png?inline";
import barrowPic from "../../assets/icons/wheelbarrow.png?inline";
import drillCrusherPic from "../../assets/icons/drillCrusher.png?inline";
import crushHammerPic from "../../assets/icons/crushHammer.png?inline";
import infernoPic from "../../assets/icons/infernoBreaker.png?inline";
import haulPic from "../../assets/icons/haulTruck.png?inline";
import wheelCrusherPic from "../../assets/icons/wheelCrusher.png?inline";
import fuelTruckPic from "../../assets/icons/fuelTruck.png?inline";

/**
 * A picture where an emoji would sit, as big as the emoji. Drawn from the game's own 3D model
 * (scripts/make-icons.mjs) for every machine and the wheelbarrow (user 2026-10-21: first the
 * Hydraulic Breaker's crane emoji did not read as the machine you drive, then the truck and
 * motorbike emoji in the vehicle menu were confusing: "make them look exactly the same").
 */
const pic = (src: string) => `<img class="ico-pic" src="${src}" alt="">`;

export const ICON: Record<string, string> = {
  player: "🧑‍🌾",
  pickaxe: "⛏️",
  sledgehammer: "🪓",
  jackhammer: "🪚",
  largeHandDrill: "🌾",
  knuckleDriller: "🪨",
  woodenCarrier: "🧺",
  cargoPack: "🎒",
  exoCarrier: "🪜",
  wheelbarrow: pic(barrowPic),
  furnace: "🔥",
  salesStand: "🛻",
  hydraulicBreaker: pic(breakerPic),
  wheelLoader: pic(loaderPic),
  rollerCrusher: pic(rollerPic),
  dumpTruck: pic(dumpPic),
  allTerrainVehicle: pic(atvPic),
  drillCrusher: pic(drillCrusherPic),
  crushHammer: pic(crushHammerPic),
  infernoBreaker: pic(infernoPic),
  haulTruck: pic(haulPic),
  wheelCrusher: pic(wheelCrusherPic),
  fuelTruck: pic(fuelTruckPic),
};
const OWNER_NAME: Record<string, string> = { player: "Farmer", furnace: "Mill & Forge", salesStand: "Market Trucks" };

/** Bottom sheet with a wooden title bar and a red close button (reference layout). */
export class Sheet {
  readonly root: HTMLDivElement;
  readonly body: HTMLDivElement;
  onClose: (() => void) | null = null;
  isOpen = false;
  /** Every sheet, so a cash change can re-light the buy buttons of whichever one is open. */
  static readonly all: Sheet[] = [];
  /** Tap on a buy button you can't afford yet (Game: deny sound + toast). */
  static onPoor: (() => void) | null = null;

  /**
   * Buttons carrying `data-price` grey out / light up as cash changes while a sheet is open.
   * Cash often lands a moment after a sheet renders (quest reward for entering the building).
   */
  static refreshAfford(): void {
    for (const s of Sheet.all) {
      if (!s.isOpen) continue;
      for (const b of s.body.querySelectorAll<HTMLElement>("[data-price]")) b.classList.toggle("off", S.cash < Number(b.dataset.price));
    }
  }

  /** A greyed buy button was tapped: shake it and let the game say why. True if it was one. */
  protected poor(b: HTMLElement | null): boolean {
    if (!b?.classList.contains("off")) return false;
    if (b.dataset.price) {
      b.classList.remove("shake");
      void b.offsetWidth;
      b.classList.add("shake");
      Sheet.onPoor?.();
    }
    return true;
  }

  constructor(host: HTMLElement, title: string, cls = "") {
    this.root = document.createElement("div");
    this.root.className = `sheet hit ${cls}`;
    this.root.innerHTML = `<div class="sh-head"><div class="sh-title">${title}</div><button class="sh-x">✕</button></div><div class="sh-body"></div>`;
    host.appendChild(this.root);
    Sheet.all.push(this);
    this.body = this.root.querySelector(".sh-body")!;
    this.root.querySelector(".sh-x")!.addEventListener("click", () => this.close());
    this.root.addEventListener("pointerdown", (e) => e.stopPropagation());
  }

  setTitle(t: string): void {
    (this.root.querySelector(".sh-title") as HTMLElement).textContent = t;
  }

  /** When the sheet last opened: taps right after that belong to the gesture that opened it. */
  protected openedAt = 0;

  open(): void {
    if (!this.isOpen) this.openedAt = performance.now();
    this.isOpen = true;
    this.root.classList.add("on");
  }

  /** True for a click that is really the tail of the tap that opened the sheet (phones). */
  protected ghost(e: Event): boolean {
    return e.isTrusted && performance.now() - this.openedAt < 450;
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove("on");
    this.onClose?.();
  }
}

/** Stat upgrades (the Workshop). */
export class UpgradePanel extends Sheet {
  onBuy: ((key: string) => void) | null = null;
  /**
   * The "Save Up N Cash" quest running now, if any (Game): buying here spends what it counts.
   * User 2026-10-24: players who had saved 100-200 for the Sledgehammer spent it here and quit.
   */
  saving: (() => string | null) | null = null;

  constructor(host: HTMLElement) {
    super(host, "WORKSHOP");
    this.body.addEventListener("click", (e) => {
      if (this.ghost(e)) return;
      const b = (e.target as HTMLElement).closest("[data-up]") as HTMLElement | null;
      if (b && !this.poor(b)) this.onBuy?.(b.dataset.up!);
    });
  }

  /** Visible upgrade keys: equipped & rented first, then the rest of what's owned. */
  private keys(): string[] {
    const owned = new Set([...S.owned, ...S.run.rentals]);
    const first = ["player", S.equipMining, S.equipCarrying, ...S.run.rentals];
    const rest = ["furnace", "salesStand", ...S.owned];
    const order = [...first, ...rest].filter((v, i, a) => a.indexOf(v) === i);
    const out: string[] = [];
    for (const owner of order) {
      if (!(owner === "player" || owner === "furnace" || owner === "salesStand" || owned.has(owner))) continue;
      for (const [k, o] of Object.entries(UPGRADE_OWNER)) if (o === owner && UPGRADES[k]) out.push(k);
    }
    return out;
  }

  render(): void {
    const rows = this.keys().map((k) => {
      const u = UPGRADES[k];
      const owner = UPGRADE_OWNER[k];
      const L = level(k);
      const price = nextPrice(k);
      const cur = this.val(k, L);
      const nxt = price === null ? "MAX" : this.val(k, L + 1);
      const can = price !== null && S.cash >= price;
      const name = OWNER_NAME[owner] ?? EQUIP[owner]?.name ?? owner;
      const rec = k === "woodenCarrierCargo" && L < 3 ? `<div class="rec">Recommended</div>` : "";
      return `<div class="row">${rec}
        <div class="r-ico">${ICON[owner] ?? "⬆️"}</div>
        <div class="r-mid"><div class="r-name">${name}</div><div class="r-sub">${u.name}</div>
          <div class="r-lv"><span>Lv.${L + 1}</span><b>›</b><em>Lv.${L + 2}</em></div>
          <div class="r-lv"><span>${cur}</span><b>›</b><em>${nxt}</em></div></div>
        <button class="r-buy ${can ? "" : "off"}" data-up="${k}"${price === null ? "" : ` data-price="${price}"`}>${price === null ? "MAX" : `<i class="ico cash"></i>${fmt(price)}`}</button>
      </div>`;
    });
    const goal = this.saving?.();
    const save = goal ? `<div class="sh-note save">💰 Quest: ${goal}<br>Upgrades spend your savings!</div>` : "";
    this.body.innerHTML = `${save}<div class="sh-note">⚠ Equipped &amp; rented items shown first.</div>${rows.join("")}`;
  }

  /** Price of the cheapest next level on offer (null: everything is maxed). */
  cheapest(): number | null {
    let best: number | null = null;
    for (const k of this.keys()) {
      const p = nextPrice(k);
      if (p !== null && (best === null || p < best)) best = p;
    }
    return best;
  }

  private val(k: string, L: number): string {
    const u = UPGRADES[k];
    const i = Math.min(L, u.value.length - 1);
    const v = Number(u.value[i]);
    if (k === "salesTruckWeightMin" && u.value2) return `${v}~${u.value2[i]}`;
    // Carriers hold PACE.cargo times the decoded number: show what they really hold.
    if (k.endsWith("Cargo")) return `+${Math.round(v * PACE.cargo)}`;
    return `+${+v.toFixed(2)}`;
  }
}

/** Farm Shop: buy hand tools (kept forever) / rent machines (this stage). */
export class ShopPanel extends Sheet {
  private tab: "light" | "heavy" = "light";
  onBuy: ((key: string) => void) | null = null;
  onRent: ((key: string) => void) | null = null;
  onEquip: ((key: string) => void) | null = null;

  constructor(host: HTMLElement) {
    super(host, "FARM SHOP", "shop");
    this.body.addEventListener("click", (e) => {
      if (this.ghost(e)) return;
      const t = e.target as HTMLElement;
      const tab = t.closest("[data-tab]") as HTMLElement | null;
      if (tab) {
        this.tab = tab.dataset.tab as "light" | "heavy";
        this.render();
        return;
      }
      const b = t.closest("[data-act]") as HTMLElement | null;
      if (!b || this.poor(b)) return;
      const k = b.dataset.key!;
      if (b.dataset.act === "buy") this.onBuy?.(k);
      else if (b.dataset.act === "rent") this.onRent?.(k);
      else if (b.dataset.act === "equip") this.onEquip?.(k);
    });
  }

  showTab(t: "light" | "heavy"): void {
    this.tab = t;
  }

  private lockText(e: EquipDef): string | null {
    if (e.unlock.type === "ReachStage" && stageNumber() < e.unlock.value) return `Stage ${e.unlock.value}+`;
    if (e.unlock.type === "UnlockEquipment") {
      const need = Object.values(EQUIP).find((x) => x.id === e.unlock.value);
      if (need && !S.unlocked.includes(need.key)) return `Rent ${need.name} first`;
    }
    return null;
  }

  private stats(e: EquipDef): string {
    const s = e.stats;
    const parts: string[] = [];
    if (s.attackPower) parts.push(`⚒ ${s.attackPower}`);
    if (s.attackInterval) parts.push(`⏱ ${+(s.attackInterval / PACE.mining).toFixed(2)}s`);
    if (s.cargo) parts.push(`📦 ${e.key === "allTerrainVehicle" ? s.cargo : Math.round(s.cargo * PACE.cargo)}`);
    if (s.moveSpeed) parts.push(`➜ ${s.moveSpeed}`);
    if (s.fuelAmount) parts.push(`⛽ ${s.fuelAmount}`);
    return parts.join("  ");
  }

  render(): void {
    const list = Object.values(EQUIP).filter((e) => e.category !== "Character" && e.price > 0 && (this.tab === "light" ? !e.rental : e.rental));
    const rows = list.map((e) => {
      const lock = this.lockText(e);
      const price = equipPrice(e.key);
      let btn: string;
      if (lock) btn = `<button class="r-buy off">🔒 ${lock}</button>`;
      else if (!e.rental && S.owned.includes(e.key)) {
        const eq = S.equipMining === e.key || S.equipCarrying === e.key;
        btn = eq ? `<button class="r-buy off eq">EQUIPPED</button>` : `<button class="r-buy" data-act="equip" data-key="${e.key}">EQUIP</button>`;
      } else if (e.rental && S.run.rentals.includes(e.key)) btn = `<button class="r-buy off eq">RENTED</button>`;
      else btn = `<button class="r-buy ${S.cash >= price ? "" : "off"}" data-act="${e.rental ? "rent" : "buy"}" data-key="${e.key}" data-price="${price}"><i class="ico cash"></i>${fmt(price)}</button>`;
      return `<div class="row ${lock ? "locked" : ""}">
        <div class="r-ico">${ICON[e.key] ?? "🔧"}</div>
        <div class="r-mid"><div class="r-name">${e.name}</div><div class="r-sub">${e.rental ? "Rental · this stage only" : "Yours forever"}</div><div class="r-stats">${this.stats(e)}</div></div>
        ${btn}
      </div>`;
    });
    this.body.innerHTML = `<div class="tabs"><button data-tab="light" class="${this.tab === "light" ? "on" : ""}">HAND TOOLS</button><button data-tab="heavy" class="${this.tab === "heavy" ? "on" : ""}">MACHINES</button></div>${rows.join("")}`;
  }
}

/** Format helpers reused by other panels. */
export function upgradeSummary(k: string): string {
  return `${UPGRADES[k]?.name ?? k} ${upValue(k)}${upValue2(k) ? `~${upValue2(k)}` : ""}`;
}

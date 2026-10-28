import { ADS_ON } from "../ads";
import * as THREE from "three";
import { QUESTS, RV_BOOSTS, RV_CONFIG, ITEM_MULT } from "../data";
import { events } from "./Events";
import { S, addCash, markDirty } from "../state";
import { padOutline } from "../world/props";
import { cupcakeMesh } from "../world/candyScenery";
import { sfx } from "../audio";
import type { AdSim } from "../ui/Popups";
import type { Hud } from "../ui/Hud";

export interface BoostHost {
  scene: THREE.Scene;
  hud: Hud;
  ad: AdSim;
  playerPos(): THREE.Vector3;
  stageNo(): number;
  /** Is there ore within r (DAMAGE BOOST condition)? */
  oreNear(r: number): boolean;
  toScreen(p: THREE.Vector3, out: { x: number; y: number; visible: boolean }): void;
  /** Stage progress in %. */
  progress(): number;
  /** Player is in the base camp (not out in the quarry). */
  inBase(): boolean;
  /** Player is inside the Machinery Center. */
  inShop(): boolean;
  /** Where each facility offer floats, and how full it is. */
  facility(kind: "furnace" | "sales" | "cafeteria" | "atm"): { pos: THREE.Vector3; stack: number } | null;
  hasWorkers(): boolean;
  /** How full the player's back is, 0..1 (MAGNET BOOST: CargoAlmostFull 0.66). */
  cargoFill(): number;
  /** Chunks lying on the ground (MAGNET BOOST: StageOreCountHigh 200). */
  groundChunks(): number;
  /** Open ground about r from the player (not in a block or a building, on the map), or null. */
  spotNear(r: number): THREE.Vector3 | null;
  /** Open ground on the way from the player to the nearest rock, or null. */
  spotOnWay(): THREE.Vector3 | null;
  /** Dialogue, a spotlight or a camera pan is up: tile countdowns and the gift timer wait. */
  busy(): boolean;
  /** SPECIAL ORDER: sell up to n ingots from the SELL pad right now. */
  instantSell(n: number): void;
  /** CREW BBQ PARTY (the reference's staff pizza party): every worker wakes up rested. */
  workersRecover(): void;
}

/** A floating "watch an ad" offer over a facility (RvBoost offerType Object). */
interface ObjectOffer {
  id: number;
  kind: "furnace" | "sales" | "cafeteria" | "atm";
  el: HTMLButtonElement;
  shown: boolean;
}

interface Tile {
  id: number;
  root: THREE.Group;
  can: THREE.Object3D;
  pos: THREE.Vector3;
  /** Seconds left on the ground, out of `total` (the countdown stops while dialogue or a pan is up). */
  left: number;
  total: number;
  /** A gift: walking onto it gives the boost, no card. */
  gift: boolean;
  label: HTMLDivElement;
}

const INFO: Record<number, { icon: string; line: string; color: number }> = {
  1001: { icon: "⚡", line: "+30% move speed", color: 0x46b4ff },
  1002: { icon: "💥", line: "+50% mining power", color: 0xff5a4a },
  1003: { icon: "🧲", line: "No cargo limit, wider pickup range", color: 0xb05cff },
  5001: { icon: "🔥", line: "+100% smelting speed", color: 0xff8a2a },
  5002: { icon: "🚚", line: "Sell 300 cargo on the spot", color: 0x4cc94a },
  5003: { icon: "🍖", line: "Your crew never gets tired", color: 0xffd34d },
  7001: { icon: "🏧", line: "Grab some free cash from the ATM", color: 0x4cc94a },
};

/** Active buff multipliers read by the game every frame. */
export const buffs = {
  speedUntil: 0,
  damageUntil: 0,
  magnetUntil: 0,
  furnaceUntil: 0,
  /** CREW BBQ PARTY: workers don't tire until then. */
  staminaUntil: 0,
};

/** Today's rewarded-ad uses per boost (DailyBoostUsedLessOrEqual). */
function daily(): Record<number, number> {
  const day = new Date().toISOString().slice(0, 10);
  const d = (S as unknown as { rvDaily?: { day: string; n: Record<number, number> } }).rvDaily;
  if (!d || d.day !== day) {
    (S as unknown as { rvDaily: { day: string; n: Record<number, number> } }).rvDaily = { day, n: {} };
    return (S as unknown as { rvDaily: { n: Record<number, number> } }).rvDaily.n;
  }
  return d.n;
}
const DAILY_CAP: Record<number, number> = { 3002: 6, 3003: 2, 7001: 2 };

/**
 * The original's FreeTrial rows (2001-2003, 4001, 6001-6003: same offer, `StageLevelLessOrEqual 1`):
 * in stage 1 each of these offers can be taken once without an ad. Ours (user 2026-10-25: "boosts on
 * the later stages, like stage 1"): once more on every stage after it. Used trials are kept as the
 * offer's negative id in `S.dialogues` on stage 1, in `S.run.trials` on the others.
 */
const TRIALS = [1001, 1002, 1003, 3001, 5001, 5002, 5003];

/**
 * One more free STAFF PIZZA PARTY on quest 1026 "Clear 40% of Stage 1" once it has had 3 minutes
 * of play (user 2026-10-22: most players who leave stage 1 leave on that quest, the crew resting a
 * third of the time). Separate from the stage-1 trial; used = `flag` in `S.dialogues`.
 */
const PIZZA_BONUS = { quest: 1026, after: 180, flag: -15003 };
/**
 * And a free FREE CASH (+3,500 × stage multiplier) on the same quest after the same 3 minutes
 * (user 2026-10-22). The HUD button stays up until it is tapped (or the quest is done); it does not
 * use up the stage-1 FREE CASH trial.
 */
const CASH_BONUS = { quest: 1026, after: 180, flag: -13001 };

/**
 * Gift boosts (ours, user 2026-10-20): a new player gets a DAMAGE can, 30 s later a SPEED can near the player,
 * 30 s after that a MAGNET can; running onto one gives the boost, free (user: you should have to go and get it).
 * A can waits until the next one drops. The first one (user 2026-10-27: "nearly every player should get it") lies
 * there from the first second, on the way to the first rock, for FIRST_GIFT_SECS; the SPEED can comes 30 s after it
 * is picked up (or gone). Before, it dropped beside the first rock hit.
 * Then the same round again 3 minutes after the last can of the previous one, and a new round from the
 * first hit on every new stage (user 2026-10-25: before, stage 1 only). They are not the trials above.
 * Every round has its MAGNET can, and the MAGNET tile is offered like the others (user 2026-10-24: back
 * as before; the 2026-10-22 "MAGNET once only" is undone).
 */
const GIFTS = [1002, 1001, 1003];
const GIFT_GAP = 30;
const GIFT_ROUND_GAP = 180;
/** How long a gift lasts (user: speed and damage 1 minute; the magnet keeps its 15 s). */
const GIFT_SECS: Record<number, number> = { 1001: 60, 1002: 60, 1003: 15 };
/** How long the first can of a new player's (or a new stage's) round waits on the way to the first rock. */
const FIRST_GIFT_SECS = 120;
/** Walking within this of a gift can picks it up (a little wider than its 2.4 pad, so walking past counts). */
const GIFT_REACH = 2;

/**
 * Rewarded-ad boosts (RvBoostData, main mode):
 * - floor tiles every RV_BOOST_TILE_INTERVAL s near the player, alive RV_BOOST_TILE_DURATION s:
 *   SPEED (+30 % move, +23 % attack speed, 300 s), DAMAGE (+50 % power, 180 s),
 *   MAGNET (unlimited cargo + ×3 absorb, 15 s);
 * - a FREE CASH offer on the HUD every RV_BOOST_UI_INTERVAL s (+3,500 × stage multiplier).
 * Boosts only start once the Hydraulic Breaker has been unlocked (HasUnlockedEquipment 301).
 * With ads off only each stage's free trials show (`offerable`), and every stage opens with the three
 * gift boosts (`GIFTS`) from the first block on.
 */
export class Boosts {
  private tiles: Tile[] = [];
  private tileT = 0;
  private uiT = 60;
  private cool: Record<number, number> = {};
  private offer: HTMLButtonElement;
  private offerUntil = 0;
  private now = 0;
  private stepping: Tile | null = null;
  private popup: HTMLDivElement;
  private ring: HTMLDivElement;
  private uiRoot: HTMLElement;
  private objects: ObjectOffer[] = [];
  /** Which HUD currency offer comes next (FREE CASH / GEAR / GEM rotate). */
  private uiKind = 0;
  private uiId = 3001;
  /** The quest-26 pizza party has been announced on this page. */
  private pizzaSaid = false;
  /** The HUD button is showing the quest-26 free cash (CASH_BONUS). */
  private cashShown = false;
  /** When the pizza toast went up (the cash one waits for it to be read). */
  private pizzaSaidAt = -99;

  constructor(private h: BoostHost, uiRoot: HTMLElement) {
    this.uiRoot = uiRoot;
    this.popup = document.createElement("div");
    this.popup.className = "modal hit boostpop";
    uiRoot.appendChild(this.popup);
    this.ring = document.createElement("div");
    this.ring.className = "buffs";
    uiRoot.appendChild(this.ring);
    this.offer = document.createElement("button");
    this.offer.className = "rv-offer hit";
    this.offer.style.display = "none";
    uiRoot.appendChild(this.offer);
    this.offer.addEventListener("click", () => void this.freeCurrency());
    // Facility offers: furnace / sales stand / cafeteria / shop ATM.
    for (const [id, kind] of [[5001, "furnace"], [5002, "sales"], [5003, "cafeteria"], [7001, "atm"]] as const) {
      const el = document.createElement("button");
      el.className = "rv-obj hit";
      el.style.display = "none";
      el.innerHTML = `<span>${INFO[id].icon}</span><b>${ADS_ON ? "▶" : "FREE"}</b>`;
      el.addEventListener("pointerdown", (e) => e.stopPropagation());
      el.addEventListener("click", () => void this.takeObject(id));
      uiRoot.appendChild(el);
      this.objects.push({ id, kind, el, shown: false });
    }
  }

  /** This offer's free trial on this stage is still unused. */
  private trialLeft(id: number): boolean {
    if (!TRIALS.includes(id)) return false;
    return this.h.stageNo() <= 1 ? !S.dialogues.includes(-id) : !(S.run.trials ?? []).includes(id);
  }

  private useTrial(id: number): void {
    if (this.h.stageNo() <= 1) S.dialogues.push(-id);
    else (S.run.trials ??= []).push(id);
    markDirty();
  }

  /**
   * May this offer show at all? With ads on, always (an ad, or the trial). With ads off
   * (ads.ts; user 2026-10-20, option A) only while this stage's free trial lasts: no free cash every
   * 3 minutes, no boost tiles once the stage's tries are used.
   */
  private offerable(id: number): boolean {
    return ADS_ON || this.trialLeft(id) || this.pizzaBonus(id);
  }

  /** The quest-26 pizza party is waiting (PIZZA_BONUS). */
  private pizzaBonus(id: number): boolean {
    return id === 5003 && this.questBonus(PIZZA_BONUS);
  }

  /** A quest bonus (PIZZA_BONUS, CASH_BONUS) is due: its quest has run long enough, not taken yet. */
  private questBonus(b: { quest: number; after: number; flag: number }): boolean {
    if (QUESTS[S.quest.index]?.id !== b.quest || S.dialogues.includes(b.flag)) return false;
    // Saves that were already on the quest before it kept the time count from now.
    if (S.quest.at === undefined) {
      S.quest.at = S.played ?? 0;
      markDirty();
    }
    return (S.played ?? 0) - S.quest.at >= b.after;
  }

  /** Put the quest-26 free cash on the HUD button while it is due; take it away once it is not. */
  private updateCashBonus(busy: boolean): void {
    const due = this.questBonus(CASH_BONUS);
    if (this.cashShown && !due) {
      this.cashShown = false;
      this.offer.style.display = "none";
      this.offerUntil = 0;
    } else if (due && !this.cashShown && !busy && this.offer.style.display === "none" && this.now - this.pizzaSaidAt > 4.5) {
      this.cashShown = true;
      this.uiId = 3001;
      this.offer.innerHTML = `🎁 FREE CASH<br><b>+${this.moneyAmount().toLocaleString("en-US")}</b>`;
      this.offer.style.display = "";
      this.offerUntil = 0;
      events.emit("boostOffered", { key: "3001b" });
      this.h.hud.toast("🎁 Free cash for you: tap FREE CASH!", 4000);
    }
  }

  /** Next gift due at this boost-clock time (null: none pending; undefined: not worked out yet). */
  private giftAt: number | null | undefined = undefined;
  /** Which gift of the round comes next. */
  private giftStep = 0;
  /** Seconds of play the gifts are timed on (stops while `busy`). */
  private giftClock = 0;

  /** After a (re)load: finish an interrupted round, or wait for the next one. */
  private planGifts(): void {
    const n = S.gift ?? GIFTS.length;
    if (n === 0) this.giftAt = this.giftClock; // a new player or a new stage: the first can drops at once
    else if (n < GIFTS.length) {
      this.giftStep = n;
      this.giftAt = this.giftClock + GIFT_GAP;
    } else this.giftAt = this.giftClock + GIFT_ROUND_GAP;
  }

  /** The first can of a round that starts at once (S.gift 0), until it is picked up or gone. */
  private firstGift: Tile | null = null;

  /** Drop the round's next gift can beside the player (the first one on the way to the first rock). */
  private giveGift(): void {
    const id = GIFTS[this.giftStep];
    if (id === undefined) return;
    // The previous gift nobody picked up makes way for this one.
    for (const t of this.tiles.filter((t) => t.gift)) this.removeTile(t);
    const first = S.gift === 0 && this.giftStep === 0;
    const at = first ? this.h.spotOnWay() ?? this.h.spotNear(5) : this.h.spotNear(5);
    if (!at || !this.placeTile(id, true, first ? FIRST_GIFT_SECS : GIFT_GAP, at)) {
      this.giftAt = this.giftClock + 1; // no open ground right here: try again in a second
      return;
    }
    if (first) {
      // S.gift stays 0 until it is taken, so a reload drops it again; the round goes on from there.
      this.firstGift = this.tiles[this.tiles.length - 1];
      this.giftAt = null;
      sfx.unlock();
      return;
    }
    if ((S.gift ?? GIFTS.length) < GIFTS.length) {
      S.gift = this.giftStep + 1;
      markDirty();
    }
    this.giftStep++;
    if (this.giftStep < GIFTS.length) this.giftAt = this.giftClock + GIFT_GAP;
    else {
      this.giftStep = 0;
      this.giftAt = this.giftClock + GIFT_ROUND_GAP;
    }
    sfx.unlock();
  }

  /** The first can was picked up or ran out: the SPEED can comes GIFT_GAP later. */
  private firstGiftDone(): void {
    this.firstGift = null;
    S.gift = 1;
    markDirty();
    this.giftStep = 1;
    this.giftAt = this.giftClock + GIFT_GAP;
  }

  /** Walked onto a gift can. */
  private collectGift(t: Tile): void {
    events.emit("boostTaken", { key: `gift${t.id}` });
    this.removeTile(t);
    if (t === this.firstGift) this.firstGiftDone();
    this.grant(t.id, GIFT_SECS[t.id]);
    sfx.reward();
    this.h.hud.toast(`🎁 ${this.def(t.id)?.title ?? "BOOST"}!`, 2500);
  }

  /** How long each running buff was granted for (the ring timers' full circle). */
  private spans: Record<number, number> = { 1001: 300, 1002: 180, 1003: 15 };

  /** A boost handed out by something else (a day of the log-in calendar, Comeback.ts). */
  give(id: number, secs: number): void {
    this.grant(id, secs);
  }

  /** Start a player boost for `secs` (a tile taken, or a gift). */
  private grant(id: number, secs: number): void {
    const until = this.now + secs;
    if (id === 1001) buffs.speedUntil = until;
    if (id === 1002) buffs.damageUntil = until;
    if (id === 1003) buffs.magnetUntil = until;
    this.spans[id] = secs;
    // IsBuffInactive: no tile of the same boost while it runs.
    this.cool[id] = Math.max(this.cool[id] ?? 0, until);
  }

  private usedUp(id: number): boolean {
    const cap = DAILY_CAP[id];
    return cap !== undefined && (daily()[id] ?? 0) >= cap;
  }

  private countUse(id: number): void {
    const d = daily();
    d[id] = (d[id] ?? 0) + 1;
    markDirty();
  }

  /** RvBoost conditions (any subGroup passes) for the facility offers. */
  private objectReady(o: ObjectOffer): boolean {
    if ((this.cool[o.id] ?? 0) > this.now || this.usedUp(o.id) || !this.offerable(o.id)) return false;
    const f = this.h.facility(o.kind);
    if (!f) return false;
    const pct = this.h.progress();
    switch (o.id) {
      case 5001:
        return this.unlocked && this.now >= buffs.furnaceUntil && (pct >= 80 || (f.stack >= 150 && this.h.inBase()));
      case 5002:
        return this.unlocked && ((pct >= 80 && f.stack >= 1) || (f.stack >= 100 && this.h.inBase()));
      case 5003:
        // The quest-26 one needs no Hydraulic Breaker: a player who rented only the loader gets it too.
        return (this.unlocked || this.pizzaBonus(5003)) && this.h.hasWorkers() && this.h.inBase() && this.now >= buffs.staminaUntil;
      case 7001:
        return this.h.stageNo() >= 2 && this.h.inShop();
    }
    return false;
  }

  private async takeObject(id: number): Promise<void> {
    const d = this.def(id);
    const bonus = this.pizzaBonus(id);
    if (!(await this.ask(id))) return;
    events.emit("boostTaken", { key: bonus ? `${id}b` : String(id) });
    this.countUse(id);
    this.cool[id] = this.now + (d?.cooldownSeconds ?? 180);
    sfx.reward();
    if (id === 5001) buffs.furnaceUntil = this.now + 180;
    if (id === 5002) this.h.instantSell(300);
    if (id === 5003) {
      buffs.staminaUntil = this.now + 180;
      this.h.workersRecover();
    }
    if (id === 7001) {
      const n = this.moneyAmount();
      addCash(n);
      S.run.earned += n;
      this.h.hud.toast(`+$${n.toLocaleString("en-US")}`);
    } else this.h.hud.toast(`${d?.title ?? "BOOST"}!`);
    markDirty();
  }

  private updateObjects(): void {
    for (const o of this.objects) {
      const ready = this.objectReady(o);
      if (ready !== o.shown) {
        o.shown = ready;
        o.el.style.display = ready ? "" : "none";
        if (ready) events.emit("boostOffered", { key: this.pizzaBonus(o.id) ? `${o.id}b` : String(o.id) });
        if (ready) o.el.innerHTML = `<span>${INFO[o.id].icon}</span><b>${ADS_ON && !this.trialLeft(o.id) ? "▶" : "FREE"}</b>`;
      }
      if (!ready) continue;
      const f = this.h.facility(o.kind)!;
      const sp = { x: 0, y: 0, visible: false };
      this.h.toScreen(f.pos.clone().setY(o.kind === "atm" ? 3.4 : 5.2), sp);
      o.el.style.transform = `translate(${sp.x}px, ${sp.y + Math.sin(this.now * 4) * 4}px) translate(-50%, -100%)`;
      o.el.style.visibility = sp.visible ? "" : "hidden";
    }
  }

  private get unlocked(): boolean {
    return S.unlocked.includes("hydraulicBreaker");
  }

  private def(id: number) {
    return RV_BOOSTS.find((b) => b.id === id);
  }

  private moneyAmount(): number {
    const m = ITEM_MULT?.RV_EarnItem?.Money?.[String(this.h.stageNo())] ?? 1;
    return Math.round(Number(RV_CONFIG.RV_BOOST_MONEY_COUNT ?? 3500) * m);
  }

  private stageMul(item: "Money" | "Gear"): number {
    return Number(ITEM_MULT?.RV_EarnItem?.[item]?.[String(this.h.stageNo())] ?? 1);
  }

  /** HUD offer: FREE CASH, FREE GEAR or FREE GEM (rotating, daily caps on gear/gem). */
  private async freeCurrency(): Promise<void> {
    this.offer.style.display = "none";
    this.offerUntil = 0;
    const id = this.uiId;
    const title = this.def(id)?.title ?? "FREE CASH";
    // The quest-26 gift first, so it never uses up the stage-1 trial.
    const bonus = this.cashShown;
    this.cashShown = false;
    if (bonus) S.dialogues.push(CASH_BONUS.flag);
    else if (this.trialLeft(id)) this.useTrial(id);
    else if (!(await this.h.ad.show(title))) return;
    events.emit("boostTaken", { key: bonus ? "3001b" : String(id) });
    this.countUse(id);
    if (id === 3002) {
      const n = Math.round(Number(RV_CONFIG.RV_BOOST_GEAR_COUNT ?? 200) * this.stageMul("Gear"));
      S.gear += n;
      this.h.hud.toast(`+${n} ⚙`);
    } else if (id === 3003) {
      const n = Number(RV_CONFIG.RV_BOOST_GEM_COUNT ?? 10);
      S.gems += n;
      this.h.hud.toast(`+${n} 💎`);
    } else {
      const n = this.moneyAmount();
      addCash(n);
      S.run.earned += n;
      this.h.hud.toast(`+$${n.toLocaleString("en-US")}`);
    }
    markDirty();
    sfx.reward();
  }

  private spawnTile(): void {
    // The original's conditions: DAMAGE needs ore within 7.5; MAGNET a back at least 2/3 full and
    // 200+ chunks on the ground.
    const fits = (id: number) =>
      (id !== 1002 || this.h.oreNear(7.5)) && (id !== 1003 || (this.h.cargoFill() >= 0.66 && this.h.groundChunks() >= 200));
    const cands = [1001, 1002, 1003].filter((id) => (this.cool[id] ?? 0) <= this.now && this.offerable(id) && fits(id));
    if (!cands.length) return;
    const at = this.h.spotNear(5);
    if (at) this.placeTile(cands[Math.floor(Math.random() * cands.length)], false, Number(RV_CONFIG.RV_BOOST_TILE_DURATION ?? 20), at);
  }

  /** A canister lying on the ground at `pos`, with a ring label and a countdown (reference). */
  private placeTile(id: number, gift: boolean, secs: number, pos: THREE.Vector3): boolean {
    const root = new THREE.Group();
    const color = INFO[id].color;
    const pad = padOutline(2.4, color);
    pad.fill.scale.set(1, 1, 1);
    root.add(pad.root);
    // A cupcake frosted in the boost's colour (Candy Miner; was a canister). Spun and bobbed in update().
    const can = new THREE.Group();
    can.add(cupcakeMesh(color));
    can.position.y = 1.0;
    root.add(can);
    root.position.copy(pos);
    this.h.scene.add(root);
    const title = this.def(id)?.title ?? "BOOST";
    const label = document.createElement("div");
    label.className = gift ? "boosttag gift" : "boosttag";
    label.innerHTML = `<b>${gift ? `🎁 FREE ${title}` : title}</b><div class="btime"><i></i></div><span></span>`;
    this.uiRoot.appendChild(label);
    this.tiles.push({ id, root, can, pos, left: secs, total: secs, gift, label });
    events.emit("boostOffered", { key: gift ? `gift${id}` : String(id) });
    return true;
  }

  /** Boost card: icon, name, effect, duration; FREE the first time on each stage, then an ad. */
  private ask(id: number): Promise<boolean> {
    const d = this.def(id);
    const dur = d?.effects?.[0]?.durationSeconds ?? 60;
    // The quest-26 pizza party goes first, so the stage-1 trial stays for later (and the rows say which).
    const bonus = this.pizzaBonus(id);
    const free = bonus || this.trialLeft(id);
    this.popup.innerHTML = `<div class="m-card"><div class="bp-ico">${INFO[id].icon}</div><div class="m-title">${d?.title ?? "BOOST"}</div>
      <div class="m-sub">${INFO[id].line}</div>${id === 5002 || id === 7001 ? "" : `<div class="bp-dur">⏱ For ${dur >= 60 ? `${Math.round(dur / 60)} Minutes` : `${dur} Seconds`}</div>`}
      <button class="m-btn go">${free || !ADS_ON ? "FREE" : "▶ Watch Ad"}</button><button class="bp-x">✕</button></div>`;
    this.popup.classList.add("on");
    return new Promise((res) => {
      const close = (ok: boolean) => {
        this.popup.classList.remove("on");
        res(ok);
      };
      this.popup.querySelector(".bp-x")!.addEventListener("click", () => close(false), { once: true });
      this.popup.querySelector(".go")!.addEventListener(
        "click",
        async () => {
          this.popup.classList.remove("on");
          if (free) {
            if (bonus) S.dialogues.push(PIZZA_BONUS.flag);
            else this.useTrial(id);
            markDirty();
            return res(true);
          }
          res(await this.h.ad.show(d?.title ?? "BOOST"));
        },
        { once: true },
      );
    });
  }

  private async take(tile: Tile): Promise<void> {
    const d = this.def(tile.id);
    this.removeTile(tile);
    if (!(await this.ask(tile.id))) return;
    events.emit("boostTaken", { key: String(tile.id) });
    const dur = d?.effects?.[0]?.durationSeconds ?? 60;
    this.grant(tile.id, dur);
    this.cool[tile.id] = this.now + (d?.cooldownSeconds ?? 120) + dur;
    sfx.reward();
    this.h.hud.toast(`${d?.title ?? "BOOST"}!`);
  }

  private removeTile(t: Tile): void {
    this.h.scene.remove(t.root);
    t.label.remove();
    this.tiles = this.tiles.filter((x) => x !== t);
  }

  update(dt: number): void {
    this.now += dt;
    buffsNow = this.now;
    const busy = this.h.busy();
    if (!busy) this.giftClock += dt;
    if (this.giftAt === undefined) this.planGifts();
    if (this.giftAt != null && this.giftClock >= this.giftAt) this.giveGift();
    if (this.unlocked) {
      this.tileT += dt;
      if (this.tileT >= Number(RV_CONFIG.RV_BOOST_TILE_INTERVAL ?? 30) && this.tiles.length < 1) {
        this.tileT = 0;
        this.spawnTile();
      }
    }
    const p = this.h.playerPos();
    for (const t of [...this.tiles]) {
      t.can.rotation.y += dt * 2;
      t.can.position.y = 1.0 + Math.sin(this.now * 3) * 0.15;
      if (!busy) t.left -= dt;
      const left = Math.max(0, t.left);
      const sp = { x: 0, y: 0, visible: false };
      this.h.toScreen(t.pos.clone().setY(2.6), sp);
      t.label.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -100%)`;
      (t.label.querySelector(".btime i") as HTMLElement).style.width = `${(left / t.total) * 100}%`;
      (t.label.querySelector("span") as HTMLElement).textContent = left.toFixed(1);
      if (t.left <= 0) {
        this.removeTile(t);
        if (t === this.firstGift) this.firstGiftDone();
      } else if (t.gift && Math.hypot(p.x - t.pos.x, p.z - t.pos.z) < GIFT_REACH) this.collectGift(t);
      else if (!t.gift && Math.abs(p.x - t.pos.x) < 1.3 && Math.abs(p.z - t.pos.z) < 1.3) {
        if (this.stepping !== t) {
          this.stepping = t;
          void this.take(t);
        }
      }
    }
    // The quest-26 pizza party waits at the food truck while the player is out mining: say so once.
    if (!this.pizzaSaid && !busy && this.h.hasWorkers() && this.pizzaBonus(5003)) {
      this.pizzaSaid = true;
      this.pizzaSaidAt = this.now;
      this.h.hud.toast("🍖 Free BBQ party for your crew at the restaurant!", 4000);
    }
    this.updateCashBonus(busy);
    if (!this.unlocked) {
      // Before the Hydraulic Breaker only the quest-26 gifts can show (and must go away again).
      if (this.pizzaBonus(5003) || this.objects.some((o) => o.shown)) this.updateObjects();
      return this.renderRings();
    }
    this.uiT += dt;
    // The quest-26 free cash keeps the button until it is tapped.
    if (this.uiT >= Number(RV_CONFIG.RV_BOOST_UI_INTERVAL ?? 180) && !this.cashShown) {
      this.uiT = 0;
      // Rotate cash → gear → gem, skipping ones used up today (or not on offer: ads off).
      const order = [3001, 3002, 3003];
      let pick = 0;
      for (let k = 0; k < 3; k++) {
        const id = order[(this.uiKind + k) % 3];
        if (this.usedUp(id) || !this.offerable(id)) continue;
        pick = id;
        this.uiKind = (this.uiKind + k + 1) % 3;
        break;
      }
      if (pick) {
        this.uiId = pick;
        const play = ADS_ON && !this.trialLeft(pick) ? "▶ " : "🎁 ";
        const label =
          pick === 3002 ? `${play}FREE GEAR<br><b>+${Math.round(Number(RV_CONFIG.RV_BOOST_GEAR_COUNT ?? 200) * this.stageMul("Gear"))} ⚙</b>` :
          pick === 3003 ? `${play}FREE GEM<br><b>+${Number(RV_CONFIG.RV_BOOST_GEM_COUNT ?? 10)} 💎</b>` :
          `${play}FREE CASH<br><b>+${this.moneyAmount().toLocaleString("en-US")}</b>`;
        this.offerUntil = this.now + Number(RV_CONFIG.RV_BOOST_UI_DURATION ?? 20);
        this.offer.innerHTML = label;
        this.offer.style.display = "";
        events.emit("boostOffered", { key: String(pick) });
      }
    }
    if (this.offerUntil && this.now > this.offerUntil) {
      this.offer.style.display = "none";
      this.offerUntil = 0;
    }
    this.updateObjects();
    this.renderRings();
  }

  /** Ring timers for active buffs, under the quest card. */
  private renderRings(): void {
    const items: string[] = [];
    const add = (until: number, icon: string, total: number) => {
      const left = until - this.now;
      if (left <= 0) return;
      const k = Math.min(1, left / total);
      items.push(`<div class="bring" style="--k:${(k * 360).toFixed(0)}deg"><b>${icon}</b><small>${Math.ceil(left)}</small></div>`);
    };
    add(buffs.speedUntil, "⚡", this.spans[1001]);
    add(buffs.damageUntil, "💥", this.spans[1002]);
    add(buffs.magnetUntil, "🧲", this.spans[1003]);
    add(buffs.furnaceUntil, "🔥", 180);
    add(buffs.staminaUntil, "🍖", 180);
    const html = items.join("");
    if (this.ring.innerHTML !== html) this.ring.innerHTML = html;
  }
}

let buffsNow = 0;
/** Seconds-clock the buff deadlines are measured against. */
export function buffClock(): number {
  return buffsNow;
}

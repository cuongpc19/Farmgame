import { ITEM_MULT } from "../data";
import { S, addCash, markDirty, stageNumber } from "../state";
import { sfx } from "../audio";
import { events } from "./Events";
import { Modal } from "../ui/Popups";
import { fmt, type Hud } from "../ui/Hud";

/**
 * Reasons to come back tomorrow (Mars Miner, user 2026-10-28; Quarry Crush kept 3-6 % of new players to the next day):
 * - **Supply drones** mine cash in real time, played or not, up to DRONE_CAP; the 🛸 button shows the store, a tap
 *   collects it, and a load with a full enough store opens a welcome-back card. The original's Research Laboratory
 *   (RndRewardData: 15 cash a minute, RND_MAX_SECOND 6 h), which it opens on stage 4; ours with the calendar.
 * - **Daily supply**: a free 7-day log-in calendar (the original sells a 3-day supply, ThreeDayOfferData). One crate
 *   per calendar day the game is opened; a missed day is not lost, the next crate just waits; after day 7 the week
 *   starts again. Cash scales with the stage like FREE CASH (RV_EarnItem).
 * Both open once the tutorial is over (quest index UNLOCK_QUEST: 1007, after the first upgrades; ~47 % of new players
 * got that far in Quarry Crush, about a minute in) or on any later stage, with day 1 of the calendar at once.
 */
const DRONE_RATE = 15;
const DRONE_CAP = 6 * 3600;
/** The store must hold this many seconds of work before a page load opens the welcome-back card. */
const WELCOME_AFTER = 10 * 60;
const UNLOCK_QUEST = 6;
const BOOST_ICON: Record<number, string> = { 1001: "⚡", 1002: "💥", 1003: "🧲" };
/** Day 1-7: cash at stage 1, plus boosts (`mins` minutes each) on days 3, 5 and 7. */
const DAYS: { cash: number; boosts?: number[]; mins?: number }[] = [
  { cash: 200 },
  { cash: 1000 },
  { cash: 1500, boosts: [1001], mins: 5 },
  { cash: 2000 },
  { cash: 3000, boosts: [1002], mins: 5 },
  { cash: 4000 },
  { cash: 8000, boosts: [1001, 1002, 1003], mins: 5 },
];

export interface ComebackHost {
  hud: Hud;
  boosts: { give(id: number, secs: number): void };
  /** Nothing else is up (dialogue, spotlight, camera pan, sheet, stage clear): a card may open by itself. */
  calm: () => boolean;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function cashMul(): number {
  return Number(ITEM_MULT?.RV_EarnItem?.Money?.[String(stageNumber())] ?? 1);
}

function hms(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
}

export class Comeback {
  private m: Modal;
  private col: HTMLDivElement;
  private dronesBtn: HTMLButtonElement;
  private dailyBtn: HTMLButtonElement;
  private dronesAmt: HTMLElement;
  private dronesFill: HTMLElement;
  private dailyLbl: HTMLElement;
  /** Cards waiting for a calm moment (welcome back, today's crate). */
  private queue: (() => Promise<void>)[] = [];
  private busy = false;
  private t = 0;
  private hudT = 1;
  private shown = "";

  constructor(
    private h: ComebackHost,
    host: HTMLElement,
  ) {
    this.m = new Modal(host);
    this.col = document.createElement("div");
    this.col.className = "cb-col";
    this.col.innerHTML = `
      <button class="cb-btn hit drones"><span>🐝</span><small>$0</small><i class="cb-fill"><i></i></i></button>
      <button class="cb-btn hit daily"><span>📅</span><small>DAY 1</small></button>`;
    host.appendChild(this.col);
    const q = <T extends Element>(s: string) => this.col.querySelector(s) as T;
    this.dronesBtn = q(".drones");
    this.dailyBtn = q(".daily");
    this.dronesAmt = q(".drones small");
    this.dronesFill = q(".cb-fill i");
    this.dailyLbl = q(".daily small");
    this.dronesBtn.addEventListener("click", () => this.show(() => this.dronesCard(false)));
    this.dailyBtn.addEventListener("click", () => this.show(() => this.calendar()));
    if (this.unlocked) {
      if (this.stored() > 0 && this.filling() >= WELCOME_AFTER) this.queue.push(() => this.dronesCard(true));
      if (this.claimable) this.queue.push(() => this.calendar());
    }
    this.col.style.display = this.unlocked ? "" : "none";
  }

  get unlocked(): boolean {
    return S.drones !== undefined;
  }

  private get claimable(): boolean {
    return this.unlocked && S.daily?.on !== today();
  }

  /** Seconds the drones have been filling the store (since the last collect), at most DRONE_CAP. */
  private filling(): number {
    const now = Date.now();
    // A clock set back: start the store again from now.
    if (S.drones! > now) S.drones = now;
    return Math.min(DRONE_CAP, (now - S.drones!) / 1000);
  }

  private rate(): number {
    return (DRONE_RATE / 60) * cashMul();
  }

  stored(): number {
    return this.unlocked ? Math.floor(this.filling() * this.rate()) : 0;
  }

  update(dt: number): void {
    this.t += dt;
    if (!this.unlocked && (S.quest.index >= UNLOCK_QUEST || stageNumber() > 1)) this.unlock();
    if (!this.unlocked) return;
    this.hudT += dt;
    if (this.hudT >= 0.5) {
      this.hudT = 0;
      this.refresh();
    }
    if (this.queue.length && !this.busy && this.t > 1.5 && this.h.calm()) void this.show(this.queue.shift()!);
  }

  private unlock(): void {
    S.drones = Date.now();
    S.daily ??= { n: 0, on: "" };
    markDirty();
    this.col.style.display = "";
    this.dronesBtn.classList.add("cb-new");
    this.queue.push(async () => {
      await this.calendar();
      this.h.hud.toast("🐝 Sugar bees are buzzing!\nThey gather cash for you, even while you're away", 4500);
    });
  }

  /** HUD buttons: the store and the next crate, written only when they change. */
  private refresh(): void {
    const n = this.stored();
    const full = this.filling() >= DRONE_CAP;
    const day = ((S.daily?.n ?? 0) % 7) + 1;
    const key = `${n}|${full}|${day}|${this.claimable}`;
    if (key === this.shown) return;
    this.shown = key;
    this.dronesAmt.textContent = full ? "FULL" : `$${fmt(n)}`;
    this.dronesFill.style.width = `${(this.filling() / DRONE_CAP) * 100}%`;
    this.dronesBtn.classList.toggle("full", full);
    this.dailyLbl.textContent = `DAY ${day}`;
    this.dailyBtn.classList.toggle("bang", this.claimable);
  }

  private async show(card: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await card();
    } finally {
      this.m.hide();
      this.busy = false;
      this.shown = "";
    }
  }

  /** The drones' store: what it holds, how long until full, COLLECT. `welcome` on a page load. */
  private async dronesCard(welcome: boolean): Promise<void> {
    this.dronesBtn.classList.remove("cb-new");
    const n = this.stored();
    const secs = this.filling();
    const left = DRONE_CAP - secs;
    this.m.show(`
      <div class="sc-hero">🐝</div>
      <div class="sc-plate blue">${welcome ? "WELCOME BACK!" : "SUGAR BEES"}</div>
      <div class="m-sub">${welcome ? `Your sugar bees kept busy for ${hms(secs)}` : "They gather cash for you, even while you're away"}</div>
      <div class="cb-store"><b>$${n.toLocaleString("en-US")}</b>
        <div class="cb-bar"><i style="width:${(secs / DRONE_CAP) * 100}%"></i></div>
        <small>${left <= 0 ? "Full! Collect it so they keep buzzing" : `Full in ${hms(left)} · holds ${DRONE_CAP / 3600} hours`}</small></div>
      <button class="m-btn go">${n > 0 ? "COLLECT" : "OK"}</button>`);
    await this.m.btn(".go");
    if (n <= 0) return;
    addCash(n);
    S.run.earned += n;
    S.drones = Date.now();
    markDirty();
    sfx.reward();
    events.emit("boostTaken", { key: "drones" });
    this.h.hud.toast(`+$${n.toLocaleString("en-US")}`);
  }

  private dayHtml(i: number, got: number, claimable: boolean): string {
    const d = DAYS[i];
    const state = i < got ? "got" : i === got ? (claimable ? "today" : "next") : "later";
    const tag = state === "got" ? "✔" : state === "today" ? "TODAY" : state === "next" ? "TOMORROW" : `DAY ${i + 1}`;
    const extra = d.boosts ? `<em>+${d.boosts.map((b) => BOOST_ICON[b]).join("")} ${d.mins}m</em>` : "";
    return `<div class="cb-day ${state}${i === 6 ? " big" : ""}"><small>${tag}</small><i>${i === 6 ? "🎁" : "💰"}</i><b>$${fmt(Math.round(d.cash * cashMul()))}</b>${extra}</div>`;
  }

  /** The week's crates; CLAIM takes today's, then the card says what tomorrow brings. */
  private async calendar(): Promise<void> {
    const render = (note: string, btn: string) => {
      const got = (S.daily?.n ?? 0) % 7;
      const claimable = this.claimable;
      this.m.show(`
        <div class="sc-hero">📅</div>
        <div class="sc-plate">DAILY TREATS</div>
        <div class="m-sub">A free treat box every day you play</div>
        <div class="cb-days">${DAYS.map((_, i) => this.dayHtml(i, got, claimable)).join("")}</div>
        <div class="cb-note">${note}</div>
        <button class="m-btn go">${btn}</button>`);
    };
    const next = () => {
      const i = (S.daily?.n ?? 0) % 7;
      return `Come back tomorrow for day ${i + 1}: <b>$${fmt(Math.round(DAYS[i].cash * cashMul()))}</b>${DAYS[i].boosts ? " + boosts" : ""}!`;
    };
    if (!this.claimable) {
      render(next(), "OK");
      await this.m.btn(".go");
      return;
    }
    render("", "CLAIM");
    await this.m.btn(".go");
    this.claim();
    render(next(), "OK");
    await this.m.btn(".go");
  }

  private claim(): void {
    const n = S.daily?.n ?? 0;
    const d = DAYS[n % 7];
    const cash = Math.round(d.cash * cashMul());
    addCash(cash);
    S.run.earned += cash;
    for (const b of d.boosts ?? []) this.h.boosts.give(b, (d.mins ?? 5) * 60);
    S.daily = { n: n + 1, on: today() };
    markDirty();
    sfx.reward();
    events.emit("boostTaken", { key: `day${(n % 7) + 1}` });
    this.h.hud.toast(`+$${cash.toLocaleString("en-US")}`);
  }
}

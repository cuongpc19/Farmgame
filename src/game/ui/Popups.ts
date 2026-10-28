import { platform } from "../../platform";
import { muteFor } from "../audio";
import { ADS_ON } from "../ads";
import { PACE, WORKER_PROFILES, type WorkerProfile } from "../data";
import { S, markDirty } from "../state";
import { fmt } from "./Hud";
import { Sheet } from "./Panels";
import { faceByName, workerPic } from "./faces";

/** Centered modal card used by the stage-clear flow (and Comeback.ts). */
export class Modal {
  readonly root: HTMLDivElement;
  readonly card: HTMLDivElement;
  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "modal hit";
    this.card = document.createElement("div");
    this.card.className = "m-card";
    this.root.appendChild(this.card);
    this.root.addEventListener("pointerdown", (e) => e.stopPropagation());
    host.appendChild(this.root);
  }
  show(html: string): void {
    this.card.innerHTML = html;
    this.root.classList.add("on");
  }
  hide(): void {
    this.root.classList.remove("on");
  }
  btn(sel: string): Promise<void> {
    return new Promise((res) => {
      const b = this.card.querySelector(sel) as HTMLElement | null;
      b?.addEventListener("click", () => res(), { once: true });
    });
  }
}

/**
 * Rewarded-ad stand-in for the prototype: a 2-second "AD" overlay, then the reward.
 * (CrazyGames/Android SDK calls replace this later.)
 */
export class AdSim {
  private m: Modal;
  busy = false;
  constructor(host: HTMLElement) {
    this.m = new Modal(host);
    this.m.root.classList.add("ad");
  }
  show(what: string): Promise<boolean> {
    if (this.busy) return Promise.resolve(false);
    if (!ADS_ON) return Promise.resolve(true); // ads off: everything is free (ads.ts)
    if (platform.name !== "web") return this.real();
    this.busy = true;
    return new Promise((res) => {
      let t = 2;
      this.m.show(`<div class="ad-tag">AD</div><div class="ad-what">${what}</div><div class="ad-t">2</div>`);
      const iv = setInterval(() => {
        t--;
        const el = this.m.card.querySelector(".ad-t");
        if (el) el.textContent = String(Math.max(0, t));
        if (t <= 0) {
          clearInterval(iv);
          this.m.hide();
          this.busy = false;
          res(true);
        }
      }, 1000);
    });
  }

  /**
   * The host's rewarded video (CrazyGames). The game is silent and counts as paused while it
   * runs (`busy`). No SDK (adblock, slow network) or no fill: say so, no reward.
   */
  private async real(): Promise<boolean> {
    if (!platform.canReward()) {
      this.unavailable();
      return false;
    }
    this.busy = true;
    muteFor("ad", true);
    try {
      const ok = await platform.rewarded();
      if (!ok) this.unavailable();
      return ok;
    } finally {
      muteFor("ad", false);
      this.busy = false;
    }
  }

  private unavailable(): void {
    this.m.show(`<div class="ad-what">No video available right now.<br>Please try again later.</div>`);
    setTimeout(() => this.m.hide(), 1800);
  }
}

export interface ClearStats {
  stage: number;
  name: string;
  oreMined: number;
  oreTotal: number;
  cashEarned: number;
  workers: { name: string; mining: number; hauling: number }[];
  reward: { item: string; amount: number }[];
  next: { order: number; name: string; keyOre: string; difficulty: string; client: string; detected: number; bonus: number } | null;
}

/** Count a number up inside an element over `ms`. */
function countUp(el: Element | null, to: number, ms: number, fmtFn: (n: number) => string): void {
  if (!el) return;
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    el.textContent = fmtFn(Math.round(to * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  step();
}

/**
 * Stage clear, following the reference: STAGE COMPLETE (work result + top 4 workers, tap
 * to continue) → BONUS REWARDS (Completion Bonus, Claim — no ×2) → HQ hand-off (the caller
 * plays Sofia's lines) → Contract Room (folder card → details → CONTRACT → APPROVED stamp).
 */
export class StageClearFlow {
  private m: Modal;
  constructor(host: HTMLElement) {
    this.m = new Modal(host);
  }

  private tap(): Promise<void> {
    return new Promise((res) => this.m.root.addEventListener("click", () => res(), { once: true }));
  }

  async results(s: ClearStats): Promise<void> {
    const pct = s.oreTotal ? Math.round((s.oreMined / s.oreTotal) * 100) : 0;
    const rows = s.workers
      .slice(0, 4)
      .map(
        (w) => `<div class="tw">${faceByName(w.name, "tw-f") || `<span class="tw-f"></span>`}<span class="tw-n">${w.name}</span><span class="tw-p">${w.mining}% / ${w.hauling}%</span>
          <div class="tw-bar"><i class="mi" style="--w:${w.mining}%"></i><i class="ha" style="--w:${w.hauling}%"></i></div></div>`,
      )
      .join("");
    this.m.show(`
      <div class="sc-rays"></div>
      <div class="sc-hero">🍭</div>
      <div class="sc-plate">STAGE COMPLETE</div>
      <div class="sc-band">Shift Report</div>
      <div class="sc-res"><div><i class="ico cash"></i><span>Cash Earned</span><b class="c1">0</b></div>
        <div><span class="ore">⛰</span><span>Candy Freed</span><b><span class="c2">0</span> <em>[${pct}%]</em></b></div></div>
      <div class="sc-band">Top 4 Crew <small><i class="dot mi"></i>Mining <i class="dot ha"></i>Hauling</small></div>
      <div class="sc-workers">${rows}</div>
      <div class="sc-tap">TAP TO CONTINUE</div>`);
    this.m.card.classList.add("sc");
    countUp(this.m.card.querySelector(".c1"), s.cashEarned, 900, (n) => n.toLocaleString("en-US"));
    countUp(this.m.card.querySelector(".c2"), s.oreMined, 900, (n) => n.toLocaleString("en-US"));
    await new Promise((r) => setTimeout(r, 900));
    await this.tap();
    this.m.card.classList.remove("sc");
  }

  /** BONUS REWARDS; resolves with the Claim button's screen rect (for the fly-to-HUD burst). */
  async bonus(s: ClearStats): Promise<DOMRect> {
    const items = s.reward
      .map((r) => `<div class="m-rw"><div class="m-rw-ico">${r.item === "Gear" ? "⚙️" : "💎"}</div><b>${fmt(r.amount)}</b></div>`)
      .join("");
    this.m.show(`
      <div class="sc-hero">🙌</div>
      <div class="sc-plate blue">◆ BONUS REWARDS ◆</div>
      <div class="m-sub">Clear Bonus</div>
      <div class="m-rws">${items}</div>
      <button class="m-btn go">Claim</button>`);
    await this.m.btn(".go");
    const r = this.m.card.querySelector(".m-rws")!.getBoundingClientRect();
    this.m.hide();
    return r;
  }

  async contract(s: ClearStats): Promise<boolean> {
    if (!s.next) return false;
    const n = s.next;
    this.m.show(`
      <div class="bubble">Pick your next contract!<small>You can't change it once you sign.</small></div>
      <div class="folder pick"><div class="f-rec">Recommended</div><div class="f-name">${n.name}</div><div class="f-tag">${n.difficulty}</div><div class="f-map">🏝️</div></div>`);
    await this.m.btn(".pick");
    this.m.show(`
      <div class="bubble">Take this contract?<small>Look over the land details below. You can't change it once you sign.</small></div>
      <div class="folder open"><div class="f-name">${n.name}</div><div class="stamp">${n.difficulty.toUpperCase()}</div>
        <div class="c-row"><span>ORE FOUND</span><b>${n.detected}</b></div>
        <div class="c-row"><span>MAIN RESOURCE</span><b>${n.keyOre}</b></div>
        <div class="c-row"><span>CLIENT</span><b>${n.client}</b></div>
        <div class="c-row"><span>BONUS</span><b>⚙️ ${n.bonus}</b></div>
        <div class="approved">APPROVED</div></div>
      <button class="m-btn go">CONTRACT</button>`);
    await this.m.btn(".go");
    (this.m.card.querySelector(".go") as HTMLElement).style.visibility = "hidden";
    this.m.card.querySelector(".approved")!.classList.add("on");
    await new Promise((r) => setTimeout(r, 1300));
    this.m.hide();
    return true;
  }
}

/** Worker office: current applicants + hire buttons; hired count / max. */
export class WorkersPanel extends Sheet {
  applicants: { profile: WorkerProfile; until: number }[] = [];
  onHire: ((id: number) => void) | null = null;
  onDecline: ((id: number) => void) | null = null;
  /** A hire was tapped with the crew already full. */
  onFull: (() => void) | null = null;
  priceOf: (p: WorkerProfile) => number = (p) => p.price;
  maxWorkers = 5;

  constructor(host: HTMLElement) {
    super(host, "JOB BOARD");
    this.body.addEventListener("click", (e) => {
      if (this.ghost(e)) return;
      const d = (e.target as HTMLElement).closest("[data-decline]") as HTMLElement | null;
      if (d) return this.onDecline?.(Number(d.dataset.decline));
      const b = (e.target as HTMLElement).closest("[data-hire]") as HTMLElement | null;
      if (b?.dataset.full) {
        // User 2026-10-21: a full crew greyed every hire button and a tap said nothing.
        b.classList.remove("shake");
        void b.offsetWidth;
        b.classList.add("shake");
        return this.onFull?.();
      }
      if (b && !this.poor(b)) this.onHire?.(Number(b.dataset.hire));
    });
  }

  render(now: number): void {
    const hired = S.run.workers.length;
    const full = hired >= this.maxWorkers;
    const cards = this.applicants
      .filter((a) => a.until > now)
      .map((a) => {
        const p = a.profile;
        const price = this.priceOf(p);
        const st = p.stats;
        const hl = (k: string) => (p.recommended.includes(k) ? "hl" : "");
        const left = Math.max(0, Math.ceil(a.until - now));
        return `<div class="row worker">
          ${workerPic(p.id, p.role)}
          <div class="r-mid"><div class="r-name">${p.name} <small>${"★".repeat(p.tier + 1)}</small></div>
            <div class="r-sub">${p.role === "Mining" ? "Miner" : "Carrier"} · ${p.trait} · leaves in ${left}s</div>
            <div class="w-stats"><span class="${hl("moveSpeed")}">➜${st.moveSpeed}</span><span class="${hl("staminaAmount")}">♥${st.stamina}</span><span class="${hl("attackPower")}">⚒${st.power}</span><span class="${hl("cargo")}">📦${Math.round(st.cargo * PACE.cargo)}</span></div></div>
          <div class="jb-btns"><button class="r-buy decline" data-decline="${p.id}">DECLINE</button>
          ${full
            ? `<button class="r-buy off" data-hire="${p.id}" data-full="1">CREW FULL</button>`
            : `<button class="r-buy ${S.cash < price ? "off" : ""}" data-hire="${p.id}"${price === 0 ? "" : ` data-price="${price}"`}>${price === 0 ? "FREE" : `<i class="ico cash"></i>${fmt(price)}`}</button>`}</div>
        </div>`;
      });
    this.setTitle(`JOB BOARD [${cards.length}/3]`);
    this.body.innerHTML = `<div class="sh-note">Hired Workers: ${hired}/${this.maxWorkers}<br><small>Hires last for this stage only. Turned-down applicants may come back.</small></div>${cards.join("") || `<div class="sh-note">No applicants right now. Check back soon.</div>`}`;
  }

  /** Roll a batch of 3 (the first batch is the scripted onboarding pair + 1). */
  roll(now: number, first: boolean, fixed: number[]): void {
    const pool = WORKER_PROFILES.filter((p) => !S.run.workers.includes(p.id));
    const pick: WorkerProfile[] = [];
    if (first) for (const id of fixed) {
      const p = pool.find((x) => x.id === id);
      if (p) pick.push(p);
    }
    while (pick.length < 3 && pick.length < pool.length) {
      const p = pool[Math.floor(Math.random() * pool.length)];
      if (!pick.includes(p)) pick.push(p);
    }
    this.applicants = pick.map((profile) => ({ profile, until: now + 120 }));
    S.run.applicants = pick.map((p) => p.id);
    markDirty();
  }

  /** Put back the applicants saved before a reload (true if there were any). */
  restore(now: number): boolean {
    const ids = S.run.applicants;
    if (!ids?.length) return false;
    const pick = ids.map((id) => WORKER_PROFILES.find((p) => p.id === id)).filter((p): p is WorkerProfile => !!p && !S.run.workers.includes(p.id));
    this.applicants = pick.map((profile) => ({ profile, until: now + 120 }));
    return true;
  }
}


/**
 * Always-on HUD (DOM): stage title + progress bar with the clear marker, currency chips,
 * settings, the guide-quest card, toasts and the exit-vehicle button.
 * Layout follows the reference: title top-centre, cash/gems top-right, quest card left.
 */
export class Hud {
  readonly root: HTMLDivElement;
  private title: HTMLDivElement;
  private bar: HTMLDivElement;
  private pct: HTMLDivElement;
  private next: HTMLButtonElement;
  private cash: HTMLSpanElement;
  private gem: HTMLSpanElement;
  private gear: HTMLSpanElement;
  private gearChip: HTMLDivElement;
  private quest: HTMLDivElement;
  private questText: HTMLDivElement;
  private questBar: HTMLDivElement;
  private questCount: HTMLDivElement;
  private questReward: HTMLDivElement;
  private toastEl: HTMLDivElement;
  readonly exitBtn: HTMLButtonElement;
  readonly settingsBtn: HTMLButtonElement;
  readonly companyBtn: HTMLButtonElement;
  readonly toolsBtn: HTMLButtonElement;
  onNext: (() => void) | null = null;
  private shown = { cash: -1, gem: -1, gear: -1 };

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "hud";
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hud-left">
          <button class="ic hit" data-k="settings">⚙</button>
          <button class="ic hit" data-k="company" style="display:none">🏡</button>
        </div>
        <div class="hud-stage">
          <div class="st-title">Stage 1</div>
          <div class="st-bar"><div class="st-fill"></div><div class="st-mark"></div><div class="st-pct">0%</div></div>
          <button class="st-next hit" disabled>Next</button>
        </div>
        <div class="hud-cur">
          <div class="chip"><i class="ico cash"></i><span>0</span></div>
          <div class="chip"><i class="ico gem"></i><span>0</span></div>
          <div class="chip gearchip" style="display:none"><i class="ico gear"></i><span>0</span></div>
        </div>
      </div>
      <div class="quest" style="display:none">
        <div class="q-body"><div class="q-text"></div><div class="q-prog"><div class="q-fill"></div><div class="q-count"></div></div></div>
        <div class="q-reward"></div>
      </div>
      <div class="toast"></div>
      <button class="exit-veh hit" style="display:none">⇲</button>
      <button class="tools-btn hit">🛠<small>EQUIPMENT</small></button>
    `;
    host.appendChild(this.root);
    const q = <T extends Element>(s: string) => this.root.querySelector(s) as T;
    this.title = q(".st-title");
    this.bar = q(".st-fill");
    this.pct = q(".st-pct");
    this.next = q(".st-next");
    const chips = this.root.querySelectorAll(".chip span");
    this.cash = chips[0] as HTMLSpanElement;
    this.gem = chips[1] as HTMLSpanElement;
    this.gear = chips[2] as HTMLSpanElement;
    this.gearChip = q(".gearchip");
    this.quest = q(".quest");
    this.questText = q(".q-text");
    this.questBar = q(".q-fill");
    this.questCount = q(".q-count");
    this.questReward = q(".q-reward");
    this.toastEl = q(".toast");
    // Toasts sit above sheets ("Not enough cash!", "Crew full" are said over one): the HUD is a
    // fixed layer of its own, so nothing inside it can rise above a sheet.
    host.appendChild(this.toastEl);
    this.exitBtn = q(".exit-veh");
    this.settingsBtn = q('[data-k="settings"]');
    this.companyBtn = q('[data-k="company"]');
    this.toolsBtn = q(".tools-btn");
    this.next.addEventListener("click", () => this.onNext?.());
  }

  /** Last values written (the HUD is refreshed every frame; the DOM only when they change). */
  private stageKey = "";
  private questKey = "";

  setStage(n: number, percent: number, clearAt: number): void {
    const p = Math.max(0, Math.min(100, percent));
    const pctText = `${p < 10 ? p.toFixed(1) : Math.floor(p)}%`;
    const key = `${n}|${pctText}|${clearAt}`;
    if (key === this.stageKey) return;
    this.stageKey = key;
    this.title.textContent = `Stage ${n}`;
    this.bar.style.width = `${p}%`;
    this.pct.textContent = pctText;
    (this.root.querySelector(".st-mark") as HTMLDivElement).style.left = `${clearAt}%`;
    const ready = p >= clearAt;
    this.next.disabled = !ready;
    this.next.textContent = ready ? "Clear Stage" : "Next";
    this.next.classList.toggle("ready", ready);
  }

  setCurrency(cash: number, gem: number, gear: number, showGear: boolean): void {
    if (cash !== this.shown.cash) {
      this.cash.textContent = fmt(cash);
      if (cash > this.shown.cash && this.shown.cash >= 0) bump(this.cash.parentElement!);
      this.shown.cash = cash;
    }
    if (gem !== this.shown.gem) {
      this.gem.textContent = fmt(gem);
      this.shown.gem = gem;
    }
    if (gear !== this.shown.gear) {
      this.gear.textContent = fmt(gear);
      this.shown.gear = gear;
    }
    this.gearChip.style.display = showGear ? "" : "none";
  }

  setQuest(text: string | null, cur = 0, target = 1, reward = ""): void {
    const key = text === null ? "" : `${text}|${cur}|${target}|${reward}`;
    if (key === this.questKey) return;
    this.questKey = key;
    if (!text) {
      this.quest.style.display = "none";
      return;
    }
    this.quest.style.display = "";
    this.questText.textContent = text;
    this.questBar.style.width = `${Math.min(100, (cur / Math.max(1, target)) * 100)}%`;
    this.questCount.textContent = `${fmt(Math.min(cur, target))}/${fmt(target)}`;
    this.questReward.innerHTML = reward;
    this.questReward.style.display = reward ? "" : "none";
  }

  /** Burst `n` currency icons from a screen rect into the matching HUD counter. */
  flyIcons(kind: "cash" | "gem" | "gear", from: DOMRect, n = 8): void {
    const chip = (kind === "gem" ? this.gem : kind === "gear" ? this.gear : this.cash).parentElement!;
    const to = chip.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const ic = document.createElement("i");
      ic.className = `ico fly ${kind}`;
      const x0 = from.left + from.width / 2 + (Math.random() - 0.5) * 50;
      const y0 = from.top + from.height / 2 + (Math.random() - 0.5) * 30;
      ic.style.left = `${x0}px`;
      ic.style.top = `${y0}px`;
      this.root.appendChild(ic);
      ic.animate(
        [
          { transform: "translate(0,0) scale(0.6)", opacity: 0 },
          { transform: `translate(${(Math.random() - 0.5) * 80}px, ${-40 - Math.random() * 40}px) scale(1.3)`, opacity: 1, offset: 0.3 },
          { transform: `translate(${to.left + 12 - x0}px, ${to.top + to.height / 2 - y0}px) scale(0.8)`, opacity: 1 },
        ],
        { duration: 700 + i * 70, easing: "cubic-bezier(.5,0,.6,1)" },
      ).onfinish = () => {
        ic.remove();
        bump(chip);
      };
    }
  }

  /**
   * Quest finished: the card turns into a green "✔ COMPLETE!" pill for ~1 s while the
   * reward icons burst out of it and fly to the matching currency counter.
   */
  questDone(reward?: { item: string; amount: number }): void {
    const pill = document.createElement("div");
    pill.className = "q-complete";
    pill.innerHTML = "✔ COMPLETE!";
    const r = this.quest.getBoundingClientRect();
    pill.style.left = `${r.left}px`;
    pill.style.top = `${r.top + r.height / 2}px`;
    this.root.appendChild(pill);
    setTimeout(() => pill.remove(), 1100);
    if (!reward) return;
    const kind = reward.item === "Gem" ? "gem" : reward.item === "Gear" ? "gear" : "cash";
    const chip = (kind === "gem" ? this.gem : kind === "gear" ? this.gear : this.cash).parentElement!;
    const to = chip.getBoundingClientRect();
    const n = Math.min(8, Math.max(3, Math.ceil(reward.amount / 5)));
    for (let i = 0; i < n; i++) {
      const ic = document.createElement("i");
      ic.className = `ico fly ${kind}`;
      const x0 = r.left + 60 + (Math.random() - 0.5) * 40;
      const y0 = r.top + r.height / 2 + (Math.random() - 0.5) * 20;
      ic.style.left = `${x0}px`;
      ic.style.top = `${y0}px`;
      this.root.appendChild(ic);
      const dx = to.left + 12 - x0;
      const dy = to.top + to.height / 2 - y0;
      ic.animate(
        [
          { transform: "translate(0,0) scale(0.6)", opacity: 0 },
          { transform: `translate(${(Math.random() - 0.5) * 60}px, ${-30 - Math.random() * 30}px) scale(1.2)`, opacity: 1, offset: 0.3 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.8)`, opacity: 1 },
        ],
        { duration: 650 + i * 60, easing: "cubic-bezier(.5,0,.6,1)" },
      ).onfinish = () => {
        ic.remove();
        bump(chip);
      };
    }
  }

  toast(text: string, ms = 2200): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove("on");
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add("on");
    clearTimeout((this.toastEl as unknown as { _t: number })._t);
    (this.toastEl as unknown as { _t: number })._t = window.setTimeout(() => this.toastEl.classList.remove("on"), ms);
  }

  private exitShown: boolean | null = null;
  showExit(on: boolean): void {
    if (on === this.exitShown) return;
    this.exitShown = on;
    this.exitBtn.style.display = on ? "" : "none";
  }
}

export function fmt(n: number): string {
  n = Math.floor(n);
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K`;
  return n.toLocaleString("en-US");
}

function bump(el: HTMLElement): void {
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
}

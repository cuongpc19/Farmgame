import "./research.css";
import { EQUIP, MANAGEMENT } from "../data";
import { S, markDirty } from "../state";
import { fmt } from "./Hud";
import { ICON } from "./Panels";

/** One research node of the company tree (MANAGEMENT.treeNodes). */
export interface ResearchNode {
  id: number;
  tree: string;
  prev: number;
  equipment: string;
  title: string;
  price: number;
  currency: string;
  researchSeconds: number;
  requiresOwnedEquipment: string | null;
  effects: { stat: string; value: number }[];
}
export type ResearchTab = "mining" | "carrying";
/** applied ✔ · complete (APPLY) · researching (countdown) · locked (prev not applied) · needs (tool not owned) · open (buyable). */
export type ResearchState = "applied" | "complete" | "researching" | "locked" | "needs" | "open";

const PADLOCK = `<svg viewBox="0 0 40 50" aria-hidden="true"><path d="M10 23V15a10 10 0 0 1 20 0v8" fill="none" stroke="currentColor" stroke-width="5.5"/><rect x="3" y="21" width="34" height="27" rx="6" fill="currentColor"/><circle cx="20" cy="32" r="4.2" fill="#555"/><rect x="18" y="33" width="4" height="9" rx="2" fill="#555"/></svg>`;

/** Icons for research equipment that ICON doesn't list (every machine has its picture there). */
const EXTRA_ICON: Record<string, string> = {
  "Large Hand Drill": "🪛",
  "Exo-Carrier": "🦾",
};
function iconOf(equipment: string): string {
  const key = Object.values(EQUIP).find((e) => e.name === equipment)?.key;
  return (key && ICON[key]) || EXTRA_ICON[equipment] || "🔧";
}

const STAT_LABEL: Record<string, string> = {
  AttackPower: "Mining Power",
  AttackInterval: "Mining Speed",
  Cargo: "Cargo",
  MoveSpeed: "Move Speed",
  FuelEfficiency: "Fuel Efficiency",
  FuelAmount: "Fuel Tank",
};
/** "PickaxeAttackPowerMulti 0.1" → "Mining Power +10%". */
export function effectText(e: { stat: string; value: number }): string {
  const m = /(AttackPower|AttackInterval|Cargo|MoveSpeed|FuelEfficiency|FuelAmount)(Multi|Base)$/.exec(e.stat);
  if (!m) return `${e.stat} +${e.value}`;
  return `${STAT_LABEL[m[1]]} +${m[2] === "Multi" ? `${+(e.value * 100).toFixed(1)}%` : e.value}`;
}
/** Research duration for the timer chip: 5s · 10m 30s · 3h 25m. */
export function durText(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m${sec % 60 ? ` ${sec % 60}s` : ""}`;
  const m = Math.floor((sec % 3600) / 60);
  return `${Math.floor(sec / 3600)}h${m ? ` ${m}m` : ""}`;
}
/** Countdown: mm:ss (h:mm:ss past an hour). */
function clock(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600);
  const mm = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
  const ss = String(t % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function floorTitle(id: number, fallback: string): string {
  const f = (MANAGEMENT.floors as { id: number; title: string | null }[] | undefined)?.find((x) => x.id === id);
  return f?.title ?? fallback;
}

/**
 * "Light Equipment Upgrade" research popup (reference S14 / ref/36), the replacement for
 * HqPanel: yellow drill picture, orange title bar + red X, MINING / CARRYING tabs, and a
 * vertical node tree on paper. Node flow: price button (+ timer chip) → RESEARCHING mm:ss →
 * COMPLETE / APPLY → APPLIED ✔. Same public surface as HqPanel (render/open/close/isOpen,
 * onResearch, owned, floor, lightOpen/heavyOpen, static nodes()) plus onApply.
 *
 * z-index 39: above the HQ tower (36), below Sofia's dialogue (40) and the spotlight (45).
 */
/** Display name of a research prerequisite (the data names equipment by name). */
function eqName(name: string | null): string {
  return name ?? "";
}

export class ResearchPanel {
  readonly root: HTMLDivElement;
  /** The scrolling node tree. */
  readonly body: HTMLDivElement;
  private box: HTMLDivElement;
  private titleEl: HTMLDivElement;
  private tabsEl: HTMLDivElement;
  private toastEl: HTMLDivElement;
  isOpen = false;
  onClose: (() => void) | null = null;
  /** Price button tapped on an available, affordable node (nothing else running). The game pays and sets S.mgmt.research. */
  onResearch: ((id: number) => void) | null = null;
  /**
   * APPLY tapped on a finished node. The game should move it into S.mgmt.done, clear
   * S.mgmt.research and refresh stats. Unset: the panel does the S.mgmt part itself.
   */
  onApply: ((id: number) => void) | null = null;
  /** Is a tool (by display name, e.g. "Cargo Pack") owned? Default: owned or ever unlocked. */
  owned: (equipName: string) => boolean = (name) =>
    Object.values(EQUIP).some((e) => e.name === name && (S.owned.includes(e.key) || S.unlocked.includes(e.key)));
  /** Which workshop: Light (LightTech, cash) or Heavy (HeavyTech, gears). */
  floor: "light" | "heavy" = "light";
  lightOpen = true;
  heavyOpen = false;
  tab: ResearchTab = "mining";

  private openedAt = 0;
  private timer = 0;
  private sig = "";
  private toastT = 0;
  private fresh = 0;
  private customTitle: string | null = null;

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "rp";
    this.root.innerHTML = `
      <div class="rp-box">
        <div class="rp-pic"><div class="rp-drill"><i class="d-bit"></i><i class="d-chuck"></i><i class="d-grip"></i><i class="d-trig"></i><i class="d-body"></i><i class="d-vent"></i><i class="d-bat"></i></div><div class="rp-heavy">🚜</div></div>
        <div class="rp-head"><i class="rp-bolt"></i><div class="rp-title"></div><button class="rp-x" aria-label="Close">✕</button></div>
        <div class="rp-paper"><div class="rp-tabs"></div><div class="rp-tree"></div></div>
      </div>
      <div class="rp-toast"></div>`;
    host.appendChild(this.root);
    const q = <T extends Element>(s: string) => this.root.querySelector(s) as T;
    this.box = q(".rp-box");
    this.titleEl = q(".rp-title");
    this.tabsEl = q(".rp-tabs");
    this.body = q(".rp-tree");
    this.toastEl = q(".rp-toast");
    q(".rp-x").addEventListener("click", () => this.close());
    this.root.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.tabsEl.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("[data-tab]") as HTMLElement | null;
      if (b && !this.ghost(e)) this.showTab(b.dataset.tab as ResearchTab);
    });
    this.body.addEventListener("click", (e) => this.onTreeClick(e));
  }

  /* ---------- data helpers (static, like HqPanel.nodes()) ---------- */

  static nodes(): ResearchNode[] {
    return MANAGEMENT.treeNodes as ResearchNode[];
  }
  static node(id: number): ResearchNode | undefined {
    return ResearchPanel.nodes().find((n) => n.id === id);
  }
  static treeName(floor: "light" | "heavy"): string {
    return floor === "light" ? "LightTech" : "HeavyTech";
  }
  /** First node of the chain `n` belongs to. */
  static rootOf(n: ResearchNode): ResearchNode {
    let r = n;
    for (let i = 0; i < 200 && r.prev; i++) {
      const p = ResearchPanel.node(r.prev);
      if (!p) break;
      r = p;
    }
    return r;
  }
  private static tabs = new Map<number, ResearchTab>();
  /** MINING = chains rooted at a mining tool (attack stats), CARRYING = the rest (cargo / speed / fuel). */
  static tabOf(n: ResearchNode): ResearchTab {
    let t = ResearchPanel.tabs.get(n.id);
    if (!t) {
      t = ResearchPanel.rootOf(n).effects.some((e) => /Attack(Power|Interval)/.test(e.stat)) ? "mining" : "carrying";
      ResearchPanel.tabs.set(n.id, t);
    }
    return t;
  }

  /* ---------- state ---------- */

  stateOf(n: ResearchNode, now = Date.now()): ResearchState {
    const done = S.mgmt.done;
    if (done.includes(n.id)) return "applied";
    const r = S.mgmt.research;
    if (r && r.id === n.id) return now >= r.endsAt ? "complete" : "researching";
    if (n.prev && !done.includes(n.prev)) return "locked";
    if (n.requiresOwnedEquipment && !this.owned(n.requiresOwnedEquipment)) return "needs";
    return "open";
  }

  private affordable(n: ResearchNode): boolean {
    return (n.currency === "Gear" ? S.gear : S.cash) >= n.price;
  }

  /** Worth a red "!": buyable right now, or finished and waiting for APPLY. */
  private alert(n: ResearchNode, st: ResearchState): boolean {
    return st === "complete" || (st === "open" && !S.mgmt.research && this.affordable(n));
  }

  private floorOpen(floor = this.floor): boolean {
    return floor === "light" ? this.lightOpen : this.heavyOpen;
  }

  /** Anything to do on this floor (for the tower's UPGRADE "!" badge). */
  hasAlert(floor: "light" | "heavy" = this.floor, tab?: ResearchTab): boolean {
    if (!this.floorOpen(floor)) return false;
    const tree = ResearchPanel.treeName(floor);
    const now = Date.now();
    return ResearchPanel.nodes().some((n) => n.tree === tree && (!tab || ResearchPanel.tabOf(n) === tab) && this.alert(n, this.stateOf(n, now)));
  }

  /** Tab's nodes in display order: the main chain, side branches right after their parent. */
  private chain(tab: ResearchTab): { n: ResearchNode; br: boolean; first: boolean }[] {
    const tree = ResearchPanel.treeName(this.floor);
    const all = ResearchPanel.nodes().filter((n) => n.tree === tree);
    const kids = new Map<number, ResearchNode[]>();
    for (const n of all) {
      const a = kids.get(n.prev) ?? [];
      a.push(n);
      kids.set(n.prev, a);
    }
    const size = (n: ResearchNode): number => 1 + (kids.get(n.id) ?? []).reduce((s, k) => s + size(k), 0);
    const out: { n: ResearchNode; br: boolean; first: boolean }[] = [];
    const walk = (n: ResearchNode, br: boolean, first: boolean) => {
      out.push({ n, br, first });
      const ks = [...(kids.get(n.id) ?? [])].sort((a, b) => size(b) - size(a));
      const [spine, ...side] = ks;
      for (const s of side) walk(s, true, false);
      if (spine) walk(spine, br, false);
    };
    for (const r of kids.get(0) ?? []) if (ResearchPanel.tabOf(r) === tab) walk(r, false, true);
    return out;
  }

  /* ---------- view ---------- */

  setTitle(t: string): void {
    this.customTitle = t;
    this.titleEl.textContent = t;
  }

  showTab(t: ResearchTab): void {
    if (this.tab === t) return;
    this.tab = t;
    this.render();
    this.scrollToFrontier();
  }

  render(): void {
    const now = Date.now();
    const scroll = this.body.scrollTop;
    this.titleEl.textContent = this.customTitle ?? (this.floor === "light" ? floorTitle(2, "Light Equipment Upgrade") : floorTitle(3, "Heavy Equipment Upgrade"));
    this.box.classList.toggle("heavy", this.floor === "heavy");
    const open = this.floorOpen();
    const tabBtn = (t: ResearchTab, ico: string, name: string) =>
      `<button data-tab="${t}" class="${this.tab === t ? "on" : ""} ${open && this.hasAlert(this.floor, t) ? "has" : ""}"><span class="rp-ti">${ico}</span>${name}<i class="rp-bang">!</i></button>`;
    this.tabsEl.innerHTML = tabBtn("mining", "⛏", "MINING") + tabBtn("carrying", "🛒", "CARRYING");
    if (!open) {
      this.body.innerHTML = `<div class="rp-note"><span>${PADLOCK}</span>${this.floor === "light" ? "Opens at Stage 2." : "Opens at Stage 2 · 40%."}</div>`;
      this.sig = this.signature(now);
      return;
    }
    let html = "";
    this.chain(this.tab).forEach(({ n, br, first }, i) => {
      if (first && i > 0) html += `<div class="rp-gap"></div>`;
      else if (!first) html += `<i class="rp-wire${br ? " br" : ""}${this.stateOf(n, now) === "locked" ? "" : " lit"}"></i>`;
      html += this.nodeHtml(n, br, now);
    });
    this.body.innerHTML = html || `<div class="rp-note">Nothing to research here yet.</div>`;
    this.body.scrollTop = scroll;
    this.sig = this.signature(now);
  }

  private nodeHtml(n: ResearchNode, br: boolean, now: number): string {
    const st = this.stateOf(n, now);
    const gear = n.currency === "Gear";
    const r = S.mgmt.research;
    let act: string;
    if (st === "applied") act = `<div class="rp-done"><b>✔</b> APPLIED</div>`;
    else if (st === "complete") act = `<button class="rp-apply" data-apply="${n.id}"><small>COMPLETE</small>APPLY</button>`;
    else if (st === "researching") {
      const left = r!.endsAt - now;
      const p = Math.min(100, Math.max(0, 100 - (left / (n.researchSeconds * 1000)) * 100));
      act = `<div class="rp-busy"><small>RESEARCHING</small><b class="rp-cd">${clock(left)}</b><i class="rp-bar" style="width:${p.toFixed(1)}%"></i></div>`;
    } else if (st === "locked" || st === "needs") act = `<div class="rp-lockbtn">${PADLOCK}<small>${st === "needs" ? eqName(n.requiresOwnedEquipment) : "LOCKED"}</small></div>`;
    else {
      const off = !!r || !this.affordable(n);
      act = `<button class="rp-buy${off ? " off" : ""}" data-buy="${n.id}"><span class="rp-chip">⏱ ${durText(n.researchSeconds)}</span><i class="ico ${gear ? "gear" : "cash"}"></i>${fmt(n.price)}</button>`;
    }
    const lockish = st === "locked" || st === "needs";
    return `<div class="rp-node s-${st}${br ? " br" : ""}${this.fresh === n.id ? " fresh" : ""}" data-id="${n.id}">
      <div class="rp-tile"><span class="rp-emo">${iconOf(n.equipment)}</span>${lockish ? `<i class="rp-pad">${PADLOCK}</i>` : ""}${st === "applied" ? `<i class="rp-check">✔</i>` : ""}${this.alert(n, st) ? `<i class="rp-bang">!</i>` : ""}</div>
      <div class="rp-mid"><div class="rp-eq">${n.equipment}</div><div class="rp-name">${n.title}</div><div class="rp-eff">${n.effects.map(effectText).join(" · ")}</div></div>
      <div class="rp-act">${act}</div></div>`;
  }

  /** What the view depends on: re-render when it changes (cash earned, research done…). */
  private signature(now: number): string {
    const tree = ResearchPanel.treeName(this.floor);
    let s = `${this.floor}${this.tab}${this.floorOpen() ? 1 : 0}|`;
    for (const n of ResearchPanel.nodes()) {
      if (n.tree !== tree) continue;
      const st = this.stateOf(n, now);
      s += `${st[0]}${st === "open" && this.affordable(n) ? 1 : 0}${S.mgmt.research ? 1 : 0}`;
    }
    return s;
  }

  private scrollToFrontier(): void {
    const el = this.body.querySelector(".rp-node:not(.s-applied)") as HTMLElement | null;
    this.body.scrollTop = el ? Math.max(0, el.offsetTop - 70) : this.body.scrollHeight;
  }

  /** 4×/s while open: tick the countdown, re-render on any state change. */
  private tick(): void {
    const now = Date.now();
    if (this.signature(now) !== this.sig) return this.render();
    const r = S.mgmt.research;
    const busy = this.body.querySelector(".rp-busy");
    if (!r || !busy) return;
    const n = ResearchPanel.node(r.id);
    const left = r.endsAt - now;
    busy.querySelector(".rp-cd")!.textContent = clock(left);
    if (n) (busy.querySelector(".rp-bar") as HTMLElement).style.width = `${Math.min(100, Math.max(0, 100 - (left / (n.researchSeconds * 1000)) * 100)).toFixed(1)}%`;
  }

  private onTreeClick(e: MouseEvent): void {
    if (this.ghost(e)) return;
    const t = e.target as HTMLElement;
    const card = t.closest("[data-id]") as HTMLElement | null;
    const n = card ? ResearchPanel.node(Number(card.dataset.id)) : undefined;
    if (!n) return;
    const st = this.stateOf(n);
    if (st === "locked") return this.toast(`Research ${ResearchPanel.node(n.prev)?.title ?? "the step above"} first!`);
    if (st === "needs") return this.toast(`Purchase ${eqName(n.requiresOwnedEquipment)} first!`);
    if (st === "complete" && t.closest("[data-apply]")) return this.apply(n);
    if (st !== "open" || !t.closest("[data-buy]")) return;
    const r = S.mgmt.research;
    if (r) return this.toast(Date.now() >= r.endsAt ? "Apply the finished research first!" : "Another research is in progress!");
    if (!this.affordable(n)) return this.toast(n.currency === "Gear" ? "Not enough Gears!" : "Not enough Cash!");
    this.onResearch?.(n.id);
    this.render();
  }

  private apply(n: ResearchNode): void {
    if (this.onApply) this.onApply(n.id);
    else {
      const r = S.mgmt.research;
      if (!r || r.id !== n.id || Date.now() < r.endsAt) return;
      S.mgmt.done.push(n.id);
      S.mgmt.research = null;
      markDirty();
    }
    this.fresh = n.id;
    this.render();
    this.fresh = 0;
    this.toast(`${n.title}: ${n.effects.map(effectText).join(", ")}`);
  }

  open(): void {
    const first = !this.isOpen;
    if (first) this.openedAt = performance.now();
    this.isOpen = true;
    this.render();
    this.root.classList.add("on");
    if (first) this.scrollToFrontier();
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), 250);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove("on");
    clearInterval(this.timer);
    this.onClose?.();
  }

  /** A click that is really the tail of the tap that opened the panel (phones). */
  private ghost(e: Event): boolean {
    return e.isTrusted && performance.now() - this.openedAt < 450;
  }

  private toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove("on");
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add("on");
    clearTimeout(this.toastT);
    this.toastT = window.setTimeout(() => this.toastEl.classList.remove("on"), 1900);
  }
}

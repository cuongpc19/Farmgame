import "./hqtower.css";
import { SOFIA_SVG } from "./portraits";

/**
 * Company HQ tower (reference S13 / ref/35): a tall stack of floors over a city skyline,
 * drawn with HTML/CSS only. Bottom → top: CONTRACT ROOM, LIGHT EQUIPMENT WORKSHOP (or its
 * COMING SOON scaffolding), four locked floors, then the roof sign.
 *
 * Sits at z-index 36: above the HUD (≤ 21), below Sofia's dialogue (40), the research panel
 * (39), the spotlight (45) and the Contract Room modal (60).
 */

export type HqFloorState = "locked" | "soon" | "built";

export interface HqTowerOpenOptions {
  /** "next": cyan NEXT STAGE button (end of a stage clear) · "info": STAGE INFO (COMPANY button). */
  mode: "next" | "info";
  /** Floor 2: LIGHT EQUIPMENT WORKSHOP when true, COMING SOON scaffolding when false. */
  workshopBuilt: boolean;
  /** UPGRADE on the workshop floor. The tower stays open. */
  onUpgrade: () => void;
  /** Floor 3 (Heavy Equipment Center). Default: "soon" once the workshop is built, else "locked". */
  heavy?: HqFloorState;
  /** UPGRADE on the heavy floor (shown only when `heavy` is "built"). */
  onHeavyUpgrade?: () => void;
  /** Red "!" on the workshop UPGRADE button (default true) / on the heavy one (default false). */
  badge?: boolean;
  heavyBadge?: boolean;
  /** Rows of the STAGE INFO card (mode "info"). */
  info?: { label: string; value: string }[];
}

const PADLOCK = `<svg class="hqt-pad" viewBox="0 0 40 50" aria-hidden="true"><path d="M10 23V15a10 10 0 0 1 20 0v8" fill="none" stroke="#fff" stroke-width="5.5"/><rect x="3" y="21" width="34" height="27" rx="6" fill="#fff"/><circle cx="20" cy="32" r="4.2" fill="#5b5e63"/><rect x="18" y="33" width="4" height="9" rx="2" fill="#5b5e63"/></svg>`;

/** Requirement text under the padlock, and the toast when a locked floor is tapped. */
const LOCKS: Record<number, { text: string; toast: string }> = {
  3: { text: "STAGE 2 [40%]", toast: "Reach 40% in Stage 2 first!" },
  4: { text: "CLEAR STAGE 3 FIRST", toast: "Clear Stage 3 first!" },
  5: { text: "CLEAR STAGE 4 FIRST", toast: "Clear Stage 4 first!" },
  6: { text: "CLEAR STAGE 5 FIRST", toast: "Clear Stage 5 first!" },
};
const SOON: Record<number, { text: string; toast: string }> = {
  2: { text: "CLEAR STAGE 1 FIRST", toast: "Clear Stage 1 first!" },
  3: { text: "STAGE 2 [40%]", toast: "Coming soon: reach 40% in Stage 2!" },
};

const CONTRACT_ROOM = `<div class="hqt-room cr">
  <i class="cr-win"></i><i class="cr-tv"></i><i class="cr-shelf"></i>
  <span class="cr-globe">🌍</span><span class="cr-plant">🪴</span>
  <span class="cr-boss">👷</span>
  <div class="cr-sofia">${SOFIA_SVG}</div>
  <div class="cr-desk"><i class="f1"></i><i class="f2"></i><i class="f3"></i></div>
</div>`;

const WORKSHOP = `<div class="hqt-room ws">
  <i class="ws-lamp a"></i><i class="ws-lamp b"></i>
  <div class="ws-peg"><span>🔨</span><span>⛏️</span><span>🔧</span><span>🪚</span><span>🪛</span></div>
  <div class="ws-shelf"><span>🧰</span><span>⛑️</span></div>
  <div class="ws-bench"><span>🛠️</span><span>⚙️</span></div>
  <span class="ws-mech">👨‍🔧</span>
  <i class="ws-line"></i>
</div>`;

const HEAVY_ROOM = `<div class="hqt-room hv">
  <i class="ws-lamp a"></i><i class="ws-lamp b"></i>
  <span class="hv-crane">🍭</span><span class="hv-dozer">🚚</span><span class="hv-tire">🍩</span>
  <span class="ws-mech hv-m">👷</span>
  <i class="ws-line"></i>
</div>`;

const scaffold = (t: string) =>
  `<div class="hqt-room sc"><i class="sc-frame"></i><i class="sc-plank p1"></i><i class="sc-plank p2"></i><div class="sc-sign"><span>🚧</span><b>${t}</b></div><i class="sc-tape"></i></div>`;
const locked = (t: string) => `<div class="hqt-room lk"><div class="lk-in">${PADLOCK}<b>${t}</b></div></div>`;
const label = (t: string, cls = "") => `<div class="hqt-lbl ${cls}">${t}</div>`;

const ROOF = `<div class="hqt-roof">
  <i class="rf-truss"></i>
  <div class="rf-sign"><span class="rf-gear g1">⚙</span><span class="rf-gear g2">⚙</span><div class="rf-name">CANDY MINER<small>& co.</small></div></div>
  <div class="rf-deck"><i class="rf-ac a1"></i><i class="rf-ac a2"></i><i class="rf-mast"></i></div>
  <div class="rf-banner"><span>Global NO.1 Mining Company!</span></div>
  <span class="rf-hero">👷<i>✨</i></span>
</div>`;

/** Small seeded RNG: the skyline looks the same every time. */
function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function skyline(): string {
  const r = rng(11);
  const layer = (cls: string, hMin: number, hMax: number, colors: string[]) => {
    let s = "";
    for (let x = -3; x < 103; ) {
      const w = 4 + r() * 8;
      const h = hMin + r() * (hMax - hMin);
      const c = colors[Math.floor(r() * colors.length)];
      s += `<i style="left:${x.toFixed(1)}%;width:${w.toFixed(1)}%;height:${h.toFixed(1)}%;--c:${c}"></i>`;
      x += w + r() * 2 - 0.5;
    }
    return `<div class="hqt-city ${cls}">${s}</div>`;
  };
  let trees = "";
  for (let x = -2; x < 102; x += 2 + r() * 4) trees += `<i style="left:${x.toFixed(1)}%;--s:${(0.7 + r() * 0.6).toFixed(2)}"></i>`;
  return (
    `<i class="hqt-cloud c1"></i><i class="hqt-cloud c2"></i><i class="hqt-cloud c3"></i>` +
    layer("far", 30, 78, ["#b5ccdb", "#a8c1d3", "#c2d5e2", "#9fb8cb"]) +
    layer("near", 12, 42, ["#7f9cb2", "#8aa5b9", "#6f8ca4", "#94acbf"]) +
    `<div class="hqt-trees">${trees}</div>`
  );
}

export class HqTower {
  readonly root: HTMLDivElement;
  private sky: HTMLDivElement;
  private view: HTMLDivElement;
  private world: HTMLDivElement;
  private roofEl: HTMLDivElement;
  private floors: HTMLDivElement[] = [];
  private bar: HTMLDivElement;
  private nextBtn: HTMLButtonElement;
  private quarryBtn: HTMLButtonElement;
  private infoEl: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private upBtn: HTMLButtonElement;
  private heavyBtn: HTMLButtonElement;
  private fstate: Record<number, HqFloorState> = { 2: "soon", 3: "locked" };

  /** UPGRADE (workshop / heavy floor) handlers; open() sets them from its options. */
  onUpgrade: (() => void) | null = null;
  onHeavyUpgrade: (() => void) | null = null;

  private mode: "next" | "info" = "next";
  private info: { label: string; value: string }[] = [];
  private pending: ((r: "next" | "close") => void) | null = null;
  private shown = false;
  private revealing = false;
  private skipped = false;
  private revealAt = 0;
  private wakers = new Set<() => void>();
  private openedAt = 0;
  private hideT = 0;
  private toastT = 0;
  private scale = 1;
  private ty = 0;
  private drag: { y: number; ty: number; moved: boolean } | null = null;
  private dragged = false;

  constructor(uiRoot: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "hqt";
    const floors = [6, 5, 4, 3, 2, 1].map((f) => `<div class="hqt-floor" data-f="${f}"><div class="hqt-fin"></div></div>`).join("");
    this.root.innerHTML = `
      <div class="hqt-sky">${skyline()}</div>
      <div class="hqt-view"><div class="hqt-world">
        <div class="hqt-gap"></div>${ROOF}
        <div class="hqt-body">${floors}</div>
        <div class="hqt-ground"><i class="gr-lane"></i></div>
      </div></div>
      <div class="hqt-info"></div>
      <div class="hqt-toast"></div>
      <div class="hqt-skip">TAP TO SKIP</div>
      <div class="hqt-bar"><button class="hqt-next">NEXT STAGE</button><button class="hqt-quarry"><span>🍭</span><small>Land</small></button></div>`;
    uiRoot.appendChild(this.root);
    const q = <T extends Element>(s: string) => this.root.querySelector(s) as T;
    this.sky = q(".hqt-sky");
    this.view = q(".hqt-view");
    this.world = q(".hqt-world");
    this.roofEl = q(".hqt-roof");
    this.bar = q(".hqt-bar");
    this.nextBtn = q(".hqt-next");
    this.quarryBtn = q(".hqt-quarry");
    this.infoEl = q(".hqt-info");
    this.toastEl = q(".hqt-toast");
    for (const el of this.root.querySelectorAll<HTMLDivElement>(".hqt-floor")) this.floors[Number(el.dataset.f)] = el;

    // The UPGRADE buttons live across re-renders, so the game can keep a reference (spotlight).
    this.upBtn = document.createElement("button");
    this.upBtn.className = "hqt-up";
    this.upBtn.innerHTML = `UPGRADE<i>!</i>`;
    this.heavyBtn = this.upBtn.cloneNode(true) as HTMLButtonElement;
    this.heavyBtn.classList.add("nobadge");
    this.upBtn.addEventListener("click", (e) => {
      if (!this.revealing && !this.ghost(e)) this.onUpgrade?.();
    });
    this.heavyBtn.addEventListener("click", (e) => {
      if (!this.revealing && !this.ghost(e)) this.onHeavyUpgrade?.();
    });

    for (const f of [1, 2, 3, 4, 5, 6]) this.setFloor(f, f === 2 ? "soon" : "locked");
    this.bindInput();
    window.addEventListener("resize", () => {
      if (this.shown && !this.revealing) this.cam("rest", 1, 0);
    });
  }

  get isOpen(): boolean {
    return this.shown;
  }

  /** The workshop's UPGRADE button (for the spotlight). Attached only while the workshop is built. */
  upgradeButton(): HTMLElement {
    return this.upBtn;
  }

  /** The heavy floor's UPGRADE button (attached only while that floor is built). */
  heavyUpgradeButton(): HTMLElement {
    return this.heavyBtn;
  }

  /** Red "!" on an UPGRADE button. */
  setBadge(on: boolean, which: "light" | "heavy" = "light"): void {
    (which === "light" ? this.upBtn : this.heavyBtn).classList.toggle("nobadge", !on);
  }

  /**
   * The stage-clear cinematic (~12.5 s, ~4 s with reduced motion): ground floor → pan up past
   * the locked floors → the roof sign drops in → back down → the scaffold floor is built into
   * the LIGHT EQUIPMENT WORKSHOP. Any tap skips to the end. The tower stays on screen after.
   */
  async reveal(): Promise<void> {
    if (this.revealing) return;
    this.revealing = true;
    this.skipped = false;
    this.onUpgrade = this.onHeavyUpgrade = null;
    this.bar.classList.remove("on");
    this.infoEl.classList.remove("on");
    this.setFloor(2, "soon");
    this.setFloor(3, "locked");
    this.roofEl.classList.remove("in", "cheer", "instant");
    this.upBtn.classList.remove("pop");
    this.show();
    this.root.classList.add("rev");
    this.revealAt = performance.now();

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const k = reduced ? 0.3 : 1;
    const zoom = reduced ? 1 : Math.min(1.3, (this.view.clientWidth * 1.04) / Math.max(1, this.world.offsetWidth));
    const f1 = this.floors[1];
    this.cam(this.yOf(f1) + f1.offsetHeight * 0.1, zoom, 0);
    const roofY = this.yOf(this.roofEl) + this.roofEl.offsetHeight * 0.8;

    const steps: (() => Promise<void>)[] = [
      () => this.wait(1500 * k),
      () => {
        this.cam(roofY, 1, 4300 * k, "cubic-bezier(.55,0,.35,1)");
        return this.wait(4100 * k);
      },
      () => {
        this.roofEl.classList.add("in");
        return this.wait(900 * k);
      },
      () => {
        this.roofEl.classList.add("cheer");
        return this.wait(1700 * k);
      },
      () => {
        this.cam("rest", 1, 2600 * k, "cubic-bezier(.45,0,.3,1)");
        return this.wait(2750 * k);
      },
      () => this.buildFloor(2, "built", k),
      () => {
        this.upBtn.classList.add("pop");
        return this.wait(500 * k);
      },
    ];
    for (const s of steps) {
      if (this.skipped) break;
      await s();
    }
    if (this.skipped) {
      // Jump to the final frame.
      this.setFloor(2, "built");
      this.roofEl.classList.add("in", "cheer", "instant");
      for (const n of this.root.querySelectorAll(".hqt-dust, .hqt-flash")) n.remove();
      for (const f of this.floors) f?.classList.remove("shake", "pop");
      this.cam("rest", 1, 0);
    }
    this.root.classList.remove("rev");
    this.revealing = false;
    this.openedAt = performance.now();
  }

  /**
   * Reference step 9: dust + flash, the locked "STAGE 2 [40%]" floor turns into COMING SOON
   * scaffolding (call after the research popup closes, before open()).
   */
  async scaffoldNext(): Promise<void> {
    if (!this.shown || this.fstate[3] !== "locked") return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    await this.buildFloor(3, "soon", reduced ? 0.3 : 1);
  }

  /**
   * Show the tower at rest (bottom floors) with NEXT STAGE / STAGE INFO and the Quarry button.
   * Resolves "next" on NEXT STAGE (the tower stays up so the Contract Room modal can sit on it;
   * call close() when done) and "close" on Quarry or close().
   */
  open(opts: HqTowerOpenOptions): Promise<"next" | "close"> {
    const prev = this.pending;
    this.pending = null;
    prev?.("close");
    this.mode = opts.mode;
    this.info = opts.info ?? [];
    this.onUpgrade = opts.onUpgrade;
    this.onHeavyUpgrade = opts.onHeavyUpgrade ?? null;
    if (!this.revealing) {
      this.setFloor(2, opts.workshopBuilt ? "built" : "soon");
      // Already on screen (after reveal / scaffoldNext): keep floor 3 as it is unless told.
      const heavy = opts.heavy ?? (this.shown ? this.fstate[3] : opts.workshopBuilt ? "soon" : "locked");
      if (heavy !== this.fstate[3] || heavy === "built") this.setFloor(3, heavy);
      this.roofEl.classList.add("in", "cheer", "instant");
    }
    this.setBadge(opts.badge ?? true, "light");
    this.setBadge(opts.heavyBadge ?? false, "heavy");
    const was = this.shown;
    this.show();
    if (!this.revealing) this.cam("rest", 1, was ? 500 : 0);
    this.nextBtn.textContent = opts.mode === "next" ? "NEXT STAGE" : "STAGE INFO";
    this.infoEl.classList.remove("on");
    this.bar.classList.add("on");
    this.openedAt = performance.now();
    return new Promise((res) => (this.pending = res));
  }

  close(): void {
    if (!this.shown) return;
    if (this.revealing) this.skip();
    this.shown = false;
    this.root.classList.remove("on");
    this.bar.classList.remove("on");
    this.infoEl.classList.remove("on");
    clearTimeout(this.hideT);
    this.hideT = window.setTimeout(() => {
      if (!this.shown) this.root.style.display = "none";
    }, 350);
    const p = this.pending;
    this.pending = null;
    p?.("close");
  }

  /* ---------- internals ---------- */

  private show(): void {
    clearTimeout(this.hideT);
    this.shown = true;
    this.root.style.display = "block";
    void this.root.offsetWidth;
    this.root.classList.add("on");
  }

  /** A click that is really the tail of the tap that opened the tower (phones). */
  private ghost(e: Event): boolean {
    return e.isTrusted && performance.now() - this.openedAt < 450;
  }

  private setFloor(f: number, st: HqFloorState): void {
    const el = this.floors[f];
    if (!el) return;
    if (f >= 2) this.fstate[f] = st;
    let html: string;
    if (f === 1) html = label("CONTRACT OFFICE", "cy") + CONTRACT_ROOM;
    else if (st === "built") html = f === 2 ? label("TOOL WORKSHOP", "cy") + WORKSHOP : label("MACHINE BAY", "or") + HEAVY_ROOM;
    else if (st === "soon" && SOON[f]) html = label("COMING SOON") + scaffold(SOON[f].text);
    else html = label("LOCKED") + locked(LOCKS[f]?.text ?? "LOCKED");
    const fin = el.querySelector(".hqt-fin") as HTMLDivElement;
    fin.innerHTML = html;
    el.dataset.st = f === 1 ? "built" : st;
    if (st === "built" && (f === 2 || f === 3)) fin.querySelector(".hqt-room")!.appendChild(f === 2 ? this.upBtn : this.heavyBtn);
  }

  private async buildFloor(f: number, st: HqFloorState, k: number): Promise<void> {
    const el = this.floors[f];
    if (this.skipped) return this.setFloor(f, st);
    el.classList.add("shake");
    for (let i = 0; i < 16; i++) {
      const d = document.createElement("i");
      d.className = "hqt-dust";
      const x = 4 + Math.random() * 92;
      d.style.cssText = `left:${x}%;top:${45 + Math.random() * 50}%;--dx:${((x - 50) * 0.9 + (Math.random() - 0.5) * 30).toFixed(0)}px;--dy:${(-20 - Math.random() * 50).toFixed(0)}px;--s:${(1 + Math.random() * 0.9).toFixed(2)};animation-delay:${(Math.random() * 160).toFixed(0)}ms`;
      el.appendChild(d);
    }
    await this.wait(380 * k);
    const fl = document.createElement("i");
    fl.className = "hqt-flash";
    el.appendChild(fl);
    await this.wait(210 * k);
    this.setFloor(f, st);
    el.classList.remove("shake");
    el.classList.add("pop");
    await this.wait(850 * k);
    el.classList.remove("pop");
    for (const n of el.querySelectorAll(".hqt-dust, .hqt-flash")) n.remove();
  }

  /** Sleep that a skip tap cuts short. */
  private wait(ms: number): Promise<void> {
    if (this.skipped || ms <= 0) return Promise.resolve();
    return new Promise((res) => {
      const done = () => {
        clearTimeout(t);
        this.wakers.delete(done);
        res();
      };
      const t = setTimeout(done, ms);
      this.wakers.add(done);
    });
  }

  private skip(): void {
    this.skipped = true;
    for (const w of [...this.wakers]) w();
  }

  /** World y (unscaled px from the world's top) of an element inside the world. */
  private yOf(el: HTMLElement): number {
    let y = 0;
    for (let e: HTMLElement | null = el; e && e !== this.world; e = e.offsetParent as HTMLElement | null) y += e.offsetTop;
    return y;
  }

  private restTy(): number {
    return this.view.clientHeight - this.world.offsetHeight;
  }

  /** Highest scroll for dragging: the roof sign just below the top edge. */
  private topTy(): number {
    return Math.max(this.restTy(), 24 - this.yOf(this.roofEl));
  }

  /** Point the camera at world y (centred) with zoom s, or at the resting bottom view. */
  private cam(target: number | "rest", s: number, ms: number, ease = "cubic-bezier(.45,.05,.3,1)"): void {
    if (this.skipped) ms = 0;
    const vh = this.view.clientHeight;
    const H = this.world.offsetHeight;
    let ty = target === "rest" ? vh - H : vh / 2 - target * s;
    ty = Math.max(ty, vh - H * s); // never past the street
    this.scale = s;
    this.ty = ty;
    this.place(ms, ease);
  }

  private place(ms: number, ease = "linear"): void {
    const tr = ms > 0 ? `transform ${ms}ms ${ease}` : "none";
    this.world.style.transition = tr;
    this.world.style.transform = `translate(-50%, ${this.ty.toFixed(1)}px) scale(${this.scale})`;
    this.sky.style.transition = tr;
    this.sky.style.transform = `translateY(${((this.ty - this.restTy()) * 0.2).toFixed(1)}px)`;
  }

  private toast(t: string): void {
    this.toastEl.textContent = t;
    this.toastEl.classList.remove("on");
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add("on");
    clearTimeout(this.toastT);
    this.toastT = window.setTimeout(() => this.toastEl.classList.remove("on"), 1800);
  }

  private toggleInfo(): void {
    if (this.infoEl.classList.contains("on")) return this.infoEl.classList.remove("on");
    const rows = this.info.length
      ? this.info.map((r) => `<div class="hqt-ir"><span>${r.label}</span><b>${r.value}</b></div>`).join("")
      : `<p>Free this land to unlock your next contract.</p>`;
    this.infoEl.innerHTML = `<h3>STAGE INFO</h3>${rows}<small>TAP TO CLOSE</small>`;
    this.infoEl.classList.add("on");
  }

  private bindInput(): void {
    const r = this.root;
    r.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      this.dragged = false;
      if (this.revealing) {
        if (!this.skipped && performance.now() - this.revealAt > 300) this.skip();
        return;
      }
      this.drag = { y: e.clientY, ty: this.ty, moved: false };
    });
    r.addEventListener("pointermove", (e) => {
      const d = this.drag;
      if (!d || this.revealing) return;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.abs(dy) < 10) return;
      d.moved = true;
      this.scale = 1;
      this.ty = Math.min(this.topTy(), Math.max(this.restTy(), d.ty + dy));
      this.place(0);
    });
    const end = () => {
      if (this.drag?.moved) this.dragged = true;
      this.drag = null;
    };
    r.addEventListener("pointerup", end);
    r.addEventListener("pointercancel", end);
    r.addEventListener("pointerleave", end);
    // A drag must not end as a click on whatever is under the finger.
    r.addEventListener(
      "click",
      (e) => {
        if (this.dragged || this.revealing) {
          e.stopPropagation();
          e.preventDefault();
          this.dragged = false;
        }
      },
      true,
    );
    r.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (this.infoEl.classList.contains("on") && !t.closest(".hqt-next")) return this.infoEl.classList.remove("on");
      if (t.closest("button")) return;
      const fl = t.closest(".hqt-floor") as HTMLElement | null;
      if (!fl) return;
      const f = Number(fl.dataset.f);
      const st = this.fstate[f];
      if (f >= 2 && st === "soon" && SOON[f]) this.toast(SOON[f].toast);
      else if (f >= 3 && st === "locked" && LOCKS[f]) this.toast(LOCKS[f].toast);
    });
    this.nextBtn.addEventListener("click", (e) => {
      if (this.ghost(e)) return;
      if (this.mode === "info") return this.toggleInfo();
      this.bar.classList.remove("on");
      const p = this.pending;
      this.pending = null;
      p?.("next");
    });
    this.quarryBtn.addEventListener("click", (e) => {
      if (!this.ghost(e)) this.close();
    });
  }
}

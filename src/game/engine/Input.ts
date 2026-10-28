/**
 * Floating one-finger joystick + WASD/arrow keys.
 *
 * Press anywhere that isn't a UI button: the stick base appears under the finger and the
 * knob follows the drag. `vec` is the movement intent in screen space (x right, y down),
 * length 0..1. Releasing the finger zeroes it. Keyboard input overrides when held.
 * Buttons registered with `steerFrom` steer too (see there).
 */
/** Movement (px) that turns a press on a `steerFrom` button into a drag. */
const SLOP = 10;

export class Input {
  readonly vec = { x: 0, y: 0 };
  /** True while a finger/mouse is held on the play area. */
  active = false;
  /** Fired once on the first press (used to start audio after a user gesture). */
  onFirstPress: (() => void) | null = null;

  private pid = -1;
  private ox = 0;
  private oy = 0;
  private keys = new Set<string>();
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private readonly radius = 58;
  private enabled = true;
  /** A touch that began on a `steerFrom` button: where, when, how far it has moved. */
  private press: { id: number; el: HTMLElement; x: number; y: number; t: number; far: number } | null = null;
  /** The button whose next click is a leftover of a drag or a hold, not a tap. */
  private swallow: { el: HTMLElement; until: number } | null = null;
  /** When the last real steering drag ended (the stick had moved), and whether this one moved. */
  private steeredAt = -1e9;
  private dragMoved = false;

  constructor(surface: HTMLElement) {
    this.base = document.createElement("div");
    this.base.className = "joy-base";
    this.knob = document.createElement("div");
    this.knob.className = "joy-knob";
    this.base.appendChild(this.knob);
    document.body.appendChild(this.base);

    surface.addEventListener("pointerdown", (e) => this.down(e));
    // iOS Safari ignores `touch-action: none` when the game sits in an iframe (the claude.ai
    // artifact viewer): a vertical drag scrolls the host page and fires pointercancel, so the
    // stick dies on up/down swipes. Cancelling the touch itself keeps the gesture ours.
    const stop = (e: TouchEvent) => e.cancelable && e.preventDefault();
    surface.addEventListener("touchstart", stop, { passive: false });
    surface.addEventListener("touchmove", stop, { passive: false });
    window.addEventListener("pointermove", (e) => this.move(e));
    window.addEventListener("pointerup", (e) => {
      this.pressEnd(e, true);
      this.up(e);
    });
    window.addEventListener("pointercancel", (e) => {
      this.pressEnd(e, false);
      this.up(e);
    });
    window.addEventListener(
      "click",
      (e) => {
        const s = this.swallow;
        if (!s || performance.now() > s.until || !s.el.contains(e.target as Node)) return;
        this.swallow = null;
        e.stopPropagation();
        e.preventDefault();
      },
      true,
    );
    window.addEventListener("keydown", (e) => {
      // Inside the CrazyGames iframe these would scroll the host page (a QA failure).
      const tag = (e.target as HTMLElement | null)?.tagName;
      if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) && tag !== "SELECT" && tag !== "INPUT") e.preventDefault();
      this.keys.add(e.key.toLowerCase());
      this.fireFirst();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.release();
    });
  }

  /**
   * A HUD button in the thumb's way (EQUIPMENT, bottom-right): a touch that starts on it steers
   * like anywhere else, and only a quick, still tap presses it. (2026-10-19, user on an iPhone:
   * "EQUIPMENT keeps popping up". A thumb resting in that corner to walk did not steer, and
   * lifting it clicked the button.) Mouse clicks are untouched.
   */
  steerFrom(el: HTMLElement): void {
    el.style.touchAction = "none";
    // Cancel the touch only once it is clearly a drag (keeps an iframe host from scrolling):
    // cancelling a touchmove also cancels the tap's click, even for a finger that never moved.
    el.addEventListener("touchmove", (e) => e.cancelable && (this.press?.far ?? SLOP) >= SLOP && e.preventDefault(), { passive: false });
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      // A new press: a leftover click the browser never sent must not eat this one.
      this.swallow = null;
      this.press = { id: e.pointerId, el, x: e.clientX, y: e.clientY, t: performance.now(), far: 0 };
      this.down(e);
    });
  }

  /** A press on a `steerFrom` button ended: unless it was a tap, its click is swallowed. */
  private pressEnd(e: PointerEvent, lifted: boolean): void {
    const p = this.press;
    if (!p || e.pointerId !== p.id) return;
    this.press = null;
    // A still tap right after steering (or while another finger steers) is the play rhythm of a
    // thumb in that corner, not a request (2026-10-20, user on an iPhone: it still opened twice).
    const now = performance.now();
    const steering = this.pid !== -1 && this.pid !== p.id;
    const tap = lifted && p.far < SLOP && now - p.t < 600 && now - this.steeredAt > 800 && !steering;
    if (!tap) this.swallow = { el: p.el, until: performance.now() + 500 };
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.release();
  }

  /** Called every frame: merges keyboard state into `vec`. */
  poll(): void {
    if (this.pid !== -1) return;
    let x = 0;
    let y = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) y -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y += 1;
    const l = Math.hypot(x, y);
    this.vec.x = l ? x / l : 0;
    this.vec.y = l ? y / l : 0;
    this.active = l > 0;
  }

  private fireFirst(): void {
    if (this.onFirstPress) {
      const f = this.onFirstPress;
      this.onFirstPress = null;
      f();
    }
  }

  private down(e: PointerEvent): void {
    this.fireFirst();
    if (!this.enabled || this.pid !== -1) return;
    this.pid = e.pointerId;
    this.ox = e.clientX;
    this.oy = e.clientY;
    this.active = true;
    this.base.style.left = `${this.ox}px`;
    this.base.style.top = `${this.oy}px`;
    this.base.classList.add("on");
    this.knob.style.transform = "translate(-50%,-50%)";
    this.dragMoved = false;
  }

  private move(e: PointerEvent): void {
    const p = this.press;
    if (p && e.pointerId === p.id) p.far = Math.max(p.far, Math.hypot(e.clientX - p.x, e.clientY - p.y));
    if (e.pointerId !== this.pid) return;
    let dx = e.clientX - this.ox;
    let dy = e.clientY - this.oy;
    const l = Math.hypot(dx, dy);
    if (l > this.radius) {
      // Drag the base along so the stick never "runs out" (feels better than clamping).
      const over = l - this.radius;
      this.ox += (dx / l) * over;
      this.oy += (dy / l) * over;
      dx = e.clientX - this.ox;
      dy = e.clientY - this.oy;
      this.base.style.left = `${this.ox}px`;
      this.base.style.top = `${this.oy}px`;
    }
    const m = Math.min(1, Math.hypot(dx, dy) / this.radius);
    const a = Math.atan2(dy, dx);
    // Small dead zone so a resting thumb doesn't drift.
    const mag = m < 0.12 ? 0 : (m - 0.12) / 0.88;
    if (mag > 0) this.dragMoved = true;
    this.vec.x = Math.cos(a) * mag;
    this.vec.y = Math.sin(a) * mag;
    this.knob.style.transform = `translate(calc(-50% + ${Math.cos(a) * m * this.radius}px), calc(-50% + ${Math.sin(a) * m * this.radius}px))`;
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.pid) return;
    this.release();
  }

  private release(): void {
    if (this.pid !== -1 && this.dragMoved) this.steeredAt = performance.now();
    this.dragMoved = false;
    this.pid = -1;
    this.vec.x = 0;
    this.vec.y = 0;
    this.active = false;
    this.base.classList.remove("on");
  }
}

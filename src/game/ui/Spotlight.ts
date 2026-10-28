/**
 * Tutorial spotlight (reference): the screen dims except a circle around one button; only
 * that button can be pressed. Tapping inside the hole fires `onTap` (usually the button's
 * own action); with `anyTap`, tapping anywhere dismisses it (highlight-only steps).
 *
 * `hint` puts a bouncing bubble with an arrow next to the hole, kept on screen even when the
 * button sits on the edge; `anyTapAfter` (seconds) lets any tap go on after a while. User
 * 2026-10-21: after the first tool, the ring around EQUIPMENT in the top corner went unseen on a
 * phone, every other tap did nothing, and the player was stuck.
 * While a spotlight is up, `body.spotlit` hides the walk-in shop's item card (it sat beside the
 * EQUIPMENT button and drew the eye away from it).
 */
export class Spotlight {
  private root: HTMLDivElement;
  private hole: HTMLDivElement;
  private bubble: HTMLDivElement;
  private done: (() => void) | null = null;
  private target: HTMLElement | null = null;
  private anyTap = false;
  private timer = 0;
  private raf = 0;
  open = false;

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "spot hit";
    this.hole = document.createElement("div");
    this.hole.className = "spot-hole";
    this.bubble = document.createElement("div");
    this.bubble.className = "spot-hint";
    this.root.append(this.hole, this.bubble);
    host.appendChild(this.root);
    this.root.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      if (!this.target) return;
      const r = this.target.getBoundingClientRect();
      const inside = e.clientX >= r.left - 10 && e.clientX <= r.right + 10 && e.clientY >= r.top - 10 && e.clientY <= r.bottom + 10;
      if (inside || this.anyTap) this.close();
    });
  }

  show(target: HTMLElement, opts: { anyTap?: boolean; hint?: string; anyTapAfter?: number } = {}): Promise<void> {
    this.target = target;
    this.anyTap = !!opts.anyTap;
    this.open = true;
    this.root.classList.add("on");
    document.body.classList.add("spotlit");
    this.bubble.innerHTML = opts.hint ?? "";
    this.bubble.style.display = opts.hint ? "" : "none";
    clearTimeout(this.timer);
    if (opts.anyTapAfter !== undefined) this.timer = window.setTimeout(() => (this.anyTap = true), opts.anyTapAfter * 1000);
    const track = () => {
      if (!this.target) return;
      const r = this.target.getBoundingClientRect();
      // Never a trap: when what it points at is off screen or hidden, any tap lets go.
      const shown = r.width > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
      if (!shown) this.anyTap = true;
      const d = Math.max(r.width, r.height) + 26;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      this.hole.style.width = this.hole.style.height = `${d}px`;
      this.hole.style.left = `${cx - d / 2}px`;
      this.hole.style.top = `${cy - d / 2}px`;
      if (opts.hint) {
        // Below the hole when there is room, else above; slid sideways to stay on screen, with
        // the arrow still pointing at the hole's centre.
        const bw = this.bubble.offsetWidth;
        const bh = this.bubble.offsetHeight;
        const below = cy + d / 2 + 14 + bh < innerHeight - 8;
        const left = Math.max(8, Math.min(innerWidth - bw - 8, cx - bw / 2));
        this.bubble.style.left = `${left}px`;
        this.bubble.style.top = `${below ? cy + d / 2 + 14 : cy - d / 2 - 14 - bh}px`;
        this.bubble.classList.toggle("up", below);
        this.bubble.style.setProperty("--ax", `${Math.max(14, Math.min(bw - 14, cx - left))}px`);
      }
      this.raf = requestAnimationFrame(track);
    };
    track();
    return new Promise((res) => (this.done = res));
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timer);
    this.root.classList.remove("on");
    document.body.classList.remove("spotlit");
    this.target = null;
    const d = this.done;
    this.done = null;
    d?.();
  }
}

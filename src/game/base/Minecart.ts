import { adLabel } from "../ads";
import * as THREE from "three";
import { CELL, GAMEPLAY, PACE, cellToWorld, itemColor, itemKind, type Placed } from "../data";
import { makeCart, makeRails } from "../models";
import { Zone } from "./Zone";
import { Stack } from "../world/Stack";
import type { BaseCtx } from "./Ctx";
import type { Actor } from "./Actor";
import type { OreStorage } from "./Buildings";
import { Ticker } from "../systems/Events";
import { UNLOAD_TRANSFER } from "./common";
import { sfx } from "../audio";
import type { Label } from "../ui/Labels";
import { pointToWorld } from "./Bridge";

/**
 * Minecart on a rail from deep in the quarry to the ore storage at base.
 * Idle → (player feeds minerals within reach) → depart (button, or auto 3 s after full) →
 * ride the rail → unload into storage 0.03 s/item → ride back.
 * Carts 102/103 (stage 1) and all stage-2 carts unlock through a rewarded ad; the near
 * stage-1 cart is free.
 */
export class Minecart {
  readonly cart: ReturnType<typeof makeCart>;
  readonly stack: Stack;
  readonly path: THREE.Vector3[];
  readonly home: THREE.Vector3;
  state: "locked" | "idle" | "out" | "unload" | "back" = "idle";
  private seg = 0;
  private along = 0;
  private fullT = 0;
  private feed = new Map<Actor, Ticker>();
  private unloadTick = new Ticker();
  private label: Label;
  readonly button: HTMLButtonElement;
  private rails = new THREE.Group();
  private pad: Zone | null = null;
  private padLabel: Label | null = null;
  private padHold = 0;
  private padAt: THREE.Vector3;
  readonly groupId: number;
  /** Rail tracks in the way are built through ore (the original's _mineBlockDamager). */
  readonly railCells: { cx: number; cz: number }[] = [];
  /** Player stood on the ACTIVATE pad (Game decides: free, or a rewarded ad first). */
  onUnlockRequest: (() => void) | null = null;
  /** Fired once the cart is active (Game clears the ore lying on the track). */
  onActivated: (() => void) | null = null;

  constructor(private ctx: BaseCtx, p: Placed, private storage: OreStorage, uiRoot: HTMLElement, locked: boolean, readonly free: boolean) {
    this.groupId = p.groupId ?? 0;
    const pts = (p.rail ?? []).map(([x, z]) => {
      // Waypoints are the cart's min corner (2×2): centre of the 2-wide rail.
      const c = cellToWorld(x + 0.5, z - 0.5);
      return new THREE.Vector3(c.x, 0, c.z);
    });
    this.path = pts.length >= 2 ? pts : [new THREE.Vector3(p.wx, 0, p.wz), new THREE.Vector3(p.wx, 0, p.wz + 10)];
    this.home = this.path[0].clone();
    // Stages 3+ say where the ACTIVATE pad goes (MinecartPlatformPoint); else beside the cart.
    this.padAt = p.raw?.platform ? pointToWorld(p.raw.platform) : this.home.clone().add(new THREE.Vector3(-CELL * 1.4, 0, 0));
    for (let i = 0; i + 1 < this.path.length; i++) {
      const rails = makeRails(this.path[i], this.path[i + 1]);
      rails.scale.set(1.5, 1, 1);
      this.rails.add(rails);
      // Remember which cells the track crosses (to clear ore from them).
      const a = this.path[i];
      const b = this.path[i + 1];
      const n = Math.ceil(a.distanceTo(b) / (CELL * 0.5));
      for (let k = 0; k <= n; k++) {
        const q = a.clone().lerp(b, k / n);
        for (const ox of [-0.5, 0.5])
          for (const oz of [-0.5, 0.5]) this.railCells.push({ cx: Math.round(q.x / CELL + ox), cz: Math.round(q.z / CELL + oz) });
      }
    }
    ctx.scene.add(this.rails);
    this.cart = makeCart();
    this.cart.root.scale.setScalar(1.6);
    this.cart.root.position.copy(this.home);
    ctx.scene.add(this.cart.root);
    this.stack = new Stack(this.cart.stackAnchor, Math.round(GAMEPLAY.minecartCapacity * PACE.cargo), itemColor, { cols: 3, rows: 3, size: 0.3, maxShown: 54 });
    this.label = ctx.labels.add(this.cart.root, "cart", "", 3.6);
    this.button = document.createElement("button");
    this.button.className = "cart-go hit";
    this.button.textContent = "▶";
    this.button.addEventListener("click", () => this.depart());
    uiRoot.appendChild(this.button);
    if (locked) this.lock();
  }

  /** Inactive: no track yet, an ACTIVATE pad (FREE / ad) beside the cart (reference). */
  private lock(): void {
    this.state = "locked";
    this.rails.visible = false;
    const c = this.padAt.clone();
    this.pad = new Zone(this.ctx.scene, c, CELL * 1.1, "ACTIVATE");
    this.padLabel = this.ctx.labels.add(c.clone().setZ(c.z + CELL * 0.75), "load", this.free ? "FREE" : adLabel());
  }

  unlock(): void {
    if (this.state !== "locked") return;
    this.state = "idle";
    this.rails.visible = true;
    if (this.pad) this.ctx.scene.remove(this.pad.root);
    if (this.padLabel) this.ctx.labels.remove(this.padLabel);
    this.pad = null;
    this.padLabel = null;
    sfx.unlock();
    this.onActivated?.();
  }

  get active(): boolean {
    return this.state !== "locked";
  }

  depart(): void {
    if (this.state !== "idle" || this.stack.count === 0) return;
    this.state = "out";
    this.seg = 0;
    this.along = 0;
    sfx.engine(true);
  }

  /** World position of the cart (for the screen button). */
  pos(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.cart.root.position);
  }

  private ride(dt: number, forward: boolean): boolean {
    const pts = forward ? this.path : [...this.path].reverse();
    // Reference P1: the near cart runs its track in ~2.5 s (≈16 u/s).
    const speed = 16;
    let move = speed * dt;
    while (move > 0 && this.seg < pts.length - 1) {
      const a = pts[this.seg];
      const b = pts[this.seg + 1];
      const len = a.distanceTo(b);
      const left = len - this.along;
      if (move < left) {
        this.along += move;
        move = 0;
      } else {
        move -= left;
        this.seg++;
        this.along = 0;
      }
    }
    if (this.seg >= pts.length - 1) {
      this.cart.root.position.copy(pts[pts.length - 1]);
      return true;
    }
    const a = pts[this.seg];
    const b = pts[this.seg + 1];
    const k = this.along / a.distanceTo(b);
    this.cart.root.position.lerpVectors(a, b, k);
    this.cart.root.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    for (const w of this.cart.wheels) w.rotation.x += dt * 12;
    return false;
  }

  update(dt: number, player: Actor): void {
    if (this.state === "locked") {
      this.ctx.labels.set(this.label, "");
      const on = !!this.pad && player.kind === "player" && this.pad.contains(player.pos);
      this.padHold = on ? this.padHold + dt : 0;
      this.pad?.setFill(this.padHold / 0.4);
      if (this.padHold >= 0.4) {
        this.padHold = -99;
        this.onUnlockRequest?.();
      }
      this.button.style.display = "none";
      return;
    }
    if (this.state === "idle") {
      // Feed: anyone close enough tips minerals in.
      for (const a of [player]) {
        const d = Math.hypot(a.pos.x - this.home.x, a.pos.z - this.home.z);
        if (d > 3.2 || this.stack.full) {
          this.feed.get(a)?.reset();
          continue;
        }
        let tk = this.feed.get(a);
        if (!tk) this.feed.set(a, (tk = new Ticker()));
        tk.tick(dt, UNLOAD_TRANSFER, () => {
          if (this.stack.full) return false;
          const it = a.stack.take((i) => itemKind(i) === "mineral");
          if (it === null) return false;
          this.ctx.flyers.launch(a.stack.topWorld(), this.cart.stackAnchor, itemColor(it), () => {
            this.stack.push(it);
            sfx.drop();
          }, { item: it });
          return true;
        });
      }
      if (this.stack.full) {
        this.fullT += dt;
        if (this.fullT > GAMEPLAY.minecartLoadWaitSeconds) this.depart();
      } else this.fullT = 0;
    } else if (this.state === "out") {
      if (this.ride(dt, true)) {
        this.state = "unload";
        this.unloadTick.reset();
      }
    } else if (this.state === "unload") {
      this.unloadTick.tick(dt, GAMEPLAY.minecartUnloadIntervalSeconds, () => {
        const it = this.stack.pop();
        if (it === null) return false;
        this.ctx.flyers.launch(this.stack.topWorld(), this.storage.anchor, itemColor(it), () => this.storage.pile.push(it), { dur: 0.25, item: it });
        return true;
      });
      if (this.stack.count === 0) {
        this.state = "back";
        this.seg = 0;
        this.along = 0;
      }
    } else if (this.state === "back") {
      if (this.ride(dt, false)) {
        this.state = "idle";
        this.cart.root.rotation.y = 0;
      }
    }
    this.stack.update(dt);
    this.ctx.labels.set(this.label, `LOAD [${this.stack.count}/${this.stack.capacity}]`);
    // Screen-space depart button above the cart while it has a load and sits idle.
    const show = this.state === "idle" && this.stack.count > 0;
    this.button.style.display = show ? "" : "none";
    if (show) {
      const p = { x: 0, y: 0, visible: false };
      this.ctx.stage.toScreen(this.cart.root.position.clone().setY(5.2), p);
      this.button.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    }
  }
}

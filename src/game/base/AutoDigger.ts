import { adLabel } from "../ads";
import * as THREE from "three";
import { CELL, GAMEPLAY, ORES, PACE, itemColor, type OreDef, type Placed } from "../data";
import { mat } from "../models";
import { Stack } from "../world/Stack";
import type { BaseCtx } from "./Ctx";
import type { Actor } from "./Actor";
import { Ticker } from "../systems/Events";
import { PICKUP_TRANSFER } from "./common";
import { sfx } from "../audio";
import type { Label } from "../ui/Labels";

/**
 * Auto Digger (rewarded-ad unlock): a drill rig on an ore deposit (OreDepositData: stage 2 has
 * 300 Emerald; later stages other ores, 300-450) that produces one mineral per DIG_INTERVAL
 * (1 s) into its output pile until the deposit is empty.
 */
export class AutoDigger {
  readonly pos: THREE.Vector3;
  private pile: Stack;
  private anchor = new THREE.Object3D();
  private drill: THREE.Mesh;
  /** Ore left in the deposit (saved). */
  left: number;
  readonly ore: OreDef;
  readonly groupId: number;
  private t = 0;
  locked = true;
  private label: Label;
  private give = new Map<Actor, Ticker>();
  onUnlockRequest: (() => void) | null = null;

  constructor(private ctx: BaseCtx, p: Placed, unlocked: boolean, deposit?: { ore: string; amount: number }) {
    this.pos = new THREE.Vector3(p.wx, 0, p.wz);
    this.groupId = p.groupId ?? 0;
    this.ore = ORES[deposit?.ore ?? "emerald"] ?? ORES.emerald;
    this.left = deposit?.amount ?? 300;
    const g = new THREE.Group();
    g.position.copy(this.pos);
    const base = new THREE.Mesh(new THREE.BoxGeometry(CELL * 2.2, 0.6, CELL * 2.2), mat(0x4b4f57));
    base.position.y = 0.3;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.6, CELL * 2.2, 0.6), mat(0xf0b414));
    tower.position.set(0, CELL * 1.1, -CELL * 0.4);
    this.drill = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.05, 1.6, 8), mat(0xb7bcc4));
    this.drill.position.set(0, 1.0, -CELL * 0.4);
    const tint = this.ore.vein ?? this.ore.rock;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), mat(tint, { emissive: new THREE.Color(tint).multiplyScalar(0.18).getHex() }));
    gem.position.set(CELL * 0.6, 0.9, -CELL * 0.4);
    g.add(base, tower, this.drill, gem);
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    ctx.scene.add(g);
    this.anchor.position.set(p.wx, 0.6, p.wz + CELL * 0.8);
    ctx.scene.add(this.anchor);
    this.pile = new Stack(this.anchor, 9999, itemColor, { cols: 3, rows: 2, size: 0.55, maxShown: 30 });
    this.label = ctx.labels.add(this.pos.clone().setY(1), "cart", "");
    if (unlocked) this.locked = false;
  }

  unlock(): void {
    this.locked = false;
    sfx.unlock();
  }

  update(dt: number, player: Actor): void {
    const d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    if (this.locked) {
      this.ctx.labels.set(this.label, `${adLabel()} AUTO DIGGER`);
      if (d < CELL * 1.6) this.onUnlockRequest?.();
      return;
    }
    if (this.left > 0) {
      this.t += dt;
      this.drill.rotation.y += dt * 14;
      if (this.t >= GAMEPLAY.autoDiggerDigIntervalSeconds / PACE.plant) {
        this.t = 0;
        this.left--;
        this.pile.push(this.ore.mineralId);
      }
    }
    for (const a of this.ctx.actors()) {
      const da = Math.hypot(a.pos.x - this.anchor.position.x, a.pos.z - this.anchor.position.z);
      if (da > CELL * 0.9 || this.pile.count === 0) continue;
      let tk = this.give.get(a);
      if (!tk) this.give.set(a, (tk = new Ticker()));
      tk.tick(dt, PICKUP_TRANSFER, () => {
        if (a.stack.capacity - a.stack.count - a.incoming <= 0) return false;
        const top = this.pile.items[this.pile.items.length - 1];
        if (top === undefined || (a.accepts && !a.accepts(top))) return false;
        const it = this.pile.pop();
        if (it === null) return false;
        a.incoming++;
        this.ctx.flyers.launch(this.pile.topWorld(), a.stack.anchor, itemColor(it), () => {
          a.incoming--;
          a.stack.push(it);
          sfx.pickup();
        }, { item: it });
        return true;
      });
    }
    this.pile.update(dt);
    this.ctx.labels.set(this.label, `${this.ore.name.toUpperCase()} ${this.left}`);
  }
}

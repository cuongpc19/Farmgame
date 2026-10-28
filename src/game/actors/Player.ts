import * as THREE from "three";
import { Character, SWING_LEAD } from "../characters";
import { Stack } from "../world/Stack";
import { itemColor } from "../data";
import type { Miner, Collector } from "../systems/Mining";

/**
 * The player on foot: walks with the joystick, auto-swings the equipped hand tool at blocks
 * in reach, and carries a stack on the back (capacity = carrying tool cargo).
 */
export class Player implements Miner, Collector {
  readonly model: Character;
  readonly pos = new THREE.Vector3();
  facing = 0;
  readonly radius = 0.7;
  // Miner
  power = 10;
  interval = 1;
  reach = 0;
  targets = 1;
  cooldown = 0;
  lastHit = null as Miner["lastHit"];
  powerMul = 1;
  intervalMul = 0;
  // Collector
  readonly stack: Stack;
  absorb = 2;
  incoming = 0;
  accepts = (_item: number) => true;

  readonly kind = "player" as const;
  speed = 6;
  moving = false;
  /** True while driving a vehicle (model hidden, no mining/collecting on foot). */
  driving = false;
  /** Walking behind the wheelbarrow (hands on the handles). */
  private pushing = false;
  /** Seconds since the last tool hit (to wind up the next swing in time). */
  private sinceHit = 99;

  constructor(scene: THREE.Scene) {
    // Blue overalls, white shirt, yellow hard hat (reference look).
    this.model = new Character("player");
    scene.add(this.model.root);
    this.stack = new Stack(this.model.stackAnchor, 5, itemColor, { cols: 1, rows: 1, size: 0.75, maxShown: 80, outline: true, ingot: 0.7 });
  }

  /** Move by a world-space intent vector (length ≤ 1). */
  move(vx: number, vz: number, dt: number): void {
    const l = Math.hypot(vx, vz);
    this.moving = l > 0.05;
    this.pushing = false;
    if (this.moving) {
      this.pos.x += vx * this.speed * dt;
      this.pos.z += vz * this.speed * dt;
      const target = Math.atan2(vx, vz);
      let d = target - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, dt * 14);
    }
    this.model.stride = Math.max(0.6, l * (this.speed / 6));
  }

  /** Drive the walk cycle without moving (riding / pushing a wheelbarrow). */
  walking(on: boolean, _dt: number): void {
    this.moving = on;
    this.pushing = true;
    this.model.stride = 0.8;
  }

  faceToward(p: THREE.Vector3, dt: number): void {
    const target = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    let d = target - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * Math.min(1, dt * 10);
  }

  swing(): void {
    this.sinceHit = 0;
    this.model.swing();
  }

  update(dt: number): void {
    const m = this.model;
    m.root.visible = !this.driving;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.facing;
    // Still mining: start the next swing early so the strike lands on the hit.
    this.sinceHit += dt;
    const every = Math.max(0.2, this.interval);
    if (!this.pushing && this.sinceHit < every + 0.25 && this.cooldown > 0 && this.cooldown <= SWING_LEAD) m.windup(this.cooldown);
    m.pose = this.moving ? (this.pushing ? "walk" : "run") : "idle";
    m.hold = this.pushing;
    m.tool.visible = !this.pushing;
    m.update(dt);
    this.stack.update(dt);
  }
}

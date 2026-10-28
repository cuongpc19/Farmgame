import type * as THREE from "three";
import type { Stack } from "../world/Stack";

/**
 * Whoever stands on a pad: the player on foot, the vehicle the player drives, or a hired
 * worker. Pads only need a position and a cargo stack.
 */
export interface Actor {
  pos: THREE.Vector3;
  stack: Stack;
  kind: "player" | "vehicle" | "worker";
  /** Items currently flying into the stack (reserved room). */
  incoming: number;
  /** Display name for stats (workers); the player and vehicles count as "PLAYER". */
  label?: string;
  /** Which items this carrier takes (an ATV only oil, a worker only minerals…). */
  accepts?: (item: number) => boolean;
}

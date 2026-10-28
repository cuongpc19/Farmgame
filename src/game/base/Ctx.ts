import type * as THREE from "three";
import type { Flyers } from "../world/Flyers";
import type { Labels } from "../ui/Labels";
import type { Stage3D } from "../engine/Stage3D";
import type { Actor } from "./Actor";

/** What base buildings need from the running game. */
export interface BaseCtx {
  scene: THREE.Scene;
  flyers: Flyers;
  labels: Labels;
  stage: Stage3D;
  /** Everyone who can use pads this frame (player or driven vehicle, workers). */
  actors(): Actor[];
  /** The actor the human controls right now (player on foot or the driven vehicle). */
  controlled(): Actor;
  /** Stage number (1-based) for multipliers. */
  stageNo(): number;
}

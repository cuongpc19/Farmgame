import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import atlasUrl from "../../assets/farm/nodes.webp?inline";
import atlas from "../../assets/farm/nodes.json";
import { farmLook } from "../farm";
import type { NodeSource } from "./BlockField";

/**
 * Cells drawn as painted sprites (farm game, user 2026-10-28: "for pretty rice and trees, try having ChatGPT draw
 * them"): rice, trees and rocks are pictures from ChatGPT-drawn sheets (scripts/sprites/nodes.py cuts them out and packs
 * src/assets/farm/nodes.webp), each on a quad that faces the camera.
 *
 * The game camera never turns (Stage3D: yaw 0, pitch 57°), so every quad faces it squarely: all quads are parallel,
 * never cut through each other, and the depth buffer sorts them with no per-frame work (alpha-tested, no blending).
 * A quad's foot is moved toward the camera along the view ray by the sprite's ground anchor (where the cell's centre is
 * in the picture: the foot of a trunk, the middle of a paddy), so that point still lands on the cell's centre on
 * screen while the bottom of the picture stays above the ground.
 */
const PITCH = THREE.MathUtils.degToRad(57);
/** Toward the camera, and "up" in the picture (leaning back, away from the camera). */
export const VIEW = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
const UP = new THREE.Vector3(0, Math.cos(PITCH), -Math.sin(PITCH));

interface Sprite {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  w: number;
  h: number;
}
const SPRITES = (atlas as { sprites: Record<string, Sprite> }).sprites;

/** Per species: sprite names (each also mirrored), width in cells, and the ground anchor (fraction of the height). */
const ART: Record<string, { names: string[]; width: number; anchor: number }> = {
  rice: { names: ["rice1", "rice2", "rice3", "rice4"], width: 1.15, anchor: 0.08 },
  bamboo: { names: ["bamboo", "bamboo2"], width: 1.3, anchor: 0.05 },
  orange: { names: ["orange"], width: 1.45, anchor: 0.03 },
  mango: { names: ["mango"], width: 1.45, anchor: 0.03 },
  pine: { names: ["pine"], width: 1.3, anchor: 0.03 },
  snowpine: { names: ["snowpine"], width: 1.3, anchor: 0.03 },
  maple: { names: ["maple"], width: 1.6, anchor: 0.03 },
  birch: { names: ["birch"], width: 1.45, anchor: 0.03 },
  cherry: { names: ["cherry"], width: 1.6, anchor: 0.03 },
  banyan: { names: ["banyan"], width: 2.1, anchor: 0.05 },
  palm: { names: ["palm"], width: 1.45, anchor: 0.03 },
  chest: { names: ["chest"], width: 1.15, anchor: 0.22 },
};
const ROCK = { width: 1.15, anchor: 0.2 };

const texture = new THREE.TextureLoader().load(atlasUrl);
texture.colorSpace = THREE.SRGBColorSpace;
texture.anisotropy = 4;
/** Unlit: the pictures carry their own light and shade. Instance colours shade them (per-cell jitter, hit flash). */
const material = new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide });
/**
 * Paddy water under a rice cell (a flat square in the grid, not part of the picture, so the field lines up with the
 * cells): it goes with the rice when the cell is cut, and the bare field shows.
 */
const water = new THREE.MeshPhongMaterial({ color: 0x7fbfb0, specular: 0x8aa0a4, shininess: 70 });
/** Shadows in the picture's own outline. */
const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: texture, alphaTest: 0.5 });

function artOf(key: string): { names: string[]; width: number; anchor: number } {
  const sp = farmLook(key).species;
  return ART[sp] ?? { names: [sp], ...ROCK };
}

export class SpriteNodes implements NodeSource {
  readonly billboard = true;
  private cache = new Map<string, THREE.BufferGeometry>();

  constructor(private cell: number) {}

  /** Mirroring is the field's (BlockField flips half the cells); rice pairs its four pictures two ways. */
  variants(key: string): number {
    const n = artOf(key).names.length;
    return farmLook(key).kind === "crop" ? Math.max(1, n >> 1) : n;
  }

  model(key: string, variant: number): { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; depth: THREE.Material; shadow: boolean } {
    const k = `${key}|${variant}`;
    let geo = this.cache.get(k);
    const crop = farmLook(key).kind === "crop";
    if (!geo) {
      if (crop) {
        // A paddy is dense: two bunches a cell, one at the back left and one at the front right (other pictures, the
        // front one the bigger), merged into the picture group; group 1 is the water square (Phong, it catches the sun).
        const back = this.quad(key, variant * 2 + 1, 0.9).translate(-this.cell * 0.2, 0, -this.cell * 0.22);
        const front = this.quad(key, variant * 2, 1.05).translate(this.cell * 0.14, 0, this.cell * 0.18);
        const sq = new THREE.PlaneGeometry(this.cell * 0.97, this.cell * 0.97).rotateX(-Math.PI / 2).translate(0, 0.03, 0);
        geo = mergeGeometries([mergeGeometries([back, front])!, sq], true)!;
      } else geo = this.quad(key, variant);
      this.cache.set(k, geo);
    }
    // Rice casts no shadow (two quads and a water square each, drawn again for the shadow map, for shade nobody sees).
    return { geo, mat: crop ? [material, water] : material, depth, shadow: !crop };
  }

  private quad(key: string, variant: number, size = 1): THREE.BufferGeometry {
    const art = artOf(key);
    const name = art.names[variant % art.names.length];
    const sp = SPRITES[name] ?? SPRITES[Object.keys(SPRITES)[0]];
    const w = art.width * this.cell * size;
    const h = (w * sp.h) / sp.w;
    const g = new THREE.PlaneGeometry(w, h);
    // Plane: XY, facing +Z. Stand it on its bottom edge, lean it back to face the camera, move its foot toward the
    // camera so the anchor lands on the cell's centre (see above).
    g.translate(0, h / 2, 0);
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), UP, VIEW);
    g.applyMatrix4(basis);
    g.translate(0, 0, (art.anchor * h) / Math.sin(PITCH));
    // Atlas rectangle.
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, sp.u0 + uv.getX(i) * (sp.u1 - sp.u0), sp.v0 + uv.getY(i) * (sp.v1 - sp.v0));
    return g;
  }
}

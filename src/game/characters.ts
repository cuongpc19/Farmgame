import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { bakeColors, candyLivery, mat } from "./models";
import { burgerMesh, cupMesh } from "./world/props";
import { S } from "./state";
import workerGlb from "../assets/chars/worker.glb?inline";

/**
 * Rigged characters: Quaternius "Worker" (CC0, packed by scripts/build-chars.mjs). One mesh,
 * recoloured per person (the player wears the reference blue; applicants get their own vest,
 * skin, trousers and hat colours). The clips (idle / walk / run) are split into a lower half
 * (hips + legs) and an upper half so the legs keep walking while the arms do something else.
 * Everything that isn't in the file is posed procedurally on top of the clips, in character
 * space (so the rig's own bone axes never matter):
 *  - the two-handed pickaxe swing (wind-up over the head, strike, recover),
 *  - hands on the wheelbarrow handles, and sitting on the cafeteria bench.
 */

export type Pose = "idle" | "walk" | "run" | "sit";
const POSE_CLIP: Record<Exclude<Pose, "sit">, string> = { idle: "Idle", walk: "Walk", run: "Run" };
const LOWER = /^(CharacterArmature|Root|Body|Hips|UpperLeg|LowerLeg|Foot|PT)/;

/** Player height in world units (the old box miner was ~2.3). */
export const PLAYER_HEIGHT = 2.95;
/** Character height the pickaxe and back frame were modelled for. */
const PROP_HEIGHT = 2.45;

let template: THREE.Object3D | null = null;
let modelHeight = 1;
const clips = new Map<string, { lower: THREE.AnimationClip; upper: THREE.AnimationClip }>();

function bytes(dataUrl: string): ArrayBuffer {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function split(clip: THREE.AnimationClip): { lower: THREE.AnimationClip; upper: THREE.AnimationClip } {
  const node = (t: THREE.KeyframeTrack) => t.name.slice(0, t.name.lastIndexOf("."));
  return {
    lower: new THREE.AnimationClip(`${clip.name}:lower`, clip.duration, clip.tracks.filter((t) => LOWER.test(node(t)))),
    upper: new THREE.AnimationClip(`${clip.name}:upper`, clip.duration, clip.tracks.filter((t) => !LOWER.test(node(t)))),
  };
}

/** Parse the character file once, before the game starts. */
export async function loadCharacters(): Promise<void> {
  const loader = new GLTFLoader();
  const g = await loader.parseAsync(bytes(workerGlb), "");
  for (const c of g.animations) clips.set(c.name.split("|").pop()!, split(c));
  g.scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.frustumCulled = false;
  });
  const bb = new THREE.Box3().setFromObject(g.scene);
  modelHeight = bb.max.y - bb.min.y;
  mergeParts(g.scene);
  bulk(g.scene);
  measureHead(g.scene);
  template = g.scene;
}

/**
 * How far (× model height) the skin around each bone is pushed out along its normal: a broad
 * chest and shoulders, thick arms, big fists (user 2026-10-22: "more muscular workers").
 * Bones not listed stay as modelled.
 */
const BULK: [RegExp, number][] = [
  [/^Shoulder[LR]$/, 0.03],
  [/^Chest$/, 0.026],
  [/^UpperArm[LR]$/, 0.026],
  [/^LowerArm[LR]$/, 0.02],
  [/^(Wrist|Thumb|Index|Middle|Ring|Pinky)\d?[LR]$/, 0.008],
  [/^Torso$/, 0.016],
  [/^Neck$/, 0.012],
  [/^UpperLeg[LR]$/, 0.008],
];

/**
 * Inflate the bind-pose skin bone by bone (`BULK`). Each vertex moves along the average normal
 * of every vertex at its position, so flat-shaded seams stay closed; the clips only rotate
 * bones, so the bulk follows every pose.
 * ⚠ The packed file stores positions as normalized 16-bit integers (-1..1 per mesh, the scale
 * folded into the bind matrices): they are turned into floats first, or a vertex pushed past
 * the edge wraps round to the other side.
 */
function bulk(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const g = m.geometry;
    const src = g.getAttribute("position") as THREE.BufferAttribute;
    const nrm = g.getAttribute("normal") as THREE.BufferAttribute;
    const si = g.getAttribute("skinIndex") as THREE.BufferAttribute;
    const sw = g.getAttribute("skinWeight") as THREE.BufferAttribute;
    if (!src || !nrm || !si || !sw) return;
    const pos = new THREE.BufferAttribute(new Float32Array(src.count * 3), 3);
    for (let i = 0; i < src.count; i++) pos.setXYZ(i, src.getX(i), src.getY(i), src.getZ(i));
    // The mesh's own units per world unit, measured through the skin in the bind pose (the
    // dequantizing scale lives in the bind matrices, not in the node).
    m.skeleton.update();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    let local = 0;
    let world = 0;
    for (let t = 0; t < 64; t++) {
      const i = Math.floor((t / 64) * pos.count);
      const j = Math.floor((((t * 37) % 64) / 64) * pos.count);
      local += a.fromBufferAttribute(pos, i).distanceTo(b.fromBufferAttribute(pos, j));
      m.applyBoneTransform(i, a.fromBufferAttribute(pos, i)).applyMatrix4(m.matrixWorld);
      m.applyBoneTransform(j, b.fromBufferAttribute(pos, j)).applyMatrix4(m.matrixWorld);
      world += a.distanceTo(b);
    }
    if (!(local > 0 && world > 0)) return;
    const unit = (modelHeight * local) / world;
    const push = m.skeleton.bones.map((b) => BULK.find(([re]) => re.test(b.name))?.[1] ?? 0);
    const key = (i: number) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    const avg = new Map<string, THREE.Vector3>();
    for (let i = 0; i < pos.count; i++) {
      const k = key(i);
      const v = avg.get(k) ?? avg.set(k, new THREE.Vector3()).get(k)!;
      v.x += nrm.getX(i);
      v.y += nrm.getY(i);
      v.z += nrm.getZ(i);
    }
    for (const v of avg.values()) v.normalize();
    const out = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      let d = 0;
      for (let k = 0; k < 4; k++) d += sw.getComponent(i, k) * push[si.getComponent(i, k)];
      const n = avg.get(key(i))!;
      out[i * 3] = pos.getX(i) + n.x * d * unit;
      out[i * 3 + 1] = pos.getY(i) + n.y * d * unit;
      out[i * 3 + 2] = pos.getZ(i) + n.z * d * unit;
    }
    pos.array.set(out);
    g.setAttribute("position", pos);
    g.computeBoundingBox();
    g.computeBoundingSphere();
  });
}

/** Source material of each merged part (index = the geometry's "part" attribute). */
const parts: { name: string; color: THREE.Color }[] = [];
/** Every merged person shares one material; their colours live in the vertices. */
const PERSON_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/**
 * The worker file has 13 primitives (feet, legs, body, head; one per material), so each person
 * cost 13 draw calls, 26 with shadows. Primitives that share a skeleton, a place and a bind
 * matrix are merged into one skinned mesh with a per-vertex "part" index; `dress` turns that
 * into vertex colours per person. Anything that does not match stays as it was.
 */
function mergeParts(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
  });
  const key = (m: THREE.SkinnedMesh) =>
    [m.skeleton.uuid, ...m.matrixWorld.elements.map((v) => v.toFixed(5)), ...m.bindMatrix.elements.map((v) => v.toFixed(5))].join(",");
  const groups = new Map<string, THREE.SkinnedMesh[]>();
  for (const m of meshes) {
    if (Array.isArray(m.material)) continue;
    const k = key(m);
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      const g = m.geometry.clone();
      const src = m.material as THREE.MeshStandardMaterial;
      let idx = parts.findIndex((x) => x.name === src.name);
      if (idx < 0) {
        idx = parts.length;
        parts.push({ name: src.name, color: src.color.clone() });
      }
      g.setAttribute("part", new THREE.BufferAttribute(new Uint8Array(g.attributes.position.count).fill(idx), 1));
      for (const k of Object.keys(g.attributes)) if (!["position", "normal", "skinIndex", "skinWeight", "part"].includes(k)) g.deleteAttribute(k);
      return g;
    });
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    const keep = list[0];
    keep.geometry = merged;
    keep.material = PERSON_MAT;
    for (const m of list.slice(1)) m.removeFromParent();
  }
}

/* ---------- looks ---------- */

interface Look {
  vest: number;
  shirt: number;
  pants: number;
  hat: number;
  skin: number;
  moustache: boolean;
}
/**
 * Candy makers (Candy Miner; Mars Miner had space suits): a white chef's jacket, an apron (the model's vest) in a candy
 * colour, chocolate trousers.
 */
const CHEF = 0xfffaf4;
const CHOCO_LEGS = 0x6b3f2a;
const PLAYER_LOOK: Look = { vest: 0xff6fa5, shirt: CHEF, pants: CHOCO_LEGS, hat: 0xffffff, skin: 0xf0c08e, moustache: false };
const VESTS = [0xff6fa5, 0x4fd1a5, 0xffc93c, 0x9b7bff, 0x5fb8ff, 0xff8a3d];
const SKINS = [0xf0c08e, 0xd9a066, 0xa86b3c, 0x6e4426];
const HATS = [0xffc928, 0xf4f4f0, 0xff8a1f];

function workerLook(seed: number): Look {
  const r = (n: number, k: number) => Math.abs(Math.imul(seed + 7, 2654435761 + k * 40503)) % n;
  return { vest: VESTS[r(VESTS.length, 1)], shirt: CHEF, pants: CHOCO_LEGS, hat: HATS[r(HATS.length, 3)], skin: SKINS[r(SKINS.length, 4)], moustache: r(2, 5) === 0 };
}

/** A candy maker in a chef's hat for anyone without a CREW entry (the player, unknown worker ids). */
function candyMaker(look: Look): Style {
  return { look, head: "chef", hair: "none", hairColor: 0x2b1d10, beard: look.moustache ? "moustache" : "none", face: "smile", tall: 1, wide: 1, sleeves: true };
}

/* ---------- crew styles ---------- */

/**
 * One style per hired worker (user 2026-10-24: "each worker their own style, the player stays as he is"):
 * colours, what they wear on the head, hair, beard, glasses and build, fitted to their card (WORKER_PROFILES:
 * name, trait, blurb). Ids without an entry fall back to `workerLook` with the model's hard hat. The same
 * styles are photographed for the Job Board / crew cards (scripts/make-portraits.mjs).
 */
interface Style {
  look: Look;
  /** What sits on the head; anything but the hard hat replaces the model's hat (`dress`, `headwear`). */
  head: "hardhat" | "cap" | "beanie" | "bandana" | "hair" | "helmet" | "chef";
  /** The arms are jacket sleeves in the shirt colour (the model's arms are bare skin); hands stay skin. */
  sleeves?: boolean;
  hair: "none" | "short" | "ponytail" | "bun";
  hairColor: number;
  beard: "none" | "moustache" | "goatee" | "full";
  glasses?: "specs";
  /** Bobble on a beanie. */
  pompom?: number;
  /** Expression (`headwear`): a closed smile, with the eyes open or shut in content. Cheerful, nothing over the top
   * (user 2026-10-24: no tongue out, no wink, no toothy grins: "a smile is enough"). */
  face: "smile" | "content";
  /** Height and girth against a standard worker. */
  tall: number;
  wide: number;
}
const CREW: Record<number, Style> = {
  // Candy Miner: the Quarry Crush crew's hair, beards, glasses and builds, as candy makers: chef's hats for most,
  // a cap, beanie or bandana in a candy colour for a few, aprons in candy colours, chocolate or berry trousers.
  1: { look: { vest: 0xff6fa5, shirt: CHEF, pants: 0x6b3f2a, hat: 0xffffff, skin: 0xf0c08e, moustache: true }, head: "chef", hair: "none", hairColor: 0xcfcac0, beard: "full", face: "content", tall: 1.02, wide: 1.14, sleeves: true },
  2: { look: { vest: 0x4fd1a5, shirt: CHEF, pants: 0x5a3324, hat: 0xffffff, skin: 0xd9a066, moustache: false }, head: "chef", hair: "none", hairColor: 0x2b1d10, beard: "none", glasses: "specs", face: "smile", tall: 1, wide: 0.94, sleeves: true },
  3: { look: { vest: 0x5fb8ff, shirt: CHEF, pants: 0x4a5fd8, hat: 0xff6fa5, skin: 0x6e4426, moustache: true }, head: "cap", hair: "short", hairColor: 0x1e1712, beard: "moustache", face: "content", tall: 1, wide: 1.1 },
  4: { look: { vest: 0xffc93c, shirt: CHEF, pants: 0x8a4fb0, hat: 0xff8fb8, skin: 0xf0c08e, moustache: false }, head: "bandana", hair: "ponytail", hairColor: 0x6b3a1c, beard: "none", face: "smile", tall: 0.94, wide: 0.92 },
  5: { look: { vest: 0x9b7bff, shirt: CHEF, pants: 0x3d2a40, hat: 0x5e3424, skin: 0xd9a066, moustache: false }, head: "beanie", hair: "short", hairColor: 0x2b1d10, beard: "goatee", face: "smile", tall: 1, wide: 1 },
  6: { look: { vest: 0xe8395a, shirt: CHEF, pants: 0x6b3f2a, hat: 0xffffff, skin: 0xd9a066, moustache: false }, head: "chef", hair: "ponytail", hairColor: 0x1e1712, beard: "none", face: "smile", tall: 0.95, wide: 0.92, sleeves: true },
  7: { look: { vest: 0x4fd1a5, shirt: CHEF, pants: 0x5a3324, hat: 0xffc93c, skin: 0x6e4426, moustache: false }, head: "cap", hair: "bun", hairColor: 0x1e1712, beard: "none", face: "smile", tall: 0.97, wide: 0.95 },
  8: { look: { vest: 0xff8fb8, shirt: CHEF, pants: 0x4a5fd8, hat: 0xffffff, skin: 0xf0c08e, moustache: false }, head: "chef", hair: "ponytail", hairColor: 0xe6c46a, beard: "none", glasses: "specs", face: "smile", tall: 0.97, wide: 0.95, sleeves: true },
  9: { look: { vest: 0xff8a3d, shirt: CHEF, pants: 0x6b3f2a, hat: 0xffffff, skin: 0xa86b3c, moustache: true }, head: "chef", hair: "none", hairColor: 0x1e1712, beard: "moustache", face: "smile", tall: 0.98, wide: 1.05, sleeves: true },
  10: { look: { vest: 0xe8395a, shirt: CHEF, pants: 0x3d2a40, hat: 0xe8c870, skin: 0xf3d2b0, moustache: true }, head: "hair", hair: "short", hairColor: 0xe8c870, beard: "full", face: "content", tall: 1.08, wide: 1.18, sleeves: true },
  11: { look: { vest: 0x9fe36a, shirt: CHEF, pants: 0x8a4fb0, hat: 0xff6fa5, skin: 0xf3d2b0, moustache: false }, head: "beanie", hair: "short", hairColor: 0x1e1712, beard: "none", pompom: 0xffffff, face: "smile", tall: 0.94, wide: 0.92 },
};

/** A colour a little darker (or lighter, k > 1). */
function shade(c: number, k: number): number {
  return new THREE.Color(c).multiplyScalar(k).getHex();
}

/** Where things sit on the model's head, in the file's own space with the skeleton at rest (`measureHead`). */
interface HeadFrame {
  /** File space → the Head bone's space (headwear rides on that bone). */
  inv: THREE.Matrix4;
  /** The hard hat, the bare head (skin), the eyes. */
  hat: THREE.Box3;
  skull: THREE.Box3;
  eyes: THREE.Box3;
  /** Each eye on its own, the one at lower X first. */
  eyePair: [THREE.Box3, THREE.Box3];
  /** The model's brows and eyes (vertices of a merged mesh, by its name, with the side of the face they are on). */
  fold: Map<string, { idx: number[]; side: number[] }>;
  /** +1 when the face looks along +Z. */
  fwd: number;
}
let HEAD: HeadFrame | null = null;

const HEAD_BONE = "Head";
/** Index of the bone that moves this vertex most. */
function mainBone(si: THREE.BufferAttribute, sw: THREE.BufferAttribute, i: number): number {
  let best = 0;
  let w = -1;
  for (let k = 0; k < 4; k++) {
    const x = sw.getComponent(i, k);
    if (x > w) (w = x), (best = si.getComponent(i, k));
  }
  return best;
}

function measureHead(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const head = root.getObjectByName(HEAD_BONE);
  if (!head) return;
  const hat = new THREE.Box3();
  const skull = new THREE.Box3();
  const eyes = new THREE.Box3();
  const eyePts: THREE.Vector3[] = [];
  const facePts: { mesh: string; i: number; eye: boolean; p: THREE.Vector3 }[] = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    const part = m.isSkinnedMesh ? m.geometry.getAttribute("part") : null;
    if (!part) return;
    const hb = m.skeleton.bones.findIndex((b) => b.name === HEAD_BONE);
    const si = m.geometry.getAttribute("skinIndex") as THREE.BufferAttribute;
    const sw = m.geometry.getAttribute("skinWeight") as THREE.BufferAttribute;
    for (let i = 0; i < part.count; i++) {
      if (mainBone(si, sw, i) !== hb) continue;
      const name = parts[part.getX(i)]?.name;
      if (name === "Eyebrows" || name === "Eye") facePts.push({ mesh: m.name, i, eye: name === "Eye", p: m.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(m.matrixWorld) });
      const box = name === "Worker_Yellow" ? hat : name === "Skin" ? skull : name === "Eye" ? eyes : null;
      if (!box) continue;
      m.getVertexPosition(i, v);
      box.expandByPoint(v.applyMatrix4(m.matrixWorld));
      if (box === eyes) eyePts.push(v.clone());
    }
  });
  if (hat.isEmpty() || skull.isEmpty() || eyes.isEmpty()) return;
  const fwd = eyes.getCenter(v).z >= skull.getCenter(new THREE.Vector3()).z ? 1 : -1;
  const mid = eyes.getCenter(v).x;
  const eyePair: [THREE.Box3, THREE.Box3] = [new THREE.Box3(), new THREE.Box3()];
  for (const p of eyePts) eyePair[p.x < mid ? 0 : 1].expandByPoint(p);
  // The brows share their material with the hair under the hat: only the bits right over the eyes, in front.
  const ew = eyePair[0].max.x - eyePair[0].min.x;
  const top = eyes.max.y + (eyes.max.y - eyes.min.y);
  const back = fwd > 0 ? eyes.min.z : eyes.max.z;
  const fold = new Map<string, { idx: number[]; side: number[] }>();
  for (const { mesh, i, eye, p } of facePts) {
    if (!eye && (p.y > top || fwd * (p.z - back) < 0 || p.x < eyes.min.x - ew * 0.6 || p.x > eyes.max.x + ew * 0.6)) continue;
    const b = fold.get(mesh) ?? fold.set(mesh, { idx: [], side: [] }).get(mesh)!;
    b.idx.push(i);
    b.side.push(p.x < mid ? 0 : 1);
  }
  HEAD = { inv: head.matrixWorld.clone().invert(), hat, skull, eyes, eyePair, fold, fwd };
}

/**
 * Headwear, hair, beard, glasses and the face (brows, eyes, smile) for a style, as one mesh with vertex
 * colours, in the Head bone's space. Built from the measured head (`HEAD`), so the pieces fit whatever the file's units are.
 */
function headwear(st: Style): THREE.Mesh | null {
  const H = HEAD;
  if (!H) return null;
  const sk = H.skull.getCenter(new THREE.Vector3());
  const ss = H.skull.getSize(new THREE.Vector3());
  const hs = H.hat.getSize(new THREE.Vector3());
  const eye = H.eyes.getCenter(new THREE.Vector3());
  const f = H.fwd;
  const rx = ss.x / 2;
  const rz = ss.z / 2;
  const brow = eye.y + ss.y * 0.12;
  const front = f > 0 ? H.skull.max.z : H.skull.min.z;
  const geos: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry, color: number, at: THREE.Vector3, scale = new THREE.Vector3(1, 1, 1), rot = new THREE.Euler()) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute("uv");
    g.applyMatrix4(new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(rot), scale));
    const c = new THREE.Color(color);
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) (col[i] = c.r), (col[i + 1] = c.g), (col[i + 2] = c.b);
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geos.push(g);
  };
  // Headwear takes the hard hat's place: the model has hair under that hat (in the brows' material, so it
  // shows in the style's hair colour once the hat folds away), and the hat's box is what covers it.
  const hatC = st.look.hat;
  const hc = H.hat.getCenter(new THREE.Vector3());
  const base = H.hat.min.y;
  const hx = hs.x / 2;
  const hz = hs.z / 2;
  const cover = (rxz: number, h: number, y0: number, color: number) =>
    add(new THREE.SphereGeometry(1, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), color, new THREE.Vector3(hc.x, y0, hc.z), new THREE.Vector3(hx * rxz, h, hz * rxz));
  switch (st.head) {
    case "cap":
      cover(0.8, hs.y * 0.6, base + hs.y * 0.1, hatC);
      // Peak toward the face, a shade darker and dipping a little, so it reads as a cap, not a helmet.
      add(new THREE.CylinderGeometry(1, 1, 1, 12, 1, false, 0, Math.PI), shade(hatC, 0.78), new THREE.Vector3(hc.x, base + hs.y * 0.1, hc.z + f * hz * 0.5), new THREE.Vector3(hz * 0.95, hs.y * 0.05, hx * 0.74), new THREE.Euler(f * 0.22, f > 0 ? -Math.PI / 2 : Math.PI / 2, 0, "YXZ"));
      add(new THREE.SphereGeometry(1, 6, 4), hatC, new THREE.Vector3(hc.x, base + hs.y * 0.8, hc.z), new THREE.Vector3(hx * 0.1, hx * 0.1, hx * 0.1));
      break;
    case "beanie":
      cover(0.82, hs.y * 0.95, base + hs.y * 0.02, hatC);
      // Folded band round the bottom.
      add(new THREE.CylinderGeometry(1, 1, 1, 14), shade(hatC, 0.85), new THREE.Vector3(hc.x, base + hs.y * 0.1, hc.z), new THREE.Vector3(hx * 0.86, hs.y * 0.24, hz * 0.86));
      if (st.pompom) add(new THREE.IcosahedronGeometry(1, 0), st.pompom, new THREE.Vector3(hc.x, base + hs.y * 1.0, hc.z), new THREE.Vector3(hx * 0.2, hx * 0.2, hx * 0.2));
      break;
    case "bandana":
      cover(0.78, hs.y * 0.62, base + hs.y * 0.08, hatC);
      // The knot at the back.
      add(new THREE.SphereGeometry(1, 6, 4), hatC, new THREE.Vector3(hc.x, base + hs.y * 0.2, hc.z - f * hz * 0.8), new THREE.Vector3(hx * 0.16, hx * 0.13, hx * 0.16));
      add(new THREE.BoxGeometry(1, 1, 1), hatC, new THREE.Vector3(hc.x + hx * 0.1, base, hc.z - f * hz * 0.82), new THREE.Vector3(hx * 0.12, hs.y * 0.3, hx * 0.05), new THREE.Euler(0, 0, 0.35));
      break;
    case "hair":
      // The model's own hair: nothing to add.
      break;
    case "chef": {
      // A chef's toque (Candy Miner): a white band round the head and a puffy top of overlapping puffs, a little
      // wider than the band and leaning back, so it reads at a glance from the 3/4 camera.
      const R = Math.max(hx, hz) * 0.98;
      const bandH = hs.y * 0.85;
      add(new THREE.CylinderGeometry(1, 1, 1, 16), 0xffffff, new THREE.Vector3(hc.x, base + bandH / 2, hc.z), new THREE.Vector3(R, bandH, R));
      add(new THREE.CylinderGeometry(1, 1, 1, 16), 0xf1e8de, new THREE.Vector3(hc.x, base + bandH * 0.12, hc.z), new THREE.Vector3(R * 1.03, bandH * 0.2, R * 1.03));
      const py = base + bandH + hs.y * 0.5;
      const lean = -f * R * 0.12;
      add(new THREE.SphereGeometry(1, 12, 9), 0xffffff, new THREE.Vector3(hc.x, py, hc.z + lean), new THREE.Vector3(R * 1.3, hs.y * 0.85, R * 1.3));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        add(new THREE.SphereGeometry(1, 8, 6), k % 2 ? 0xfaf4ee : 0xffffff, new THREE.Vector3(hc.x + Math.cos(a) * R * 0.85, py + hs.y * 0.18, hc.z + lean + Math.sin(a) * R * 0.85), new THREE.Vector3(R * 0.62, hs.y * 0.62, R * 0.62));
      }
      break;
    }
    case "helmet": {
      // Astronaut helmet (Mars Miner): a white shell round the whole head with the face window open, a stripe in the
      // person's colour round it, a gold visor pushed up over the window, an antenna with a light, a collar ring.
      const R = Math.max(hx, hz, ss.x / 2, ss.z / 2) * 1.3;
      const top = H.hat.max.y;
      const ry = ((top - H.skull.min.y) / 2) * 1.2;
      const ctr = new THREE.Vector3(sk.x, (top + H.skull.min.y) / 2 + ry * 0.04, sk.z - f * R * 0.06);
      const shell = 0xf2f4f7;
      const scale = new THREE.Vector3(R, ry, R * 1.04);
      // Window: ±0.95 rad round the face, from just over the brows (theta 0.36 pi) to below the chin.
      const face = f > 0 ? Math.PI / 2 : (3 * Math.PI) / 2;
      const gap = 0.95;
      add(new THREE.SphereGeometry(1, 16, 5, 0, Math.PI * 2, 0, Math.PI * 0.36), shell, ctr, scale);
      add(new THREE.SphereGeometry(1, 16, 7, face + gap, Math.PI * 2 - gap * 2, Math.PI * 0.36, Math.PI * 0.5), shell, ctr, scale);
      // Stripe at the seam, and the visor pushed up: a gold band over the window's top.
      const seam = ctr.y + ry * Math.cos(Math.PI * 0.36);
      const seamR = R * Math.sin(Math.PI * 0.36) * 1.0;
      add(new THREE.TorusGeometry(1, 0.045, 4, 20), st.look.vest, new THREE.Vector3(ctr.x, seam, ctr.z), new THREE.Vector3(seamR, seamR * 1.04, seamR), new THREE.Euler(Math.PI / 2, 0, 0));
      add(new THREE.SphereGeometry(1, 10, 2, face - gap, gap * 2, Math.PI * 0.27, Math.PI * 0.09), 0xffc23a, ctr, new THREE.Vector3(R * 1.012, ry * 1.012, R * 1.05));
      // Antenna on the right with a light.
      const ax = ctr.x + R * 0.62;
      add(new THREE.CylinderGeometry(1, 1, 1, 5), 0x8e939c, new THREE.Vector3(ax, top + ry * 0.12, ctr.z - f * R * 0.2), new THREE.Vector3(R * 0.04, ry * 0.45, R * 0.04));
      add(new THREE.SphereGeometry(1, 6, 4), 0xff5a3a, new THREE.Vector3(ax, top + ry * 0.36, ctr.z - f * R * 0.2), new THREE.Vector3(R * 0.1, R * 0.1, R * 0.1));
      // Collar ring at the neck.
      add(new THREE.TorusGeometry(1, 0.22, 5, 16), 0xc5cbd4, new THREE.Vector3(ctr.x, H.skull.min.y - ry * 0.12, ctr.z), new THREE.Vector3(R * 0.8, R * 0.8, R * 0.8), new THREE.Euler(Math.PI / 2, 0, 0));
      break;
    }
  }
  // Short hair shows under a cap or a beanie: sideburns.
  if (st.hair === "short" && (st.head === "cap" || st.head === "beanie"))
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(1, 1, 1), st.hairColor, new THREE.Vector3(sk.x + s * rx * 0.98, brow - ss.y * 0.06, sk.z + f * rz * 0.05), new THREE.Vector3(rx * 0.12, ss.y * 0.2, rz * 0.5));
  // Ponytail and bun hang off the back of the head, just under the headwear.
  const nape = hc.z - f * hz * 0.72;
  if (st.hair === "ponytail") {
    add(new THREE.SphereGeometry(1, 7, 5), st.hairColor, new THREE.Vector3(hc.x, base + hs.y * 0.05, nape), new THREE.Vector3(hx * 0.2, hx * 0.2, hx * 0.2));
    add(new THREE.ConeGeometry(1, 1, 7), st.hairColor, new THREE.Vector3(hc.x, base - hs.y * 0.38, nape - f * hz * 0.12), new THREE.Vector3(hx * 0.2, hs.y * 0.85, hx * 0.2), new THREE.Euler(Math.PI - f * 0.3, 0, 0));
  }
  if (st.hair === "bun") add(new THREE.SphereGeometry(1, 8, 6), st.hairColor, new THREE.Vector3(hc.x, base + hs.y * 0.15, nape - f * hz * 0.08), new THREE.Vector3(hx * 0.3, hx * 0.3, hx * 0.3));
  // The lowest skin the Head bone moves; the jaw below it follows the neck, so beards reach further down.
  const chin = H.skull.min.y;
  if (st.beard === "full") {
    // A bulb round the jaw and chin; the moustache stays on top of it.
    const jaw = eye.y - chin;
    add(new THREE.SphereGeometry(1, 10, 7), st.hairColor, new THREE.Vector3(sk.x, chin - jaw * 0.12, sk.z + f * rz * 0.28), new THREE.Vector3(rx * 0.92, jaw * 0.62, rz * 0.82));
  } else if (st.beard === "goatee") {
    add(new RoundedBoxGeometry(1, 1, 1, 2, 0.3), st.hairColor, new THREE.Vector3(sk.x, chin + ss.y * 0.03, front - f * rz * 0.2), new THREE.Vector3(rx * 0.32, ss.y * 0.11, rz * 0.42));
  }
  if (st.glasses === "specs") {
    const gz = front + f * rz * 0.04;
    for (const s of [-1, 1]) add(new THREE.TorusGeometry(1, 0.22, 4, 8), 0x23262e, new THREE.Vector3(sk.x + s * rx * 0.42, eye.y, gz), new THREE.Vector3(rx * 0.28, rx * 0.24, rx * 0.28));
    add(new THREE.BoxGeometry(1, 1, 1), 0x23262e, new THREE.Vector3(sk.x, eye.y + rx * 0.05, gz), new THREE.Vector3(rx * 0.3, rx * 0.06, rx * 0.06));
  }
  // A cheerful, funny face (user 2026-10-24: "the faces look grim", then "not bright, not funny enough"): the
  // model's brows hung over the top half of small black eyes, a scowl; `dress` folds both away. Big round
  // eyes (white, pupil, glint; shut in a content smile, `Style.face`), arched brows, a smile, rosy cheeks.
  const [eL, eR] = H.eyePair;
  const eh = H.eyes.max.y - H.eyes.min.y;
  const ew = eL.max.x - eL.min.x;
  const mid = (eL.getCenter(new THREE.Vector3()).x + eR.getCenter(new THREE.Vector3()).x) / 2;
  const eyeFront = f > 0 ? H.eyes.max.z : H.eyes.min.z;
  const turn = f > 0 ? 0 : Math.PI;
  const ink = 0x231a16;
  const lip = 0x6e2420;
  const blush = new THREE.Color(st.look.skin).lerp(new THREE.Color(0xff5a4e), 0.32).getHex();
  // An arc of a ring, bulging up (or down), turned by `tilt`.
  const arcAt = (r: number, tube: number, arc: number, color: number, at: THREE.Vector3, up: boolean, tilt = 0) =>
    add(new THREE.TorusGeometry(1, tube, 3, 8, arc), color, at, new THREE.Vector3(r, r, r), new THREE.Euler(0, turn, (up ? Math.PI / 2 : -Math.PI / 2) - arc / 2 + tilt));
  const R = ew * 0.72;
  const shut = st.face === "content";
  for (const e of [eL, eR]) {
    const c = e.getCenter(new THREE.Vector3());
    const out = Math.sign(c.x - mid);
    const ball = new THREE.Vector3(c.x, c.y + eh * 0.05, eyeFront - f * R * 0.55);
    if (shut) arcAt(R * 0.8, 0.28, 2.2, ink, new THREE.Vector3(c.x, c.y - R * 0.35, eyeFront + f * ew * 0.05), true);
    else {
      add(new THREE.SphereGeometry(1, 10, 8), 0xffffff, ball, new THREE.Vector3(R, R * 1.08, R * 0.62));
      const P = R * 0.52;
      const front = ball.z + f * R * 0.62;
      const pupil = new THREE.Vector3(c.x - out * R * 0.12, ball.y - R * 0.05, front - f * P * 0.3);
      add(new THREE.SphereGeometry(1, 8, 6), ink, pupil, new THREE.Vector3(P, P * 1.1, P * 0.45));
      add(new THREE.IcosahedronGeometry(1, 0), 0xffffff, new THREE.Vector3(pupil.x - P * 0.35, pupil.y + P * 0.4, front + f * P * 0.2), new THREE.Vector3(P * 0.36, P * 0.36, P * 0.2));
    }
    const br = ew * 0.85;
    arcAt(br, 0.28, 1.5, st.hairColor, new THREE.Vector3(c.x + out * ew * 0.08, ball.y + R * 1.08 + eh * 0.12 - br, eyeFront + f * ew * 0.15), true);
    add(new THREE.SphereGeometry(1, 8, 6), blush, new THREE.Vector3(c.x + out * ew * 0.35, c.y - eh * 1.3, eyeFront - f * ew * 0.5), new THREE.Vector3(ew * 0.55, ew * 0.32, ew * 0.15));
  }
  // The smile: an arc of a ring under the nose (in front of a full beard, a little lower under a moustache).
  const mr = ew * 1.1;
  const mouthY = eye.y - (eye.y - chin) * 0.66 - (st.look.moustache ? ew * 0.3 : 0);
  const mouthZ = eyeFront - f * ew * 0.2 + (st.beard === "full" ? f * ew * 0.25 : 0);
  arcAt(mr * 0.85, 0.24, 2.1, lip, new THREE.Vector3(mid, mouthY + mr * 0.45, mouthZ + f * ew * 0.03), false);
  if (!geos.length) return null;
  const geo = mergeGeometries(geos);
  if (!geo) return null;
  const mesh = new THREE.Mesh(geo, PERSON_MAT);
  mesh.castShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(H.inv);
  return mesh;
}

/** Trim on a styled worker's apron (the model paints it with the hard hat's yellow): white stitching. */
const TRIM = new THREE.Color(0xffffff);
/** Under a helmet the arms are suit sleeves and the hands gloves (the model's arms are bare skin). */
const SLEEVE = new THREE.Color(0xeef1f5);
const GLOVE = new THREE.Color(0x8e939c);

/**
 * This person's colours: vertex colours on merged parts, Lambert materials on any others. With a crew
 * style, the vest trim keeps its yellow whatever the hat, brows and moustache take the hair colour, and
 * the model's hard hat folds away (to one point) when something else is worn, and its brows always do.
 */
function dress(model: THREE.Object3D, look: Look, st?: Style): void {
  const made = new Map<string, THREE.Material>();
  const colour = (name: string, fallback: THREE.Color): THREE.Color | null => {
    switch (name) {
      case "Worker_Vest": return new THREE.Color(look.vest);
      case "Worker_Yellow": return new THREE.Color(look.hat);
      case "LightBrown": return new THREE.Color(look.shirt);
      case "Brown": return new THREE.Color(look.pants);
      case "Skin": return new THREE.Color(look.skin);
      case "Eyebrows": return st ? new THREE.Color(st.hairColor) : fallback;
      case "Moustache": return look.moustache ? (st ? new THREE.Color(st.hairColor) : fallback) : null;
      default: return fallback;
    }
  };
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    const part = m.geometry.getAttribute("part");
    if (part) {
      // Own copy of the geometry (shared buffers would share the colours too).
      const g = m.geometry.clone();
      const table = parts.map((x) => colour(x.name, x.color) ?? new THREE.Color(look.skin)); // hidden parts (no moustache) take the skin
      const yellow = parts.findIndex((x) => x.name === "Worker_Yellow");
      const hb = st && m.isSkinnedMesh ? m.skeleton.bones.findIndex((b) => b.name === HEAD_BONE) : -1;
      const si = g.getAttribute("skinIndex") as THREE.BufferAttribute;
      const sw = g.getAttribute("skinWeight") as THREE.BufferAttribute;
      const onHat = (i: number) => hb >= 0 && part.getX(i) === yellow && mainBone(si, sw, i) === hb;
      // Sleeves: skin on the arms becomes the jacket (Candy Miner chefs; a helmet's suit has gloves too, Mars Miner).
      const skinPart = parts.findIndex((x) => x.name === "Skin");
      const helmet = st?.head === "helmet";
      const sleeve = helmet ? SLEEVE : new THREE.Color(look.shirt);
      const boneNames = (helmet || st?.sleeves) && m.isSkinnedMesh ? m.skeleton.bones.map((b) => b.name) : null;
      const suit = (i: number): THREE.Color | null => {
        if (!boneNames || part.getX(i) !== skinPart) return null;
        const b = boneNames[mainBone(si, sw, i)] ?? "";
        if (/^(Shoulder|UpperArm|LowerArm)/.test(b)) return sleeve;
        if (helmet && /^(Wrist|Index|Middle|Ring|Pinky|Thumb)/.test(b)) return GLOVE;
        return null;
      };
      if (st && st.head !== "hardhat" && hb >= 0) {
        const pos = g.getAttribute("position") as THREE.BufferAttribute;
        const c = new THREE.Vector3();
        let n = 0;
        for (let i = 0; i < part.count; i++) if (onHat(i)) (c.x += pos.getX(i)), (c.y += pos.getY(i)), (c.z += pos.getZ(i)), n++;
        if (n) {
          c.divideScalar(n);
          for (let i = 0; i < part.count; i++) if (onHat(i)) pos.setXYZ(i, c.x, c.y, c.z);
          pos.needsUpdate = true;
        }
      }
      // The model's brows and eyes fold away too: `headwear` gives a styled worker a new face.
      const brows = st && HEAD?.fold.get(m.name);
      if (brows) {
        const pos = g.getAttribute("position") as THREE.BufferAttribute;
        for (const s of [0, 1]) {
          const c = new THREE.Vector3();
          let n = 0;
          brows.idx.forEach((i, k) => brows.side[k] === s && ((c.x += pos.getX(i)), (c.y += pos.getY(i)), (c.z += pos.getZ(i)), n++));
          if (!n) continue;
          c.divideScalar(n);
          brows.idx.forEach((i, k) => brows.side[k] === s && pos.setXYZ(i, c.x, c.y, c.z));
        }
        pos.needsUpdate = true;
      }
      const col = new Float32Array(part.count * 3);
      for (let i = 0; i < part.count; i++) {
        const c = suit(i) ?? (st && part.getX(i) === yellow && !onHat(i) ? TRIM : table[part.getX(i)]);
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      m.geometry = g;
      m.material = PERSON_MAT;
      return;
    }
    const swap = (old: THREE.Material): THREE.Material => {
      let nm = made.get(old.name);
      if (!nm) {
        const c = colour(old.name, (old as THREE.MeshStandardMaterial).color.clone());
        nm = new THREE.MeshLambertMaterial({ color: c ?? 0, visible: !!c, flatShading: true });
        made.set(old.name, nm);
      }
      return nm;
    };
    m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
  });
}

/* ---------- props ---------- */

/**
 * Pickaxe in tool space: handle along +Y from the grip (origin), head across ±Z at the top. Candy Miner's Candy Pick:
 * a candy-cane handle (red and white bands) and a pink head with white tips.
 */
function pickaxe(): THREE.Group {
  const g = new THREE.Group();
  const bands = 8;
  for (let i = 0; i < bands; i++) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.05, 1.25 / bands, 7), mat(i % 2 ? 0xffffff : 0xe8395a));
    band.position.y = 0.32 - 0.625 + (i + 0.5) * (1.25 / bands);
    g.add(band);
  }
  const pink = mat(0xff6fa5);
  const icing = mat(0xffffff);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.62), pink);
  head.position.y = 0.92;
  const tipA = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.3, 6), icing);
  tipA.rotation.x = Math.PI / 2;
  tipA.position.set(0, 0.9, 0.45);
  const tipB = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 6), icing);
  tipB.rotation.x = -Math.PI / 2;
  tipB.position.set(0, 0.92, -0.4);
  g.add(head, tipA, tipB);
  // One vertex-coloured mesh: the striped handle is eleven parts (every miner carries one).
  bakeColors(g);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** Sledgehammer: the pickaxe's handle with a heavy block head across ±Z. */
function sledgehammer(): THREE.Group {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.2, 7), mat(0x8a5a2b));
  handle.position.y = 0.3;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.52), mat(0x4a4f58));
  head.position.y = 0.92;
  g.add(handle, head);
  for (const z of [-0.27, 0.27]) {
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.04), mat(0x8a9099));
    face.position.set(0, 0.92, z);
    g.add(face);
  }
  for (const o of g.children) o.castShadow = true;
  return g;
}

/*
 * Drills in tool space: the grip (both hands) at the origin, the bit along +Y, the top side
 * (carry handles) toward +Z. `bit` spins about Y while drilling.
 */
interface Drill {
  g: THREE.Group;
  bit: THREE.Object3D | null;
}

function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  parent.add(o);
  return o;
}
const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const C = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);

/** Jackhammer: T-handle, yellow body, chisel. */
function jackhammer(): Drill {
  const g = new THREE.Group();
  const dark = mat(0x3d4049);
  part(g, B(0.46, 0.06, 0.06), dark, 0, 0, 0);
  part(g, B(0.06, 0.12, 0.06), dark, 0, 0.06, 0);
  part(g, C(0.115, 0.115, 0.08), dark, 0, 0.12, 0);
  part(g, C(0.1, 0.1, 0.46), mat(0xf2b51a), 0, 0.37, 0);
  part(g, B(0.06, 0.1, 0.08), dark, 0, 0.3, 0.12);
  part(g, C(0.065, 0.065, 0.08, 6), dark, 0, 0.64, 0);
  const steel = mat(0xb0b6be);
  part(g, C(0.025, 0.025, 0.28, 5), steel, 0, 0.82, 0);
  part(g, new THREE.ConeGeometry(0.035, 0.1, 5), steel, 0, 1.0, 0);
  return { g, bit: null };
}

/** Large Hand Drill: wide side handles, orange motor block, a long auger bit (spins). */
function largeHandDrill(): Drill {
  const g = new THREE.Group();
  const dark = mat(0x3d4049);
  const paint = mat(0xe8562a);
  part(g, B(0.66, 0.06, 0.06), dark, 0, 0, 0);
  part(g, B(0.32, 0.44, 0.34), paint, 0, 0.2, 0);
  part(g, B(0.26, 0.04, 0.28), dark, 0, -0.03, 0);
  part(g, B(0.05, 0.32, 0.05), dark, 0, 0.2, 0.25);
  for (const y of [0.07, 0.33]) part(g, B(0.05, 0.05, 0.1), dark, 0, y, 0.2);
  part(g, C(0.07, 0.11, 0.14), dark, 0, 0.49, 0);
  const bit = new THREE.Group();
  bit.position.y = 0.56;
  g.add(bit);
  const steel = mat(0xc8ccd2);
  part(bit, C(0.035, 0.035, 0.72, 6), steel, 0, 0.36, 0);
  for (let i = 0; i < 7; i++) {
    const a = i * 1.3;
    const fin = part(bit, B(0.15, 0.05, 0.05), mat(0x8a9099), Math.cos(a) * 0.06, 0.06 + i * 0.09, Math.sin(a) * 0.06);
    fin.rotation.y = -a;
  }
  part(bit, new THREE.ConeGeometry(0.05, 0.14, 6), steel, 0, 0.79, 0);
  return { g, bit };
}

/** Knuckle Driller: chunky gunmetal block in copper knuckle bands; vents and bit use `heat`. */
function knuckleDriller(heat: THREE.Material): Drill {
  const g = new THREE.Group();
  const gun = mat(0x3a3e46);
  const copper = mat(0xc87533);
  for (const sx of [-1, 1]) {
    part(g, B(0.07, 0.3, 0.07), copper, sx * 0.31, 0.13, 0);
    for (const y of [0, 0.27]) part(g, B(0.1, 0.06, 0.07), copper, sx * 0.27, y, 0);
  }
  part(g, B(0.46, 0.5, 0.44), gun, 0, 0.25, 0);
  for (const y of [0.06, 0.25, 0.44]) part(g, B(0.5, 0.07, 0.48), copper, 0, y, 0);
  for (const sx of [-1, 1]) for (const z of [-0.1, 0.1]) part(g, B(0.02, 0.28, 0.05), heat, sx * 0.235, 0.25, z);
  part(g, B(0.3, 0.02, 0.06), heat, 0, 0.25, 0.225);
  part(g, C(0.16, 0.21, 0.14), gun, 0, 0.57, 0);
  const bit = new THREE.Group();
  bit.position.y = 0.64;
  g.add(bit);
  part(bit, C(0.12, 0.15, 0.28), heat, 0, 0.14, 0);
  part(bit, new THREE.ConeGeometry(0.12, 0.22, 8), heat, 0, 0.39, 0);
  return { g, bit };
}

/** Cargo Pack: a canvas basket bag on the back; the pile rides inside it. */
function cargoPack(): THREE.Group {
  const g = new THREE.Group();
  const green = mat(0x4f7a3a);
  const deep = mat(0x3a5a2a);
  part(g, new RoundedBoxGeometry(0.84, 0.66, 0.1, 2, 0.04), green, 0, 0.3, 0.16);
  part(g, B(0.84, 0.06, 0.5), deep, 0, -0.01, -0.08);
  for (const sx of [-1, 1]) {
    part(g, B(0.06, 0.4, 0.5), green, sx * 0.42, 0.18, -0.08);
    part(g, B(0.08, 0.2, 0.26), deep, sx * 0.47, 0.14, -0.08);
    part(g, B(0.06, 0.5, 0.05), mat(0x2b2a26), sx * 0.18, 0.4, 0.23);
  }
  part(g, B(0.84, 0.3, 0.06), green, 0, 0.13, -0.33);
  part(g, C(0.07, 0.07, 0.84, 7).rotateZ(Math.PI / 2), mat(0xb59a5a), 0, 0.66, 0.16);
  return g;
}

/** Exo-Carrier: a steel exoskeleton frame, tall rails over the shoulders, a wide shelf on struts. */
function exoFrame(): THREE.Group {
  const g = new THREE.Group();
  const steel = mat(0x9aa3ae);
  const dark = mat(0x2f3238);
  const yellow = mat(0xf2b51a);
  const led = mat(0x3fd0ff, { emissive: 0x1a7fa0 });
  for (const sx of [-1, 1]) {
    const x = sx * 0.24;
    part(g, B(0.07, 1.0, 0.07), steel, x, 0.44, 0.16);
    part(g, B(0.07, 0.07, 0.32), steel, x, 0.94, 0.3);
    part(g, B(0.07, 0.2, 0.07), steel, x, 0.85, 0.44);
    part(g, B(0.05, 0.05, 0.03), led, x, 0.98, 0.12);
    // Piston strut from the shelf's outer corner up to the rail.
    const a = new THREE.Vector3(sx * 0.42, 0.02, -0.3);
    const b = new THREE.Vector3(x, 0.62, 0.13);
    const strut = part(g, C(0.026, 0.026, a.distanceTo(b), 5), dark, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    part(g, B(0.04, 0.1, 0.52), yellow, sx * 0.45, 0.03, -0.08);
  }
  part(g, B(0.9, 0.05, 0.52), steel, 0, -0.02, -0.08);
  part(g, B(0.9, 0.1, 0.04), yellow, 0, 0.03, -0.34);
  part(g, B(0.74, 0.1, 0.08), dark, 0, 0.02, 0.24);
  part(g, B(0.3, 0.28, 0.08), dark, 0, 0.56, 0.2);
  part(g, B(0.16, 0.05, 0.02), led, 0, 0.62, 0.155);
  return g;
}

/** Wooden back frame the carried pile sits on. */
function carrier(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x9a6434);
  const dark = mat(0x5e3a1c);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.4), wood);
  shelf.position.set(0, 0, -0.04);
  g.add(shelf);
  for (const x of [-0.22, 0.22]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.78, 0.07), wood);
    post.position.set(x, 0.35, 0.15);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.05), dark);
    strap.position.set(x * 0.8, 0.42, 0.22);
    g.add(post, strap);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.07), wood);
  bar.position.set(0, 0.7, 0.15);
  g.add(bar);
  for (const o of g.children) o.castShadow = true;
  return g;
}

/* ---------- gear: which prop each equipment key shows ---------- */

/** "swing": two-handed overhead swing (pickaxe, sledgehammer); "drill": held forward in both hands, buzzing. */
type Grip = "swing" | "drill";
interface ToolProp {
  g: THREE.Group;
  grip: Grip;
  bit: THREE.Object3D | null;
  /** The Knuckle Driller's own heat-glow material (see setToolHeat). */
  heat: THREE.MeshLambertMaterial | null;
}

const HEAT_COOL = new THREE.Color(0x5c6068);
const HEAT_HOT = new THREE.Color(0xffc070);

/** Every tool in candy colours (Candy Miner; the pickaxe is drawn in them already). */
function makeTool(key: string): ToolProp {
  const t = makeToolModel(key);
  if (key in TOOL_LIVERY) candyLivery(t.g);
  return t;
}
const TOOL_LIVERY: Record<string, true> = { sledgehammer: true, jackhammer: true, largeHandDrill: true, titanDrill: true, knuckleDriller: true };

function makeToolModel(key: string): ToolProp {
  switch (key) {
    case "sledgehammer":
      return { g: sledgehammer(), grip: "swing", bit: null, heat: null };
    case "jackhammer":
      return { ...jackhammer(), grip: "drill", heat: null };
    case "largeHandDrill":
    case "titanDrill":
      return { ...largeHandDrill(), grip: "drill", heat: null };
    case "knuckleDriller": {
      const heat = new THREE.MeshLambertMaterial({ color: HEAT_COOL.clone(), emissive: 0xff4a10, emissiveIntensity: 0.12, flatShading: true });
      heat.userData.own = true;
      return { ...knuckleDriller(heat), grip: "drill", heat };
    }
    default:
      return { g: pickaxe(), grip: "swing", bit: null, heat: null };
  }
}

function makeBack(key: string): THREE.Group {
  const g = key === "cargoPack" ? cargoPack() : key === "exoCarrier" ? exoFrame() : carrier();
  candyLivery(g);
  return g;
}

/**
 * A stand-alone copy of a hand tool or back carrier (shop counters, previews), in the same
 * units as on a person (PROP_HEIGHT). Drills point along +Y; carriers stand on y = 0, back at +Z.
 */
export function gearModel(key: string): { g: THREE.Group; kind: Grip | "back" } {
  if (key === "woodenCarrier" || key === "cargoPack" || key === "exoCarrier") return { g: makeBack(key), kind: "back" };
  const t = makeTool(key);
  return { g: t.g, kind: t.grip };
}

/** Knuckle Driller heat look, 0 (cold steel) … 1 (glowing). No effect for other tools. */
export function setToolHeat(character: Character, heat: number): void {
  character.setHeat(heat);
}

/** Free a swapped-out prop's geometries (materials come from mat()'s shared cache, except the heat glow). */
function dispose(root: THREE.Object3D): void {
  const own = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    if (!Array.isArray(m.material) && m.material.userData.own) own.add(m.material);
  });
  for (const m of own) m.dispose();
}

/* ---------- swing timing (seconds) ---------- */

/** Wind-up until the pick is overhead; the strike lands at WINDUP + STRIKE. */
export const WINDUP = 0.2;
const STRIKE = 0.09;
const SWING_END = 0.5;

const smooth = (t: number) => t * t * (3 - 2 * t);
/** Piecewise-smooth interpolation through (t, v) keys. */
function curve(keys: [number, number][], t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0));
    }
  }
  return keys[keys.length - 1][1];
}
const D = THREE.MathUtils.degToRad;
const HIT = WINDUP + STRIKE;
/** How long before a hit the swing has to start for the strike to land on it. */
export const SWING_LEAD = HIT;
// Arm pitch about the character's X axis (0 = hanging, −90° = straight ahead, −180° = up).
// The strike lands on the block's face at chest height (blocks are as tall as a person),
// with a short recoil, rather than in the dirt in front of it.
const ARM_KEYS: [number, number][] = [[0, -50], [WINDUP, -200], [HIT, -98], [HIT + 0.06, -110], [SWING_END, -50]].map(([t, v]) => [t, D(v)]);
const TORSO_KEYS: [number, number][] = [[0, 4], [WINDUP, -14], [HIT, 16], [HIT + 0.08, 10], [SWING_END, 4]].map(([t, v]) => [t, D(v)]);
const ELBOW_KEYS: [number, number][] = [[0, -20], [WINDUP, -40], [HIT, -4], [SWING_END, -20]].map(([t, v]) => [t, D(v)]);

const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
/** Handle direction (towards the head) while the pickaxe is just carried. */
const HOLD_DIR = new THREE.Vector3(0, 0.55, 0.85).normalize();
/** Drills: bit direction while drilling (at the block's face, chest height) and while carried. */
const DRILL_DIR = new THREE.Vector3(0, -0.12, 1).normalize();
const CARRY_DIR = new THREE.Vector3(0, -0.85, 0.5).normalize();
const NEG_X = new THREE.Vector3(-1, 0, 0);
/** Break area poses (degrees): the eating arm at rest -> at the mouth; resting in an armchair, hands on the lap. */
const DINE = { arm: [-20, -55], elbow: [-55, -140], inward: 18 };
const REST = { arm: -24, elbow: -62, inward: 8, head: 7 };
/** Seconds a drill stays up after the last hit (hits come every ~0.17 s). */
const DRILL_HOLD = 0.45;
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const qc = new THREE.Quaternion();
const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const vc = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const m5 = new THREE.Matrix4();

/**
 * One animated character. The owner moves `root` and sets `pose` / `hold` every frame,
 * calls `windup()` / `swing()` around tool hits, and `update(dt)` once per frame.
 */
export class Character {
  readonly root = new THREE.Group();
  /** Where carried items stack (on the back frame). */
  readonly stackAnchor = new THREE.Object3D();
  /** The hand tool (holder of the current tool prop); the owner may hide it. */
  readonly tool = new THREE.Group();
  pose: Pose = "idle";
  /** Both hands forward on handles (pushing the wheelbarrow). */
  hold = false;
  /**
   * At the break area (user 2026-10-24), with pose "sit": eating or drinking at a table, or resting in an
   * armchair. The tool and the back carrier are put away meanwhile.
   */
  activity: "eat" | "drink" | "rest" | null = null;
  /** Walk/run clip speed multiplier (match the clip to the ground speed). */
  stride = 1;
  private model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private lower = new Map<Pose, THREE.AnimationAction>();
  private upper = new Map<Pose, THREE.AnimationAction>();
  private blend: Record<Pose, number> = { idle: 1, walk: 0, run: 0, sit: 0 };
  private holdW = 0;
  /** Time into the current swing, or −1 when not swinging. */
  private swingT = -1;
  private bones: Record<string, THREE.Object3D> = {};
  private thigh = 0.5;
  private hasTool: boolean;
  /* Gear on show (equipment keys) and how the tool is held. */
  private toolKey = "";
  private backKey = "";
  private grip: Grip = "swing";
  private bit: THREE.Object3D | null = null;
  private heatMat: THREE.MeshLambertMaterial | null = null;
  /** Cosmetic heat build-up while drilling, until the game drives it with setToolHeat. */
  private heatAuto = true;
  private heat = 0;
  /** Back carrier: placed once; its look is swapped inside. */
  private back = new THREE.Group();
  private backLook: THREE.Object3D | null = null;
  /** True: gear follows the save (S.equipMining / S.run.gear); false after setGear(). */
  private autoGear = true;
  private gearId: string;
  /** Drills: seconds left in the drilling pose, its blend weight, and the buzz after a hit. */
  private drillT = 0;
  private drillW = 0;
  private buzz = 0;
  private clock = 0;
  /* Break area: blend weights of eating / drinking and of resting, the burger or cup in hand and where in the bite it is. */
  private actW = 0;
  private restW = 0;
  /** The feet are IK bones under Root, not under the shins: sitting moves them to the shins' ends (`pinFeet`). */
  private feet: { bone: THREE.Object3D; shin: THREE.Object3D; rel: THREE.Matrix4; p: THREE.Vector3; q: THREE.Quaternion; moved: boolean }[] = [];
  private meal = new THREE.Group();
  private mealKind = "";
  private mealUp = 0;
  private mealHand: "L" | "R" = "R";
  private mealPhase: number;

  constructor(
    private kind: "player" | "worker",
    seed = 0,
    opts: { tool?: boolean; height?: number } = {},
  ) {
    this.gearId = String(seed);
    if (!template) throw new Error("characters not loaded");
    this.model = cloneSkinned(template);
    // A hired worker's own style (CREW); the player and unknown ids are candy makers in the plain looks (Candy Miner).
    const st = kind === "worker" ? CREW[seed] ?? candyMaker(workerLook(seed)) : candyMaker(PLAYER_LOOK);
    const height = (opts.height ?? PLAYER_HEIGHT) * (st?.tall ?? 1);
    this.model.scale.multiplyScalar(height / modelHeight);
    if (st) (this.model.scale.x *= st.wide), (this.model.scale.z *= st.wide);
    dress(this.model, st.look, st);
    const wear = st && headwear(st);
    if (wear) this.model.getObjectByName(HEAD_BONE)?.add(wear);
    this.root.add(this.model);
    for (const n of ["Hips", "Chest", "Head", "UpperArmL", "UpperArmR", "LowerArmL", "LowerArmR", "WristL", "WristR", "UpperLegL", "UpperLegR", "LowerLegL", "LowerLegR"]) {
      const b = this.model.getObjectByName(n);
      if (!b) throw new Error(`bone ${n} missing`);
      this.bones[n] = b;
    }
    this.root.updateMatrixWorld(true);
    this.thigh = this.bones.UpperLegL.getWorldPosition(va).distanceTo(this.bones.LowerLegL.getWorldPosition(vb));
    for (const side of ["L", "R"]) {
      const bone = this.model.getObjectByName(`Foot${side}`);
      const shin = this.bones[`LowerLeg${side}`];
      if (bone) this.feet.push({ bone, shin, rel: shin.matrixWorld.clone().invert().multiply(bone.matrixWorld), p: new THREE.Vector3(), q: new THREE.Quaternion(), moved: false });
    }

    this.hasTool = opts.tool ?? true;
    this.tool.scale.setScalar(height / PROP_HEIGHT);
    this.tool.visible = this.hasTool;
    this.root.add(this.tool);

    // Back frame at shoulder-blade height, a little behind the back.
    this.back.scale.setScalar(height / PROP_HEIGHT);
    this.back.position.set(0, height * 0.5, -height * 0.13);
    this.root.add(this.back);
    this.stackAnchor.position.set(0, 0.05, -0.06);
    this.back.add(this.stackAnchor);
    this.wear("pickaxe", "woodenCarrier");
    this.meal.scale.setScalar(height / PROP_HEIGHT);
    this.meal.visible = false;
    this.root.add(this.meal);
    this.mealPhase = (Math.abs(seed) % 13) * 0.37;

    this.mixer = new THREE.AnimationMixer(this.model);
    const act = (c: THREE.AnimationClip) => {
      const a = this.mixer.clipAction(c);
      a.setEffectiveWeight(0);
      a.play();
      return a;
    };
    for (const p of Object.keys(POSE_CLIP) as Exclude<Pose, "sit">[]) {
      const c = clips.get(POSE_CLIP[p])!;
      this.lower.set(p, act(c.lower));
      this.upper.set(p, act(c.upper));
    }
    // Sitting reuses the idle clip; the legs are folded procedurally.
    const idle = clips.get("Idle")!;
    this.lower.set("sit", act(idle.lower.clone()));
    this.upper.set("sit", act(idle.upper.clone()));
    // Desync idle/walk cycles between characters.
    this.mixer.setTime((Math.abs(seed) % 97) * 0.13);
  }

  /**
   * Show these tools (equipment keys: a mining tool and a carrier) instead of following the
   * save. Cheap when nothing changes. Unknown keys show the pickaxe / wooden carrier.
   */
  setGear(mining: string, carrying: string): void {
    this.autoGear = false;
    this.wear(mining, carrying);
  }

  /** Knuckle Driller heat look (0..1); from then on the game drives it (no cosmetic heat). */
  setHeat(heat: number): void {
    this.heatAuto = false;
    this.applyHeat(heat);
  }

  private applyHeat(h: number): void {
    this.heat = Math.max(0, Math.min(1, h));
    if (!this.heatMat) return;
    this.heatMat.color.lerpColors(HEAT_COOL, HEAT_HOT, this.heat);
    this.heatMat.emissiveIntensity = 0.12 + this.heat * 1.5;
  }

  private wear(mining: string, carrying: string): void {
    if (mining !== this.toolKey) {
      this.toolKey = mining;
      for (const o of this.tool.children) dispose(o);
      this.tool.clear();
      const t = makeTool(mining);
      this.tool.add(t.g);
      this.grip = t.grip;
      this.bit = t.bit;
      this.heatMat = t.heat;
      this.swingT = -1;
      this.drillT = 0;
      this.applyHeat(this.heatAuto ? 0 : this.heat);
    }
    if (carrying !== this.backKey) {
      this.backKey = carrying;
      if (this.backLook) {
        dispose(this.backLook);
        this.back.remove(this.backLook);
      }
      this.backLook = makeBack(carrying);
      this.back.add(this.backLook);
    }
  }

  /** What the save says this person uses: the player's equipped tools, a worker's lent tool or basic gear. */
  private followSave(): void {
    if (this.kind === "player") return this.wear(S.equipMining, S.equipCarrying);
    const lent = S.run.gear?.[this.gearId];
    if (this.hasTool) this.wear(lent ?? "pickaxe", "woodenCarrier");
    else this.wear("pickaxe", lent ?? "woodenCarrier");
  }

  /** Start the swing so that the strike lands `lead` seconds from now. */
  windup(lead: number): void {
    if (this.grip === "drill") {
      this.drillT = Math.max(this.drillT, lead + 0.2);
      return;
    }
    if (this.swingT >= 0 && this.swingT < HIT) return;
    this.swingT = Math.max(0, HIT - lead);
  }

  /** The tool hits now: finish the swing on the strike (or play just the strike). */
  swing(): void {
    if (this.grip === "drill") {
      this.drillT = DRILL_HOLD;
      this.buzz = 0.16;
      return;
    }
    if (this.swingT >= 0 && this.swingT <= HIT + 0.02) return;
    this.swingT = WINDUP;
  }

  get swinging(): boolean {
    return this.swingT >= 0 || this.drillT > 0;
  }

  update(dt: number): void {
    if (this.autoGear) this.followSave();
    this.clock += dt;
    const k = Math.min(1, dt * 12);
    for (const p of Object.keys(this.blend) as Pose[]) this.blend[p] += ((p === this.pose ? 1 : 0) - this.blend[p]) * k;
    this.holdW += ((this.hold ? 1 : 0) - this.holdW) * k;
    const dining = this.activity === "eat" || this.activity === "drink";
    this.actW += ((dining ? 1 : 0) - this.actW) * k;
    this.restW += ((this.activity === "rest" ? 1 : 0) - this.restW) * k;
    if (this.kind === "worker") {
      this.tool.visible = this.hasTool && !this.activity;
      this.back.visible = !this.activity;
    }
    // Feet moved for sitting last frame go back first: the mixer only writes a value that changed.
    for (const f of this.feet) if (f.moved) (f.bone.position.copy(f.p), f.bone.quaternion.copy(f.q), (f.moved = false));
    for (const [p, a] of this.lower) {
      a.setEffectiveWeight(this.blend[p]);
      a.timeScale = p === "walk" || p === "run" ? this.stride : 1;
    }
    for (const [p, a] of this.upper) {
      a.setEffectiveWeight(this.blend[p]);
      a.timeScale = p === "walk" || p === "run" ? this.stride : 1;
    }
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);

    let sw = 0;
    if (this.swingT >= 0) {
      this.swingT += dt;
      if (this.swingT >= SWING_END) this.swingT = -1;
      else sw = Math.min(1, this.swingT / 0.05, (SWING_END - this.swingT) / 0.12);
    }
    const t = Math.max(0, this.swingT);
    // Drills: both hands forward on the tool while drilling (a little after the last hit).
    if (this.drillT > 0) this.drillT -= dt;
    if (this.buzz > 0) this.buzz -= dt;
    this.drillW += ((this.drillT > 0 && this.tool.visible ? 1 : 0) - this.drillW) * Math.min(1, dt * 14);
    const dw = this.drillW > 0.01 ? this.drillW : 0;
    if (this.bit && dw > 0.5) this.bit.rotation.y += dt * 40;
    // Cosmetic: the Knuckle Driller warms up while it bites and cools off after.
    if (this.heatMat && this.heatAuto) this.applyHeat(this.buzz > 0 ? Math.min(0.85, this.heat + dt * 0.35) : this.heat - dt * 0.25);
    this.model.position.y = 0;
    if (this.blend.sit > 0.01) {
      this.sit(this.blend.sit);
      this.pinFeet(this.blend.sit);
      if (this.actW > 0.01) this.dine(this.blend.sit * this.actW);
      if (this.restW > 0.01) this.rest(this.blend.sit * this.restW);
    }
    this.placeMeal();
    // Hands forward for the wheelbarrow, unless swinging.
    const busy = Math.max(sw, dw);
    const holdW = this.holdW * (1 - busy);
    if (busy > 0 || holdW > 0.01) {
      const shake = this.buzz > 0 ? Math.sin(this.clock * 95) * D(1.6) : 0;
      const arm = sw * curve(ARM_KEYS, t) + dw * (D(-52) + shake) + holdW * D(-38);
      const elbow = sw * curve(ELBOW_KEYS, t) + dw * D(-58) + holdW * D(-25);
      this.turn(this.bones.Chest, X, sw * curve(TORSO_KEYS, t) + dw * (D(10) + shake * 0.5));
      for (const side of ["L", "R"] as const) {
        const s = side === "L" ? 1 : -1;
        // Bring the hands together in front of the body, then pitch the arm.
        this.turn(this.bones[`UpperArm${side}`], Z, -s * D(14) * Math.max(busy, holdW));
        this.turn(this.bones[`UpperArm${side}`], X, arm);
        this.turn(this.bones[`LowerArm${side}`], X, elbow);
      }
    }
    if (this.grip === "drill") this.placeDrill(dw);
    else this.placeTool(sw);
  }

  /** Rotate a bone by `angle` about a character-space axis (independent of the rig's axes). */
  private turn(bone: THREE.Object3D, axis: THREE.Vector3, angle: number): void {
    if (Math.abs(angle) < 1e-4) return;
    this.root.getWorldQuaternion(qa);
    va.copy(axis).applyQuaternion(qa);
    qb.setFromAxisAngle(va, angle);
    bone.parent!.getWorldQuaternion(qc);
    // local delta = parent⁻¹ · world rotation · parent
    qa.copy(qc).invert().multiply(qb).multiply(qc);
    bone.quaternion.premultiply(qa);
    bone.updateMatrixWorld(true);
  }

  /** Fold the legs onto a chair (props.ts SEAT_Y): thighs level, shins down, the feet on the ground (`pinFeet`). */
  private sit(w: number): void {
    this.model.position.y = -this.thigh * 0.97 * w;
    for (const side of ["L", "R"] as const) {
      this.turn(this.bones[`UpperLeg${side}`], X, D(-88) * w);
      this.turn(this.bones[`LowerLeg${side}`], X, D(88) * w);
    }
  }

  /** Each foot to the end of its shin, as it hangs in the bind pose; the mixer's value comes back next frame. */
  private pinFeet(w: number): void {
    for (const f of this.feet) {
      f.p.copy(f.bone.position);
      f.q.copy(f.bone.quaternion);
      f.moved = true;
      f.shin.updateWorldMatrix(true, false);
      f.bone.parent!.updateWorldMatrix(true, false);
      m5.copy(f.bone.parent!.matrixWorld).invert();
      m4.multiplyMatrices(f.shin.matrixWorld, f.rel).premultiply(m5);
      m4.decompose(va, qa, vb);
      f.bone.position.lerp(va, w);
      f.bone.quaternion.slerp(qa, w);
      f.bone.updateMatrixWorld(true);
    }
  }

  /**
   * Eating or drinking at a table: the hand on the camera side brings the burger / cup to the mouth now and then
   * (a bite: the head nods; a sip: the head tips back), the other arm rests on the table.
   */
  private dine(w: number): void {
    const drink = this.activity === "drink";
    const period = drink ? 4.2 : 3.4;
    const t = (this.clock + this.mealPhase) % period;
    const up = t < 0.45 ? smooth(t / 0.45) : t < 1.35 ? 1 : t < 1.8 ? 1 - smooth((t - 1.35) / 0.45) : 0;
    // Facing +x the right hand is toward the camera (+z), facing -x the left one.
    const hand = Math.sin(this.root.rotation.y) >= 0 ? "R" : "L";
    for (const side of ["L", "R"] as const) {
      const s = side === "L" ? 1 : -1;
      const u = side === hand ? up : 0;
      this.turn(this.bones[`UpperArm${side}`], Z, -s * D(10 + DINE.inward * u) * w);
      this.turn(this.bones[`UpperArm${side}`], X, D(DINE.arm[0] + (DINE.arm[1] - DINE.arm[0]) * u) * w);
      this.turn(this.bones[`LowerArm${side}`], X, D(DINE.elbow[0] + (DINE.elbow[1] - DINE.elbow[0]) * u) * w);
    }
    this.turn(this.bones.Head, X, (drink ? D(-14) * up : D(3) * Math.sin(this.clock * 13) * up) * w);
    this.mealUp = up;
    this.mealHand = hand;
  }

  /** Resting in an armchair: hands on the lap, the head down a little, nodding slowly. */
  private rest(w: number): void {
    for (const side of ["L", "R"] as const) {
      const s = side === "L" ? 1 : -1;
      this.turn(this.bones[`UpperArm${side}`], Z, -s * D(REST.inward) * w);
      this.turn(this.bones[`UpperArm${side}`], X, D(REST.arm) * w);
      this.turn(this.bones[`LowerArm${side}`], X, D(REST.elbow) * w);
    }
    this.turn(this.bones.Head, X, D(REST.head + 3 * Math.sin(this.clock * 1.3 + this.mealPhase)) * w);
  }

  /** The burger or cup in the eating / drinking hand, tipped toward the mouth on a sip. */
  private placeMeal(): void {
    const kind = this.actW > 0.5 && (this.activity === "eat" || this.activity === "drink") ? this.activity : "";
    if (kind !== this.mealKind) {
      this.mealKind = kind;
      for (const o of this.meal.children) dispose(o);
      this.meal.clear();
      if (kind) this.meal.add(kind === "eat" ? burgerMesh(0.11) : cupMesh(0.26, 0xe0483a));
    }
    this.meal.visible = !!kind;
    if (!kind) return;
    const wrist = this.bones[`Wrist${this.mealHand}`].getWorldPosition(va);
    const dir = vc.subVectors(wrist, this.bones[`LowerArm${this.mealHand}`].getWorldPosition(vb)).normalize();
    wrist.addScaledVector(dir, 0.1);
    this.root.worldToLocal(wrist);
    this.meal.position.copy(wrist);
    this.meal.position.y -= 0.1;
    this.meal.rotation.set(kind === "drink" ? -0.8 * this.mealUp : 0, 0, 0);
  }

  /** Drill: hanging from the right hand while walking; in both hands, bit at the block, buzzing while drilling. */
  private placeDrill(dw: number): void {
    if (!this.tool.visible) return;
    const r = this.root;
    let dir: THREE.Vector3;
    if (dw > 0.5) {
      const hands = va.addVectors(this.bones.WristL.getWorldPosition(vb), this.bones.WristR.getWorldPosition(vc)).multiplyScalar(0.5);
      r.worldToLocal(hands);
      this.tool.position.copy(hands);
      dir = DRILL_DIR;
      if (this.buzz > 0) {
        const c = this.clock;
        this.tool.position.x += Math.sin(c * 97) * 0.012;
        this.tool.position.y += Math.cos(c * 83) * 0.012;
        this.tool.position.z += Math.sin(c * 71) * 0.02;
      }
    } else {
      const hand = this.bones.WristR.getWorldPosition(vb);
      r.worldToLocal(hand);
      this.tool.position.copy(hand);
      dir = CARRY_DIR;
    }
    // Right-handed basis with the tool's top side (+Z) up: (−X, dir, −X × dir).
    const up = vc.crossVectors(NEG_X, dir).normalize();
    m4.makeBasis(NEG_X, dir, up);
    this.tool.quaternion.setFromRotationMatrix(m4);
  }

  /** Pickaxe: in the right hand, head forward, while walking; in both hands (extension of the arms) when swinging. */
  private placeTool(sw: number): void {
    if (!this.hasTool) return;
    const r = this.root;
    const hands = va.addVectors(this.bones.WristL.getWorldPosition(vb), this.bones.WristR.getWorldPosition(vc)).multiplyScalar(0.5);
    r.worldToLocal(hands);
    if (sw > 0.5) {
      const shoulders = vb.addVectors(this.bones.UpperArmL.getWorldPosition(vb), this.bones.UpperArmR.getWorldPosition(vc)).multiplyScalar(0.5);
      r.worldToLocal(shoulders);
      const dir = vc.subVectors(hands, shoulders).normalize();
      // Handle continues the arms; the pick head leads in the swing plane.
      const lead = vb.crossVectors(X, dir).normalize();
      m4.makeBasis(X, dir, lead);
      this.tool.quaternion.setFromRotationMatrix(m4);
      this.tool.position.copy(hands).addScaledVector(dir, -0.12);
    } else {
      // Gripped low on the handle in the right hand, head up and ahead; it follows the arm swing.
      const hand = this.bones.WristR.getWorldPosition(vb);
      r.worldToLocal(hand);
      const dir = vc.copy(HOLD_DIR);
      const lead = va.crossVectors(X, dir).normalize();
      m4.makeBasis(X, dir, lead);
      this.tool.quaternion.setFromRotationMatrix(m4);
      this.tool.position.copy(hand);
    }
  }
}

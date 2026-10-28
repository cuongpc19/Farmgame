import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import dozerGlb from "../assets/props/dozer.glb?inline";
import dumpGlb from "../assets/props/dump.glb?inline";
import barrowGlb from "../assets/props/barrow.glb?inline";
import tractorGlb from "../assets/props/tractor.glb?inline";
import truckflatGlb from "../assets/props/truckflat.glb?inline";
import wheelGlb from "../assets/props/wheel.glb?inline";
import foundryGlb from "../assets/props/foundry.glb?inline";
import workshopGlb from "../assets/props/workshop.glb?inline";
import officeGlb from "../assets/props/office.glb?inline";
import flatGlb from "../assets/props/flat.glb?inline";
import tankGlb from "../assets/props/tank.glb?inline";
import barrelGlb from "../assets/props/barrel.glb?inline";

/**
 * Machine / building models from files (sources and licences: src/assets/props/LICENSE.txt).
 * Each entry says which way the model's front points so `prop()` can hand back a clone
 * that faces +Z, sits on y = 0, is centred, and has a given length.
 */
const SRC = {
  dozer: { url: dozerGlb, turn: Math.PI / 2 },
  dump: { url: dumpGlb, turn: Math.PI },
  barrow: { url: barrowGlb, turn: 0 },
  tractor: { url: tractorGlb, turn: 0 },
  truckflat: { url: truckflatGlb, turn: 0 },
  wheel: { url: wheelGlb, turn: 0 },
  foundry: { url: foundryGlb, turn: 0 },
  workshop: { url: workshopGlb, turn: 0 },
  office: { url: officeGlb, turn: 0 },
  flat: { url: flatGlb, turn: 0 },
  tank: { url: tankGlb, turn: 0 },
  barrel: { url: barrelGlb, turn: 0 },
} as const;
export type PropName = keyof typeof SRC;

const loaded = new Map<PropName, THREE.Object3D>();

function bytes(dataUrl: string): ArrayBuffer {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Lambert copies of the file's materials (matches the scene, cheaper on phones). */
function lambert(scene: THREE.Object3D): void {
  const made = new Map<THREE.Material, THREE.Material>();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    const swap = (old: THREE.Material) => {
      let nm = made.get(old);
      if (!nm) {
        const s = old as THREE.MeshStandardMaterial;
        nm = new THREE.MeshLambertMaterial({ color: s.color, map: s.map ?? null, transparent: s.transparent, opacity: s.opacity });
        // Keep the name: `tint` repaints by it (Space Kit trims are "metalRed").
        nm.name = old.name;
        made.set(old, nm);
      }
      return nm;
    };
    m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
  });
}

export async function loadProps(): Promise<void> {
  const loader = new GLTFLoader();
  // Decode embedded textures through <img>: the artifact viewer's CSP blocks fetch().
  loader.register((parser) => {
    parser.textureLoader = new THREE.TextureLoader(parser.options.manager);
    return { name: "cm_img_textures" };
  });
  await Promise.all(
    (Object.keys(SRC) as PropName[]).map(async (k) => {
      const g = await loader.parseAsync(bytes(SRC[k].url), "");
      lambert(g.scene);
      loaded.set(k, g.scene);
    }),
  );
}

/** Kenney colour-atlas cells (512 px atlas: x, y of a 64×128 cell). */
export const ATLAS = {
  /** City Kit (Industrial): roofs, roof trims and plinths. */
  roof: [256, 256] as [number, number],
};

const recolorCache = new Map<string, THREE.Material>();

/** A copy of `mat` whose atlas cells are repainted (a vertical gradient of each colour). */
function recolor(mat: THREE.Material, cells: [number, number, number][]): THREE.Material {
  const key = `${mat.uuid}|${cells.map((c) => c.join(":")).join(",")}`;
  const hit = recolorCache.get(key);
  if (hit) return hit;
  const src = (mat as THREE.MeshLambertMaterial).map;
  const out = mat.clone() as THREE.MeshLambertMaterial;
  if (src?.image) {
    const img = src.image as CanvasImageSource & { width: number; height: number };
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const u = img.width / 512;
    for (const [x, y, col] of cells) {
      const base = new THREE.Color(col);
      const grd = g.createLinearGradient(0, y * u, 0, (y + 128) * u);
      grd.addColorStop(0, `#${base.clone().lerp(new THREE.Color(0xffffff), 0.12).getHexString()}`);
      grd.addColorStop(1, `#${base.clone().multiplyScalar(0.78).getHexString()}`);
      g.fillStyle = grd;
      g.fillRect(x * u, y * u, 64 * u, 128 * u);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = src.flipY;
    t.magFilter = src.magFilter;
    t.minFilter = src.minFilter;
    out.map = t;
  }
  recolorCache.set(key, out);
  return out;
}

/**
 * A fresh copy of a model: front along +Z, centred on x/z, bottom at y = 0, scaled so its
 * extent along `axis` (after turning) is `length`. Child nodes keep their names (e.g. Kenney
 * wheels "wheel-front-left") so callers can find and animate them. `recolor` repaints atlas
 * cells (Kenney models) — e.g. a building's roof in its signature colour. `tint` repaints materials by name (the Space
 * Kit's orange trim is "metalRed").
 */
export function prop(name: PropName, length: number, opts: { axis?: "x" | "z"; recolor?: [number, number, number][]; tint?: Record<string, number> } = {}): THREE.Group {
  const src = loaded.get(name);
  if (!src) throw new Error(`prop ${name} not loaded`);
  const inner = src.clone(true);
  inner.rotation.y = SRC[name].turn;
  if (opts.recolor) {
    const cells = opts.recolor;
    inner.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = Array.isArray(m.material) ? m.material.map((x) => recolor(x, cells)) : recolor(m.material, cells);
    });
  }
  if (opts.tint) {
    const tint = opts.tint;
    inner.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const paint = (x: THREE.Material) => {
        const col = tint[x.name];
        if (col === undefined) return x;
        const key = `${x.uuid}|tint:${col}`;
        let out = recolorCache.get(key);
        if (!out) {
          out = x.clone();
          (out as THREE.MeshLambertMaterial).color.setHex(col);
          recolorCache.set(key, out);
        }
        return out;
      };
      m.material = Array.isArray(m.material) ? m.material.map(paint) : paint(m.material);
    });
  }
  const holder = new THREE.Group();
  holder.add(inner);
  holder.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(inner);
  const ext = opts.axis === "x" ? bb.max.x - bb.min.x : bb.max.z - bb.min.z;
  const k = length / Math.max(1e-6, ext);
  inner.scale.multiplyScalar(k);
  holder.updateMatrixWorld(true);
  bb.setFromObject(inner);
  inner.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  const out = new THREE.Group();
  out.add(holder);
  return out;
}

/** Size of a prop() result (for placing anchors on it). */
export function propSize(obj: THREE.Object3D): THREE.Vector3 {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
}

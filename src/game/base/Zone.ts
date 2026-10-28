import * as THREE from "three";
import padsUrl from "../../assets/farm/pads.webp?inline";

/**
 * Floor pads (farm game, user 2026-10-28: "redesign the white squares, SELL, MILL..., ChatGPT can design them"): two
 * ChatGPT-drawn mats in src/assets/farm/pads.webp, cut from a sheet of four with scripts/sprites/nodes.py's keyer. Work
 * pads (where goods go on and off: MILL, FORGE, SELL, STORAGE, FUEL) are a light wood frame round a woven straw mat;
 * every other pad (doors, ACTIVATE / FREE / BUILD, shop plates) a green wood frame round pale canvas. Captions are
 * painted on top: cream with a dark brown edge on straw, dark brown on canvas.
 */
const tex = new THREE.TextureLoader().load(padsUrl);
tex.colorSpace = THREE.SRGBColorSpace;
tex.anisotropy = 4;
const padMat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const tinted = new Map<number, THREE.MeshLambertMaterial>();
const WORK = new Set(["MILL", "FORGE", "SELL", "STORAGE", "FUEL"]);
const fillMat = new THREE.MeshBasicMaterial({ color: 0x9be36a, transparent: true, opacity: 0.55, depthWrite: false });

function padGeo(style: "work" | "door"): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (style === "work" ? 0 : 0.5) + uv.getX(i) * 0.5);
  return g;
}
const GEO = { work: padGeo("work"), door: padGeo("door") };

/** A caption on the floor (auto-fitted), with an edge so it reads on the mat. */
function caption(text: string, w: number, h: number, fill: string, edge: string): THREE.Mesh {
  const c = document.createElement("canvas");
  const scale = 72;
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const g = c.getContext("2d")!;
  const fit = Math.min(c.height * 0.8, (c.width * 0.92) / Math.max(1, text.length * 0.56));
  g.font = `${Math.round(fit)}px "Lilita One", system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = Math.max(4, fit * 0.2);
  g.strokeStyle = edge;
  g.strokeText(text, c.width / 2, c.height / 2);
  g.fillStyle = fill;
  g.fillText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  // Pulled further toward the camera than the mat (padMat's polygon offset), or the mat hides part of the caption.
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  me.rotation.x = -Math.PI / 2;
  me.position.y = 0.08;
  return me;
}

/**
 * A floor zone with a caption painted inside (MILL, SELL, OPEN…).
 * Pure geometry + a point-in-square test; the owner decides what standing on it does.
 */
export class Zone {
  readonly root = new THREE.Group();
  private fill: THREE.Mesh;
  private caption: THREE.Mesh | null = null;
  private fillK = 0;
  private style: "work" | "door";

  constructor(
    parent: THREE.Object3D,
    readonly center: THREE.Vector3,
    readonly size: number,
    text: string,
    color = 0xffffff,
  ) {
    this.style = WORK.has(text) ? "work" : "door";
    let mat = padMat;
    if (color !== 0xffffff) {
      mat = tinted.get(color) ?? padMat.clone();
      mat.color.setHex(color);
      tinted.set(color, mat);
    }
    const pad = new THREE.Mesh(GEO[this.style], mat);
    pad.scale.setScalar(size * 1.06);
    pad.position.y = 0.03;
    pad.receiveShadow = true;
    this.root.add(pad);
    // Hold-to-activate progress: a soft green square growing from the middle.
    this.fill = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.72, size * 0.72).rotateX(-Math.PI / 2), fillMat);
    this.fill.position.y = 0.05;
    this.fill.scale.set(0.001, 1, 0.001);
    this.root.add(this.fill);
    if (text) this.setText(text);
    this.root.position.copy(center);
    parent.add(this.root);
  }

  setText(text: string, color?: string): void {
    if (this.caption) {
      this.root.remove(this.caption);
      (this.caption.material as THREE.MeshBasicMaterial).map?.dispose();
    }
    const work = this.style === "work";
    this.caption = caption(text, this.size * 0.74, this.size * 0.32, color ?? (work ? "#fff6dc" : "#5a3418"), work ? "#5a3418" : "rgba(255,248,230,0.9)");
    this.root.add(this.caption);
  }

  contains(p: THREE.Vector3, grow = 0): boolean {
    const h = this.size / 2 + grow;
    return Math.abs(p.x - this.center.x) <= h && Math.abs(p.z - this.center.z) <= h;
  }

  /** Progress fill 0..1 (hold-to-activate pads). */
  setFill(k: number): void {
    this.fillK = Math.max(0, Math.min(1, k));
    const s = Math.max(0.001, this.fillK);
    this.fill.scale.set(s, 1, s);
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }
}

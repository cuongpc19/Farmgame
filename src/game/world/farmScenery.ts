import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { THEME, rng } from "../theme";

/**
 * Farm scenery (Farm Valley, 2026-10-28; replaced Candy Miner's candyScenery.ts): the yard's hay, crates, sacks,
 * barrels, woodpiles and trough, the wooden lamps and fences, the rocky hills (cliff tiles and the stage 9 knoll),
 * bushes, flowers and reeds round the plot, and the boost pickup. Everything is drawn here (no image files), smooth
 * shaded (not low-poly facets), and built so that many copies cost one draw call: `tintedMaterial` lets one
 * InstancedMesh carry a two-colour prop (each part takes the instance colour, a second per-instance colour, or its
 * own fixed colour) with an optional shading pattern (planks, straw, burlap) on chosen parts.
 */

/** Which colour a part takes: its own (FIXED), the instance colour (A) or the second instance colour (B). */
export const FIXED = 0;
export const A = 1;
export const B = 2;
/** Add to A / B: the part also shows the material's pattern. */
export const PATTERN = 3;

export interface Part {
  geo: THREE.BufferGeometry;
  tint: number;
  color: number;
}

export const part = (geo: THREE.BufferGeometry, tint: number, color = 0xffffff): Part => ({ geo, tint, color });

const rbox = (w: number, h: number, d: number, r = 0.06, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.99);

/** Merge parts into one geometry with `color` (own colour) and `tint` (which colour slot) per vertex. */
export function mergeParts(parts: Part[]): THREE.BufferGeometry {
  const indexed = parts.every((p) => p.geo.index);
  const geos = parts.map((p) => {
    const g = indexed ? p.geo.clone() : p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = new THREE.Color(p.color);
    const col = new Float32Array(n * 3);
    const tint = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      tint[i] = p.tint;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("tint", new THREE.BufferAttribute(tint, 1));
    return g;
  });
  const merged = mergeGeometries(geos)!;
  for (const g of geos) g.dispose();
  for (const p of parts) p.geo.dispose();
  return merged;
}

/** UVs from positions (period = metres per texture repeat), by each face's main axis: patterns keep their size on long faces. */
export function planarUVs(geo: THREE.BufferGeometry, period: number): THREE.BufferGeometry {
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    const [u, v] = ny >= nx && ny >= nz ? [pos.getX(i), pos.getZ(i)] : nx >= nz ? [pos.getZ(i), pos.getY(i)] : [pos.getX(i), pos.getY(i)];
    uv[i * 2] = u / period;
    uv[i * 2 + 1] = v / period;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** A pattern mask: red = how light (0 keeps the colour), green = shade (1 = none). Linear, repeating. */
function maskTexture(draw: (g: CanvasRenderingContext2D, S: number, r: () => number) => void, seed = 3): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgb(0,255,0)";
  g.fillRect(0, 0, S, S);
  draw(g, S, rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const masks: Record<string, () => THREE.CanvasTexture> = {
  /** Horizontal boards, four per repeat: soft dark seams and a little grain (crates, troughs). */
  planks: () =>
    maskTexture((g, S, r) => {
      for (let i = 0; i < 4; i++) {
        const y = (i * S) / 4;
        g.fillStyle = "rgb(0,150,0)";
        g.fillRect(0, y, S, 3);
        g.fillStyle = "rgb(0,205,0)";
        g.fillRect(0, y + 3, S, 2);
        for (let k = 0; k < 5; k++) {
          g.fillStyle = r() < 0.5 ? "rgb(0,225,0)" : "rgb(40,255,0)";
          g.fillRect(r() * S, y + 7 + r() * (S / 4 - 12), 18 + r() * 30, 1.5);
        }
      }
    }),
  /** Vertical staves (barrels): u runs round the barrel. */
  staves: () =>
    maskTexture((g, S) => {
      for (let i = 0; i < 4; i++) {
        g.fillStyle = "rgb(0,160,0)";
        g.fillRect((i * S) / 4, 0, 3, S);
        g.fillStyle = "rgb(30,255,0)";
        g.fillRect((i * S) / 4 + 6, 0, 3, S);
      }
    }),
  /** Straw (hay): short light and dark streaks along u. */
  straw: () =>
    maskTexture((g, S, r) => {
      for (let i = 0; i < 260; i++) {
        const x = r() * S;
        const y = r() * S;
        const len = 8 + r() * 20;
        g.fillStyle = r() < 0.5 ? "rgb(110,255,0)" : "rgb(0,180,0)";
        const tilt = (r() - 0.5) * 0.5;
        // Drawn again across the edges so the mask tiles.
        for (const ox of [-S, 0, S]) {
          g.save();
          g.translate(x + ox, y);
          g.rotate(tilt);
          g.fillRect(-len / 2, -1, len, 2);
          g.restore();
        }
      }
    }, 9),
  /** Burlap weave (sacks): a fine checker of slightly darker threads. */
  weave: () =>
    maskTexture((g, S) => {
      for (let y = 0; y < S; y += 4)
        for (let x = 0; x < S; x += 4) {
          g.fillStyle = (x + y) % 8 ? "rgb(0,215,0)" : "rgb(25,255,0)";
          g.fillRect(x, y, 3, 3);
        }
    }),
};

const tinted = new Map<string, THREE.MeshPhongMaterial>();

/**
 * Material for `mergeParts` geometry drawn as an InstancedMesh: each vertex takes its own colour times the instance
 * colour (A), the `instanceColor2` attribute (B) or nothing (FIXED); parts marked PATTERN get the pattern.
 */
export function tintedMaterial(pattern: keyof typeof masks | null, shininess = 12): THREE.MeshPhongMaterial {
  const key = `${pattern}|${shininess}`;
  let m = tinted.get(key);
  if (m) return m;
  m = new THREE.MeshPhongMaterial({ vertexColors: true, shininess, specular: 0x1a1a1a, map: pattern ? masks[pattern]() : null });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader =
      "attribute float tint;\nattribute vec3 instanceColor2;\nvarying float vPattern;\n" +
      sh.vertexShader.replace(
        "#include <color_vertex>",
        `vColor = vec4(1.0);
#ifdef USE_COLOR
  vColor.rgb *= color;
#endif
  vPattern = step(2.5, tint);
  float tk = tint - vPattern * 3.0;
#ifdef USE_INSTANCING_COLOR
  vColor.rgb *= tk < 0.5 ? vec3(1.0) : (tk < 1.5 ? instanceColor.rgb : instanceColor2);
#endif`,
      );
    sh.fragmentShader =
      "varying float vPattern;\n" +
      sh.fragmentShader
        .replace("#include <map_fragment>", "#ifdef USE_MAP\n  vec4 farmMask = texture2D(map, vMapUv);\n#endif")
        .replace(
          "#include <color_fragment>",
          "#include <color_fragment>\n#ifdef USE_MAP\n  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.35 + 0.05, farmMask.r * vPattern) * mix(1.0, farmMask.g, vPattern);\n#endif",
        );
  };
  tinted.set(key, m);
  return m;
}

/** An InstancedMesh for `tintedMaterial`: one matrix, colour A and colour B per copy. */
export function tintedInstances(geo: THREE.BufferGeometry, material: THREE.Material, list: { m: THREE.Matrix4; a: number; b: number }[]): THREE.InstancedMesh | null {
  if (!list.length) return null;
  const second = new Float32Array(list.length * 3);
  geo.setAttribute("instanceColor2", new THREE.InstancedBufferAttribute(second, 3));
  const mesh = new THREE.InstancedMesh(geo, material, list.length);
  const c = new THREE.Color();
  list.forEach((it, i) => {
    mesh.setMatrixAt(i, it.m);
    mesh.setColorAt(i, c.setHex(it.a));
    c.setHex(it.b);
    second[i * 3] = c.r;
    second[i * 3 + 1] = c.g;
    second[i * 3 + 2] = c.b;
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------------------------------------------
// Yard pieces (world/yard.ts). Base at y 0, centred on x / z. Each geometry is built once per page.

/** A rectangular hay bale l x h x w along x: straw (A + pattern), two twine bands (B). */
export function haybaleGeometry(l = 1.6, h = 0.8, w = 1.0): THREE.BufferGeometry {
  const body = rbox(l, h, w, 0.16, 1);
  body.translate(0, h / 2, 0);
  const parts: Part[] = [part(planarUVs(body, 0.9), A + PATTERN)];
  for (const x of [-l * 0.27, l * 0.27]) {
    const band = new THREE.BoxGeometry(0.07, h + 0.02, w + 0.02);
    band.translate(x, h / 2, 0);
    parts.push(part(band, B));
  }
  return mergeParts(parts);
}

/** A round hay bale lying along x: straw roll (A + pattern), lighter spiral ends, net bands (B). */
export function roundBaleGeometry(r = 0.72, l = 1.25): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(r, r, l, 22, 1, true);
  body.rotateZ(Math.PI / 2);
  body.translate(0, r, 0);
  const parts: Part[] = [part(planarUVs(body, 0.7), A + PATTERN)];
  for (const s of [-1, 1]) {
    // Ends: a slightly domed disc, lighter, with a darker ring (the spiral seen from the side).
    const end = new THREE.CircleGeometry(r * 0.98, 22);
    end.rotateY((s * Math.PI) / 2);
    end.translate((s * l) / 2, r, 0);
    parts.push(part(end, A, 0xfff1c8));
    const ring = new THREE.TorusGeometry(r * 0.55, 0.035, 4, 16);
    ring.rotateY(Math.PI / 2);
    ring.translate((s * l) / 2 + s * 0.01, r, 0);
    parts.push(part(ring, A, 0xb89a5a));
  }
  for (const x of [-l * 0.3, 0, l * 0.3]) {
    const band = new THREE.TorusGeometry(r + 0.01, 0.025, 4, 20);
    band.rotateY(Math.PI / 2);
    band.translate(x, r, 0);
    parts.push(part(band, B));
  }
  return mergeParts(parts);
}

/**
 * A rice-straw stack round a pole, as they stand in paddy villages: a bulging dome of straw (A + pattern), a little
 * cap and the pole's tip (fixed wood).
 */
export function haystackGeometry(): THREE.BufferGeometry {
  const prof = [
    [0.0, 0.0], [0.82, 0.0], [0.98, 0.25], [1.02, 0.6], [0.92, 1.05], [0.68, 1.5], [0.38, 1.88], [0.12, 2.1], [0.0, 2.14],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const dome = new THREE.LatheGeometry(prof, 18);
  const parts: Part[] = [part(planarUVs(dome, 0.8), A + PATTERN)];
  const cap = new THREE.ConeGeometry(0.26, 0.32, 10);
  cap.translate(0, 2.18, 0);
  parts.push(part(cap, A, 0xd8c08a));
  const pole = new THREE.CylinderGeometry(0.05, 0.06, 0.6, 6);
  pole.translate(0, 2.45, 0);
  parts.push(part(pole, FIXED, 0x6e4a28));
  return mergeParts(parts);
}

/** A woodpile along x (length l): logs in rows of 4, 3, 2 (bark A), cut ends (fixed pale wood). */
export function woodpileGeometry(l = 2.6): THREE.BufferGeometry {
  const parts: Part[] = [];
  const r = 0.22;
  const rows = [4, 3, 2];
  rows.forEach((n, row) => {
    for (let i = 0; i < n; i++) {
      const z = (i - (n - 1) / 2) * r * 2.02;
      const y = r + row * r * 1.72;
      const jit = ((i * 7 + row * 3) % 5) * 0.03 - 0.06;
      const log = new THREE.CylinderGeometry(r, r, l + jit, 12, 1, true);
      log.rotateZ(Math.PI / 2);
      log.translate(jit, y, z);
      parts.push(part(log, A));
      for (const s of [-1, 1]) {
        const end = new THREE.CircleGeometry(r * 0.98, 12);
        end.rotateY((s * Math.PI) / 2);
        end.translate(jit + (s * (l + jit)) / 2, y, z);
        parts.push(part(end, FIXED, 0xe9c48a));
        const ring = new THREE.CircleGeometry(r * 0.45, 10);
        ring.rotateY((s * Math.PI) / 2);
        ring.translate(jit + (s * (l + jit)) / 2 + s * 0.005, y, z);
        parts.push(part(ring, FIXED, 0xd4a868));
      }
    }
  });
  return mergeParts(parts);
}

/** A wooden crate of produce: slatted box (A + planks), a heap of round produce on top (B) with green tops. */
export function crateGeometry(): THREE.BufferGeometry {
  const W = 1.05;
  const H = 0.6;
  const D = 0.78;
  const parts: Part[] = [];
  const box = new THREE.BoxGeometry(W, H, D);
  box.translate(0, H / 2, 0);
  parts.push(part(planarUVs(box, 0.6), A + PATTERN));
  // Corner posts a shade darker.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const post = new THREE.BoxGeometry(0.08, H + 0.02, 0.08);
      post.translate((sx * W) / 2, H / 2, (sz * D) / 2);
      parts.push(part(post, A, 0xc8c8c8));
    }
  // Produce: 3 x 2 below, 2 on top.
  const pr = 0.18;
  const at: [number, number, number][] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) at.push([(i - 1) * pr * 2.05, H + pr * 0.55, (j - 0.5) * pr * 2.1]);
  at.push([0, H + pr * 1.85, 0]);
  at.forEach(([x, y, z], i) => {
    const s = new THREE.SphereGeometry(pr * (0.95 + (i % 3) * 0.05), 8, 5);
    s.scale(1, 0.9, 1);
    s.translate(x, y, z);
    parts.push(part(s, B));
    const leaf = new THREE.ConeGeometry(0.05, 0.08, 4);
    leaf.translate(x, y + pr * 0.92, z);
    parts.push(part(leaf, FIXED, 0x4f9a3a));
  });
  return mergeParts(parts);
}

/** A burlap sack, tied at the neck: sack (A + weave), twine (B). About 1.0 tall. */
export function sackGeometry(): THREE.BufferGeometry {
  const prof = [
    [0.0, 0.0], [0.34, 0.0], [0.42, 0.08], [0.45, 0.32], [0.42, 0.58], [0.3, 0.76], [0.12, 0.86], [0.1, 0.9], [0.17, 1.0], [0.0, 1.02],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const sack = new THREE.LatheGeometry(prof, 16);
  sack.scale(1, 1, 0.82);
  const parts: Part[] = [part(planarUVs(sack, 0.5), A + PATTERN)];
  const tie = new THREE.TorusGeometry(0.11, 0.035, 6, 12);
  tie.rotateX(Math.PI / 2);
  tie.translate(0, 0.88, 0);
  parts.push(part(tie, B));
  return mergeParts(parts);
}

/** A wooden barrel: bulging staves (A + staves), two iron hoops and the lid (fixed). About 1.0 tall. */
export function barrelGeometry(): THREE.BufferGeometry {
  const prof = [[0.0, 0.0], [0.36, 0.0], [0.42, 0.25], [0.45, 0.5], [0.42, 0.75], [0.36, 1.0], [0.0, 1.0]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.LatheGeometry(prof, 18);
  // Lathe u runs round once: three repeats of the four-stave mask = 12 staves.
  const uv = body.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 3);
  const parts: Part[] = [part(body, A + PATTERN)];
  for (const [y, r] of [[0.18, 0.415], [0.82, 0.415]] as const) {
    const hoop = new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.07, 18, 1, true);
    hoop.translate(0, y, 0);
    parts.push(part(hoop, FIXED, 0x5a5550));
  }
  const lid = new THREE.CylinderGeometry(0.34, 0.34, 0.03, 16);
  lid.translate(0, 0.985, 0);
  parts.push(part(lid, A, 0xd8b890));
  return mergeParts(parts);
}

/** A wooden water trough on legs, along x: boards (A + planks), water (fixed blue). */
export function troughGeometry(): THREE.BufferGeometry {
  const L = 2.2;
  const W = 0.8;
  const H = 0.55;
  const y0 = 0.18;
  const parts: Part[] = [];
  const add = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const b = new THREE.BoxGeometry(w, h, d);
    b.translate(x, y, z);
    parts.push(part(planarUVs(b, 0.55), A + PATTERN));
  };
  add(L, 0.08, W, 0, y0 + 0.04, 0);
  for (const s of [-1, 1]) add(L, H, 0.08, 0, y0 + H / 2, (s * (W - 0.08)) / 2);
  for (const s of [-1, 1]) add(0.08, H, W, (s * (L - 0.08)) / 2, y0 + H / 2, 0);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = new THREE.BoxGeometry(0.1, y0, 0.1);
      leg.translate(sx * (L / 2 - 0.15), y0 / 2, sz * (W / 2 - 0.12));
      parts.push(part(leg, A, 0xb0b0b0));
    }
  const water = new THREE.PlaneGeometry(L - 0.16, W - 0.16);
  water.rotateX(-Math.PI / 2);
  water.translate(0, y0 + H - 0.1, 0);
  parts.push(part(water, FIXED, 0x5cc0e8));
  return mergeParts(parts);
}

// ---------------------------------------------------------------------------------------------------------------
// Round the plot (MapView): bushes with flowers, small rocks, reeds by the water.

/** A round bush (A, lighter on top) with a few flowers in it (B). Base at y 0, about 1.1 tall. */
export function bushGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const r = rng(23);
  const balls: [number, number, number, number][] = [[0, 0.55, 0, 0.62], [0.5, 0.42, 0.1, 0.45], [-0.48, 0.4, -0.05, 0.48], [0.05, 0.38, 0.42, 0.44]];
  for (const [x, y, z, rad] of balls) {
    const s = new THREE.SphereGeometry(rad, 9, 6);
    s.translate(x, y, z);
    parts.push(part(s, A));
  }
  for (let k = 0; k < 5; k++) {
    const a = r() * Math.PI * 2;
    const b = 0.3 + r() * 0.9;
    const [bx, by, bz, br] = balls[k % balls.length];
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(b), Math.cos(b), Math.sin(a) * Math.sin(b));
    const f = new THREE.SphereGeometry(0.075, 6, 4);
    f.translate(bx + dir.x * br, by + dir.y * br, bz + dir.z * br);
    parts.push(part(f, B));
  }
  const geo = mergeParts(parts);
  // Lighter toward the top: the leaves' own colour from their normals (times the instance green).
  const n = geo.getAttribute("normal");
  const c = geo.getAttribute("color");
  const t = geo.getAttribute("tint");
  for (let i = 0; i < n.count; i++) {
    if (t.getX(i) !== A) continue;
    const k = 0.8 + Math.max(0, n.getY(i)) * 0.3;
    c.setXYZ(i, k, k, k);
  }
  return geo;
}

/** Reeds and cattails for the water's edge: green blades (fixed) and brown heads (fixed). */
export function reedGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const r = rng(61);
  for (let k = 0; k < 7; k++) {
    const h = 0.9 + r() * 0.7;
    const blade = new THREE.ConeGeometry(0.05, h, 4);
    blade.translate(0, h / 2, 0);
    blade.rotateZ((r() - 0.5) * 0.5);
    blade.rotateX((r() - 0.5) * 0.4);
    blade.translate((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5);
    parts.push(part(blade, FIXED, r() < 0.5 ? 0x5e9e3a : 0x78b04a));
  }
  for (let k = 0; k < 3; k++) {
    const h = 1.2 + r() * 0.5;
    const x = (r() - 0.5) * 0.4;
    const z = (r() - 0.5) * 0.4;
    const stem = new THREE.CylinderGeometry(0.018, 0.022, h, 4);
    stem.translate(x, h / 2, z);
    parts.push(part(stem, FIXED, 0x6a9a3a));
    const head = new THREE.CylinderGeometry(0.06, 0.06, 0.24, 6);
    head.translate(x, h + 0.04, z);
    parts.push(part(head, FIXED, 0x7a4a2a));
  }
  return mergeParts(parts);
}

/**
 * A rounded, lumpy rock in a unit box (x / z −0.5..0.5, y 0..1): grey, darker low down, moss on what faces up. Its
 * colours are vertex colours; an InstancedMesh's instance colour tints it per copy. `seed` changes the lumps.
 */
export function rockGeometry(seed = 1, moss = true, wSeg = 12, hSeg = 9): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.SphereGeometry(0.5, wSeg, hSeg);
  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  g = mergeVertices(g);
  const pos = g.getAttribute("position");
  const v = new THREE.Vector3();
  const a = seed * 1.7;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).multiplyScalar(2);
    // Boxier than a ball, then lumps.
    const sx = Math.sign(v.x) * Math.pow(Math.abs(v.x), 0.7);
    const sy = Math.sign(v.y) * Math.pow(Math.abs(v.y), 0.8);
    const sz = Math.sign(v.z) * Math.pow(Math.abs(v.z), 0.7);
    const lump = 1 + 0.1 * Math.sin(3.1 * v.x + a) * Math.cos(2.7 * v.z - a * 0.6) + 0.07 * Math.sin(4.3 * v.y + 2.1 * v.x + a * 1.3) + 0.04 * Math.sin(7 * v.z + 5 * v.y + a);
    v.set(sx * 0.5 * lump, sy * 0.5 * lump, sz * 0.5 * lump);
    // Sit on y 0: flatten what would go below, a slightly flattened top.
    v.y = Math.max(-0.47, v.y) + 0.5;
    if (v.y > 0.9) v.y = 0.9 + (v.y - 0.9) * 0.6;
    pos.setXYZ(i, v.x, v.y / 0.96, v.z);
  }
  g.computeVertexNormals();
  const n = g.getAttribute("normal");
  const col = new Float32Array(pos.count * 3);
  const grey = new THREE.Color(THEME.rock);
  const dark = new THREE.Color(THEME.rockDark);
  const green = new THREE.Color(THEME.moss);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const speck = 0.5 + 0.5 * Math.sin(pos.getX(i) * 23 + pos.getZ(i) * 17 + y * 11 + a);
    c.copy(dark).lerp(grey, Math.min(1, y * 1.6)).multiplyScalar(0.94 + speck * 0.1);
    if (moss) {
      const m = THREE.MathUtils.smoothstep(n.getY(i), 0.72, 0.95);
      c.lerp(green, m * 0.9);
    }
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/** Shared material for vertex-coloured, instance-tinted rocks. */
let rockMat: THREE.MeshLambertMaterial | null = null;
export function rockMaterial(): THREE.MeshLambertMaterial {
  return (rockMat ??= new THREE.MeshLambertMaterial({ vertexColors: true }));
}

/**
 * The stage 9 knoll as a rocky hill: big grey boulders with moss on top, a grassy crown and a few bushes.
 * `w` / `h` are the prop's footprint in metres. Vertex-coloured Lambert meshes: the caller bakes them.
 */
export function rockyKnoll(w: number, h: number): THREE.Group {
  const knoll = new THREE.Group();
  const m = rockMaterial();
  const r = rng(19);
  const lumps: [number, number, number, number, number][] = [
    [0, 0, 1, 1, 6.5],
    [-0.3, 0.22, 0.62, 0.7, 4.6],
    [0.32, -0.2, 0.66, 0.62, 4.2],
    [0.08, 0.34, 0.55, 0.6, 5.2],
    [-0.36, -0.28, 0.4, 0.45, 2.6],
    [0.4, 0.3, 0.38, 0.4, 2.4],
  ];
  lumps.forEach(([ox, oz, sx, sz, H], i) => {
    const geo = rockGeometry(i + 3, true, 16, 12);
    const me = new THREE.Mesh(geo, m);
    me.scale.set(w * 0.8 * sx, H, h * 0.8 * sz);
    me.position.set(ox * w * 0.42, -0.3, oz * h * 0.42);
    me.rotation.y = r() * Math.PI * 2;
    me.castShadow = me.receiveShadow = true;
    knoll.add(me);
  });
  // Bushes round the foot (plain green balls, baked by the caller).
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + r();
    const rad = 0.5 + r() * 0.5;
    const b = new THREE.Mesh(new THREE.SphereGeometry(rad, 12, 9), new THREE.MeshLambertMaterial({ color: THEME.bushes[k % THEME.bushes.length] }));
    b.position.set(Math.cos(a) * w * 0.46, rad * 0.6, Math.sin(a) * h * 0.46);
    b.castShadow = true;
    knoll.add(b);
  }
  return knoll;
}

// ---------------------------------------------------------------------------------------------------------------
// Street furniture (MapView): plain Lambert parts, baked by the caller (`bakeColors`).

const lam = new Map<string, THREE.MeshLambertMaterial>();
function plain(color: number, emissive = 0, opacity = 1): THREE.MeshLambertMaterial {
  const key = `${color}|${emissive}|${opacity}`;
  let m = lam.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, emissive, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    lam.set(key, m);
  }
  return m;
}

function put(g: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y, z);
  me.castShadow = shadow;
  g.add(me);
  return me;
}

/**
 * A wooden lamp post, 3.3 tall, on a few stones: a crossbar out along +x holds an iron lantern with a warm glow and
 * a soft halo (the old lamp's bulb hung ~0.8 out along +x too).
 */
export function farmLamp(): THREE.Group {
  const g = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const s = new THREE.SphereGeometry(0.17, 8, 6);
    s.scale(1, 0.65, 1);
    put(g, s, plain(k % 2 ? 0x9a968e : 0x86827a), Math.cos(a) * 0.2, 0.06, Math.sin(a) * 0.2);
  }
  put(g, new THREE.CylinderGeometry(0.09, 0.12, 3.3, 10), plain(THEME.wood), 0, 1.65, 0);
  put(g, new THREE.SphereGeometry(0.12, 10, 8), plain(THEME.woodDark), 0, 3.32, 0);
  put(g, rbox(1.05, 0.12, 0.12, 0.04), plain(THEME.woodDark), 0.42, 3.05, 0);
  const brace = put(g, rbox(0.5, 0.08, 0.08, 0.03), plain(THEME.woodDark), 0.2, 2.82, 0);
  brace.rotation.z = 0.75;
  // Hanger, the lantern: iron cap and base, glowing glass, a ring on top.
  put(g, new THREE.CylinderGeometry(0.015, 0.015, 0.2, 4), plain(0x3a3632), 0.82, 2.92, 0, false);
  put(g, new THREE.ConeGeometry(0.24, 0.2, 10), plain(0x3a3632), 0.82, 2.76, 0);
  put(g, new THREE.CylinderGeometry(0.15, 0.13, 0.36, 10), plain(THEME.lantern, THEME.lanternGlow), 0.82, 2.48, 0, false);
  put(g, new THREE.CylinderGeometry(0.17, 0.17, 0.06, 10), plain(0x3a3632), 0.82, 2.28, 0);
  put(g, new THREE.SphereGeometry(0.5, 12, 9), plain(0xffd27a, 0xffa53a, 0.22), 0.82, 2.48, 0, false);
  return g;
}

/** A stretch of wooden rail fence along local x (as long as the old barrier, 0.9 * cell): three posts, two rails. */
export function woodFence(len: number): THREE.Group {
  const g = new THREE.Group();
  const half = len / 2 - 0.12;
  for (const x of [-half, 0, half]) {
    put(g, new THREE.CylinderGeometry(0.09, 0.1, 1.15, 8), plain(THEME.wood), x, 0.575, 0);
    put(g, new THREE.SphereGeometry(0.095, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), plain(THEME.wood), x, 1.15, 0);
  }
  for (const [y, tone] of [[0.48, THEME.woodLight], [0.88, THEME.woodLight]] as const) {
    const rail = put(g, rbox(half * 2 + 0.2, 0.13, 0.07, 0.03), plain(tone), 0, y, 0.06);
    rail.rotation.z = y < 0.6 ? 0.012 : -0.01;
  }
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// The boost / gift pickup (systems/Boosts.ts): a seed sack tied with a ribbon in the boost's colour.

/** Vertex colours for a whole geometry. */
function paint(geo: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) (col[i * 3] = c.r), (col[i * 3 + 1] = c.g), (col[i * 3 + 2] = c.b);
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

const pickups = new Map<number, { geo: THREE.BufferGeometry; m: THREE.MeshPhongMaterial }>();

/**
 * A plump seed sack about as big as the old boost canister (~1.4 tall, 0.46 wide), centred on its middle: burlap,
 * a ribbon round the neck in the boost colour with a big bow in front, golden seeds and a sprout peeking out of the
 * top. It glows a little in its colour.
 */
export function boostPickupMesh(color: number): THREE.Mesh {
  let c = pickups.get(color);
  if (!c) {
    const geos: THREE.BufferGeometry[] = [];
    const prof = [
      [0.0, 0.0], [0.38, 0.0], [0.5, 0.12], [0.55, 0.38], [0.5, 0.64], [0.36, 0.82], [0.2, 0.9], [0.18, 0.94], [0.3, 1.04], [0.32, 1.08], [0.0, 1.06],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const sack = new THREE.LatheGeometry(prof, 20);
    sack.scale(1, 1, 0.86);
    geos.push(paint(sack, 0xd8b47a));
    // Seeds heaped in the open mouth.
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const s = new THREE.SphereGeometry(0.075, 8, 6);
      s.scale(1, 0.7, 1);
      s.translate(Math.cos(a) * 0.16, 1.07, Math.sin(a) * 0.14);
      geos.push(paint(s, 0xf2c84b));
    }
    const top = new THREE.SphereGeometry(0.1, 8, 6);
    top.translate(0, 1.12, 0);
    geos.push(paint(top, 0xf2c84b));
    // A sprout: stem and two leaves.
    const stem = new THREE.CylinderGeometry(0.02, 0.025, 0.28, 5);
    stem.translate(0, 1.26, 0);
    geos.push(paint(stem, 0x4f9a3a));
    for (const s of [-1, 1]) {
      const leaf = new THREE.SphereGeometry(0.1, 10, 6);
      leaf.scale(1.6, 0.35, 0.8);
      leaf.rotateZ(s * 0.5);
      leaf.translate(s * 0.13, 1.4, 0);
      geos.push(paint(leaf, 0x6cc04a));
    }
    // Ribbon round the neck and a bow in front, in the boost colour.
    const band = new THREE.TorusGeometry(0.205, 0.045, 8, 20);
    band.rotateX(Math.PI / 2);
    band.scale(1, 1, 0.86);
    band.translate(0, 0.92, 0);
    geos.push(paint(band, color));
    for (const s of [-1, 1]) {
      const loop = new THREE.TorusGeometry(0.13, 0.045, 8, 14);
      loop.scale(1.25, 0.8, 1);
      loop.translate(s * 0.15, 0.95, 0.2);
      geos.push(paint(loop, color));
      const tail = new THREE.BoxGeometry(0.08, 0.3, 0.03);
      tail.rotateZ(s * 0.35);
      tail.translate(s * 0.08, 0.76, 0.21);
      geos.push(paint(tail, color));
    }
    const knot = new THREE.SphereGeometry(0.07, 10, 8);
    knot.translate(0, 0.94, 0.22);
    geos.push(paint(knot, color));
    // A stitched patch on the front: a lighter square with a seed drawn on it.
    const patch = new THREE.BoxGeometry(0.34, 0.3, 0.03);
    patch.translate(0, 0.42, 0.47);
    geos.push(paint(patch, 0xf1dcb0));
    const seed = new THREE.SphereGeometry(0.08, 10, 8);
    seed.scale(0.75, 1.1, 0.3);
    seed.translate(0, 0.43, 0.49);
    geos.push(paint(seed, color));
    const geo = mergeGeometries(geos)!;
    for (const g of geos) g.dispose();
    geo.translate(0, -0.62, 0);
    const m = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 18, specular: 0x222222, emissive: color, emissiveIntensity: 0.14 });
    c = { geo, m };
    pickups.set(color, c);
  }
  const mesh = new THREE.Mesh(c.geo, c.m);
  mesh.castShadow = true;
  return mesh;
}

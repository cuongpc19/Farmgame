import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rng } from "../theme";

/**
 * Candy scenery helpers (Candy Miner, 2026-10-28): the yard's gift boxes, macarons and candy tubs, the candy-cane
 * lamps and fence, the chocolate cliffs and knoll. Everything is drawn here (no image files) and built so that many
 * copies cost one draw call: `tintedMaterial` lets one InstancedMesh carry a two-colour candy (each part takes the
 * instance colour, a second per-instance colour, or its own fixed colour) with an optional white pattern (dots,
 * stripes, a swirl) on chosen parts.
 */

/** Which colour a part takes: its own (FIXED), the instance colour (A) or the second instance colour (B). */
export const FIXED = 0;
export const A = 1;
export const B = 2;
/** Add to A / B: the part also shows the material's white pattern. */
export const PATTERN = 3;

export interface Part {
  geo: THREE.BufferGeometry;
  tint: number;
  color: number;
}

export const part = (geo: THREE.BufferGeometry, tint: number, color = 0xffffff): Part => ({ geo, tint, color });

/** Merge parts into one geometry with `color` (own colour) and `tint` (which colour slot) per vertex. */
export function mergeParts(parts: Part[]): THREE.BufferGeometry {
  const indexed = parts.every((p) => p.geo.index);
  const geos = parts.map((p) => {
    const g = indexed ? p.geo.clone() : p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
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

/** A pattern mask: red = how white (0 keeps the candy's colour), green = shade (1 = none). Linear, repeating. */
function maskTexture(draw: (g: CanvasRenderingContext2D, S: number) => void): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgb(0,255,0)";
  g.fillRect(0, 0, S, S);
  draw(g, S);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const masks: Record<string, () => THREE.CanvasTexture> = {
  /** Polka dots (gift wrap). */
  dots: () =>
    maskTexture((g, S) => {
      g.fillStyle = "rgb(255,255,0)";
      for (const [x, y] of [[0, 0], [S, 0], [0, S], [S, S], [S / 2, S / 2]]) {
        g.beginPath();
        g.arc(x, y, S * 0.13, 0, Math.PI * 2);
        g.fill();
      }
    }),
  /** Vertical stripes, four per repeat (tubs, wrappers). */
  stripes: () =>
    maskTexture((g, S) => {
      g.fillStyle = "rgb(255,255,0)";
      for (let i = 0; i < 4; i++) g.fillRect((i * S) / 4, 0, S / 8, S);
    }),
  /** Diagonal stripes, seamless (wrapped candies). */
  swirl: () =>
    maskTexture((g, S) => {
      g.fillStyle = "rgb(255,255,0)";
      for (let i = -2; i < 4; i++) {
        g.beginPath();
        const x = (i * S) / 2;
        g.moveTo(x, 0);
        g.lineTo(x + S / 5, 0);
        g.lineTo(x + S / 5 + S, S);
        g.lineTo(x + S, S);
        g.closePath();
        g.fill();
      }
    }),
};

const tinted = new Map<string, THREE.MeshPhongMaterial>();

/**
 * Material for `mergeParts` geometry drawn as an InstancedMesh: each vertex takes its own colour times the instance
 * colour (A), the `instanceColor2` attribute (B) or nothing (FIXED); parts marked PATTERN get the white pattern.
 */
export function tintedMaterial(pattern: keyof typeof masks | null, shininess = 40): THREE.MeshPhongMaterial {
  const key = `${pattern}|${shininess}`;
  let m = tinted.get(key);
  if (m) return m;
  m = new THREE.MeshPhongMaterial({ vertexColors: true, shininess, specular: 0x2a2a2a, map: pattern ? masks[pattern]() : null });
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
        .replace("#include <map_fragment>", "#ifdef USE_MAP\n  vec4 candyMask = texture2D(map, vMapUv);\n#endif")
        .replace(
          "#include <color_fragment>",
          "#include <color_fragment>\n#ifdef USE_MAP\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97), candyMask.r * vPattern) * mix(1.0, candyMask.g, vPattern);\n#endif",
        );
  };
  tinted.set(key, m);
  return m;
}

/** An InstancedMesh for `tintedMaterial`: `put(matrix, colourA, colourB)` per copy. */
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
// Yard pieces (world/yard.ts). Each geometry is built once per page.

/** A wrapped gift box, l x h x w, centred: dotted box and lid (A), ribbon cross and a four-loop bow on top (B). */
export function giftGeometry(l: number, h: number, w: number): THREE.BufferGeometry {
  const parts: Part[] = [];
  const lidH = 0.5;
  const body = new THREE.BoxGeometry(l, h - lidH + 0.05, w);
  body.translate(0, -lidH / 2 + 0.025, 0);
  parts.push(part(planarUVs(body, 1.4), A + PATTERN));
  const lid = new THREE.BoxGeometry(l + 0.18, lidH, w + 0.18);
  lid.translate(0, h / 2 - lidH / 2, 0);
  parts.push(part(planarUVs(lid, 1.4), A + PATTERN));
  // Ribbon round both ways.
  const rib = 0.5;
  parts.push(part(new THREE.BoxGeometry(rib, h + 0.06, w + 0.24), B));
  parts.push(part(new THREE.BoxGeometry(l + 0.24, h + 0.06, rib), B));
  // The bow: four puffy loops on the diagonals, a knot and two tails.
  const top = h / 2 + 0.03;
  for (let k = 0; k < 4; k++) {
    const loop = new THREE.TorusGeometry(0.42, 0.13, 8, 18);
    loop.scale(1, 1, 1.9);
    loop.rotateZ(-0.55);
    loop.translate(0.42, top + 0.3, 0);
    loop.rotateY(Math.PI / 4 + (k * Math.PI) / 2);
    parts.push(part(loop, B));
  }
  const knot = new THREE.SphereGeometry(0.22, 12, 8);
  knot.scale(1, 0.8, 1);
  knot.translate(0, top + 0.14, 0);
  parts.push(part(knot, B));
  for (const s of [-1, 1]) {
    const tail = new THREE.BoxGeometry(0.34, 0.05, 1.05);
    tail.translate(0, 0, 0.52);
    tail.rotateY(s * 0.5);
    tail.translate(0, top + 0.03, 0);
    parts.push(part(tail, B));
  }
  return mergeParts(parts);
}

/** A macaron lying flat, `height` tall (returned), centred: domed shells and ruffled feet (A), filling (B). */
export function macaronGeometry(d: number): { geo: THREE.BufferGeometry; height: number } {
  const R = d / 2;
  const dome = 0.42;
  const foot = 0.08;
  const fill = 0.13;
  const parts: Part[] = [];
  let y = 0;
  const lower = new THREE.SphereGeometry(R, 20, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  lower.scale(1, dome, 1);
  lower.translate(0, R * dome, 0);
  parts.push(part(lower, A));
  y = R * dome;
  const foot1 = new THREE.CylinderGeometry(R + 0.03, R, foot, 20);
  foot1.translate(0, y + foot / 2, 0);
  parts.push(part(foot1, A, 0xf2f2f2));
  y += foot;
  const filling = new THREE.CylinderGeometry(R - 0.05, R - 0.05, fill, 20);
  filling.translate(0, y + fill / 2, 0);
  parts.push(part(filling, B));
  y += fill;
  const foot2 = new THREE.CylinderGeometry(R, R + 0.03, foot, 20);
  foot2.translate(0, y + foot / 2, 0);
  parts.push(part(foot2, A, 0xf2f2f2));
  y += foot;
  const upper = new THREE.SphereGeometry(R, 20, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  upper.scale(1, dome, 1);
  upper.translate(0, y, 0);
  parts.push(part(upper, A));
  const height = y + R * dome;
  const geo = mergeParts(parts);
  geo.translate(0, -height / 2, 0);
  return { geo, height };
}

/** A wrapped candy lying along x, centred: a striped sweet (A + white swirl) with twisted wrapper ends (B). */
export function wrappedCandyGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const body = new THREE.SphereGeometry(0.36, 16, 10);
  body.rotateZ(Math.PI / 2);
  body.scale(1.35, 1, 1);
  parts.push(part(body, A + PATTERN));
  for (const s of [-1, 1]) {
    const neck = new THREE.CylinderGeometry(0.08, 0.08, 0.14, 8);
    neck.rotateZ(Math.PI / 2);
    neck.translate(s * 0.52, 0, 0);
    parts.push(part(neck, B));
    const fan = new THREE.ConeGeometry(0.3, 0.42, 10);
    fan.rotateZ(s * Math.PI / 2);
    fan.translate(s * 0.78, 0, 0);
    parts.push(part(fan, B));
  }
  const geo = mergeParts(parts);
  geo.scale(0.78, 0.78, 0.78);
  return geo;
}

/** A striped candy tub, base at y 0: radius r, height h, the rim in white. Tint `tub` for the tub. */
function tubParts(r: number, h: number, tub: number): Part[] {
  const body = new THREE.CylinderGeometry(r, r * 0.8, h, 16);
  body.translate(0, h / 2, 0);
  const rim = new THREE.TorusGeometry(r, 0.055, 6, 18);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, h, 0);
  return [part(body, tub), part(rim, FIXED, 0xffffff)];
}

const GUMBALLS = [0xff5c8a, 0x4fd1a5, 0xffc93c, 0x5fb8ff, 0x9b7bff, 0xe8395a, 0xff8a3d];

/** A tub heaped with gumballs (tub A + white stripes, gumballs in fixed colours). Base at y 0. */
export function gumballTubGeometry(r: number): THREE.BufferGeometry {
  const h = 0.56;
  const parts = tubParts(r, h, A + PATTERN);
  const ball = 0.15;
  const at: [number, number, number][] = [];
  for (let k = 0; k < 7; k++) at.push([Math.cos((k / 7) * Math.PI * 2) * r * 0.62, h + 0.05, Math.sin((k / 7) * Math.PI * 2) * r * 0.62]);
  for (let k = 0; k < 4; k++) at.push([Math.cos((k / 4) * Math.PI * 2 + 0.4) * r * 0.3, h + 0.2, Math.sin((k / 4) * Math.PI * 2 + 0.4) * r * 0.3]);
  at.push([0, h + 0.34, 0]);
  at.forEach(([x, y, z], i) => {
    const s = new THREE.SphereGeometry(ball, 8, 6);
    s.translate(x, y, z);
    parts.push(part(s, FIXED, GUMBALLS[i % GUMBALLS.length]));
  });
  return mergeParts(parts);
}

/** A tub of cotton candy: striped tub (B + white stripes), a fluffy cloud on top (A). Base at y 0. */
export function cottonTubGeometry(r: number): THREE.BufferGeometry {
  const h = 0.5;
  const parts = tubParts(r, h, B + PATTERN);
  const r2 = rng(41);
  const puffs: [number, number, number, number][] = [[0, h + 0.38, 0, 0.32]];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    puffs.push([Math.cos(a) * r * 0.55, h + 0.16 + r2() * 0.1, Math.sin(a) * r * 0.55, 0.22 + r2() * 0.06]);
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    puffs.push([Math.cos(a) * r * 0.3, h + 0.48, Math.sin(a) * r * 0.3, 0.2]);
  }
  for (const [x, y, z, rad] of puffs) {
    const s = new THREE.SphereGeometry(rad, 10, 7);
    s.translate(x, y, z);
    parts.push(part(s, A));
  }
  return mergeParts(parts);
}

// ---------------------------------------------------------------------------------------------------------------
// Street furniture (MapView): plain Lambert parts, baked by the caller (`bakeColors`).

const lam = new Map<string, THREE.MeshLambertMaterial>();
function plain(color: number, emissive = 0, opacity = 1): THREE.MeshLambertMaterial {
  const key = `${color}|${emissive}|${opacity}`;
  let m = lam.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, emissive, flatShading: true, transparent: opacity < 1, opacity });
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

const CANE_RED = 0xe8395a;
const CANE_WHITE = 0xfff8f4;

/** A candy-cane shaft from y0 to y1 at (x, z): red and white bands. */
function caneShaft(g: THREE.Object3D, x: number, z: number, y0: number, y1: number, r: number, band: number): void {
  const n = Math.max(2, Math.round((y1 - y0) / band));
  const step = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const s = new THREE.CylinderGeometry(r, r, step, 8);
    put(g, s, plain(i % 2 ? CANE_WHITE : CANE_RED), x, y0 + step * (i + 0.5), z);
  }
}

/** A candy-cane hook: a half ring of radius `rad` from the shaft top at (x, y, z) over to +x (turned by `rotY`). */
function caneHook(g: THREE.Object3D, x: number, y: number, z: number, rad: number, r: number, rotY: number, segs = 6): THREE.Group {
  const hook = new THREE.Group();
  for (let i = 0; i < segs; i++) {
    const arc = new THREE.TorusGeometry(rad, r, 6, 3, Math.PI / segs);
    arc.rotateZ((Math.PI * (segs - 1 - i)) / segs);
    put(hook, arc, plain(i % 2 ? CANE_WHITE : CANE_RED), rad, 0, 0);
  }
  hook.position.set(x, y, z);
  hook.rotation.y = rotY;
  g.add(hook);
  return hook;
}

/**
 * A candy-cane lamp post: a striped cane 3.4 tall whose hook holds a glowing bulb under a pink gumdrop shade, on a
 * chocolate-drop foot. Same reach as the old pole and arm (the bulb hangs ~0.8 out along +x).
 */
export function candyLamp(): THREE.Group {
  const g = new THREE.Group();
  const foot = new THREE.SphereGeometry(0.34, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  foot.scale(1, 0.8, 1);
  put(g, foot, plain(0x6b3f2a), 0, 0, 0);
  caneShaft(g, 0, 0, 0.15, 3.1, 0.1, 0.32);
  caneHook(g, 0, 3.1, 0, 0.4, 0.1, 0);
  // Hanger, a glowing round lantern (seen from above) with a little pink gumdrop cap, and a soft halo.
  put(g, new THREE.CylinderGeometry(0.025, 0.025, 0.22, 4), plain(0x6b3f2a), 0.8, 2.98, 0, false);
  const cap = new THREE.SphereGeometry(0.17, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.scale(1, 0.9, 1);
  put(g, cap, plain(0xff6fa5), 0.8, 2.83, 0);
  put(g, new THREE.SphereGeometry(0.3, 12, 9), plain(0xfff1c9, 0xffb04a), 0.8, 2.58, 0, false);
  put(g, new THREE.SphereGeometry(0.06, 6, 4), plain(0xff6fa5), 0.8, 2.26, 0, false);
  put(g, new THREE.SphereGeometry(0.48, 12, 9), plain(0xffd27a, 0xffa53a, 0.25), 0.8, 2.58, 0, false);
  return g;
}

/**
 * A stretch of candy-cane fence along local x (as long as the old barrier, 0.9 * cell): three canes with their
 * hooks, two striped rails between them.
 */
export function caneFence(len: number): THREE.Group {
  const g = new THREE.Group();
  const half = len / 2 - 0.15;
  const xs = [-half, 0, half];
  xs.forEach((x, i) => {
    caneShaft(g, x, 0, 0, 1.15, 0.085, 0.23);
    // Hooks curl outward at the ends, alternate in the middle.
    caneHook(g, x, 1.15, 0, 0.2, 0.085, i === 0 ? Math.PI : i === 2 ? 0 : Math.PI / 2, 4);
  });
  for (const y of [0.45, 0.85]) {
    const n = 8;
    const step = (half * 2) / n;
    for (let i = 0; i < n; i++) {
      const s = new THREE.CylinderGeometry(0.06, 0.06, step, 6);
      s.rotateZ(Math.PI / 2);
      put(g, s, plain(i % 2 ? CANE_RED : CANE_WHITE), -half + step * (i + 0.5), y, 0);
    }
  }
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// Chocolate (cliff pillars and the stage 9 knoll).

/**
 * Atlas for a unit chocolate pillar, a rocky-road brownie (kept apart from the chocolate-bar candy blocks, which
 * can be broken): upper half = the top, glossy fudge with an icing drizzle, mini marshmallows and chocolate chips; lower
 * half = the sides, dense brownie with air pockets under a fudge coat dripping over the top edge.
 */
export function chocoPillarTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const H = S / 2;
  const r = rng(91);
  // Top (canvas y 0..128 = v 0.5..1; squashed 2:1 in v, so vertical sizes are halved): glossy fudge.
  const top = g.createLinearGradient(0, 0, S, H);
  top.addColorStop(0, "#8a5232");
  top.addColorStop(1, "#5e3420");
  g.fillStyle = top;
  g.fillRect(0, 0, S, H);
  // Soft swirls in the fudge and a few hairline cracks in the crust.
  for (let k = 0; k < 10; k++) {
    g.strokeStyle = r() < 0.5 ? "rgba(160,104,66,0.45)" : "rgba(58,30,18,0.4)";
    g.lineWidth = 5 + r() * 6;
    g.beginPath();
    g.ellipse(r() * S, r() * H, 20 + r() * 30, 8 + r() * 10, 0, r() * 6, r() * 6 + 2);
    g.stroke();
  }
  g.strokeStyle = "rgba(40,18,10,0.6)";
  g.lineWidth = 1.5;
  for (let k = 0; k < 4; k++) {
    let x = r() * S;
    let y = r() * H;
    g.beginPath();
    g.moveTo(x, y);
    for (let n = 0; n < 4; n++) g.lineTo((x += (r() - 0.5) * 50), (y += (r() - 0.5) * 18));
    g.stroke();
  }
  // Gloss.
  g.fillStyle = "rgba(255,232,214,0.22)";
  g.beginPath();
  g.ellipse(S * 0.32, H * 0.3, S * 0.22, H * 0.07, -0.15, 0, Math.PI * 2);
  g.fill();
  // A loose icing drizzle across (white, a pink one beside it).
  for (const [col, y0, ph] of [["#fff6ee", 0.4, 0], ["#ff9cc2", 0.66, 1.7]] as const) {
    const wave = (dy: number) => {
      g.beginPath();
      for (let x = 0; x <= S; x += 4) {
        const y = H * y0 + Math.sin((x / S) * Math.PI * 5 + ph) * H * 0.13 + dy;
        if (x) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    };
    g.strokeStyle = "rgba(40,18,10,0.3)";
    g.lineWidth = 5;
    wave(2);
    g.strokeStyle = col;
    g.lineWidth = 3.5;
    wave(0);
  }
  // Chocolate chips and mini marshmallows (pink and white, a little shadow under each).
  for (let k = 0; k < 6; k++) {
    g.fillStyle = "#24110a";
    g.beginPath();
    g.ellipse(r() * S, r() * H, 5, 3, 0, 0, Math.PI * 2);
    g.fill();
  }
  for (let k = 0; k < 5; k++) {
    const x = 12 + r() * (S - 24);
    const y = 6 + r() * (H - 12);
    const w = 16 + r() * 6;
    g.fillStyle = "rgba(30,12,6,0.45)";
    g.beginPath();
    g.roundRect(x - w / 2 + 2, y - w / 4 + 2, w, w / 2, 4);
    g.fill();
    g.fillStyle = k % 2 ? "#ffd3e4" : "#fff8f2";
    g.beginPath();
    g.roundRect(x - w / 2, y - w / 4, w, w / 2, 4);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.8)";
    g.fillRect(x - w / 2 + 3, y - w / 4 + 1.5, w * 0.5, 2);
  }
  // Sides (canvas y 128..256 = v 0..0.5; v 0.5 is the top edge): brownie crumb.
  const side = g.createLinearGradient(0, H, 0, S);
  side.addColorStop(0, "#6a3d25");
  side.addColorStop(1, "#40231a");
  g.fillStyle = side;
  g.fillRect(0, H, S, H);
  for (let k = 0; k < 260; k++) {
    g.fillStyle = r() < 0.6 ? "rgba(28,12,6,0.5)" : "rgba(150,96,60,0.45)";
    g.beginPath();
    g.ellipse(r() * S, H + r() * H, 1.5 + r() * 3, 1 + r() * 1.6, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Fudge coat with drips over the top edge.
  g.fillStyle = "#4a2618";
  g.fillRect(0, H, S, H * 0.12);
  for (let x = 0; x < S; x += 14 + r() * 16) {
    const len = H * (0.1 + r() * 0.22);
    g.beginPath();
    g.roundRect(x, H, 10 + r() * 6, len, 6);
    g.fill();
  }
  g.fillStyle = "rgba(255,225,200,0.28)";
  g.fillRect(0, H + 3, S, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** UVs for a box w x h x d (x / z centred, y from 0 to h) on `chocoPillarTexture`'s atlas. */
export function chocoPillarUVs(geo: THREE.BufferGeometry, w: number, h: number, d: number): void {
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / w + 0.5;
    const y = pos.getY(i) / h;
    const z = pos.getZ(i) / d + 0.5;
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);
    if (ny > 0.6) {
      uv[i * 2] = x;
      uv[i * 2 + 1] = 0.51 + (1 - z) * 0.48;
    } else {
      uv[i * 2] = Math.abs(nx) > Math.abs(nz) ? z : x;
      uv[i * 2 + 1] = 0.01 + Math.min(1, Math.max(0, y)) * 0.48;
    }
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/** Chocolate for a cone or lump: swirls of milk and dark, glossy streaks. Repeats. */
export function chocoTexture(seed = 7): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const r = rng(seed);
  g.fillStyle = "#6b3f2a";
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 18; i++) {
    g.strokeStyle = r() < 0.5 ? "rgba(140,86,52,0.55)" : "rgba(60,32,20,0.5)";
    g.lineWidth = 4 + r() * 6;
    g.beginPath();
    g.arc(r() * S, r() * S, 12 + r() * 26, r() * 6, r() * 6 + 1.4 + r() * 2);
    g.stroke();
  }
  for (let i = 0; i < 10; i++) {
    g.strokeStyle = "rgba(255,225,200,0.18)";
    g.lineWidth = 2;
    g.beginPath();
    const x = r() * S;
    const y = r() * S;
    g.moveTo(x, y);
    g.lineTo(x + 8 + r() * 14, y + 2 + r() * 6);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * The stage 9 knoll as a chocolate mountain: chocolate peaks (textured, kept apart) with white icing caps dripping
 * down, sprinkles and a cherry on the tallest. `w` / `h` are the prop's footprint in metres.
 */
export function chocoKnoll(w: number, h: number): THREE.Group {
  const knoll = new THREE.Group();
  const choco = new THREE.MeshLambertMaterial({ map: chocoTexture(7), flatShading: true });
  const parts: [number, number, number, number][] = [[0, 0, 1, 1], [-0.28, 0.2, 0.65, 0.75], [0.3, -0.18, 0.7, 0.6], [0.05, 0.32, 0.5, 0.9]];
  const r = rng(19);
  const SPR = [0xff5c8a, 0x4fd1a5, 0xffc93c, 0x5fb8ff, 0x9b7bff];
  let best = { x: 0, y: -1, z: 0 };
  for (const [ox, oz, s, hgt] of parts) {
    const rad = w * 0.48 * s;
    const H = 7 * hgt;
    const cx = ox * w * 0.4;
    const cz = oz * h * 0.4;
    const cy = H / 2 - 0.3;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(rad, H, 7), choco);
    cone.position.set(cx, cy, cz);
    cone.rotation.y = ox * 3;
    knoll.add(cone);
    // Icing cap: the top 30 % of the cone, a touch larger, with drips round its rim.
    const f = 0.3;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * f * 1.07, H * f, 7), plain(0xfff6ee));
    cap.position.set(cx, cy + H / 2 - (H * f) / 2 + 0.04, cz);
    cap.rotation.y = ox * 3;
    knoll.add(cap);
    const rimY = cy + H / 2 - H * f;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + ox * 3 + Math.PI / 7;
      const len = 0.5 + r() * 0.9;
      const drip = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 5), plain(0xfff6ee));
      drip.scale.set(1, len / 0.32 / 2, 0.7);
      const rr = rad * f * 0.98 + 0.05;
      drip.position.set(cx + Math.sin(a) * rr, rimY - len * 0.25, cz + Math.cos(a) * rr);
      drip.rotation.y = a;
      knoll.add(drip);
    }
    // Sprinkles on the icing.
    for (let k = 0; k < 9; k++) {
      const t = 0.25 + r() * 0.65;
      const a = r() * Math.PI * 2;
      const rr = rad * f * (1 - t) * 1.1 + 0.05;
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.09), plain(SPR[k % SPR.length]));
      sp.position.set(cx + Math.sin(a) * rr, rimY + H * f * t, cz + Math.cos(a) * rr);
      sp.rotation.set(r() * 3, r() * 3, r() * 3);
      knoll.add(sp);
    }
    if (cy + H / 2 > best.y) best = { x: cx, y: cy + H / 2, z: cz };
  }
  const cherry = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 9), plain(0xe8395a));
  cherry.position.set(best.x, best.y + 0.3, best.z);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 5), plain(0x4f8a3a));
  stem.position.set(best.x + 0.15, best.y + 0.95, best.z);
  stem.rotation.z = -0.35;
  knoll.add(cherry, stem);
  knoll.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true));
  return knoll;
}

// ---------------------------------------------------------------------------------------------------------------
// The boost / gift pickup (systems/Boosts.ts): a cupcake whose frosting is the boost's colour.

/** Vertex colours for a whole geometry, or per triangle from `pick(triangle index)`. */
function paint(geo: THREE.BufferGeometry, color: number | ((tri: number) => number)): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    c.setHex(typeof color === "number" ? color : color(Math.floor(i / 3)));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

const cupcakes = new Map<number, { geo: THREE.BufferGeometry; m: THREE.MeshPhongMaterial }>();

/**
 * A cupcake about as big as the old boost canister (~1.4 tall, 0.46 wide), centred on its middle: a pleated paper
 * cup in white and the boost colour, a three-ring frosting swirl in the boost colour with sprinkles, and a cherry.
 */
export function cupcakeMesh(color: number): THREE.Mesh {
  let c = cupcakes.get(color);
  if (!c) {
    const frost = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.18).getHex();
    const pleat = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.55).getHex();
    const geos: THREE.BufferGeometry[] = [];
    const segs = 16;
    const cup = new THREE.CylinderGeometry(0.46, 0.35, 0.56, segs, 1);
    cup.translate(0, -0.28, 0);
    // Side triangles come first (2 per segment), then the caps.
    geos.push(paint(cup, (t) => (t < segs * 2 ? (Math.floor(t / 2) % 2 ? 0xffffff : pleat) : 0xffffff)));
    const rim = new THREE.TorusGeometry(0.46, 0.04, 5, segs);
    rim.rotateX(Math.PI / 2);
    geos.push(paint(rim, 0xffffff));
    const base = new THREE.CylinderGeometry(0.47, 0.47, 0.12, segs);
    base.translate(0, 0.04, 0);
    geos.push(paint(base, frost));
    const rings: [number, number, number][] = [[0.36, 0.15, 0.12], [0.25, 0.13, 0.33], [0.14, 0.11, 0.51]];
    for (const [R, tube, y] of rings) {
      const t = new THREE.TorusGeometry(R, tube, 8, 18);
      t.rotateX(Math.PI / 2);
      t.translate(0, y, 0);
      geos.push(paint(t, frost));
    }
    const tip = new THREE.ConeGeometry(0.13, 0.24, 12);
    tip.translate(0, 0.66, 0);
    geos.push(paint(tip, frost));
    const cherry = new THREE.SphereGeometry(0.14, 12, 9);
    cherry.translate(0.02, 0.84, 0);
    geos.push(paint(cherry, color === 0xff5a4a ? 0xb3122e : 0xe8395a));
    const stem = new THREE.CylinderGeometry(0.02, 0.025, 0.24, 5);
    stem.rotateZ(-0.4);
    stem.translate(0.08, 1.0, 0);
    geos.push(paint(stem, 0x4f8a3a));
    const SPR = [0xffffff, 0xffd166, 0x4fd1a5, 0xff6fa5, 0x5fb8ff, 0xffffff];
    const r = rng(color);
    for (let k = 0; k < 14; k++) {
      const ring = rings[k % 3];
      const a = r() * Math.PI * 2;
      const rr = ring[0] + ring[1] * 0.55;
      const s = new THREE.BoxGeometry(0.11, 0.035, 0.035);
      s.rotateY(r() * Math.PI);
      s.rotateZ((r() - 0.5) * 0.8);
      s.translate(Math.cos(a) * rr, ring[2] + ring[1] * 0.75, Math.sin(a) * rr);
      geos.push(paint(s, SPR[k % SPR.length]));
    }
    const geo = mergeGeometries(geos)!;
    for (const g of geos) g.dispose();
    geo.translate(0, -0.2, 0);
    const m = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x333333, emissive: color, emissiveIntensity: 0.12 });
    c = { geo, m };
    cupcakes.set(color, c);
  }
  const mesh = new THREE.Mesh(c.geo, c.m);
  mesh.castShadow = true;
  return mesh;
}

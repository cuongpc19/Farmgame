// @ts-nocheck
// Farm cells and items side by side (world/farmNodes.ts, world/itemGeo.ts).
//   ?view=nodes  every ore key's model, each variant, from about the game camera (57° down), closer than in play
//                (&kind=crop,wood,fruit,ore,gem,chest  &key=gold,ruby  &v=0  &zoom=1.5)
//   ?view=items  every raw item (its shapes) and product at size 1, plus the fuel can (&kind=… &key=…)
//   ?view=game   a patch of field at the game's camera distance (InstancedMesh + instance colours, as BlockField
//                will draw it) and two carried columns (the real Stack) in front
import * as THREE from "three";
import { nodeGeometry, nodeMaterial, nodeTop, nodeVariants } from "/src/game/world/farmNodes.ts";
import { itemGeometry, itemMaterial, itemHeight, itemFootprint, ROCK_SHAPES } from "/src/game/world/itemGeo.ts";
import { FARM, farmLook } from "/src/game/farm.ts";
import { ORES, itemColor, OIL_ITEM } from "/src/game/data.ts";
import { Stack } from "/src/game/world/Stack.ts";

const q = new URLSearchParams(location.search);
const view = q.get("view") ?? "nodes";
const kinds = q.get("kind")?.split(",");
const only = q.get("key")?.split(",");
const vOnly = q.get("v");
const zoom = Number(q.get("zoom") ?? 1);
const CELL = 2.5;
const PITCH = THREE.MathUtils.degToRad(57);

const r = new THREE.WebGLRenderer({ antialias: true });
r.outputColorSpace = THREE.SRGBColorSpace;
r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
r.setSize(innerWidth, innerHeight);
r.shadowMap.enabled = true;
r.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(r.domElement);
const s = new THREE.Scene();
s.background = new THREE.Color(0xbfe6ff);
// The game's lights (theme.ts / Stage3D): a warm sky dome and the sun from the right, behind the camera.
s.add(new THREE.HemisphereLight(0xfff2fb, 0x9a6a5a, 1.35));
const sun = new THREE.DirectionalLight(0xfff4e6, 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0008;
s.add(sun, sun.target);
window.__game = { ready: false };
const info = document.getElementById("info");
const labels = [];
const label = (text, at) => {
  const e = document.createElement("div");
  e.className = "lb";
  e.textContent = text;
  document.body.appendChild(e);
  labels.push([e, at]);
};

const keys = Object.keys(FARM).filter((k) => (!kinds || kinds.includes(farmLook(k).kind)) && (!only || only.includes(k)));
const tris = (g) => (g.index ? g.index.count : g.getAttribute("position").count) / 3;

function ground(w, d, cx = 0, cz = 0) {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color: 0x86c95a }));
  g.rotation.x = -Math.PI / 2;
  g.position.set(cx, -0.01, cz);
  g.receiveShadow = true;
  s.add(g);
}

/** Camera at the game's pitch, far enough to fit w x d (and h tall) on screen. */
function frame(cam, cx, cz, w, d, h = 3) {
  const vf = THREE.MathUtils.degToRad(cam.fov);
  const hf = 2 * Math.atan(Math.tan(vf / 2) * cam.aspect);
  const dist = Math.max(w / 2 / Math.tan(hf / 2), (d * Math.sin(PITCH) + h * Math.cos(PITCH)) / 2 / Math.tan(vf / 2)) * 1.08 / zoom;
  const focus = new THREE.Vector3(cx, h * 0.3, cz);
  cam.position.copy(focus).add(new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH)).multiplyScalar(dist));
  cam.lookAt(focus);
  sun.position.set(cx + 16, 40, cz + 12);
  sun.target.position.set(cx, 0, cz);
  const sc = sun.shadow.camera;
  const span = Math.max(w, d) * 0.75 + 6;
  sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 1; sc.far = 140;
  sc.updateProjectionMatrix();
}

try {
  const cam = new THREE.PerspectiveCamera(view === "game" ? (innerWidth < innerHeight ? 46 : 34) : 30, innerWidth / innerHeight, 0.5, 400);
  const lines = [];
  if (view === "nodes") {
    // Each key: its variants side by side; keys in a grid.
    const per = vOnly !== null ? 1 : 3;
    const groupW = per * CELL * 1.25 + CELL * 0.6;
    const cols = Math.max(1, Math.min(only ? keys.length : 5, Math.round(Math.sqrt(keys.length * 1.6))));
    const rows = Math.ceil(keys.length / cols);
    const rowD = CELL * 2.6;
    keys.forEach((key, i) => {
      const gx = (i % cols) * groupW;
      const gz = Math.floor(i / cols) * rowD;
      const counts = [];
      for (let v = 0; v < nodeVariants(key); v++) {
        if (vOnly !== null && Number(vOnly) !== v) continue;
        const g = nodeGeometry(key, v, CELL);
        const m = new THREE.Mesh(g, nodeMaterial);
        m.castShadow = m.receiveShadow = true;
        const col = vOnly !== null ? 0 : v;
        m.position.set(gx + col * CELL * 1.25, 0, gz);
        s.add(m);
        counts.push(tris(g));
        // The cell's outline on the ground.
        const tile = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 0.98, CELL * 0.98), new THREE.MeshLambertMaterial({ color: 0x9bd46c }));
        tile.rotation.x = -Math.PI / 2;
        tile.position.set(m.position.x, 0, gz);
        tile.receiveShadow = true;
        s.add(tile);
      }
      label(`${key} · ${farmLook(key).species} · ${counts.join("/")}▲ · top ${nodeTop(key).toFixed(2)}`, new THREE.Vector3(gx + (per - 1) * CELL * 0.625, 0, gz + CELL * 0.62));
      lines.push(`${key} ${farmLook(key).species}: ${counts.join("/")} tris, top ${nodeTop(key).toFixed(2)}`);
    });
    const w = (cols - 1) * groupW + per * CELL * 1.25;
    const d = (rows - 1) * rowD + CELL;
    ground(w + 20, d + 20, w / 2 - CELL * 0.6, d / 2 - CELL * 0.5);
    frame(cam, w / 2 - CELL * 0.6, d / 2 - CELL * 0.4, w, d, 4.5);
  } else if (view === "items") {
    const list = [];
    for (const key of keys) {
      const o = Object.values(ORES).find((x) => x.key === key);
      if (!o) continue;
      list.push([key, o]);
    }
    const cols = Number(q.get("cols") ?? (list.length > 12 ? 5 : 3));
    const step = 1.5;
    list.forEach(([key, o], i) => {
      const gx = (i % cols) * (step * 4.6);
      const gz = Math.floor(i / cols) * step * 1.7;
      const items = [...Array(ROCK_SHAPES)].map((_, v) => [o.mineralId, v]).concat([[o.ingotId, 0]]);
      items.forEach(([it, v], j) => {
        const m = new THREE.Mesh(itemGeometry(it, v), itemMaterial(it, itemColor(it)));
        m.castShadow = true;
        m.position.set(gx + j * step, itemHeight(it) / 2 + 0.02, gz);
        m.rotation.y = 0.35;
        s.add(m);
      });
      const gm = itemGeometry(o.mineralId, 0);
      const gi = itemGeometry(o.ingotId, 0);
      label(`${key} ${tris(gm)}▲ / ${tris(gi)}▲`, new THREE.Vector3(gx + step * 1.5, 0, gz + 0.75));
      lines.push(`${key}: raw ${[...Array(ROCK_SHAPES)].map((_, v) => tris(itemGeometry(o.mineralId, v))).join("/")} tris h ${itemHeight(o.mineralId).toFixed(2)} foot ${itemFootprint(o.mineralId).map((x) => x.toFixed(2))}; product ${tris(gi)} tris h ${itemHeight(o.ingotId).toFixed(2)} foot ${itemFootprint(o.ingotId).map((x) => x.toFixed(2))}`);
    });
    if (!kinds && !only) {
      const i = list.length;
      const gx = (i % cols) * (step * 4.6);
      const gz = Math.floor(i / cols) * step * 1.7;
      const m = new THREE.Mesh(itemGeometry(OIL_ITEM, 0), itemMaterial(OIL_ITEM, itemColor(OIL_ITEM)));
      m.castShadow = true;
      m.position.set(gx, itemHeight(OIL_ITEM) / 2 + 0.02, gz);
      m.rotation.y = 0.35;
      s.add(m);
      label(`fuel ${tris(itemGeometry(OIL_ITEM, 0))}▲`, new THREE.Vector3(gx, 0, gz + 0.75));
      lines.push(`fuel: ${tris(itemGeometry(OIL_ITEM, 0))} tris h ${itemHeight(OIL_ITEM).toFixed(2)} foot ${itemFootprint(OIL_ITEM).map((x) => x.toFixed(2))}`);
    }
    const rows = Math.ceil((list.length + 1) / cols);
    const w = (cols - 1) * step * 4.6 + step * 4;
    const d = (rows - 1) * step * 1.7 + 1;
    ground(w + 10, d + 10, w / 2, d / 2);
    frame(cam, w / 2 - 0.75, d / 2 - 0.2, w * 0.98, d, 1);
  } else if (view === "stacks") {
    // Carried columns as on a back (the player's Stack layout: one column, size 0.75, products at 70 %), each on a
    // post as high as the character's back, seen from the game camera's pitch (&zoom=… to go closer).
    const pickKeys = only ?? ["limestone", "sandstone", "obsidian", "granite", "dunite", "bronzite", "gold", "copper", "silver", "ruby", "emerald", "diamond", "mystery"];
    const ores = pickKeys.map((k) => Object.values(ORES).find((o) => o.key === k)).filter(Boolean);
    const n = 7;
    const columns = [];
    for (const o of ores) columns.push([o.key, [...Array(n)].map(() => o.mineralId)]);
    for (const o of ores) columns.push([o.key + "+", [...Array(n)].map(() => o.ingotId)]);
    columns.push(["fuel", [...Array(n)].map(() => OIL_ITEM)]);
    columns.push(["mixed", ores.slice(0, n).map((o, i) => (i % 2 ? o.ingotId : o.mineralId))]);
    const per = Math.ceil(columns.length / 2);
    const gap = 1.25;
    columns.forEach(([name, items], i) => {
      const x = (i % per) * gap;
      const z = Math.floor(i / per) * 7;
      const anchor = new THREE.Object3D();
      anchor.position.set(x, 1.5, z);
      s.add(anchor);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.5, 8), new THREE.MeshLambertMaterial({ color: 0x8a6a48 }));
      post.position.set(x, 0.75, z);
      post.castShadow = true;
      s.add(post);
      const st = new Stack(anchor, 99, itemColor, { cols: 1, rows: 1, size: 0.75, maxShown: 80, outline: true, ingot: 0.7 });
      for (const it of items) st.push(it);
      label(name, new THREE.Vector3(x, 0, z + 0.6));
    });
    const w = (per - 1) * gap + 1.5;
    ground(w + 30, 40, w / 2, 3);
    frame(cam, w / 2 - 0.6, 3.5, w, 9, 6);
  } else {
    // A field as BlockField will draw it: one InstancedMesh per (key, variant), instance colours jittered.
    const W = 10;
    const D = 9;
    const pick = (cx, cz) => {
      if (cz >= 5) return "limestone";
      if (cz === 4) return ["sandstone", "dunite", "obsidian", "coal", "granite", "bronzite", "yooperlite", "basalt", "ice", "cinnabar"][cx];
      if (cz === 3) return ["cinnabar", "ice", "basalt", "yooperlite", "limestone", "limestone", "dunite", "sandstone", "obsidian", "coal"][cx];
      if (cz === 2) return ["copper", "iron", "manganese", "silver", "gold", "bismuth", "cobalt", "gold", "copper", "mystery"][cx];
      if (cz === 1) return ["lapisLazuli", "quartz", "amber", "amethyst", "emerald", "aquamarine", "opal", "zircon", "ruby", "tanzanite"][cx];
      return ["diamond", "gold", "ruby", "emerald", "gold", "diamond", "amethyst", "silver", "gold", "mystery"][cx];
    };
    const cells = [];
    for (let cz = 0; cz < D; cz++) for (let cx = 0; cx < W; cx++) cells.push({ cx, cz, key: pick(cx, cz) });
    const groups = new Map();
    for (const c of cells) {
      const v = Math.abs(c.cx * 7919 + c.cz * 104729) % nodeVariants(c.key);
      const k = `${c.key}|${v}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    for (const [k, list] of groups) {
      const [key, v] = k.split("|");
      const m = new THREE.InstancedMesh(nodeGeometry(key, Number(v), CELL), nodeMaterial, list.length);
      m.castShadow = m.receiveShadow = true;
      list.forEach((c, i) => {
        dummy.position.set(c.cx * CELL, 0, c.cz * CELL);
        dummy.rotation.set(0, ((c.cx * 3 + c.cz * 5) % 4) * (Math.PI / 2), 0);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        const h = Math.abs(c.cx * 7919 + c.cz * 104729);
        m.setColorAt(i, col.setScalar(0.93 + ((h % 97) / 97) * 0.12));
      });
      s.add(m);
    }
    // Two carried columns (the player's Stack layout) on posts in front of the field.
    const raws = Object.values(ORES).filter((o) => ["limestone", "sandstone", "dunite", "coal", "granite", "gold", "ruby", "diamond", "mystery", "copper", "cinnabar"].includes(o.key));
    const mk = (x, items) => {
      const anchor = new THREE.Object3D();
      anchor.position.set(x, 1.4, D * CELL + 0.5);
      s.add(anchor);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.4, 8), new THREE.MeshLambertMaterial({ color: 0x8a6a48 }));
      post.position.set(x, 0.7, D * CELL + 0.5);
      s.add(post);
      const st = new Stack(anchor, 99, itemColor, { cols: 1, rows: 1, size: 0.75, maxShown: 80, outline: true, ingot: 0.7 });
      for (const it of items) st.push(it);
    };
    mk(W * CELL * 0.5 - 4.5, raws.map((o) => o.mineralId));
    mk(W * CELL * 0.5 - 2.2, raws.map((o) => o.ingotId).concat([OIL_ITEM, OIL_ITEM]));
    ground(80, 80, W * CELL * 0.5, D * CELL * 0.5);
    // The game camera: 57° down, a 13.5-unit span across a portrait screen (Stage3D.baseDist).
    const vf = THREE.MathUtils.degToRad(cam.fov);
    const half = cam.aspect < 1 ? Math.atan(Math.tan(vf / 2) * cam.aspect) : vf / 2;
    const span = cam.aspect < 1 ? 13.5 : 13.5 * 1.45;
    const dist = span / 2 / Math.tan(half) / zoom;
    const focus = new THREE.Vector3(W * CELL * 0.5 - 2, 0, D * CELL * 0.62);
    cam.position.copy(focus).add(new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH)).multiplyScalar(dist));
    cam.lookAt(focus);
    sun.position.set(focus.x + 16, 40, focus.z + 12);
    sun.target.position.copy(focus);
    const sc = sun.shadow.camera;
    sc.left = -32; sc.right = 32; sc.top = 32; sc.bottom = -32; sc.near = 1; sc.far = 120;
    sc.updateProjectionMatrix();
  }
  cam.updateMatrixWorld();
  r.render(s, cam);
  for (const [e, at] of labels) {
    const p = at.clone().project(cam);
    e.style.left = `${((p.x + 1) / 2) * innerWidth}px`;
    e.style.top = `${((1 - p.y) / 2) * innerHeight}px`;
  }
  info.textContent = `view=${view} · ${keys.length} keys`;
  console.log(lines.join("\n"));
  window.__game.ready = true;
} catch (e) {
  document.body.textContent = "ERR " + (e.stack || e);
  console.log("ERR " + (e.stack || e));
  window.__game.ready = true;
}

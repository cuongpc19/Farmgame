// Preview of the farm cells as the game draws them (BlockField + a NodeSource), from the game camera:
// rows of rice near the camera, then trees, then rocks. ?src=sprites (default) | nodes (procedural farmNodes.ts).
// ?hit=1 sways a few trees as if just chopped. window.__ready turns true after the first frames.
import * as THREE from "three";
import { BlockField, type NodeSource } from "../../src/game/world/BlockField";
import { SpriteNodes } from "../../src/game/world/spriteNodes";
import { farmLook } from "../../src/game/farm";

const q = new URLSearchParams(location.search);
const CELL = 2.5;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd4f2);
scene.add(new THREE.HemisphereLight(0xfff6e0, 0x7a9a5a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(16, 40, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
scene.add(sun, sun.target);

// Grass with a warm earth path under the fields.
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0x8cc456 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const earth = new THREE.Mesh(new THREE.PlaneGeometry(13 * CELL, 13 * CELL), new THREE.MeshLambertMaterial({ color: 0xc9a46a }));
earth.rotation.x = -Math.PI / 2;
earth.position.set(5.5 * CELL, 0.01, -5.5 * CELL);
earth.receiveShadow = true;
scene.add(earth);

const rows: string[][] = [
  ["mystery", "diamond", "ruby", "emerald", "zircon", "tanzanite", "amethyst", "amber", "quartz", "opal", "aquamarine", "lapisLazuli"],
  ["gold", "silver", "copper", "iron", "manganese", "bismuth", "cobalt", "gold", "silver", "copper", "gold", "iron"],
  ["basalt", "ice", "cinnabar", "granite", "bronzite", "basalt", "ice", "cinnabar", "granite", "bronzite", "basalt", "ice"],
  ["obsidian", "coal", "yooperlite", "dunite", "obsidian", "coal", "yooperlite", "dunite", "obsidian", "coal", "yooperlite", "dunite"],
  ["sandstone", "sandstone", "dunite", "sandstone", "sandstone", "obsidian", "sandstone", "sandstone", "dunite", "sandstone", "sandstone", "coal"],
  ...Array.from({ length: 4 }, () => Array(12).fill("limestone")),
];
const keys = [...new Set(rows.flat())];
const cells = rows.flatMap((r, z) => r.map((k, x) => ({ cx: x, cz: -(rows.length - 1 - z), ore: keys.indexOf(k), hp: 100 })));
let source: NodeSource;
if (q.get("src") === "nodes") {
  const n = await import("../../src/game/world/farmNodes");
  const cache = new Map<string, THREE.BufferGeometry>();
  source = {
    variants: (k) => n.nodeVariants(k),
    model: (k, v) => {
      const id = `${k}|${v}`;
      if (!cache.has(id)) cache.set(id, n.nodeGeometry(k, v, CELL));
      return { geo: cache.get(id)!, mat: n.nodeMaterial };
    },
  };
} else source = new SpriteNodes(CELL);
const field = new BlockField(scene, cells, CELL, (ore) => ({ key: keys[ore], kind: farmLook(keys[ore]).kind }), source, CELL);

const camera = new THREE.PerspectiveCamera(innerWidth < innerHeight ? 46 : 34, innerWidth / innerHeight, 3, 200);
const pitch = THREE.MathUtils.degToRad(57);
const focus = new THREE.Vector3(5.5 * CELL, 0, -3.5 * CELL);
const dist = Number(q.get("dist") ?? 34);
camera.position.copy(focus).add(new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch)).multiplyScalar(dist));
camera.lookAt(focus);

if (q.get("hit")) for (const b of field.blocks.filter((b) => b.cz === -4 && b.cx % 3 === 0)) field.damage(b, 1, { x: b.cx * CELL - 3, z: b.cz * CELL + 3 });
let frames = 0;
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  field.update(Math.min(0.05, clock.getDelta()) * (q.get("hit") ? 0.25 : 1));
  renderer.render(scene, camera);
  if (++frames === 8) (window as unknown as { __ready: boolean }).__ready = true;
});

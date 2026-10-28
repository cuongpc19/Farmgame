// @ts-nocheck
// The crew's styles side by side (characters.ts CREW, user 2026-10-24): the player, then workers 1-11.
// ?view=full (whole bodies, front) | heads (head and shoulders, three-quarter) | back (from behind).
import * as THREE from "three";
import { loadCharacters, Character } from "/src/game/characters.ts";
const q = new URLSearchParams(location.search);
const view = q.get("view") ?? "full";
const r = new THREE.WebGLRenderer({ antialias: true });
r.outputColorSpace = THREE.SRGBColorSpace;
r.setSize(innerWidth, innerHeight);
document.body.appendChild(r.domElement);
const s = new THREE.Scene();
s.background = new THREE.Color(0x8a7a68);
s.add(new THREE.HemisphereLight(0xfff4e0, 0x6a5440, 1.35));
const d = new THREE.DirectionalLight(0xffffff, 1.9);
d.position.set(4, 8, 9);
s.add(d);
window.__game = { ready: false };
try {
  await loadCharacters();
  const ids = ["player", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const chars = ids.map((id, i) => {
    const c = id === "player" ? new Character("player", 0, { tool: false }) : new Character("worker", id, { tool: false, height: 2.95 * 0.88 });
    c.tool.visible = false;
    const heads = view !== "full";
    const col = heads ? i % 6 : i;
    const row = heads ? Math.floor(i / 6) : 0;
    c.root.position.set(heads ? (col - 2.5) * 1.25 : (col - 5.5) * 1.45, row ? -1.25 : 0, 0);
    c.root.rotation.y = view === "heads" ? 0.45 : view === "back" ? 0.5 : 0;
    c.pose = "idle";
    s.add(c.root);
    return c;
  });
  for (let k = 0; k < 20; k++) for (const c of chars) c.update(0.016);
  const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 200);
  if (view === "full") (cam.position.set(0, 1.6, 21), cam.lookAt(0, 1.35, 0));
  else (cam.position.set(0, 1.9, view === "back" ? -8.2 : 8.2), cam.lookAt(0, 1.75, 0));
  r.render(s, cam);
  window.__game.ready = true;
} catch (e) {
  document.body.textContent = "ERR " + (e.stack || e);
  window.__game.ready = true;
}

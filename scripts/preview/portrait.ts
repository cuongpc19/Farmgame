// @ts-nocheck
// Crew portraits from the game's own 3D workers (user 2026-10-24: the Job Board had only ⛏️ / 📦; the
// reference shows each applicant's face). One character at a time, head and shoulders, three-quarter
// view, transparent background.
//   ?id=3 (a worker profile id, or "player")&size=160  -> window.__icon = PNG data URL (scripts/make-portraits.mjs)
//   ?grid=1&size=160                                    -> every portrait on one canvas, to look them over
// Loaded as a module file, not inline: the dev server's inline-script proxy can fail ("No matching HTML
// proxy module"), and then nothing on the page runs.
import * as THREE from "three";
import { loadCharacters, Character, PLAYER_HEIGHT } from "/src/game/characters.ts";
const q = new URLSearchParams(location.search);
const size = Number(q.get("size") ?? 160);
const grid = q.get("grid") === "1";
const IDS = ["player", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const ids = grid ? IDS : [q.get("id") === "player" ? "player" : Number(q.get("id") ?? 1)];
const cols = grid ? 6 : 1;
const rows = Math.ceil(ids.length / cols);
const W = size;
const H = Math.round(size * 1.15);
window.__game = { ready: false };
try {
  await loadCharacters();
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.setPixelRatio(1);
  r.setSize(W * cols, H * rows);
  r.setClearColor(0x000000, 0);
  r.setScissorTest(true);
  document.body.style.background = grid ? "#5d6470" : "transparent";
  document.body.appendChild(r.domElement);
  ids.forEach((id, i) => {
    const s = new THREE.Scene();
    // Warm and bright, the key low enough to reach under a hat brim (user 2026-10-24: faces looked grim).
    s.add(new THREE.HemisphereLight(0xfff8ee, 0xd0b090, 1.75));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.0);
    key.position.set(1.5, 2, 6);
    s.add(key);
    const rim = new THREE.DirectionalLight(0xffe6c0, 0.8);
    rim.position.set(-5, 3, -4);
    s.add(rim);
    const c = id === "player" ? new Character("player", 0, { tool: false }) : new Character("worker", id, { tool: false, height: PLAYER_HEIGHT * 0.88 });
    c.tool.visible = false;
    c.pose = "idle";
    c.root.rotation.y = 0.42;
    s.add(c.root);
    for (let k = 0; k < 30; k++) c.update(0.016);
    // Chin up a little: a confident look, and the eyes come out from under the brim.
    const head = c.root.getObjectByName("Head");
    head.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0).applyQuaternion(c.root.quaternion), -0.12);
    c.root.updateMatrixWorld(true);
    // Frame the face: aim just above the Head bone (it sits at the neck), the shoulders cut off at the bottom.
    const at = head.getWorldPosition(new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(24, W / H, 0.05, 50);
    const aim = at.clone().add(new THREE.Vector3(0, 0.27, 0));
    cam.position.copy(aim).add(new THREE.Vector3(0.4, 0.02, 1.5));
    cam.lookAt(aim);
    const col = i % cols;
    const row = Math.floor(i / cols);
    const y = (rows - 1 - row) * H;
    r.setViewport(col * W, y, W, H);
    r.setScissor(col * W, y, W, H);
    r.render(s, cam);
  });
  window.__icon = r.domElement.toDataURL("image/png");
  window.__game.ready = true;
} catch (e) {
  window.__icon = "ERR " + (e.stack || e);
  window.__game.ready = true;
}

// Farm Valley look check: every machine in its farm livery (makeVehicleModel), the delivery pickup, the mine cart on
// rails, the boost pickup, a stretch of fence and a lamp, on grass. Snap it with scripts/plans/fv_machines.json.
import * as THREE from "three";
import { loadProps } from "/src/game/props3d.ts";
import { makeVehicleModel, makeCart, makeRails } from "/src/game/models.ts";
import { truckModel } from "/src/game/world/props.ts";
import { boostPickupMesh, farmLamp, woodFence } from "/src/game/world/farmScenery.ts";

const r = new THREE.WebGLRenderer({ antialias: true });
r.outputColorSpace = THREE.SRGBColorSpace;
r.setSize(innerWidth, innerHeight);
document.body.appendChild(r.domElement);
const s = new THREE.Scene();
s.background = new THREE.Color(0x8fcb57);
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 400);
cam.position.set(0, 34, 26);
cam.lookAt(0, 0, 2);
s.add(new THREE.HemisphereLight(0xeef7ff, 0x7d9a5a, 1.3));
const d = new THREE.DirectionalLight(0xfff1d6, 2.0);
d.position.set(10, 20, 12);
s.add(d);
const w = window as unknown as { __game: { ready: boolean }; __dbg: string };
w.__game = { ready: true };
w.__dbg = "loading";
try {
  await loadProps();
  const keys = ["wheelbarrow", "hydraulicBreaker", "wheelLoader", "rollerCrusher", "dumpTruck", "allTerrainVehicle", "drillCrusher", "crushHammer", "infernoBreaker", "haulTruck", "wheelCrusher", "fuelTruck"];
  keys.forEach((k, i) => {
    const m = makeVehicleModel(k);
    m.root.scale.setScalar(1.5);
    m.root.position.set(((i % 6) - 2.5) * 7, 0, i < 6 ? -8 : 0);
    m.root.rotation.y = 0.6;
    s.add(m.root);
  });
  const t = truckModel();
  t.root.position.set(-8, 0, 10);
  s.add(t.root);
  const c = makeCart();
  c.root.scale.setScalar(1.5);
  c.root.position.set(8, 0, 10);
  s.add(c.root);
  const rails = makeRails(new THREE.Vector3(8, 0, 4), new THREE.Vector3(8, 0, 16));
  s.add(rails);
  const p = boostPickupMesh(0xff5a4a);
  p.position.set(14, 1.0, 10);
  s.add(p);
  const p2 = boostPickupMesh(0x4fc3ff);
  p2.position.set(16, 1.0, 10);
  s.add(p2);
  const f = woodFence(2.25);
  f.position.set(2, 0, 12);
  s.add(f);
  const l = farmLamp();
  l.position.set(2, 0, 9);
  s.add(l);
  r.render(s, cam);
  w.__dbg = "ok";
} catch (e) {
  w.__dbg = "ERR " + ((e as Error).stack || e);
}

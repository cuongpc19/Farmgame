// Pack the machine/building models into src/assets/props/ (embedded textures, pruned,
// quantized). Sources and licences: src/assets/props/LICENSE.txt.
//
//   node scripts/build-props.mjs <dl_machines folder>
import { NodeIO } from "@gltf-transform/core";
import { prune, dedup, quantize } from "@gltf-transform/functions";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DL = process.argv[2];
const OUT = "src/assets/props";
const CAR = "kenney_car_kit/x/Models/GLB format";
const IND = "kenney_city_kit_industrial/x/Models/GLB format";
const SUR = "kenney_survival_kit/x/Models/GLB format";
const PROPS = {
  dozer: "poly_pizza/bulldozer__poly_by_google__CCBY__ddxtaegI3HQ.glb",
  dump: "poly_pizza/dump_truck__jeremy__CCBY__1BpGYg14QGD.glb",
  barrow: "poly_pizza/wheelbarrow__poly_by_google__CCBY__0VPTwKNVxk2.glb",
  tractor: `${CAR}/tractor.glb`,
  truckflat: `${CAR}/truck-flat.glb`,
  van: `${CAR}/delivery.glb`,
  wheel: `${CAR}/wheel-default.glb`,
  foundry: `${IND}/building-m.glb`,
  workshop: `${IND}/building-k.glb`,
  office: `${IND}/building-i.glb`,
  flat: `${IND}/building-q.glb`,
  tank: `${IND}/detail-tank-large.glb`,
  barrel: `${SUR}/barrel.glb`,
};
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
mkdirSync(OUT, { recursive: true });
for (const [name, src] of Object.entries(PROPS)) {
  const doc = await io.read(join(DL, src));
  await doc.transform(prune(), dedup(), quantize());
  const out = join(OUT, `${name}.glb`);
  await io.write(out, doc);
  console.log(out, statSync(out).size);
}

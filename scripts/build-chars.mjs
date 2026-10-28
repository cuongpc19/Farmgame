// Pack the character model for the game: Quaternius "Worker" (CC0, poly.pizza/m/Yg2bQZO6Hj,
// file https://static.poly.pizza/3a5f3056-ffe6-42eb-bd52-122afcbd22b2.glb).
// Keeps only the clips we use, drops unused data, quantizes vertex data.
//
//   node scripts/build-chars.mjs <worker.glb>
import { NodeIO } from "@gltf-transform/core";
import { prune, dedup, quantize } from "@gltf-transform/functions";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { mkdirSync, statSync } from "node:fs";

const SRC = process.argv[2];
const OUT = "src/assets/chars/worker.glb";
const CLIPS = ["Idle", "Walk", "Run"];
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
mkdirSync("src/assets/chars", { recursive: true });

const doc = await io.read(SRC);
for (const a of doc.getRoot().listAnimations()) {
  if (CLIPS.includes(a.getName().split("|").pop())) {
    // Finger keys are most of the clip data and invisible from the game camera.
    for (const c of a.listChannels()) {
      if (!/Index|Middle|Ring|Pinky|Thumb/.test(c.getTargetNode()?.getName() ?? "")) continue;
      c.getSampler()?.dispose();
      c.dispose();
    }
    continue;
  }
  // Disposing the animation alone leaves its samplers holding their accessors.
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}
await doc.transform(prune(), dedup(), quantize());
await io.write(OUT, doc);
console.log(OUT, statSync(OUT).size);

import type * as THREE from "three";

/**
 * Static scenery: compose the local matrices once and stop rebuilding them every frame. three.js
 * otherwise recomputes every object's matrix on every render (~9% of a frame on a weak machine
 * for ~900 objects, most of which never move). Anything at or under an object in `keep` stays
 * live (a bobbing beacon, a pile that bumps when an item lands).
 *
 * ⚠ A frozen object ignores later position / rotation / scale writes. Freeze only what is built
 * once and never moved; objects added to a frozen parent later are live by default.
 */
export function freeze(root: THREE.Object3D, keep: (THREE.Object3D | null | undefined)[] = []): void {
  root.updateMatrixWorld(true);
  const live = new Set(keep.filter(Boolean));
  const walk = (o: THREE.Object3D) => {
    if (live.has(o)) return;
    o.matrixAutoUpdate = false;
    for (const c of o.children) walk(c);
  };
  walk(root);
}

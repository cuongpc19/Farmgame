declare module "virtual:platform" {
  export const platform: import("./base").Platform;
}

/** Build target, from VITE_TARGET ("web" | "crazy"). Wording and dev-tool gating only. */
declare const __TARGET__: string;

/** Git short hash of the build, "+" when the tree was dirty (vite.config.ts). Telemetry rows carry it. */
declare const __BUILD__: string;

/** Vite's flag (the project does not pull in vite/client types). */
interface ImportMeta {
  readonly env: { readonly DEV: boolean };
}

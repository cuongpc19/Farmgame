import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

/**
 * Which host this build is for: `web` (dev server, artifact, self-hosted; the default) or
 * `crazy` (CrazyGames). ⚠ Split at the bundler, never at runtime: CrazyGames bans third-party
 * ad networks, so the SDK of one host must never sit in another host's bundle.
 * Build with `node scripts/build-target.mjs crazy` (it also checks the upload limits).
 */
const TARGET = process.env.VITE_TARGET ?? "web";
if (!["web", "crazy"].includes(TARGET)) throw new Error(`VITE_TARGET="${TARGET}" is not web | crazy`);

const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * Which code a telemetry row was played on: the git short hash, "+" when the tree is dirty (that
 * build is not the commit it names). Rows from different builds must not be averaged blindly.
 */
const BUILD = (() => {
  try {
    const hash = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
    const dirty = execSync("git status --porcelain --untracked-files=no", { cwd: root }).toString().trim() !== "";
    return hash + (dirty ? "+" : "");
  } catch {
    return "nogit";
  }
})();
const SDK_URL = "https://sdk.crazygames.com/crazygames-sdk-v3.js";

/**
 * CrazyGames: an ASYNC SDK tag in <head> (CRAZYGAMES_RULES §2.1), so the download starts with the
 * page instead of after the ~3 MB game script. ⚠ `async` is load-bearing: a blocking tag lets a
 * slow answer from their host stop the parser, and the deferred game module with it.
 */
function crazySdkTag() {
  return {
    name: "crazy-sdk-tag",
    transformIndexHtml(html: string) {
      if (TARGET !== "crazy") return html;
      return html.replace("<head>", `<head>\n    <script async src="${SDK_URL}"></script>`);
    },
  };
}

/**
 * The crazy build loads the game chunk only after `platform.init()` (main.ts), so the cloud save
 * is in before anything reads it. A modulepreload link starts that download with the page, so
 * waiting for the SDK costs no network time.
 */
function preloadBoot() {
  type Chunk = { type: string; facadeModuleId?: string | null; fileName: string };
  return {
    name: "preload-boot",
    apply: "build" as const,
    transformIndexHtml: {
      order: "post" as const,
      handler(html: string, ctx: { bundle?: Record<string, Chunk> }) {
        const b = ctx.bundle && Object.values(ctx.bundle).find((c) => c.type === "chunk" && /[\\/]src[\\/]boot\.ts$/.test(c.facadeModuleId ?? ""));
        return b ? html.replace("</head>", `  <link rel="modulepreload" crossorigin href="./${b.fileName}">\n  </head>`) : html;
      },
    },
  };
}

// base: "./" keeps asset paths relative so the same build works from a subfolder,
// from CrazyGames' iframe and from file:// inside the Capacitor wrapper.
export default defineConfig({
  base: "./",
  plugins: [crazySdkTag(), preloadBoot()],
  resolve: {
    alias: {
      // The platform door: the implementation not selected never enters the module graph.
      "virtual:platform": root + `src/platform/${TARGET === "crazy" ? "crazy" : "none"}.ts`,
    },
  },
  define: {
    __TARGET__: JSON.stringify(TARGET),
    __BUILD__: JSON.stringify(BUILD),
  },
  // Character models are imported as `*.glb?inline` (data URLs in the bundle, so the build
  // stays one self-contained file); Vite only inlines file types it knows as assets.
  assetsInclude: ["**/*.glb"],
  server: {
    // host: true so the dev server is reachable from a phone on the same wifi —
    // this is a touch game and has to be tried on a real phone.
    host: true,
    port: 5173,
    allowedHosts: [".trycloudflare.com"],
    // The headless test browser keeps its profile under scripts/.shots — never reload on it.
    watch: { ignored: ["**/scripts/.shots/**", "**/docs/**", "**/reports/**", "**/research_notes/**", "**/store/**"] },
  },
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      // web: one script, so `scripts/inline.mjs` can fold the build into the artifact page.
      // crazy: the game is its own chunk, evaluated after the SDK is up (see preloadBoot).
      output: { inlineDynamicImports: TARGET !== "crazy" },
    },
  },
});

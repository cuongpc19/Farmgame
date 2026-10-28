// Drive the game in a headless Chromium over raw CDP and bring back screenshots + console.
// No Playwright/Puppeteer: just a Chrome/Edge already on the machine.
//
//   npm run dev                                  # in another terminal
//   node scripts/shot.mjs                        # boot shot only
//   node scripts/shot.mjs --plan scripts/plans/tutorial.json
//   node scripts/shot.mjs --size 1280x720        # landscape (CrazyGames desktop frame)
//   QC_URL=http://localhost:4173/ node scripts/shot.mjs --plan scripts/plans/crazy.json --ready "!document.getElementById('boot')" [--hang-sdk]
//                                                # the built dist/ (vite preview), SDK reachable or hung
//
// A plan is a JSON array of steps, run in order:
//   {"wait": 500}                    sleep ms
//   {"snap": "name"}                 screenshot -> scripts/.shots/name.png
//   {"eval": "js expression"}        run in page, result printed
//   {"key": "w", "ms": 800}          hold a key for ms (movement)
//   {"tap": [x, y]}                  mouse click at CSS px
//   {"drag": [x0, y0, x1, y1], "ms": 1500}   one-finger touch drag, held at the end until ms
//   {"touchTap": [x, y]}             a quick finger tap (~80 ms, no movement)
//   {"until": "js bool expr", "timeout": 20000, "every": 200}   poll until true
// Output lands in scripts/.shots/ (gitignored).

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, ".shots");
const PORT = Number(process.env.QC_CDP_PORT ?? 9336);
const URL_BASE = process.env.QC_URL ?? "http://localhost:5173/";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
};
const [W, H] = String(arg("size", "540x1160")).split("x").map(Number);

const BROWSERS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.waiting = new Map();
    this.logs = [];
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.waiting.has(msg.id)) {
        this.waiting.get(msg.id)(msg);
        this.waiting.delete(msg.id);
      }
      if (msg.method === "Runtime.consoleAPICalled") {
        this.logs.push(`[${msg.params.type}] ` + msg.params.args.map((a) => a.value ?? a.description).join(" "));
      }
      if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails;
        this.logs.push(`[error] ${d.exception?.description ?? d.text}`);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.send("Runtime.evaluate", {
      // Promises are awaited (Game.advance, async page helpers) before the value comes back.
      expression: `Promise.resolve((()=>{return (${expr});})()).then((v) => JSON.stringify(v))`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.exception?.description };
    const v = r.result?.result?.value;
    return v == null ? null : JSON.parse(v);
  }
  async tap(x, y) {
    const base = { x, y, button: "left", clickCount: 1, buttons: 1 };
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", ...base });
    await sleep(60);
    await this.send("Input.dispatchMouseEvent", { ...base, type: "mouseReleased", buttons: 0 });
  }
  async touchTap(x, y) {
    await this.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] });
    await sleep(80);
    await this.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  async drag([x0, y0, x1, y1], ms) {
    const pt = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    await this.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(x0, y0) });
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      await sleep(30);
      await this.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps) });
    }
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      await sleep(120);
      await this.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(x1, y1) });
    }
    await this.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  async key(k, ms) {
    const code = { w: "KeyW", a: "KeyA", s: "KeyS", d: "KeyD" }[k] ?? k;
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code });
    await sleep(ms);
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code });
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const exe = BROWSERS.find((p) => existsSync(p));
  if (!exe) throw new Error("no Chromium-based browser found");
  const child = spawn(
    exe,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${join(OUT, PORT === 9336 ? "profile" : `profile-${PORT}`)}`,
      "--headless=new",
      "--no-first-run",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      `--window-size=${W},${H}`,
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try {
      const pages = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((t) => t.type === "page");
      target = pages[0] ?? null;
    } catch {
      /* starting */
    }
  }
  if (!target) throw new Error("browser never opened a page");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  const cdp = new Cdp(ws);
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  // --hang-sdk: the CrazyGames SDK request never answers and never errors (what an adblocker
  // does). The build must still boot. Paused requests are simply never continued.
  if (arg("hang-sdk", false)) await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*sdk.crazygames.com*" }] });
  // --dpr <n>: phone-like pixel density (details too small to judge at 1x).
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: Number(arg("dpr", 1)), mobile: false });
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  const q = [arg("keep-save", false) ? "" : "reset=1", arg("hq", false) ? "gfx=high" : "gfx=low"].filter(Boolean).join("&");
  await cdp.send("Page.navigate", { url: URL_BASE + (q ? (URL_BASE.includes("?") ? "&" : "?") + q : "") });

  let ready = false;
  // --boot-timeout <s>: big windows and parallel runs boot slower under software GL.
  const bootTries = Number(arg("boot-timeout", 30)) * 4;
  for (let i = 0; i < bootTries && !ready; i++) {
    await sleep(250);
    // --ready "<js>": production builds have no window.__game test handle.
    ready = await cdp.eval(String(arg("ready", "!!(window.__game && window.__game.ready)")));
  }
  if (!ready) {
    console.log(cdp.logs.join("\n"));
    throw new Error("game never booted");
  }

  const shots = [];
  const snap = async (name) => {
    const r = await cdp.send("Page.captureScreenshot", { format: "png" });
    const file = join(OUT, `${name}.png`);
    writeFileSync(file, Buffer.from(r.result.data, "base64"));
    shots.push(file);
  };

  const planFile = arg("plan", null);
  const plan = planFile ? JSON.parse(readFileSync(planFile, "utf8")) : [{ wait: 1200 }, { snap: "boot" }];
  for (const step of plan) {
    if (step.wait) await sleep(step.wait);
    if (step.eval) console.log("eval:", step.eval.slice(0, 60), "->", JSON.stringify(await cdp.eval(step.eval)));
    // {"evalFile": "scripts/store/scenes.js"}: define page helpers too long for a JSON string.
    if (step.evalFile) console.log("evalFile:", step.evalFile, "->", JSON.stringify(await cdp.eval(readFileSync(join(HERE, "..", step.evalFile), "utf8"))));
    if (step.key) await cdp.key(step.key, step.ms ?? 500);
    if (step.tap) await cdp.tap(step.tap[0], step.tap[1]);
    // {"tapSel": "css selector"}: a real (trusted) tap on the centre of the first match.
    if (step.tapSel) {
      const r = await cdp.eval(`(()=>{const e=document.querySelector(${JSON.stringify(step.tapSel)}); if(!e) return null; const b=e.getBoundingClientRect(); return [b.x+b.width/2, b.y+b.height/2];})()`);
      if (r) await cdp.tap(Math.round(r[0]), Math.round(r[1]));
      else console.log(`tapSel ${step.tapSel}: no match`);
    }
    if (step.drag) await cdp.drag(step.drag, step.ms ?? 1000);
    if (step.touchTap) await cdp.touchTap(step.touchTap[0], step.touchTap[1]);
    if (step.until) {
      const t0 = Date.now();
      let ok = false;
      while (Date.now() - t0 < (step.timeout ?? 20000)) {
        ok = await cdp.eval(step.until);
        if (ok === true) break;
        await sleep(step.every ?? 200);
      }
      console.log(`until ${step.until.slice(0, 50)} -> ${ok} (${Date.now() - t0}ms)`);
    }
    if (step.pause) {
      // Freeze the page and print where the main thread is (debugging hangs).
      await cdp.send("Debugger.enable");
      const paused = new Promise((res) => {
        const h = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.method === "Debugger.paused") {
            ws.removeEventListener("message", h);
            res(msg.params);
          }
        };
        ws.addEventListener("message", h);
      });
      await cdp.send("Debugger.pause");
      const pr = await Promise.race([paused, sleep(10000).then(() => null)]);
      if (pr) for (const f of pr.callFrames.slice(0, 12)) console.log("  at", f.functionName || "(anon)", f.url.split("/").slice(-2).join("/"), f.location.lineNumber + 1);
      else console.log("pause timed out");
      await cdp.send("Debugger.resume");
    }
    if (step.snap) await snap(step.snap);
    // {"cpuThrottle": 4}: emulate a slower CPU (weak laptops / Chromebooks) for the steps after.
    if (step.cpuThrottle) await cdp.send("Emulation.setCPUThrottlingRate", { rate: step.cpuThrottle });
    // {"metrics": 5000}: main-thread work per second over N ms (script, layout, style recalcs).
    if (step.metrics) {
      await cdp.send("Performance.enable");
      const get = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).result.metrics.map((m) => [m.name, m.value]));
      const a0 = await get();
      await sleep(step.metrics);
      const a1 = await get();
      const s = step.metrics / 1000;
      const per = (k) => (a1[k] - a0[k]) / s;
      console.log(
        `metrics/s: task ${(per("TaskDuration") * 1000).toFixed(0)} ms · script ${(per("ScriptDuration") * 1000).toFixed(0)} ms · layout ${(per("LayoutDuration") * 1000).toFixed(1)} ms (${per("LayoutCount").toFixed(1)}x) · style ${(per("RecalcStyleDuration") * 1000).toFixed(1)} ms (${per("RecalcStyleCount").toFixed(1)}x)`,
      );
    }
    // {"profile": 5000}: sample the page's JS for N ms and print the top functions by self time.
    if (step.profile) {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
      await cdp.send("Profiler.start");
      await sleep(step.profile);
      const { result } = await cdp.send("Profiler.stop");
      const prof = result.profile;
      const dt = prof.timeDeltas;
      const self = new Map();
      const byId = new Map(prof.nodes.map((n) => [n.id, n]));
      for (let i = 0; i < prof.samples.length; i++) {
        const n = byId.get(prof.samples[i]);
        const f = n.callFrame;
        const key = `${f.functionName || "(anon)"} ${f.url.split("/").slice(-1)[0].split("?")[0]}:${f.lineNumber + 1}`;
        self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0));
      }
      const total = [...self.values()].reduce((a, b) => a + b, 0);
      console.log(`profile ${step.profile} ms (top self time):`);
      for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, step.top ?? 30)) console.log(`  ${((v / total) * 100).toFixed(1).padStart(5)}%  ${k}`);
      // "callers": "fnName" prints who calls it (5 frames up), weighted by samples.
      if (step.callers) {
        const parent = new Map();
        for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
        const chains = new Map();
        for (let i = 0; i < prof.samples.length; i++) {
          let id = prof.samples[i];
          if (byId.get(id).callFrame.functionName !== step.callers) continue;
          const chain = [];
          for (let k = 0; k < 6 && parent.has(id); k++) {
            id = parent.get(id);
            const f = byId.get(id).callFrame;
            chain.push(`${f.functionName || "(anon)"}@${f.url.split("/").slice(-1)[0].split("?")[0]}:${f.lineNumber + 1}`);
          }
          const key = chain.join(" < ");
          chains.set(key, (chains.get(key) ?? 0) + 1);
        }
        console.log(`callers of ${step.callers}:`);
        for (const [k, v] of [...chains].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`  ${v}x  ${k}`);
      }
    }
  }
  console.log(cdp.logs.length ? cdp.logs.join("\n") : "console clean");
  console.log("shots:\n" + shots.join("\n"));
  ws.close();
  child.kill();
  // Chrome's helper processes keep the event loop alive on Windows; leave explicitly.
  setTimeout(() => process.exit(0), 300);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

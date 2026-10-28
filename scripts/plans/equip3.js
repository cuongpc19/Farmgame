// Page helpers for plans/equip3*.json (loaded with {"evalFile": "scripts/plans/equip3.js"}).
// One expression: shot.mjs wraps the file in `return (…)`.
(() => {
  const g = () => window.__game;
  const H = (window.__eq = {});
  H.skipDlg = () => {
    let n = 0;
    while (g().dialogue.open && n < 80) {
      document.querySelector(".dlg").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      n++;
    }
    if (g().spot.open) g().spot.close();
    return n;
  };
  H.veh = (k) => g().vehicles.find((v) => v.key === k);
  /** Stand on an item's plate in the shop. */
  H.plate = (k) => {
    const p = g().shopIn.platePos(k);
    if (!p) return "no plate " + k;
    g().player.pos.copy(p);
    return true;
  };
  /** Press the buy / rent button of the open item card. */
  H.buy = () => {
    const b = document.querySelector(".icard [data-buy]");
    if (!b) return document.querySelector(".icard")?.textContent?.slice(0, 80) ?? "no card";
    b.click();
    H.skipDlg();
    return true;
  };
  /** A block on the quarry's edge near home with two free cells in front (room for a machine). */
  H.spot = (taken = []) => {
    const G = g();
    const f = G.field;
    const C = f.cell;
    const home = G.homePos;
    const c = new home.constructor();
    const d = (b) => (b.cx * C - home.x) ** 2 + (b.cz * C - home.z) ** 2;
    const blocks = f.blocks.filter((b) => b.alive).sort((a, b) => d(a) - d(b));
    for (const b of blocks.slice(0, 600)) {
      for (const [ox, oz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        if (f.at(b.cx + ox, b.cz + oz) || f.at(b.cx + 2 * ox, b.cz + 2 * oz)) continue;
        f.center(b, c);
        const x = c.x + ox * C * 1.25;
        const z = c.z + oz * C * 1.25;
        if (!G.map.inside(x, z) || !G.map.inside(c.x + ox * C * 2, c.z + oz * C * 2)) continue;
        if (G.solids.some((s) => x > s.x0 - 2 && x < s.x1 + 2 && z > s.z0 - 2 && z < s.z1 + 2)) continue;
        if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < 7)) continue;
        return { x, z, facing: Math.atan2(-ox, -oz), block: [b.cx, b.cz] };
      }
    }
    return null;
  };
  H.used = [];
  /**
   * Drive machine k (dismounting the current one) and park it facing a fresh block face, or at
   * an earlier spot (index into H.used) after moving whatever stands there out of the way.
   */
  H.park = (k, reuse) => {
    const G = g();
    const v = H.veh(k);
    if (!v) return "no " + k;
    if (G.driving && G.driving !== v) {
      G.driving.moving = false;
      G.dismount();
    }
    if (G.driving !== v) G.mount(v);
    H.skipDlg();
    const s = reuse !== undefined ? H.used[reuse] : H.spot(H.used);
    if (!s) return "no spot";
    if (reuse === undefined) H.used.push(s);
    else
      G.vehicles.forEach((o, i) => {
        if (o !== v && Math.hypot(o.pos.x - s.x, o.pos.z - s.z) < 7) o.pos.set(G.homePos.x + 8 + i * 7, 0, G.homePos.z + 6);
      });
    v.pos.set(s.x, 0, s.z);
    v.facing = s.facing;
    if (v.tank) v.fuel = v.tank;
    H.t0 = { remaining: G.field.remaining, fuel: v.fuel, cargo: v.stack.count };
    return { k, at: [+s.x.toFixed(1), +s.z.toFixed(1)], block: s.block };
  };
  H.report = (k) => {
    const G = g();
    const v = H.veh(k);
    if (!v) return "no " + k;
    return {
      k,
      driving: G.driving?.key ?? null,
      broke: H.t0.remaining - G.field.remaining,
      fuelUsed: +(H.t0.fuel - v.fuel).toFixed(2),
      cargo: `${v.stack.count}/${v.stack.capacity}`,
      mines: v.mines,
      carries: v.carries,
      feeds: v.feeds,
      targets: v.targets,
      reach: v.reach,
      power: +v.power.toFixed(1),
      empty: v.empty,
    };
  };
  /** Fuel Truck test without Game.ts wiring: drain machine k, park the truck beside it, pump. */
  H.feed = (k) => {
    const G = g();
    const ft = H.veh("fuelTruck");
    const v = H.veh(k);
    if (!ft || !v) return "missing";
    v.fuel = 0;
    const r0 = ft.fuelReserve;
    ft.pos.set(v.pos.x + Math.sin(v.facing + Math.PI / 2) * (v.radius + ft.radius + 0.8), 0, v.pos.z + Math.cos(v.facing + Math.PI / 2) * (v.radius + ft.radius + 0.8));
    let fed = 0;
    for (let i = 0; i < 40; i++) if (ft.refuelNearby(G.vehicles, 0.05) === v) fed++;
    const far = ft.pos.clone();
    ft.pos.set(v.pos.x + 30, 0, v.pos.z);
    const stillFed = ft.refuelNearby(G.vehicles, 1) !== null;
    ft.pos.copy(far);
    return { k, topUps: fed, fuel: +v.fuel.toFixed(1), tank: v.tank, reserveBefore: r0, reserveAfter: ft.fuelReserve, farFeeds: stillFed };
  };
  /** On foot: step up to a fresh block face (or the last one), within arm's reach. */
  H.walkUp = (again) => {
    const G = g();
    if (G.driving) {
      G.driving.moving = false;
      G.dismount();
    }
    const s = again ? H.pspot : H.spot(H.used);
    if (!s) return "no spot";
    if (!again) {
      H.used.push(s);
      H.pspot = s;
    }
    const C = G.field.cell;
    const fx = Math.sin(s.facing);
    const fz = Math.cos(s.facing);
    const bx = s.x + fx * 1.25 * C;
    const bz = s.z + fz * 1.25 * C;
    G.player.pos.set(bx - fx * (C / 2 + 0.8), 0, bz - fz * (C / 2 + 0.8));
    G.player.facing = s.facing;
    H.p0 = G.field.remaining;
    H.hits = 0;
    clearInterval(H.watch);
    // Count drilling poses seen (the pose only lasts ~0.45 s after a hit).
    H.watch = setInterval(() => (H.hits += G.player.model.drillT > 0 ? 1 : 0), 100);
    return { at: [+G.player.pos.x.toFixed(1), +G.player.pos.z.toFixed(1)] };
  };
  H.playerReport = () => {
    const G = g();
    const m = G.player.model;
    return { mining: G.debug.state().equipMining, carrying: G.debug.state().equipCarrying, tool: m.toolKey, back: m.backKey, grip: m.grip, power: G.player.power, broke: H.p0 - G.field.remaining, drillTicks: H.hits, heat: +m.heat.toFixed(2) };
  };
  return "helpers ok";
})()

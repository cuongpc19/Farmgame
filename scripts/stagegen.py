# Our own quarry for a stage: keeps the base (everything south of the quarry mouth) and
# replaces the quarry with a fan that opens out from the base (map idea A, user 2026-10-19).
#
#   python -I scripts/stagegen.py preview <out.png> [--angles 120,90]   # sketches for review
#   python -I scripts/stagegen.py write --angle 140                      # src/data/game/stage1.json
#
# Ores: the original stage's exact count per ore, dealt out "richer the farther from base":
# the original blocks sorted by walking distance from the base give the ore sequence, and
# the new cells sorted the same way receive it (lightly shuffled so the bands look natural).
import json, math, os, random, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ORIG = json.load(open(os.path.join(ROOT, "src/data/orig/stage1.json"), encoding="utf-8"))
MOUTH_Z = 500            # first quarry row; everything below is the base and stays as it is
TILE = 4                 # ground / obstacle tiles are 4x4 cells on the original grid
TX0, TZ0 = 487 % TILE, 488 % TILE

def tile_of(x, z):
    return (x - (x - TX0) % TILE, z - (z - TZ0) % TILE)

def bfs(passable, sources):
    d = {c: 0 for c in sources}
    q = collections.deque(sources)
    while q:
        x, z = q.popleft()
        for n in ((x + 1, z), (x - 1, z), (x, z + 1), (x, z - 1)):
            if n in passable and n not in d:
                d[n] = d[(x, z)] + 1
                q.append(n)
    return d

def tile_cells(t):
    return [(t[0] + i, t[1] + j) for i in range(TILE) for j in range(TILE)]

def area_cells(rects):
    return {c for r in rects for c in tile_cells((r["x"], r["z"]))}

BASE_GROUND = [r for r in ORIG["areas"]["ground"] if r["z"] < MOUTH_Z]
HOME = ORIG["areas"]["home"]
HOME_CELLS = area_cells(HOME)

def furnace_stats(blocks):
    """Straight-line cells from the furnace to the blocks: all of them, and the nearest 200."""
    d = sorted(math.hypot(x + 0.5 - FURNACE_C[0], z + 0.5 - FURNACE_C[1]) for x, z in blocks)
    return sum(d) / len(d), sum(d[:200]) / 200, d[0]

def walk_stats(blocks, ground_cells):
    d = bfs(set(blocks) | ground_cells | HOME_CELLS, list(HOME_CELLS))
    v = [d[c] for c in blocks if c in d]
    return sum(v) / len(v), max(v), len(v)

# Ore sequence of the original, nearest block first.
_og = area_cells(ORIG["areas"]["ground"])
_ob = {(b["x"], b["z"]): b["ore"] for b in ORIG["blocks"]}
_d0 = bfs(set(_ob) | _og | HOME_CELLS, list(HOME_CELLS))
_r = random.Random(7)
PROFILE = [o for _, _, o in sorted((_d0[c], _r.random(), o) for c, o in _ob.items())]
N = len(PROFILE)
ORIG_WALK = walk_stats(_ob, _og)

STORAGE = next(b for b in ORIG["buildings"] if b["type"] == "oreStorage")
RAIL_END = [STORAGE["x"] + 2, STORAGE["z"]]          # the original's rail end, next to the storage

FURNACE = next(b for b in ORIG["buildings"] if b["type"] == "furnace")
FURNACE_C = (FURNACE["x"] + FURNACE["w"] / 2, FURNACE["z"] + FURNACE["h"] / 2)

# Where the fan opens (user 2026-10-21: "a fan, but nearer the houses, above all the furnace"):
# the apex sits FAN_BACK cells behind the quarry mouth, in line with the furnace, so the quarry's
# very first row is already a wide face of rock; FAN_APRON is bare ground around the apex. v1
# (2026-10-19) had the apex on the mouth at x 503 with 5 cells of bare ground: the first rock was
# 5 rows in and the narrow tip held few blocks, so most of the quarry was a long walk.
FAN_CX, FAN_BACK, FAN_APRON = 506.0, 4.0, 2.0
LAYOUT_V = 3            # bump whenever the cells change: saves of another layout restart this quarry
# The ore ladder (Mars Miner, user 2026-10-28: "two hits and a limestone is done at first; only a while later do
# players meet the other rocks"): (nearest blocks to the base, the hardest ore allowed among them, in HP). The
# first 200 are limestone only (2 hits with the starting pickaxe), then sandstone and copper (150 HP; quest 1025
# wants 10 metal ores, players reach it about 320 blocks in), iron (400), up to silver (800); gold, amethyst and
# diamond only past 700. Same count per ore as the original. Before: limestone for 100 blocks with 4 soft accents,
# then the original's profile (iron at block 103, silver 111, gold 181).
LADDER = ((200, 50), (350, 150), (500, 400), (700, 800))
ORE_HP = {k: o["hp"] for k, o in json.load(open(os.path.join(ROOT, "src/data/orig/economy.json"), encoding="utf-8"))["ores"].items()}

def fan(angle_deg, cx=FAN_CX, back=FAN_BACK, apron=FAN_APRON, seed=1):
    """Cells of a fan of `angle_deg` opening north from (cx, MOUTH_Z - back), sized to hold N blocks."""
    cz = MOUTH_Z - back
    half = math.radians(angle_deg) / 2
    def inside(x, z, R):
        dx, dz = x + 0.5 - cx, z + 0.5 - cz
        r = math.hypot(dx, dz)
        if dz <= 0 or r > R: return None
        a = math.atan2(dx, dz)                         # 0 = due north
        return r if abs(a) <= half else None
    # Rails: three spokes from a parking spot in the fan back to the storage at the base, like
    # the original's lane (open ground, no ore on it). Cart 101 (FREE) parks near the mouth as in
    # the original (5 rows in), 102 half way, 103 deep. Waypoints are integers in the data's
    # convention (Minecart.ts: the rail centre of waypoint (x, z) is cell (x + 0.5, z - 0.5));
    # in this script's cell-corner coordinates that centre is (x + 1, z).
    CARTS = ((101, -0.62, None), (102, 0.62, 0.55), (103, 0.0, 0.9))
    def mouth_L(a):
        """Distance along a spoke from the apex to the first quarry row (the apex may sit behind it)."""
        return max(apron, (MOUTH_Z + 1 - cz) / math.cos(a))
    def waypoints(ang_frac, depth_frac, R):
        a = half * ang_frac
        m = mouth_L(a)
        L = m + 4 if depth_frac is None else m + (R - m) * depth_frac
        to_w = lambda fx, fz: [round(fx - 1), round(fz)]
        deep = to_w(cx + L * math.sin(a), cz + L * math.cos(a))
        near = to_w(cx + m * math.sin(a), cz + m * math.cos(a))
        return [deep, near, [RAIL_END[0], MOUTH_Z + 1], list(RAIL_END)]
    centre = lambda w: (w[0] + 1.0, w[1] * 1.0)
    def rail_cells(wps):
        out = set()
        pts = [centre(w) for w in wps]
        for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
            n = int(math.hypot(x1 - x0, z1 - z0) * 3) + 1
            for k in range(n + 1):
                x, z = x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n
                for ox in (-1.0, 0.0, 1.0):
                    for oz in (-1.0, 0.0, 1.0):
                        out.add((math.floor(x + ox * 0.6), math.floor(z + oz * 0.6)))
        # The ACTIVATE pad sits 1.4 cells west of the parked cart (Minecart.lock): keep it clear.
        px, pz = pts[0][0] - 1.4, pts[0][1]
        out |= {(x, z) for x in range(math.floor(px - 1.2), math.floor(px + 1.2) + 1) for z in range(math.floor(pz - 1.2), math.floor(pz + 1.2) + 1)}
        return out
    R = max(apron, back) + 2
    while True:
        R += 0.25
        carts = [(g, waypoints(f, d, R)) for g, f, d in CARTS]
        rails = set().union(*(rail_cells(w) for _, w in carts))
        cand = [(x, z) for x in range(int(cx - R) - 1, int(cx + R) + 2) for z in range(MOUTH_Z, int(cz + R) + 2)
                if (r := inside(x, z, R)) is not None and r >= apron and (x, z) not in rails]
        if len(cand) >= N: break
    spokes = [[centre(w) for w in wps] for _, wps in carts]
    apron_cells = {(x, z) for x in range(int(cx - apron) - 1, int(cx + apron) + 2) for z in range(MOUTH_Z, int(cz + apron) + 2)
                   if (r := inside(x, z, apron + 0.01)) is not None}
    # Ground tiles: every 4x4 tile touched by the fan, the apron or a rail.
    tiles = {tile_of(x, z) for x, z in set(cand) | apron_cells | rails}
    ground = set().union(*(set(tile_cells(t)) for t in tiles)) | area_cells(BASE_GROUND)
    d = bfs(set(cand) | ground | HOME_CELLS, list(HOME_CELLS))
    cand = sorted((c for c in cand if c in d), key=lambda c: (d[c], c[0] * 1e-3))[:N]
    ores = list(PROFILE)
    rr = random.Random(seed)
    for i in range(N):
        j = min(N - 1, max(0, i + rr.randint(-30, 30)))
        ores[i], ores[j] = ores[j], ores[i]
    # The LADDER, outermost step first: each ore too hard for its step swaps with one soft enough from
    # further in, spread evenly over the next 2 x the step's blocks (swapping with the nearest ones piled them
    # into a wall of metal right behind the front, 2026-10-21). An ore moved out of a step is at most as hard
    # as the step after it allows, since that step was dealt first.
    for upto, hp in reversed(LADDER):
        hard = [i for i in range(min(upto, N)) if ORE_HP[ores[i]] > hp]
        soft = [j for j in range(upto, min(N, upto * 3)) if ORE_HP[ores[j]] <= hp]
        for k, i in enumerate(hard):
            j = soft[(k * len(soft)) // len(hard) + len(soft) // (2 * len(hard))]
            ores[i], ores[j] = ores[j], ores[i]
    blocks = dict(zip(cand, ores))
    # Drop ground tiles that ended up with nothing on them beyond the trimmed rim.
    used = {tile_of(*c) for c in set(blocks) | apron_cells | rails}
    q_tiles = {t for t in tiles if t in used}
    # Cliff ring: tiles around the quarry tiles (and the original base cliffs south of the mouth).
    ring = set()
    for tx, tz in q_tiles:
        for ox in (-TILE, 0, TILE):
            for oz in (-TILE, 0, TILE):
                n = (tx + ox, tz + oz)
                if n not in q_tiles and n[1] >= MOUTH_Z - TILE: ring.add(n)
    base_tiles = {(r["x"], r["z"]) for r in BASE_GROUND + HOME}
    ring -= base_tiles
    return dict(angle=angle_deg, R=R, blocks=blocks, q_tiles=q_tiles, ring=ring, spokes=spokes, rails=rails, carts=carts)

def write(angle, out):
    """The stage JSON the game loads: the original's base and stage fields, our quarry."""
    f = fan(angle)
    st = json.loads(json.dumps(ORIG))
    st["_note"] = (f"Quarry: ours, a {angle} degree fan (map idea A), generated by scripts/stagegen.py - do not edit by hand. "
                   "TEMPORARY: the base layout, clear rule, rewards and contract fields are still the original game's.")
    tile = lambda t: {"x": t[0], "z": t[1], "w": TILE, "h": TILE}
    # No cliff walls beside the houses (user 2026-10-21: "too many unbreakable crates next to the
    # houses"): the base's own side walls and any ring tile south of the quarry mouth go, and the
    # ground just drops to grass there (cliffs were never walkable, so nothing else changes). The
    # road tiles south of the base stay (MapView: obstacles below every ground row are road), and
    # so does the ring around the quarry.
    # Those slots become "lawn" (MapView shows the grass there instead of filling the gap with water).
    min_z = min(r["z"] for r in BASE_GROUND + HOME)
    floor = {(r["x"], r["z"]) for r in BASE_GROUND + HOME} | set(f["q_tiles"])
    lawn = {(r["x"], r["z"]) for r in ORIG["areas"]["obstacle"] if min_z <= r["z"] < MOUTH_Z} | {t for t in f["ring"] if t[1] < MOUTH_Z}
    st["areas"] = {
        "ground": BASE_GROUND + [tile(t) for t in sorted(f["q_tiles"])],
        "home": HOME,
        "obstacle": [r for r in ORIG["areas"]["obstacle"] if r["z"] < min_z] + [tile(t) for t in sorted(f["ring"]) if t[1] >= MOUTH_Z],
        "lawn": [tile(t) for t in sorted(lawn - floor)],
    }
    by_group = {s["structureGroupId"]: s for s in ORIG["structures"]}
    st["structures"] = []
    for g, wps in f["carts"]:
        s = json.loads(json.dumps(by_group[g]))
        (x0, z0), (x1, z1) = wps[0], wps[1]
        s.update(x=wps[0][0], z=wps[0][1], railWaypoints=wps, rotY=round(math.degrees(math.atan2(x1 - x0, z1 - z0))) % 360,
                 worldCenter=[(wps[0][0] + 1 - 500) * 2.5, 0.0, (wps[0][1] + 1 - 500) * 2.5])
        st["structures"].append(s)
    # Saves keep broken blocks by index: a new layout id makes Game start this quarry afresh.
    st["layoutId"] = f"fan{angle}-v{LAYOUT_V}"
    st["oreGroups"] = []
    st["blocks"] = [{"x": x, "z": z, "ore": o} for (x, z), o in sorted(f["blocks"].items(), key=lambda kv: (kv[0][1], kv[0][0]))]
    by_ore = collections.Counter(f["blocks"].values())
    st["totals"] = {"original": ORIG["totals"]["original"],
                    "resolved": {"blocks": N, "dropItems": N * 6, "duplicateCellsRemoved": 0, "byOre": dict(by_ore.most_common())}}
    cells = [(b["x"], b["z"]) for b in st["blocks"]] + [c for r in st["areas"]["ground"] + st["areas"]["obstacle"] for c in tile_cells((r["x"], r["z"]))]
    st["grid"]["usedBounds"] = {"minX": min(c[0] for c in cells), "maxX": max(c[0] for c in cells),
                                "minZ": min(c[1] for c in cells), "maxZ": max(c[1] for c in cells)}
    # Our town layout for the base, then the same scrub as the other shipped tables.
    sys.path.insert(0, HERE)
    from townbase import town_base
    from slimdata import stage as slim
    st = slim(town_base(st))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(st, fh, ensure_ascii=False, separators=(",", ":"))
    gcells = {c for t in f["q_tiles"] for c in tile_cells(t)} | area_cells(BASE_GROUND)
    return f, walk_stats(f["blocks"], gcells)

# ---------- drawing ----------
def render(panels, out):
    from PIL import Image, ImageDraw, ImageFont
    F = lambda s, b=False: ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf" if b else "C:/Windows/Fonts/segoeui.ttf", s)
    PX = 8
    ORE_COL = {"limestone": 0xcdc9c0, "sandstone": 0xd8a466, "copper": 0xe0703a, "iron": 0xb8b0a8, "manganese": 0x9a6fb0,
               "silver": 0xe8eef5, "gold": 0xffcf2e, "amber": 0xff9a1f, "amethyst": 0xb05cff, "diamond": 0x8ff3ff}
    rgb = lambda c: ((c >> 16) & 255, (c >> 8) & 255, c & 255)
    LAB = {"workerBuilding": "Thợ", "furnace": "Lò", "machineryShop": "Shop", "upgradeBuilding": "N.cấp",
           "oilStation": "Dầu", "salesStand": "Bán", "oreStorage": "Kho"}
    BC = {"Lò": (90, 96, 112), "Bán": (60, 150, 80), "Shop": (200, 120, 40), "N.cấp": (50, 110, 190),
          "Dầu": (40, 40, 48), "Thợ": (70, 120, 200), "Kho": (150, 110, 60)}
    imgs = []
    for p in panels:
        cells = set(p["blocks"]) | {c for t in p["q_tiles"] | p["ring"] for c in tile_cells(t)} | area_cells(ORIG["areas"]["obstacle"]) | HOME_CELLS
        xs = [c[0] for c in cells]; zs = [c[1] for c in cells]
        minx, maxx, minz, maxz = min(xs) - 1, max(xs) + 1, min(zs) - 1, max(zs) + 1
        W, H = (maxx - minx + 1) * PX, (maxz - minz + 1) * PX
        head, foot = 92, 58
        img = Image.new("RGB", (max(W, 470) + 24, H + head + foot), (34, 32, 30))
        d = ImageDraw.Draw(img)
        ox, oy = 12 + (max(W, 470) - W) // 2, head
        P = lambda x, z: (ox + (x - minx) * PX, oy + (maxz - z) * PX)
        def cell(c, col, inset=0):
            a, b = P(*c)
            d.rectangle([a, b, a + PX - 1 - inset, b + PX - 1 - inset], fill=col)
        d.rectangle([ox, oy, ox + W - 1, oy + H - 1], fill=(34, 32, 30))
        obst = area_cells([r for r in ORIG["areas"]["obstacle"] if r["z"] < MOUTH_Z]) if p.get("new") else area_cells(ORIG["areas"]["obstacle"])
        for c in obst | {c for t in p["ring"] for c in tile_cells(t)}: cell(c, (58, 52, 48))
        for c in {c for t in p["q_tiles"] for c in tile_cells(t)} | area_cells(BASE_GROUND): cell(c, (122, 98, 72))
        for c in HOME_CELLS: cell(c, (150, 154, 160))
        for c, o in p["blocks"].items(): cell(c, rgb(ORE_COL[o]), 1)
        for pts in p["spokes"]:
            q = [(ox + (x - minx) * PX, oy + (maxz - z) * PX) for x, z in pts]
            d.line(q, fill=(30, 30, 30), width=6); d.line(q, fill=(170, 170, 170), width=1)
            a, b = q[0]; d.rectangle([a - 6, b - 6, a + 6, b + 6], fill=(230, 60, 50), outline=(20, 20, 20))
        for b in ORIG["buildings"]:
            lab = LAB[b["type"]]
            a, c = P(b["x"], b["z"] + b["h"] - 1)
            d.rectangle([a, c, a + b["w"] * PX - 2, c + b["h"] * PX - 2], fill=BC[lab], outline=(20, 20, 20))
            tw = d.textlength(lab, font=F(9, True))
            d.text((a + (b["w"] * PX - tw) / 2, c + b["h"] * PX), lab, font=F(9, True), fill=(255, 255, 255))
        d.text((12, 8), p["title"], font=F(20, True), fill=(255, 255, 255))
        for i, ln in enumerate(p["lines"]): d.text((12, 36 + i * 17), ln, font=F(13), fill=(210, 210, 210))
        avg, mx, n = p["walk"]
        delta = "" if not p.get("new") else f"  ({(avg / ORIG_WALK[0] - 1) * 100:+.0f}% so với gốc)"
        d.text((12, img.height - foot + 8), f"{len(p['blocks'])} khối · đi bộ trung bình {avg:.0f} ô, xa nhất {mx} ô{delta}", font=F(13, True), fill=(255, 230, 140))
        d.text((12, img.height - foot + 30), "Khu nhà giữ nguyên bản hiện tại · đỏ = chỗ đỗ xe goòng", font=F(12), fill=(180, 180, 180))
        imgs.append(img)
    gap = 14
    sheet = Image.new("RGB", (sum(i.width for i in imgs) + gap * (len(imgs) + 1), max(i.height for i in imgs) + gap * 2), (20, 19, 18))
    x = gap
    for i in imgs:
        sheet.paste(i, (x, gap)); x += i.width + gap
    sheet.save(out)
    return sheet.size

def original_panel():
    rails = [[(x + 1.0, z * 1.0) for x, z in s["railWaypoints"]] for s in ORIG["structures"] if s.get("railWaypoints")]
    return dict(title="Bản gốc", lines=["Hành lang thẳng 16 ô, sâu ~76 ô."], blocks=_ob,
                q_tiles={(r["x"], r["z"]) for r in ORIG["areas"]["ground"] if r["z"] >= MOUTH_Z}, ring=set(), spokes=rails, walk=ORIG_WALK)

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "preview":
        out = sys.argv[2]
        angles = [int(a) for a in (sys.argv[sys.argv.index("--angles") + 1] if "--angles" in sys.argv else "120,90").split(",")]
        panels = [original_panel()]
        for a in angles:
            f = fan(a)
            gcells = {c for t in f["q_tiles"] for c in tile_cells(t)} | area_cells(BASE_GROUND)
            f.update(title=f"A. Quạt {a}°", lines=[f"Mỏ toả ra từ cửa mỏ, bán kính ~{f['R']:.0f} ô.", "Vòng trong đá thường, vòng ngoài quặng quý.", "3 xe goòng chạy theo 3 nan quạt về Kho."],
                     walk=walk_stats(f["blocks"], gcells), new=True)
            assert collections.Counter(f["blocks"].values()) == collections.Counter(_ob.values())
            panels.append(f)
            print(f"angle {a}: R={f['R']:.1f} blocks={len(f['blocks'])} walk avg {f['walk'][0]:.1f} max {f['walk'][1]} tiles {len(f['q_tiles'])} cliffs {len(f['ring'])}")
        print("orig walk avg %.1f max %d" % ORIG_WALK[:2])
        print("sheet", render(panels, out))
    elif cmd == "write":
        # 140 since 2026-10-21 (user: nearer the houses): wider and shallower than v1's 120.
        angle = int(sys.argv[sys.argv.index("--angle") + 1]) if "--angle" in sys.argv else 140
        out = os.path.join(ROOT, "src/data/game/stage1.json")
        f, walk = write(angle, out)
        print(f"wrote {out}: fan {angle} deg, R={f['R']:.1f}, {len(f['blocks'])} blocks, walk avg {walk[0]:.1f} (orig {ORIG_WALK[0]:.1f}), "
              f"carts " + ", ".join(f"{g}:{w}" for g, w in f["carts"]))

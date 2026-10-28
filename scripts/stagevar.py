# Our version of the original stages 2-10 (user 2026-10-20: "change the maps a little"; map idea E):
# the quarry (everything north of the home area) is mirrored left <-> right and the ores are dealt
# out again, keeping each ore's exact count and the original's depth profile (which ores lie how
# far from the base), so the stage plays and pays like the original but does not look like it.
# The base is our town layout (townbase.py); the stage fields (clear rule, rewards, contract) are
# still the original's.
#
#   python -I scripts/stagevar.py [2 3 ...]        (default: every stage 2-10; slimdata.py runs it)
#
# Mirror axis: the rails all end in one trunk that runs into the ore storage. The axis is the
# trunk's centre line when that keeps the 4x4 ground tiles on their grid, else the grid line one
# cell beside it (toward the furnace if the town layout has room); then the storage and the rail
# below the quarry move with the trunk (2 cells).
#
# Since 2026-10-24 (user: "our own maps for stages 2-10, but don't change them too much") each part of the
# quarry also gets its own outline (reshape): square corners go back to cliff, lobes grow into the cliff around,
# and the ore takes a new shape inside with ragged edges and clearings. The parts, the bridges between them,
# the rails, the machines and each part's number of blocks stay.
import json, math, os, random, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TILE = 4
LAYOUT = "ours-v1"     # bump to redraw every saved quarry of these stages (relayout in state.ts keeps the % broken)


def cells(x, z, w=1, h=1):
    return {(x + i, z + j) for i in range(w) for j in range(h)}


def bfs(passable, sources):
    d = {c: 0 for c in sources if c in passable}
    q = collections.deque(d)
    while q:
        x, z = q.popleft()
        for n in ((x + 1, z), (x - 1, z), (x, z + 1), (x, z - 1)):
            if n in passable and n not in d:
                d[n] = d[(x, z)] + 1
                q.append(n)
    return d


def passable(st):
    """Cells a walker can reach: ground, home, ore and bridge decks."""
    p = set()
    for key in ("ground", "home"):
        for t in st["areas"][key]: p |= cells(t["x"], t["z"], t.get("w", TILE), t.get("h", TILE))
    p |= {(b["x"], b["z"]) for b in st["blocks"]}
    for s in st["structures"]:
        if s["type"] == "bridge": p |= cells(s["x"], s["z"], s.get("w", 1), s.get("h", 1))
    return p


def depth_order(st, seed):
    """Block cells sorted by walking distance from the home area (ties broken by a seeded shuffle)."""
    home = set()
    for t in st["areas"]["home"]: home |= cells(t["x"], t["z"], t.get("w", TILE), t.get("h", TILE))
    d = bfs(passable(st), list(home))
    far = max(d.values()) + 1 if d else 0
    r = random.Random(seed)
    return [c for _, _, c in sorted((d.get((b["x"], b["z"]), far), r.random(), (b["x"], b["z"])) for b in st["blocks"])]


def value_noise(seed, scale):
    """Smooth noise in -1..1 with features about `scale` cells across."""
    lat = {}
    def at(i, j):
        if (i, j) not in lat: lat[(i, j)] = random.Random(seed * 1000003 + i * 7919 + j * 104729).random() * 2 - 1
        return lat[(i, j)]
    def f(x, z):
        gx, gz = x / scale, z / scale
        i, j = math.floor(gx), math.floor(gz)
        sx, sz = gx - i, gz - j
        sx, sz = sx * sx * (3 - 2 * sx), sz * sz * (3 - 2 * sz)
        a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx
        b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx
        return a + (b - a) * sz
    return f


def reshape(st, n, zq):
    """Our outline for every part of the quarry (rows from `zq` up). Blocks keep their count per part;
    their ores are dealt afterwards (variant), so each block here is a placeholder."""
    r = random.Random(5000 + n)
    a = st["areas"]
    for k in ("ground", "obstacle", "home"):
        assert all(t.get("w", TILE) == TILE and t.get("h", TILE) == TILE for t in a[k]), k
    ph = (a["ground"][0]["x"] % TILE, a["ground"][0]["z"] % TILE)
    tkey = lambda x, z: (x - (x - ph[0]) % TILE, z - (z - ph[1]) % TILE)
    tcells = lambda t: {(t[0] + i, t[1] + j) for i in range(TILE) for j in range(TILE)}
    quarry = lambda t: t[1] >= zq
    ground = {(t["x"], t["z"]) for t in a["ground"] if quarry((t["x"], t["z"]))}
    obst = {(t["x"], t["z"]) for t in a["obstacle"] if quarry((t["x"], t["z"]))}
    base_walk = {(t["x"], t["z"]) for t in a["ground"] + a["home"] if not quarry((t["x"], t["z"]))}
    blocks = {(b["x"], b["z"]) for b in st["blocks"]}
    every = [(t["x"], t["z"]) for k in ("ground", "obstacle", "home") for t in a[k]]
    bx0, bx1 = min(t[0] for t in every), max(t[0] for t in every)
    bz0, bz1 = min(t[1] for t in every), max(t[1] for t in every)
    beyond = lambda t: t[0] < bx0 or t[0] > bx1 or t[1] < bz0 or t[1] > bz1

    # What must not move: no ore on these cells, and these tiles keep their kind.
    noore, frozen = set(), set()
    def protect(x, z, w, h, margin, freeze):
        for i in range(-margin, w + margin):
            for j in range(-margin, h + margin): noore.add((x + i, z + j))
        for i in range(-freeze, w + freeze):
            for j in range(-freeze, h + freeze): frozen.add(tkey(x + i, z + j))
    for s in st["structures"]:
        if s["type"] == "bridge":
            protect(s["x"], s["z"], s.get("w", 1), s.get("h", 1), 0, TILE + 1)
        elif s.get("railWaypoints"):
            wps = s["railWaypoints"]
            protect(wps[0][0] - 2, wps[0][1] - 2, 5, 5, 0, 1)
            # Rails run through ore (the cart breaks it when activated) but keep their tiles.
            pts = [(x + 1.0, z * 1.0) for x, z in wps]
            for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
                m = int(max(abs(x1 - x0), abs(z1 - z0)) * 2) + 1
                for k in range(m + 1):
                    x, z = x0 + (x1 - x0) * k / m, z0 + (z1 - z0) * k / m
                    for ox in (-2, -1, 0, 1):
                        for oz in (-2, -1, 0, 1): frozen.add(tkey(int(x) + ox, int(z) + oz))
        else:
            protect(s["x"], s["z"], s.get("w", 1), s.get("h", 1), 1, 1)
        for k in ("sign", "platform", "expansionPoint", "returnPoint"):
            if k in s: protect(s[k][0] - 1, s[k][1] - 1, 3, 3, 1, 1)
    for p in st["props"] + st["buildings"]:
        if quarry((p["x"], p["z"])): protect(p["x"], p["z"], p.get("w", 1), p.get("h", 1), 1, 1)
    # The front of the quarry (the first row of tiles with ore, and below) keeps the original's pace.
    mouth = tkey(0, min(z for _, z in blocks))[1]
    front = {t for t in ground | obst if t[1] <= mouth}
    frozen |= front
    # ...and keeps its ore exactly where it was.
    fixed = {c for c in blocks if tkey(*c) in front}
    frozen |= {t for t in ground | obst if any((t[0] + dx, t[1] + dz) in base_walk for dx in (-TILE, 0, TILE) for dz in (-TILE, 0, TILE))}

    # Parts: ground tiles joined side by side.
    side = lambda t: [(t[0] + TILE, t[1]), (t[0] - TILE, t[1]), (t[0], t[1] + TILE), (t[0], t[1] - TILE)]
    ring8 = lambda t: [(t[0] + dx, t[1] + dz) for dx in (-TILE, 0, TILE) for dz in (-TILE, 0, TILE) if dx or dz]
    part_of, parts = {}, []
    for t in sorted(ground):
        if t in part_of: continue
        comp, q = {t}, [t]
        while q:
            for nb in side(q.pop()):
                if nb in ground and nb not in comp: comp.add(nb); q.append(nb)
        for c in comp: part_of[c] = len(parts)
        parts.append(comp)
    count = collections.Counter(part_of[tkey(*c)] for c in blocks - fixed)

    noise = value_noise(900 + n, 9.0)
    fine = value_noise(1900 + n, 3.5)
    tnoise = value_noise(2900 + n, 14.0)
    new_blocks, added_all, removed_all = set(fixed), set(), set()
    grown = set()           # cliff tiles added beyond the map's old edge, behind a lobe

    def walk_cells():
        tiles = (ground - removed_all) | added_all | base_walk
        return set().union(*(tcells(t) for t in tiles)) if tiles else set()

    def interior(tiles, walk):
        """Cells of `tiles` with walkable ground all round them (the 1-cell bare rim is left out), minus no-ore cells."""
        out = set()
        for t in tiles:
            for c in tcells(t):
                if c in noore or t in front: continue
                if all((c[0] + dx, c[1] + dz) in walk for dx in (-1, 0, 1) for dz in (-1, 0, 1)): out.add(c)
        return out

    for pi, comp in enumerate(parts):
        k = count[pi]
        if not k: continue
        tiles = set(comp)
        removed, added = set(), set()
        if len(comp) >= 6:
            # Bevel square corners (two passes on big parts: a staircase), and a notch or two on long edges.
            for _ in range(2 if len(comp) >= 40 else 1):
                for t in sorted(tiles):
                    if t in frozen: continue
                    out = [nb not in tiles for nb in side(t)]
                    e, w_, nn, s_ = out
                    corner = sum(out) == 2 and (e != w_) and (nn != s_)
                    # Convex only: the tile between the two inner sides is in the part too (an L's elbow is not a corner).
                    inner = (t[0] + (TILE if w_ else -TILE), t[1] + (TILE if s_ else -TILE))
                    if corner and inner in tiles and r.random() < 0.85:
                        tiles.discard(t); removed.add(t)
            if len(comp) >= 40:
                def notchable(t):
                    out = [nb for nb in side(t) if nb not in tiles]
                    if len(out) != 1: return False
                    ox, oz = t[0] * 2 - out[0][0], t[1] * 2 - out[0][1]          # the side opposite the outside
                    px, pz = (TILE, 0) if ox == t[0] else (0, TILE)
                    return all(c in tiles for c in ((ox, oz), (ox + px, oz + pz), (ox - px, oz - pz)))
                edges = [t for t in sorted(tiles) if t not in frozen and notchable(t)]
                for t in r.sample(edges, min(2, len(edges))):
                    tiles.discard(t); removed.add(t)
            # Lobes into the cliff where only this part and cliff are around, until the ore fits with room for clearings.
            removed_all |= removed
            def room():
                return len(interior(tiles, walk_cells() | set().union(*(tcells(t) for t in tiles))))
            want = int(k * 1.03)
            others = {t for t in ground if part_of.get(t) != pi} - removed_all
            cap = len(removed) + max(2, len(comp) // 10)
            while room() < want and len(added) < cap:
                cand = []
                for t in tiles:
                    for nb in side(t):
                        if nb in tiles or nb in frozen or nb not in obst or nb in added_all or beyond(nb): continue
                        around = ring8(nb)
                        if any(x not in tiles and x not in obst and x not in removed_all and not beyond(x) for x in around): continue
                        if any(x in others or x in base_walk for x in around): continue
                        # Never between two arms: no ground on opposite sides, and a corner may only touch
                        # where a side does too (a lone diagonal touch would pinch a gap shut).
                        offs = {(x[0] - nb[0], x[1] - nb[1]) for x in around if x in tiles}
                        sides = {o for o in offs if 0 in o}
                        if {(0, TILE), (0, -TILE)} <= sides or {(TILE, 0), (-TILE, 0)} <= sides: continue
                        if any((ox, 0) not in sides and (0, oz) not in sides for ox, oz in offs if ox and oz): continue
                        cand.append(nb)
                if not cand: break
                # Wide, low lobes: hug the part (fill a bay first), noise only breaks ties between similar spots.
                best = max(set(cand), key=lambda t: sum(x in tiles for x in ring8(t)) + 0.6 * tnoise(t[0], t[1]) + r.random() * 0.2)
                tiles.add(best); added.add(best); added_all.add(best)
                for x in ring8(best):
                    if beyond(x) and x not in obst: obst.add(x); grown.add(x)
            # Not enough room after all: give corners back until it fits.
            for t in sorted(removed, key=lambda t: tnoise(t[0], t[1])):
                if room() >= k: break
                tiles.add(t); removed.discard(t); removed_all.discard(t)
        walk = walk_cells() | set().union(*(tcells(t) for t in tiles))
        inside = interior(tiles, walk)
        # Only the part's main body (a pocket cut off by the new outline holds no ore).
        body, lab = set().union(*(tcells(t) for t in tiles)), {}
        for c0 in body:
            if c0 in lab: continue
            lab[c0] = c0; q2 = [c0]
            while q2:
                c = q2.pop()
                for d in ((c[0] + 1, c[1]), (c[0] - 1, c[1]), (c[0], c[1] + 1), (c[0], c[1] - 1)):
                    if d in body and d not in lab: lab[d] = c0; q2.append(d)
        main = (collections.Counter(lab[c] for c in blocks if c in lab) or collections.Counter(lab.values())).most_common(1)[0][0]
        inside = {c for c in inside if lab.get(c) == main}
        if len(inside) < k:
            # A small part packed to the edge in the original: ore may touch its rim there too.
            inside = {c for t in tiles - front for c in tcells(t) if c not in noore} | {c for c in blocks - fixed if part_of.get(tkey(*c)) == pi}
        assert len(inside) >= k, (n, pi, len(inside), k)
        # Depth from the bare rim, so the ore stays a solid body with a ragged edge and a few clearings.
        depth, q = {}, collections.deque()
        for c in inside:
            if any((c[0] + dx, c[1] + dz) not in inside for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                depth[c] = 1; q.append(c)
        while q:
            c = q.popleft()
            for d in ((c[0] + 1, c[1]), (c[0] - 1, c[1]), (c[0], c[1] + 1), (c[0], c[1] - 1)):
                if d in inside and d not in depth: depth[d] = depth[c] + 1; q.append(d)
        score = lambda c: min(depth.get(c, 1), 5) + 2.2 * noise(*c) + 0.8 * fine(*c) + r.random() * 0.05
        new_blocks |= set(sorted(inside, key=score, reverse=True)[:k])
        ground = (ground - removed) | added
        obst = (obst | removed) - added
        removed_all |= removed

    keep = lambda key: [t for t in a[key] if not quarry((t["x"], t["z"]))]
    tile = lambda t: {"x": t[0], "z": t[1], "w": TILE, "h": TILE}
    a["ground"] = keep("ground") + [tile(t) for t in sorted(ground, key=lambda t: (t[1], t[0]))]
    a["obstacle"] = keep("obstacle") + [tile(t) for t in sorted(obst, key=lambda t: (t[1], t[0]))]
    assert len(new_blocks) == len(blocks)
    st["blocks"] = [{"x": x, "z": z, "ore": "?"} for x, z in sorted(new_blocks, key=lambda c: (c[1], c[0]))]
    return st


def variant(orig, n, toward=1):
    st = json.loads(json.dumps(orig))
    home = st["areas"]["home"]
    hx0 = min(t["x"] for t in home)
    zq = max(t["z"] + t.get("h", TILE) for t in home)           # first row above the home area
    rails = [s for s in st["structures"] if s.get("railWaypoints")]
    if rails:
        trunk = rails[0]["railWaypoints"][-1][0] + 1               # rail centre (cell-corner coordinates)
    else:
        xs = [b["x"] for b in st["blocks"]]
        trunk = round((min(xs) + max(xs) + 1) / 2)
    axis = trunk if (trunk - hx0) % 2 == 0 else trunk + toward
    shift = 2 * axis - 2 * trunk                                   # how far the trunk moves (0 or +-2)
    mx = lambda x, w=1: 2 * axis - x - w
    quarry = lambda z: z >= zq

    def mirror_rect(o):
        if quarry(o["z"]):
            o["x"] = mx(o["x"], o.get("w", 1))
            if "rotY" in o: o["rotY"] = (360 - o["rotY"]) % 360
            if "offset" in o: o["offset"][0] = -o["offset"][0]
            o.pop("worldCenter", None)

    def mirror_point(p):
        # [x, z, [ox, oz], rot?] points of bridges / platforms: 1x1 cells with a world offset.
        if quarry(p[1]):
            p[0] = mx(p[0])
            if len(p) > 2 and isinstance(p[2], list): p[2][0] = -p[2][0]
            if len(p) > 3: p[3] = (360 - p[3]) % 360
        else:
            p[0] += shift

    for key in ("ground", "obstacle"):
        for t in st["areas"][key]: mirror_rect(t)
    for b in st["blocks"]:
        if quarry(b["z"]): b["x"] = mx(b["x"])
    for s in st["structures"]:
        wps = s.get("railWaypoints")
        mirror_rect(s)
        if wps:
            for w in wps: w[0] = mx(w[0], 2) if quarry(w[1]) else w[0] + shift
            s["x"], s["z"] = wps[0]
        for k in ("sign", "platform", "expansionPoint", "returnPoint"):
            if k in s: mirror_point(s[k])
    for p in st["props"]: mirror_rect(p)
    for b in st["buildings"]:
        # The ore storage takes the rail trunk's end, wherever the trunk went.
        if b["type"] == "oreStorage":
            if quarry(b["z"]): mirror_rect(b)
            else: b["x"] += shift
            b.pop("worldCenter", None)

    reshape(st, n, zq)

    # Ores: the original's depth profile, dealt onto our cells by depth.
    before = depth_order(orig, n)
    ore_at = {(b["x"], b["z"]): b["ore"] for b in orig["blocks"]}
    profile = [ore_at[c] for c in before]
    after = depth_order(st, n + 100)
    r = random.Random(1000 + n)
    N = len(profile)
    for i in range(N):
        j = min(N - 1, max(0, i + r.randint(-25, 25)))
        profile[i], profile[j] = profile[j], profile[i]
    st["blocks"] = [{"x": x, "z": z, "ore": o} for (x, z), o in sorted(zip(after, profile), key=lambda kv: (kv[0][1], kv[0][0]))]
    assert collections.Counter(b["ore"] for b in st["blocks"]) == collections.Counter(ore_at.values())
    assert len({(b["x"], b["z"]) for b in st["blocks"]}) == N

    st["layoutId"] = f"{LAYOUT}-s{n}"
    st["oreGroups"] = []
    by_ore = collections.Counter(b["ore"] for b in st["blocks"])
    st["totals"] = {"original": orig["totals"]["original"],
                    "resolved": {"blocks": N, "dropItems": N * 6, "duplicateCellsRemoved": 0, "byOre": dict(by_ore.most_common())}}
    allc = [(b["x"], b["z"]) for b in st["blocks"]] + [c for k in ("ground", "obstacle", "home") for t in st["areas"][k] for c in cells(t["x"], t["z"], t.get("w", TILE), t.get("h", TILE))]
    st["grid"]["usedBounds"] = {"minX": min(c[0] for c in allc), "maxX": max(c[0] for c in allc),
                                "minZ": min(c[1] for c in allc), "maxZ": max(c[1] for c in allc)}
    st["_variant"] = {"axis": axis, "quarryFromZ": zq, "trunkShift": shift}
    return st


def open_front(st):
    """Cliff between the base and its quarry becomes ground (user 2026-10-21, stage 2: "rocks you
    can't break block the way from the houses to the quarry"). Mirroring moves the quarry's neck off
    the middle of our base (stage 2: right behind the worker building), so the north row faced a wall.
    A cliff tile below the first ore row and within the base's width opens when every cell round it
    is ground the base already reaches (never a part behind a bridge) or more cliff (no new gap to
    the water). Runs after town_base, so vehicle spots stay where they were; the ores are untouched."""
    a = st["areas"]
    home = a["home"]
    hx0, hx1 = min(t["x"] for t in home), max(t["x"] + t.get("w", TILE) for t in home)
    top = max(t["z"] + t.get("h", TILE) for t in home)
    mouth = min(b["z"] for b in st["blocks"])
    area = lambda t: cells(t["x"], t["z"], t.get("w", TILE), t.get("h", TILE))
    homec = set().union(*(area(t) for t in home))
    # Ground as it is on arrival: ore is a wall (stage 4's left part joins the rest only through
    # ore, and its bridge is the way in).
    walk = homec | set().union(*(area(t) for t in a["ground"]))
    reach = set(bfs(walk, list(homec)))
    ore = {(b["x"], b["z"]) for b in st["blocks"]}
    taken = walk | ore | set().union(*(area(t) for k in ("obstacle", "lawn") for t in a.get(k, [])))
    opened = True
    while opened:
        opened = False
        for t in list(a["obstacle"]):
            if t["z"] < top or t["z"] >= mouth or t["x"] < hx0 or t["x"] + t.get("w", TILE) > hx1: continue
            inside = area(t)
            # Side by side with water is a gap; corner to corner with another part is a way through.
            ring = cells(t["x"] - 1, t["z"] - 1, t.get("w", TILE) + 2, t.get("h", TILE) + 2) - inside
            sides = {c for c in ring if t["x"] <= c[0] < t["x"] + t.get("w", TILE) or t["z"] <= c[1] < t["z"] + t.get("h", TILE)}
            if any(c not in taken for c in sides) or any(c in ore or (c in walk and c not in reach) for c in ring) or not ring & reach: continue
            a["obstacle"].remove(t)
            a["ground"].append(t)
            walk |= inside
            reach |= inside
            opened = True
    return st


def write(n):
    sys.path.insert(0, HERE)
    from townbase import town_base
    from slimdata import stage as slim
    orig = json.load(open(os.path.join(ROOT, f"src/data/orig/stage{n}.json"), encoding="utf-8"))
    # Move the trunk (and the storage) toward the furnace when it has to move; the other way if
    # the town layout finds no room then.
    f = next(b for b in orig["buildings"] if b["type"] == "furnace")
    rails = [s for s in orig["structures"] if s.get("railWaypoints")]
    pref = 1 if not rails or rails[0]["railWaypoints"][-1][0] + 1 < f["x"] + 1.5 else -1
    for toward in (pref, -pref):
        try:
            st = slim(open_front(town_base(variant(orig, n, toward))))
            break
        except SystemExit as e:
            last = e
    else:
        raise last
    st.pop("_variant", None)
    out = os.path.join(ROOT, f"src/data/game/stage{n}.json")
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(st, fh, ensure_ascii=False, separators=(",", ":"))
    return out, st


if __name__ == "__main__":
    which = [int(a) for a in sys.argv[1:]] or list(range(2, 11))
    for n in which:
        out, st = write(n)
        print(f"stage {n}: {len(st['blocks'])} blocks, layout {st['layoutId']} -> {os.path.relpath(out, ROOT)}")

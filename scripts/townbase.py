# Our base layout ("like a little street", user 2026-10-19): two rows of buildings. The north
# row holds the machinery shop, the oil station, the Upgrade building, the furnace + ore storage,
# the worker building and the cafeteria; the trading house stands below the Upgrade building
# (same column, user), by the road, with its SELL and CASH pads on the side facing the furnace
# (user) - which is the avenue left open between the Upgrade building and the furnace, from the
# quarry down to the pads. The house and the Upgrade building sit close to the furnace (user:
# short runs for everyone): a two-cell avenue, the SELL pad just below the furnace's REFINING pad. The furnace, ore storage, worker building
# and cafeteria stay where the stage put them (the minecart rails end at the storage).
# Used by stagegen.py (stage 1) and slimdata.py (stage 2); offsets are from the home area's
# south-west corner, which both stages share up to a shift.
import collections

TILE = 4
# Movable buildings: (dx, dz) of the 3x3 min corner from the home area's min corner. The shop, the
# oil station and the Upgrade building stand one cell apart (user 2026-10-21: "closer together, so
# the walk between them is short"; they were 3 and 2 cells apart). Each one's pads sit inside its
# own 3-cell width (the oil station's OIL pad and barrel bin too), so one cell is enough.
# Candy Miner (user 2026-10-28: "lay the houses out differently from before"): the north row is now the worker
# building, the shop, then the Upgrade building beside the furnace; the oil station (syrup pump) moves down to the road
# row, left of the trading house; the worker building's old spot beside the furnace is left open (vehicles park there).
# Quarry Crush / Mars Miner: shop (5, 5), oil (9, 5), Upgrade (13, 5), trading house (13, 1), worker building fixed.
# Farm game (user 2026-10-28: two processing houses, rice and wood in one, gold, ores and gems in the other): the Forge
# (new building type "forge") stands in the north row beside the Mill (the stage's furnace), where the Upgrade building
# was; the Upgrade building and the shop move one step left, the worker building (Farmhands' House) goes down to the
# road row's west end.
MOVES = {"workerBuilding": (1, 1), "machineryShop": (5, 5), "upgradeBuilding": (9, 5), "forge": (13, 5), "salesStand": (13, 1), "oilStation": (7, 1)}

def cells(x, z, w=1, h=1):
    return {(x + i, z + j) for i in range(w) for j in range(h)}

def tiles(rects):
    return set().union(*(cells(r["x"], r["z"], r.get("w", TILE), r.get("h", TILE)) for r in rects)) if rects else set()

def rail_cells(st):
    """Cells under every minecart rail (2 wide; waypoint (x, z) covers cells x..x+1, z-1..z)."""
    out = set()
    for s in st["structures"]:
        w = s.get("railWaypoints") or []
        for (x0, z0), (x1, z1) in zip(w, w[1:]):
            out |= cells(min(x0, x1), min(z0, z1) - 1, abs(x1 - x0) + 2, abs(z1 - z0) + 2)
    return out

def moves(st, hx, hz):
    """MOVES, slid left when the ore storage or a rail sits where the Upgrade / trading house go
    (stage 3 keeps its storage beside the furnace): the Upgrade stays as close to the furnace as
    it can (two-cell avenue at best), the oil station and the shop follow on its left."""
    by = {b["type"]: b for b in st["buildings"]}
    fixed = rail_cells(st)
    for t in ("furnace", "oreStorage"):
        b = by[t]
        fixed |= cells(b["x"], b["z"], b.get("w", 3), b.get("h", 3))
    fx = by["furnace"]["x"] - hx
    for u in range(fx - 5, 8, -1):
        # Upgrade + its pad row, trading house + the SELL / CASH strip on the furnace side.
        need = cells(hx + u, hz + 4, 3, 4) | cells(hx + u, hz + 1, 3, 3) | cells(hx + u + 3, hz + 1, 2, 3)
        if not need & fixed: break
    else:
        raise SystemExit("town_base: no room for the Upgrade building")
    # `u` is the column of the building right above the trading house: the Forge.
    if u == MOVES["forge"][0] and fx == 18: return MOVES
    return {"workerBuilding": (max(0, u - 12), 1), "machineryShop": (u - 8, 5), "upgradeBuilding": (u - 4, 5), "forge": (u, 5), "salesStand": (u, 1), "oilStation": (max(0, u - 6), 1)}

def town_base(st):
    home = st["areas"]["home"]
    hx, hz = min(t["x"] for t in home), min(t["z"] for t in home)
    # Base rows only: below the first quarry row (and never more than 12 rows up from home).
    mouth = min(min(b["z"] for b in st["blocks"]), hz + 12)
    walk = {c for c in tiles(st["areas"]["ground"] + home) if c[1] < mouth} - tiles([r for r in st["areas"]["obstacle"]])
    if not any(b["type"] == "forge" for b in st["buildings"]):
        st["buildings"].append({"type": "forge", "x": 0, "z": 0, "w": 3, "h": 3, "rotY": 0})
    by = {b["type"]: b for b in st["buildings"]}
    for t, (dx, dz) in moves(st, hx, hz).items():
        b = by[t]
        b["x"], b["z"] = hx + dx, hz + dz
        b.pop("worldCenter", None)

    # What must stay clear: footprints, the pad row in front of each building, the trading
    # house's SELL / CASH pads, BUY dock and price board, the storage, rails and spawns.
    reserved = set()
    foot = {}
    for b in st["buildings"]:
        f = cells(b["x"], b["z"], b.get("w", 3), b.get("h", 3))
        foot[b["type"]] = f
        reserved |= f | cells(b["x"] - 1, b["z"] - 2, b.get("w", 3) + 2, b.get("h", 3) + 3)
    s = by["salesStand"]
    reserved |= cells(s["x"] - 5, s["z"] - 3, 13, 5)
    for c in st["cafeteria"]:
        reserved |= cells(c["x"] - 1, c["z"] - 1, c.get("w", 1) + 2, c.get("h", 1) + 2)
    for sp in st["spawns"]:
        if sp["type"] != "vehicleSpawnPoint": reserved |= cells(sp["x"] - 1, sp["z"] - 1, 3, 3)
    for stt in st["structures"]:
        for x, z in stt.get("railWaypoints") or []:
            reserved |= cells(x - 1, z - 2, 4, 4)

    # Sanity: moved buildings sit on walkable base tiles and overlap nothing.
    names = list(foot)
    for i, a in enumerate(names):
        if a in MOVES and not foot[a] <= walk: raise SystemExit(f"town_base: {a} leaves the base tiles")
        for b in names[i + 1:]:
            if foot[a] & foot[b]: raise SystemExit(f"town_base: {a} overlaps {b}")

    # The player starts on open ground: a spawn the moved buildings landed on goes to the nearest
    # free cell (stage 2's sat inside the Upgrade building, stage 3's on the ore storage).
    ps = next(sp for sp in st["spawns"] if sp["type"] == "playerSpawnPoint")
    taken = set().union(*foot.values()) | set().union(*(cells(b["x"] - 1, b["z"] - 2, b.get("w", 3) + 2, 2) for b in st["buildings"]))
    if (ps["x"], ps["z"]) in taken:
        ok = sorted((c for c in walk if {c, (c[0] + 1, c[1]), (c[0] - 1, c[1]), (c[0], c[1] + 1), (c[0], c[1] - 1)} <= walk - taken),
                    key=lambda c: ((c[0] - ps["x"]) ** 2 + (c[1] - ps["z"]) ** 2, c))
        ps["x"], ps["z"] = ok[0]
        ps.pop("worldCenter", None)

    # Vehicle spots: free base cells nearest the player's spawn, two cells apart, never on the
    # avenue between the trading house / Upgrade and the quarry (the way everyone walks).
    fx = by["furnace"]["x"]
    reserved |= cells(s["x"] + 3, hz, fx - s["x"] - 3, mouth - hz)
    free = sorted((c for c in walk if c not in reserved and cells(c[0] - 1, c[1] - 1, 3, 3) <= walk),
                  key=lambda c: ((c[0] - ps["x"]) ** 2 + (c[1] - ps["z"]) ** 2, c))
    spots = []
    for c in free:
        if all(max(abs(c[0] - o[0]), abs(c[1] - o[1])) >= 2 for o in spots): spots.append(c)
        if len(spots) == 7: break
    # Five heavy machines can be out at once; Game reuses slots round-robin past that.
    if len(spots) < 5: raise SystemExit(f"town_base: only {len(spots)} vehicle spots")
    st["spawns"] = [sp for sp in st["spawns"] if sp["type"] != "vehicleSpawnPoint"] + [
        {"type": "vehicleSpawnPoint", "x": x, "z": z, "w": 1, "h": 1, "rotY": 0} for x, z in sorted(spots)]

    # Street furniture: a fence along the road except in front of the trading house and the
    # Upgrade building, and lamps along it and at the avenue's top corners.
    keep = [p for p in st["props"] if p["type"] not in ("metalBarrier", "priceSign")]
    o = by["oilStation"]
    w = by["workerBuilding"]
    gap = set(range(min(s["x"] - 5, o["x"] - 1), s["x"] + 9))
    # The road row's buildings keep their pads clear of the fence and the lamps.
    if w["z"] == hz + 1: gap |= set(range(w["x"] - 1, w["x"] + 4))
    fence = [{"type": "metalBarrier", "x": x, "z": hz, "w": 1, "h": 1, "rotY": 90} for x in range(hx, hx + 28, 2) if x not in gap]
    # Road-side lamps stand on the fence line (decor, never in the way); the avenue pair must be on open ground.
    lamps = [(hx + 1, hz), (min(s["x"] - 6, o["x"] - 2), hz), (s["x"] + 10, hz), (hx + 27, hz)] + [
        c for c in ((s["x"] - 1, hz + 8), (fx - 1, hz + 8)) if c in walk]
    lamps = [(x, z) for x, z in lamps if not (z == hz and w["z"] == hz + 1 and w["x"] - 1 <= x <= w["x"] + 3)]
    lamp = [{"type": "streetLamp", "x": x, "z": z, "w": 1, "h": 1, "rotY": 0} for x, z in lamps]
    st["props"] = keep + fence + lamp
    return st

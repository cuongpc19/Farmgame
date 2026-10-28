# Top-down drawing of a stage as it is built today: python -I scripts/mapdraw.py <stage.json> <out.png>
# Blocks by ore, quarry / base / cliff tiles, rails and carts, every building with its pads (SELL,
# CASH, BUY, REFINING, OPEN...), the truck road, vehicle spots, lamps and fence. The pad offsets
# mirror the game code (Game.buildBase, base/*.ts); positions are cells, x to the right and z up
# (the quarry is up, the road at the bottom, as the game camera shows it).
import json, sys
from PIL import Image, ImageDraw, ImageFont

FONT = lambda s, b=False: ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf" if b else "C:/Windows/Fonts/segoeui.ttf", s)
ORE = {"limestone": (0xcd, 0xc9, 0xc0), "sandstone": (0xd8, 0xa4, 0x66), "copper": (0xe0, 0x70, 0x3a), "iron": (0x8f, 0x96, 0xa3),
       "manganese": (0x9a, 0x6f, 0xb0), "silver": (0xe8, 0xee, 0xf5), "gold": (0xff, 0xcf, 0x2e), "amber": (0xff, 0x9a, 0x1f),
       "amethyst": (0xb0, 0x5c, 0xff), "diamond": (0x8f, 0xf3, 0xff),
       "dunite": (0x8c, 0x9a, 0x5b), "emerald": (0x22, 0xd0, 0x7a), "ice": (0xbf, 0xe6, 0xf5)}
ORE_VI = {"limestone": "Đá vôi", "sandstone": "Sa thạch", "copper": "Đồng", "iron": "Sắt", "manganese": "Mangan",
          "silver": "Bạc", "gold": "Vàng", "amber": "Hổ phách", "amethyst": "Thạch anh tím", "diamond": "Kim cương",
          "dunite": "Dunit", "emerald": "Ngọc lục bảo", "ice": "Băng"}
def ore_color(o):
    if o in ORE: return ORE[o]
    h = sum(ord(ch) * (i + 7) for i, ch in enumerate(o))
    return (80 + h % 150, 80 + (h // 7) % 150, 80 + (h // 49) % 150)


CLIFF, DIRT, CONCRETE, ASPHALT, BG = (58, 52, 48), (122, 98, 72), (150, 154, 160), (70, 70, 78), (28, 27, 26)


def center(p):
    return p["x"] + (p.get("w", 1) - 1) / 2, p["z"] + (p.get("h", 1) - 1) / 2


def layout(st):
    """Everything to draw, in cell coordinates (z up). Offsets follow the game code."""
    by = {b["type"]: b for b in st["buildings"]}
    out = {"boxes": [], "pads": [], "dots": [], "lane": None, "belts": []}
    shed = lambda c: (c[0] - 1.3, c[1] - 0.3, c[0] + 1.3, c[1] + 1.45)
    names = {"upgradeBuilding": ("UPGRADE", "Nhà nâng cấp", (50, 110, 190), "OPEN"),
             "machineryShop": ("MACHINERY", "Cửa hàng máy", (200, 120, 40), "ENTER"),
             "workerBuilding": ("WORKER", "Nhà thợ", (70, 120, 200), "WORKER")}
    for t, (sign, vi, col, pad) in names.items():
        c = center(by[t])
        out["boxes"].append((shed(c), col, sign, vi))
        out["pads"].append(((c[0], c[1] - 1), 1.25, pad, (255, 255, 255)))
    f = center(by["furnace"])
    out["boxes"].append(((f[0] - 0.6, f[1] - 0.15, f[0] + 1.6, f[1] + 1.9), (90, 96, 112), "FURNACE", "Lò nấu"))
    out["pads"].append(((f[0] - 1, f[1] - 0.95), 1.3, "REFINING", (255, 255, 255)))
    out["dots"].append(((f[0] + 1, f[1] - 0.35), (255, 210, 80), "Khay thỏi"))
    o = center(by["oilStation"])
    out["boxes"].append(((o[0] - 1.0, o[1] + 0.2, o[0] + 1.1, o[1] + 1.35), (40, 40, 48), "OIL", "Trạm dầu"))
    out["pads"].append(((o[0] - 0.35, o[1] - 1), 1.1, "OIL", (255, 255, 255)))
    s = center(by["oreStorage"])
    out["pads"].append((s, 1.6, "STORAGE", (255, 220, 150)))
    m = center(by["salesStand"])
    side = -1 if f[0] < m[0] else 1
    out["boxes"].append((shed(m), (58, 163, 90), "MARKET", "Nhà Market"))
    px = m[0] + side * 2.4
    out["pads"].append(((px, m[1] + 2.3 / 2.5), 1.25, "SELL", (255, 255, 255)))
    out["pads"].append(((px, m[1] - 1.25 / 2.5), 1.0, "CASH", (120, 220, 120)))
    dock = (m[0] + 0.1, m[1] - 2.0)
    out["pads"].append((dock, 1.0, "BUY", (255, 200, 90)))
    sell_z = m[1] + 2.3 / 2.5
    out["belts"] = [((px - side * 0.55, sell_z), (m[0] + side * 0.85, sell_z)), ((m[0] + 0.1, m[1] - 0.9 / 2.5), (dock[0], dock[1] + 0.55))]
    right = m[0] - 1.25 - 0.6 / 2.5 if side > 0 else m[0] + 1.25 + 9 / 2.5
    front = m[1] - 1.6 / 2.5
    out["boxes"].append(((right - 2.2, front - 0.05, right, front + 0.35), (240, 236, 220), "", "Bảng giá"))
    roads = [center(p) for p in st["props"] if p["type"] == "road"]
    if roads:
        out["lane"] = (min(r[0] for r in roads) - 2.4, roads[0][1] - 1.5, max(r[0] for r in roads) + 2.4, roads[0][1] + 1.5, dock[0] + 1.2 / 2.5)
    for c in st["cafeteria"]:
        cc = center(c)
        if c["type"] == "cafeteriaTruck":
            out["boxes"].append(((cc[0] - 1.2, cc[1] - 0.3, cc[0] + 1.2, cc[1] + 0.9), (230, 120, 60), "FOOD", "Căng tin"))
        else:
            out["boxes"].append(((cc[0] - 0.45, cc[1] - 0.45, cc[0] + 0.45, cc[1] + 0.45), (160, 120, 80), "", "bàn"))
    return out


def draw(st, out_png):
    L = layout(st)
    tiles = lambda key: {(t["x"] + i, t["z"] + j) for t in st["areas"][key] for i in range(t.get("w", 4)) for j in range(t.get("h", 4))}
    cliff, ground, home = tiles("obstacle"), tiles("ground"), tiles("home")
    blocks = {(b["x"], b["z"]): b["ore"] for b in st["blocks"]}
    allc = cliff | ground | home | set(blocks)
    minx, maxx = min(c[0] for c in allc), max(c[0] for c in allc)
    minz, maxz = min(c[1] for c in allc), max(c[1] for c in allc)
    hz = min(c[1] for c in home)
    hx0, hx1 = min(c[0] for c in home), max(c[0] for c in home)
    base_box = (hx0 - 4, hz - 4, hx1 + 4, hz + 12)
    rails = [(s, [(x + 0.5, z - 0.5) for x, z in s["railWaypoints"]]) for s in st["structures"] if s.get("railWaypoints")]
    spawn = next(center(p) for p in st["spawns"] if p["type"] == "playerSpawnPoint")
    slots = [center(p) for p in st["spawns"] if p["type"] == "vehicleSpawnPoint"]

    def panel(x0, z0, x1, z1, PX, detail):
        W, H = int((x1 - x0 + 1) * PX), int((z1 - z0 + 1) * PX)
        img = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(img, "RGBA")
        P = lambda x, z: ((x - x0 + 0.5) * PX, (z1 - z + 0.5) * PX)
        def rect(a, b, c, e, **kw):
            p, q = P(a, e), P(c, b)
            d.rectangle([p[0], p[1], q[0], q[1]], **kw)
        def cell(c, col, inset=0):
            rect(c[0] - 0.5, c[1] - 0.5, c[0] + 0.5 - inset / PX, c[1] + 0.5 - inset / PX, fill=col)
        for c in cliff: cell(c, CLIFF)
        for c in ground: cell(c, DIRT)
        for c in home: cell(c, CONCRETE)
        if L["lane"]:
            a, b, c, e, stop = L["lane"]
            rect(a, b, c, e, fill=ASPHALT)
            for x in range(int(a) + 1, int(c), 2):
                rect(x, (b + e) / 2 - 0.04, x + 0.9, (b + e) / 2 + 0.04, fill=(230, 230, 210, 180))
        for c, o in blocks.items(): cell(c, ore_color(o), 1 if PX < 20 else 2)
        for s in st["structures"]:
            t = s["type"]
            if t == "minecart": continue
            a, b = s["x"] - 0.5, s["z"] - 0.5
            c, e = a + s.get("w", 1), b + s.get("h", 1)
            if t == "bridge":
                col = (170, 120, 60) if s.get("onFoot") else (120, 130, 150)
                rect(a, b, c, e, fill=col, outline=(20, 20, 20), width=2)
                cx, cy = P(s["x"] + (s.get("w", 1) - 1) / 2, s["z"] + (s.get("h", 1) - 1) / 2)
                d.text((cx, cy), ("cầu bộ " if s.get("onFoot") else "cầu xe ") + str(s.get("span", "")), font=FONT(max(9, int(PX * 0.6)), True), fill=(255, 255, 255), anchor="mm")
                for k, colk in (("sign", (255, 230, 120)), ("expansionPoint", (90, 220, 255)), ("platform", (255, 255, 255))):
                    if k in s:
                        px_, pz_ = s[k][0], s[k][1]
                        q = P(px_, pz_); r = PX * 0.35
                        d.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], outline=colk, width=2)
                continue
            col, lab = {"autoDigger": ((150, 90, 40), "MÁY ĐÀO"), "extraOilStation": ((30, 30, 36), "DẦU+"), "harvester": ((60, 150, 200), "HARVESTER")}.get(t, ((200, 0, 200), t))
            rect(a, b, c, e, fill=col, outline=(240, 240, 240), width=2)
            cx, cy = P(s["x"] + (s.get("w", 1) - 1) / 2, s["z"] + (s.get("h", 1) - 1) / 2)
            d.text((cx, cy), lab, font=FONT(max(9, int(PX * 0.55)), True), fill=(255, 255, 255), anchor="mm")
            if t == "harvester" and "returnPoint" in s:
                q = P(*s["returnPoint"]); r = PX * 0.4
                d.rectangle([q[0] - r, q[1] - r, q[0] + r, q[1] + r], outline=(60, 150, 200), width=3)
        for s, pts in rails:
            q = [P(*p) for p in pts]
            d.line(q, fill=(25, 25, 25), width=max(4, PX // 3)); d.line(q, fill=(200, 200, 200), width=max(1, PX // 12))
            a, b = q[0]
            r = PX * 0.9
            d.rectangle([a - r, b - r, a + r, b + r], fill=(230, 60, 50), outline=(20, 20, 20), width=2)
            d.text((a, b), str(s.get("structureGroupId", "")), font=FONT(max(10, PX // 2), True), fill=(255, 255, 255), anchor="mm")
        for (a, b, c, e), col, sign, vi in L["boxes"]:
            rect(a, b, c, e, fill=col, outline=(15, 15, 15), width=2)
            if detail and sign:
                cx, cy = P((a + c) / 2, (b + e) / 2)
                d.text((cx, cy - PX * 0.2), sign, font=FONT(int(PX * 0.42), True), fill=(255, 255, 255), anchor="mm")
                d.text((cx, cy + PX * 0.3), vi, font=FONT(int(PX * 0.36)), fill=(235, 235, 235), anchor="mm")
            elif detail and vi == "bàn":
                d.text(P((a + c) / 2, (b + e) / 2), vi, font=FONT(int(PX * 0.3), True), fill=(255, 255, 255), anchor="mm")
            elif detail and vi:
                cx, cy = P((a + c) / 2, e)
                d.text((cx, cy - 3), vi, font=FONT(int(PX * 0.34), True), fill=(255, 255, 255), anchor="md")
        for a, b in L["belts"]:
            d.line([P(*a), P(*b)], fill=(40, 40, 46), width=max(3, int(PX * 0.35)))
        for (x, z), size, text, col in L["pads"]:
            h = size / 2
            dashed = text in ("CASH", "BUY")
            rect(x - h, z - h, x + h, z + h, outline=col, width=max(2, PX // 12), fill=(255, 255, 255, 25) if not dashed else None)
            if detail:
                cx, cy = P(x, z)
                d.text((cx, cy), text, font=FONT(int(PX * (0.27 if len(text) > 6 else 0.33 if len(text) > 4 else 0.38)), True), fill=col, anchor="mm")
        for (x, z), col, label in L["dots"]:
            cx, cy = P(x, z)
            r = PX * 0.22
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col, outline=(20, 20, 20))
            if detail: d.text((cx, cy + r + 2), label, font=FONT(int(PX * 0.28), True), fill=col, anchor="mt")
        for x, z in slots:
            cx, cy = P(x, z)
            r = PX * 0.32
            d.rounded_rectangle([cx - r, cy - r, cx + r, cy + r], radius=r / 2, outline=(255, 235, 60), width=2)
            if detail: d.text((cx, cy), "P", font=FONT(int(PX * 0.34), True), fill=(255, 235, 60), anchor="mm")
        for p in st["props"]:
            cx, cy = P(*center(p))
            if p["type"] == "streetLamp":
                r = PX * 0.18
                d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 240, 160), outline=(40, 40, 40))
            elif p["type"] == "mountain":
                r = PX * 2.5
                d.polygon([(cx, cy - r), (cx - r, cy + r), (cx + r, cy + r)], fill=(110, 100, 95), outline=(20, 20, 20))
            elif p["type"] == "metalBarrier":
                d.rectangle([cx - PX * 0.5, cy - PX * 0.08, cx + PX * 0.5, cy + PX * 0.08], fill=(210, 60, 50))
        cx, cy = P(*spawn)
        r = PX * 0.35
        d.regular_polygon((cx, cy, r), 5, fill=(255, 255, 255), outline=(20, 20, 20))
        if L["lane"] and detail:
            a, b, c, e, stop = L["lane"]
            p, q = P(a + 0.3, (b + e) / 2), P(stop, (b + e) / 2)
            d.text((p[0], p[1]), "Xe tải vào →", font=FONT(int(PX * 0.34), True), fill=(255, 255, 255), anchor="lm")
            d.text((P(c - 0.3, (b + e) / 2)[0], p[1]), "→ ra", font=FONT(int(PX * 0.34), True), fill=(255, 255, 255), anchor="rm")
            d.line([q[0], q[1] - PX * 0.6, q[0], q[1] + PX * 0.6], fill=(255, 200, 90), width=2)
            d.text((q[0], q[1] - PX * 0.65), "xe dừng", font=FONT(int(PX * 0.28)), fill=(255, 200, 90), anchor="md")
        return img, P

    # Panel 1: the whole stage.
    full, P1 = panel(minx - 1, minz - 1, maxx + 1, maxz + 1, 14, False)
    d1 = ImageDraw.Draw(full, "RGBA")
    a, b = P1(base_box[0], base_box[3]); c, e = P1(base_box[2], base_box[1])
    d1.rectangle([a, b, c, e], outline=(255, 255, 255, 200), width=2)
    d1.text((a + 4, b + 2), "Khu nhà (phóng to bên dưới)", font=FONT(13, True), fill=(255, 255, 255))
    # Panel 2: the base.
    zoom, _ = panel(*base_box, 40, True)

    from collections import Counter
    count = Counter(blocks.values())
    head, gap, legend_w = 64, 18, 300
    W = max(full.width + legend_w + gap * 3, zoom.width + gap * 2)
    H = head + full.height + gap * 2 + 26 + zoom.height + gap
    sheet = Image.new("RGB", (W, H), (20, 19, 18))
    d = ImageDraw.Draw(sheet)
    d.text((gap, 12), f"Màn {st.get('order', '?')} · bản đồ hiện tại", font=FONT(26, True), fill=(255, 255, 255))
    d.text((gap, 44), f"{len(blocks)} khối · bản đồ {maxx - minx + 1}×{maxz - minz + 1} ô (1 ô = 2,5 m) · layout {st.get('layoutId', '')}", font=FONT(14), fill=(200, 200, 200))
    sheet.paste(full, (gap, head))
    lx, ly = gap * 2 + full.width, head
    d.text((lx, ly), "Quặng (số khối)", font=FONT(16, True), fill=(255, 255, 255)); ly += 26
    for o, n in count.most_common():
        d.rectangle([lx, ly + 3, lx + 16, ly + 19], fill=ore_color(o), outline=(10, 10, 10))
        d.text((lx + 24, ly), f"{ORE_VI.get(o, o)} ({o}) · {n}", font=FONT(14), fill=(225, 225, 225)); ly += 24
    ly += 12
    d.text((lx, ly), "Ký hiệu", font=FONT(16, True), fill=(255, 255, 255)); ly += 26
    keys = [(CONCRETE, "Sân bê tông khu nhà"), (DIRT, "Nền đất mỏ (đi được)"), (CLIFF, "Vách đá (không đi được)"),
            (ASPHALT, "Đường xe tải"), ((230, 60, 50), "Xe goòng 101/102/103 + đường ray")]
    for col, t in keys:
        d.rectangle([lx, ly + 3, lx + 16, ly + 19], fill=col, outline=(10, 10, 10))
        d.text((lx + 24, ly), t, font=FONT(14), fill=(225, 225, 225)); ly += 24
    d.regular_polygon((lx + 8, ly + 11, 8), 5, fill=(255, 255, 255), outline=(20, 20, 20))
    d.text((lx + 24, ly), "Chỗ người chơi xuất hiện", font=FONT(14), fill=(225, 225, 225)); ly += 24
    d.line([lx, ly + 11, lx + 16, ly + 11], fill=(40, 40, 46), width=6)
    d.text((lx + 24, ly), "Băng chuyền Market", font=FONT(14), fill=(225, 225, 225)); ly += 24
    for sym, t in [("P", "Chỗ đỗ máy thuê"), ("●", "Đèn đường"), ("▬", "Hàng rào")]:
        d.text((lx + 8, ly + 10), sym, font=FONT(16, True), fill=(255, 235, 60) if sym == "P" else (255, 90, 70) if sym == "▬" else (255, 240, 160), anchor="mm")
        d.text((lx + 24, ly), t, font=FONT(14), fill=(225, 225, 225)); ly += 24
    ly += 12
    for t in ["Quặng quý nằm càng xa càng nhiều.", "Ô nét liền = ô có vẽ trong game.", "CASH, BUY: chỗ tiền / thỏi xuất hiện,", "không vẽ trong game."]:
        d.text((lx, ly), t, font=FONT(13), fill=(180, 180, 180)); ly += 19
    zy = head + full.height + gap * 2
    d.text((gap, zy), "Khu nhà · SELL bên trong (phía lò), CASH bên ngoài · BUY trước cửa Market cạnh đường", font=FONT(16, True), fill=(255, 230, 140))
    sheet.paste(zoom, (gap, zy + 26))
    sheet.save(out_png)
    return sheet.size


if __name__ == "__main__":
    st = json.load(open(sys.argv[1], encoding="utf-8"))
    print(draw(st, sys.argv[2]))

"""Cell sprites (rice, trees, rocks) for the farm game, from ChatGPT-drawn sheets on a magenta background.

User 2026-10-28: "rice and trees should be pretty: try having ChatGPT draw them". The sheets are kept out of the
repo (big PNGs); the cut sprites are small WebPs in art/sprites/, and the game loads one atlas:
src/assets/farm/nodes.webp + nodes.json (name -> uv rect, size in pixels, ground anchor).

    python -I scripts/sprites/nodes.py cut <sheet.png> <cols> <rows> <name,name,...>   # magenta key -> art/sprites/*.webp
    python -I scripts/sprites/nodes.py atlas                                           # art/sprites + derived -> atlas

`-` as a name skips that cell. Derived sprites (DERIVED) recolour the saturated parts of another sprite (ore veins,
crystals, fruit) and leave its grey rock / brown bark / green leaves alone.
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = os.path.join(ROOT, "art", "sprites")
OUT = os.path.join(ROOT, "src", "assets", "farm")
SLOT = 192           # atlas slot (px); each sprite is fitted inside, aspect kept (trees are ~150 px tall on a phone)
PAD = 3

def key_out(rgb: np.ndarray) -> np.ndarray:
    """RGBA from an RGB image on pure magenta: alpha from how magenta a pixel is, colours un-blended from it."""
    f = rgb.astype(np.float32) / 255.0
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    m = np.clip(np.minimum(r, b) - g, 0, 1)                 # 1 on the background, ~0 on art
    a = np.clip((0.82 - m) / (0.82 - 0.5), 0, 1)
    bg = np.array([1.0, 0.0, 1.0], np.float32)
    safe = np.maximum(a, 0.05)[..., None]
    c = np.clip((f - (1 - a)[..., None] * bg) / safe, 0, 1)
    out = np.concatenate([c, a[..., None]], axis=-1)
    return (out * 255 + 0.5).astype(np.uint8)

def crop(img: Image.Image) -> Image.Image:
    """Keep the cell's own asset (its biggest blob of art and whatever lies close to it, e.g. fruit or nuggets beside a
    boulder), drop bits of the neighbouring assets that reach into the cell, then cut to its box."""
    from scipy import ndimage
    arr = np.array(img)
    a = arr[..., 3]
    lab, n = ndimage.label(ndimage.binary_dilation(a > 16, iterations=6))
    if n > 1:
        sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
        keep = lab == (1 + int(np.argmax(sizes)))
        arr[..., 3] = np.where(keep, a, 0)
        img = Image.fromarray(arr, "RGBA")
        a = arr[..., 3]
    ys, xs = np.where(a > 16)
    if not len(xs): return img
    return img.crop((max(0, xs.min() - 2), max(0, ys.min() - 2), min(img.width, xs.max() + 3), min(img.height, ys.max() + 3)))

def cut(sheet: str, cols: int, rows: int, names: list[str]) -> None:
    im = np.array(Image.open(sheet).convert("RGB"))
    rgba = key_out(im)
    h, w = rgba.shape[:2]
    os.makedirs(ART, exist_ok=True)
    for k, name in enumerate(names):
        if name == "-": continue
        cx, cy = k % cols, k // cols
        cell = Image.fromarray(rgba[cy * h // rows:(cy + 1) * h // rows, cx * w // cols:(cx + 1) * w // cols], "RGBA")
        sp = crop(cell)
        sp.thumbnail((SLOT - PAD * 2, SLOT - PAD * 2), Image.LANCZOS)
        sp.save(os.path.join(ART, name + ".webp"), "WEBP", quality=88, method=6)
        print(f"{name}: {sp.size}")

def recolour(img: Image.Image, hue: float | None, sat: float = 1.0, val: float = 1.0, band=(0, 360), min_sat=0.35) -> Image.Image:
    """Turn the saturated pixels whose hue lies in `band` (degrees) to `hue`, scale their saturation / value."""
    hsv = np.array(img.convert("RGB").convert("HSV")).astype(np.float32)
    a = np.array(img)[..., 3]
    hd = hsv[..., 0] * 360 / 255
    lo, hi = band
    inband = (hd >= lo) & (hd <= hi) if lo <= hi else (hd >= lo) | (hd <= hi)
    mask = inband & (hsv[..., 1] / 255 >= min_sat)
    if hue is not None: hsv[..., 0] = np.where(mask, hue * 255 / 360, hsv[..., 0])
    hsv[..., 1] = np.where(mask, np.clip(hsv[..., 1] * sat, 0, 255), hsv[..., 1])
    hsv[..., 2] = np.where(mask, np.clip(hsv[..., 2] * val, 0, 255), hsv[..., 2])
    rgb = Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB")
    out = rgb.convert("RGBA")
    out.putalpha(Image.fromarray(a))
    return out

GOLD = (35, 65)        # gold veins and nuggets
CRYSTAL = (180, 320)   # the blue / purple crystals of gems.webp
RUBY = (330, 20)
# name: (source sprite, recolour args)
DERIVED = {
    "tin": ("silver", dict(hue=None, sat=0.3, val=0.85, band=(0, 360), min_sat=0.0)),
    "platinum": ("silver", dict(hue=210, sat=1.6, val=1.05, band=(150, 260), min_sat=0.05)),
    "cobalt": ("gold", dict(hue=220, sat=1.0, val=0.85, band=GOLD)),
    "amethyst": ("gems", dict(hue=280, band=CRYSTAL)),
    "sapphire": ("gems", dict(hue=225, band=CRYSTAL)),
    "lapis": ("gems", dict(hue=232, sat=1.1, val=0.7, band=CRYSTAL)),
    "aquamarine": ("emerald", dict(hue=185, band=(90, 170))),
    "amber": ("ruby", dict(hue=32, band=RUBY)),
    "topaz": ("ruby", dict(hue=48, sat=1.0, val=1.08, band=RUBY)),
    "opal": ("diamond", dict(hue=310, sat=2.2, band=(150, 260), min_sat=0.05)),
    "quartz": ("diamond", dict(hue=None, sat=0.2, val=1.0, band=(0, 360), min_sat=0.0)),
}

# Sprites that only feed DERIVED ones (the blue / purple crystal boulder), kept out of the atlas.
SOURCE_ONLY = {"gems"}

def atlas() -> None:
    names = sorted(n[:-5] for n in os.listdir(ART) if n.endswith(".webp"))
    sprites = {n: Image.open(os.path.join(ART, n + ".webp")).convert("RGBA") for n in names}
    for n, (src, args) in DERIVED.items():
        if src in sprites and n not in sprites: sprites[n] = recolour(sprites[src], **args)
    order = sorted(n for n in sprites if n not in SOURCE_ONLY)
    per = int(np.ceil(np.sqrt(len(order))))
    rows = int(np.ceil(len(order) / per))
    W, H = per * SLOT, rows * SLOT
    sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    meta = {}
    for k, n in enumerate(order):
        sp = sprites[n]
        x0 = (k % per) * SLOT + (SLOT - sp.width) // 2
        y0 = (k // per) * SLOT + (SLOT - sp.height)  - PAD
        sheet.alpha_composite(sp, (x0, y0))
        meta[n] = {"u0": x0 / W, "v0": 1 - (y0 + sp.height) / H, "u1": (x0 + sp.width) / W, "v1": 1 - y0 / H, "w": sp.width, "h": sp.height}
    # Bleed colours into the transparent pixels (mipmaps average them in), alpha untouched.
    arr = np.array(sheet).astype(np.float32)
    a = arr[..., 3:4] / 255
    col = arr[..., :3]
    from PIL import ImageFilter
    def blur(x: np.ndarray) -> np.ndarray:
        chans = [np.array(Image.fromarray(np.clip(x[..., i], 0, 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(6))).astype(np.float32) for i in range(x.shape[-1])]
        return np.stack(chans, axis=-1)
    pm = blur(np.concatenate([col * a, a * 255], axis=-1))
    # Only a few pixels round the art (enough for the mip levels in use); flat grey further out compresses to nothing.
    near = pm[..., 3:4] > 6
    fill = np.where(a > 0.02, col, np.where(near, pm[..., :3] / np.maximum(pm[..., 3:4] / 255, 1e-3), 128))
    out = Image.fromarray(np.concatenate([fill, arr[..., 3:4]], axis=-1).astype(np.uint8), "RGBA")
    os.makedirs(OUT, exist_ok=True)
    out.save(os.path.join(OUT, "nodes.webp"), "WEBP", quality=78, method=6)
    json.dump({"size": [W, H], "sprites": meta}, open(os.path.join(OUT, "nodes.json"), "w"), indent=0)
    print(f"atlas {W}x{H}, {len(order)} sprites, {os.path.getsize(os.path.join(OUT, 'nodes.webp')) // 1024} KB")

if __name__ == "__main__":
    if sys.argv[1] == "cut": cut(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5].split(","))
    elif sys.argv[1] == "atlas": atlas()

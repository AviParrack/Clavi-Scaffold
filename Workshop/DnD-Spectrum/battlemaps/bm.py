"""Battlemap engine: layout in grid squares, render to pixels, grid is exact by construction.

1 square = PPS pixels = 5 ft. Every coordinate in a map file is in squares.
"""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"


# ============================================================
# Palette
# ============================================================

C = dict(
    wood=(132, 92, 60), wood_dark=(96, 64, 42), stage=(150, 104, 66),
    tatami=(176, 168, 112), tatami_edge=(62, 74, 52),
    stone=(118, 112, 122), street=(98, 82, 120), grass=(78, 104, 64),
    water=(52, 92, 108), wall=(38, 30, 34), screen=(232, 222, 196),
    lacquer=(138, 34, 32), chalk=(238, 236, 228), brass=(196, 154, 72),
    cloth=(92, 62, 128), shadow=(0, 0, 0),
)


# ============================================================
# Canvas
# ============================================================

class Map:
    def __init__(self, w, h, pps=100, seed=0):
        self.w, self.h, self.pps = w, h, pps
        self.rng = np.random.default_rng(seed)
        self.img = Image.new("RGB", (w * pps, h * pps), C["wall"])
        self.labels = []   # (x, y, text) in squares, GM-only

    def px(self, v):
        return int(round(v * self.pps))

    def box(self, x0, y0, x1, y1):
        return [self.px(x0), self.px(y0), self.px(x1), self.px(y1)]

    def overlay(self):
        return Image.new("RGBA", self.img.size, (0, 0, 0, 0))

    def paste(self, layer):
        self.img = Image.alpha_composite(self.img.convert("RGBA"), layer).convert("RGB")

    def label(self, x, y, text):
        self.labels.append((x, y, text))


# ============================================================
# Textures (numpy, seeded)
# ============================================================

def _noise(rng, h, w, scale):
    sh, sw = max(2, h // scale + 2), max(2, w // scale + 2)
    small = rng.random((sh, sw)).astype(np.float32)
    big = Image.fromarray((small * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    return np.asarray(big, np.float32) / 255 - 0.5


def _tint(base, h, w, var):
    a = np.empty((h, w, 3), np.float32)
    a[:] = base
    return a + var[..., None]


def tex_planks(m, w, h, base, plank=0.5, horizontal=True):
    rng = m.rng
    a = _tint(base, h, w, 18 * _noise(rng, h, w, 6) + 8 * _noise(rng, h, w, 40))
    step = max(4, int(m.pps * plank))
    span = h if horizontal else w
    for i in range(0, span, step):
        shade = rng.uniform(-14, 14)
        sl = (slice(i, i + step), slice(None)) if horizontal else (slice(None), slice(i, i + step))
        a[sl] += shade
        line = (slice(i, i + 2), slice(None)) if horizontal else (slice(None), slice(i, i + 2))
        a[line] -= 40
        for _ in range(3):  # butt joints
            j = int(rng.uniform(0, w if horizontal else h))
            if horizontal:
                a[i:i + step, j:j + 2] -= 35
            else:
                a[j:j + 2, i:i + step] -= 35
    return a


def tex_stone(m, w, h, base, tile=1.0):
    rng = m.rng
    a = _tint(base, h, w, 14 * _noise(rng, h, w, 5) + 10 * _noise(rng, h, w, 30))
    s = int(m.pps * tile)
    for y in range(0, h, s):
        for x in range(0, w, s):
            a[y:y + s, x:x + s] += rng.uniform(-12, 12)
    a[::s, :] -= 45
    a[:, ::s] -= 45
    return a


def tex_cobble(m, w, h, base):
    rng = m.rng
    a = _tint(base, h, w, 16 * _noise(rng, h, w, 4) + 10 * _noise(rng, h, w, 50))
    s = m.pps // 4
    for y in range(0, h, s):
        off = (y // s % 2) * s // 2
        a[y:y + 2, :] -= 30
        for x in range(-off, w, s):
            a[y:y + s, max(0, x):x + s] += rng.uniform(-10, 10)
            a[y:y + s, max(0, x):max(0, x) + 2] -= 25
    return a


def tex_flat(m, w, h, base, amp=14, scale=8):
    return _tint(base, h, w, amp * _noise(m.rng, h, w, scale) + amp * _noise(m.rng, h, w, scale * 6))


def fill(m, x0, y0, x1, y1, kind, **kw):
    b = m.box(x0, y0, x1, y1)
    w, h = b[2] - b[0], b[3] - b[1]
    fn = dict(planks=tex_planks, stone=tex_stone, cobble=tex_cobble, flat=tex_flat)[kind]
    a = fn(m, w, h, **kw)
    m.img.paste(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)), (b[0], b[1]))


def tatami(m, x0, y0, x1, y1, vertical=False):
    """Mats are exactly 1x2 squares, so they line up with the grid."""
    fill(m, x0, y0, x1, y1, "flat", base=C["tatami"], amp=8, scale=3)
    d = ImageDraw.Draw(m.img)
    for i, yy in enumerate(range(y0, y1)):
        for xx in range(x0, x1, 2) if not vertical else []:
            d.rectangle(m.box(xx, yy, min(xx + 2, x1), yy + 1), outline=C["tatami_edge"], width=4)
    if vertical:
        for xx in range(x0, x1):
            for yy in range(y0, y1, 2):
                d.rectangle(m.box(xx, yy, xx + 1, min(yy + 2, y1)), outline=C["tatami_edge"], width=4)


# ============================================================
# Walls, doors, screens
# ============================================================

def wall(m, x0, y0, x1, y1, t=0.18):
    d = ImageDraw.Draw(m.img)
    d.rectangle(m.box(min(x0, x1) - t / 2, min(y0, y1) - t / 2, max(x0, x1) + t / 2, max(y0, y1) + t / 2), fill=C["wall"])


def door(m, x0, y0, x1, y1, t=0.18):
    """Door in a wall gap: wooden leaf drawn across the gap."""
    d = ImageDraw.Draw(m.img)
    d.rectangle(m.box(min(x0, x1) - t / 2, min(y0, y1) - t / 2, max(x0, x1) + t / 2, max(y0, y1) + t / 2),
                fill=C["wood_dark"], outline=C["wall"], width=3)


def screen(m, x0, y0, x1, y1, t=0.12):
    """Shoji: paper over a lattice. Blocks sight, not much else."""
    d = ImageDraw.Draw(m.img)
    b = m.box(min(x0, x1) - t / 2, min(y0, y1) - t / 2, max(x0, x1) + t / 2, max(y0, y1) + t / 2)
    d.rectangle(b, fill=C["screen"], outline=C["wood_dark"], width=3)
    n = int(max(abs(x1 - x0), abs(y1 - y0)) * 4)
    for i in range(1, n):
        f = i / n
        if y0 == y1:
            xx = m.px(x0 + (x1 - x0) * f)
            d.line([xx, b[1], xx, b[3]], fill=C["wood_dark"], width=2)
        else:
            yy = m.px(y0 + (y1 - y0) * f)
            d.line([b[0], yy, b[2], yy], fill=C["wood_dark"], width=2)


def rooms_from_walls(m, segs, kind):
    f = dict(wall=wall, door=door, screen=screen)[kind]
    for s in segs:
        f(m, *s)


# ============================================================
# Props (all positions in squares)
# ============================================================

def drop_shadow(m, shapes, off=0.08, blur=6):
    """shapes: list of ('rect'|'ellipse', box-in-squares)."""
    lay = m.overlay()
    d = ImageDraw.Draw(lay)
    for kind, (x0, y0, x1, y1) in shapes:
        b = m.box(x0 + off, y0 + off, x1 + off, y1 + off)
        (d.rectangle if kind == "rect" else d.ellipse)(b, fill=(0, 0, 0, 110))
    m.paste(Image.composite(lay, lay, lay).filter(ImageFilter.GaussianBlur(blur)))


def pillar(m, x, y, r=0.32):
    drop_shadow(m, [("ellipse", (x - r, y - r, x + r, y + r))])
    d = ImageDraw.Draw(m.img)
    d.ellipse(m.box(x - r, y - r, x + r, y + r), fill=C["lacquer"], outline=C["wall"], width=4)
    d.ellipse(m.box(x - r * 0.5, y - r * 0.6, x - r * 0.1, y - r * 0.2), fill=(178, 70, 60))


def crate(m, x0, y0, x1, y1, color=None, straps=True):
    drop_shadow(m, [("rect", (x0, y0, x1, y1))])
    d = ImageDraw.Draw(m.img)
    d.rectangle(m.box(x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05), fill=color or C["wood_dark"], outline=C["wall"], width=3)
    if straps:
        for f in (0.3, 0.7):
            xx = x0 + (x1 - x0) * f
            d.line(m.box(xx, y0 + 0.05, xx, y1 - 0.05), fill=C["brass"], width=5)


def cushion(m, x, y, s=0.5, color=None):
    d = ImageDraw.Draw(m.img)
    d.rounded_rectangle(m.box(x - s / 2, y - s / 2, x + s / 2, y + s / 2), radius=m.px(0.1),
                        fill=color or C["cloth"], outline=(50, 34, 70), width=2)


def table(m, x0, y0, x1, y1):
    drop_shadow(m, [("rect", (x0, y0, x1, y1))])
    d = ImageDraw.Draw(m.img)
    d.rectangle(m.box(x0 + 0.1, y0 + 0.1, x1 - 0.1, y1 - 0.1), fill=(70, 40, 30), outline=C["wall"], width=3)


def glow(m, x, y, r, rgb, alpha=110):
    lay = m.overlay()
    ImageDraw.Draw(lay).ellipse(m.box(x - r, y - r, x + r, y + r), fill=rgb + (alpha,))
    m.paste(lay.filter(ImageFilter.GaussianBlur(m.pps * r / 3)))


def brazier(m, x, y):
    glow(m, x, y, 1.6, (255, 170, 80), 70)
    d = ImageDraw.Draw(m.img)
    d.ellipse(m.box(x - 0.3, y - 0.3, x + 0.3, y + 0.3), fill=C["brass"], outline=C["wall"], width=3)
    d.ellipse(m.box(x - 0.17, y - 0.17, x + 0.17, y + 0.17), fill=(255, 140, 50))


def lantern(m, x, y, rgb=(200, 140, 255)):
    glow(m, x, y, 1.2, rgb, 80)
    d = ImageDraw.Draw(m.img)
    d.ellipse(m.box(x - 0.18, y - 0.18, x + 0.18, y + 0.18), fill=(150, 60, 160), outline=C["wall"], width=2)


def tree(m, x, y, r, seed=0):
    rng = np.random.default_rng(seed)
    lay = m.overlay()
    d = ImageDraw.Draw(lay)
    for _ in range(14):
        a, rr = rng.uniform(0, 2 * math.pi), rng.uniform(0, r * 0.6)
        cx, cy, cr = x + rr * math.cos(a), y + rr * math.sin(a), r * rng.uniform(0.35, 0.55)
        g = int(rng.uniform(70, 110))
        d.ellipse(m.box(cx - cr, cy - cr, cx + cr, cy + cr), fill=(140, g - 20, g + 40, 200))
    drop_shadow(m, [("ellipse", (x - r, y - r, x + r, y + r))], off=0.25, blur=12)
    m.paste(lay)


def water(m, pts):
    """Irregular pool; pts are polygon vertices in squares."""
    mask = Image.new("L", m.img.size, 0)
    ImageDraw.Draw(mask).polygon([(m.px(x), m.px(y)) for x, y in pts], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(4))
    w, h = m.img.size
    a = tex_flat(m, w, h, C["water"], amp=10, scale=12)
    rip = np.sin(np.arange(h)[:, None] / 7 + 3 * _noise(m.rng, h, w, 20)) * 6
    m.img = Image.composite(Image.fromarray(np.clip(a + rip[..., None], 0, 255).astype(np.uint8)), m.img, mask)
    ImageDraw.Draw(m.img).line([(m.px(x), m.px(y)) for x, y in pts + pts[:1]], fill=(60, 58, 64), width=7)


def koi(m, x, y, ang):
    d = ImageDraw.Draw(m.img)
    dx, dy = 0.18 * math.cos(ang), 0.18 * math.sin(ang)
    d.line(m.box(x - dx, y - dy, x + dx, y + dy), fill=(236, 120, 50), width=m.px(0.09))


def teleport_circle(m, cx, cy, r=1.0, seed=1):
    """Chalk circle, radius in squares. Runes are seeded so the sigil is repeatable."""
    rng = np.random.default_rng(seed)
    glow(m, cx, cy, r * 1.4, (220, 230, 255), 50)
    d = ImageDraw.Draw(m.img)
    for rr, wd in ((r, 6), (r * 0.82, 3), (r * 0.35, 3)):
        d.ellipse(m.box(cx - rr, cy - rr, cx + rr, cy + rr), outline=C["chalk"], width=wd)
    n = 7
    for i in range(n):  # seven-pointed star: one point per color
        a0, a1 = 2 * math.pi * i / n - math.pi / 2, 2 * math.pi * ((i + 3) % n) / n - math.pi / 2
        d.line(m.box(cx + r * 0.82 * math.cos(a0), cy + r * 0.82 * math.sin(a0),
                     cx + r * 0.82 * math.cos(a1), cy + r * 0.82 * math.sin(a1)), fill=C["chalk"], width=2)
    for i in range(28):  # rune ticks in the outer band
        a = 2 * math.pi * i / 28
        r0, r1 = r * 0.85, r * rng.uniform(0.9, 0.97)
        b = a + rng.uniform(-0.06, 0.06)
        d.line(m.box(cx + r0 * math.cos(a), cy + r0 * math.sin(a), cx + r1 * math.cos(b), cy + r1 * math.sin(b)),
               fill=C["chalk"], width=3)
    # salt line, swept
    d.arc(m.box(cx - r * 1.15, cy - r * 1.15, cx + r * 1.15, cy + r * 1.15), 200, 520, fill=(250, 250, 250), width=2)


def stage(m, x0, y0, x1, y1, lip=0.15):
    drop_shadow(m, [("rect", (x0, y0, x1, y1))], off=0.15, blur=10)
    fill(m, x0, y0, x1, y1, "planks", base=C["stage"], plank=0.25, horizontal=False)
    d = ImageDraw.Draw(m.img)
    d.rectangle(m.box(x0, y1 - lip, x1, y1), fill=C["lacquer"])
    d.rectangle(m.box(x0, y0, x1, y1), outline=C["wall"], width=4)


def curtain(m, x0, x1, y):
    d = ImageDraw.Draw(m.img)
    d.rectangle(m.box(x0, y - 0.15, x1, y + 0.15), fill=(120, 40, 110))
    for i in range(int((x1 - x0) * 5)):
        xx = x0 + i / 5
        d.line(m.box(xx, y - 0.15, xx, y + 0.15), fill=(80, 20, 70), width=3)


def steps(m, x0, y0, x1, y1, n=3, vertical=True):
    d = ImageDraw.Draw(m.img)
    d.rectangle(m.box(x0, y0, x1, y1), fill=C["wood"])
    for i in range(1, n):
        if vertical:
            yy = y0 + (y1 - y0) * i / n
            d.line(m.box(x0, yy, x1, yy), fill=C["wall"], width=3)
        else:
            xx = x0 + (x1 - x0) * i / n
            d.line(m.box(xx, y0, xx, y1), fill=C["wall"], width=3)


def roof_edge(m, x0, y0, x1, y1):
    """Violet tile eaves overhanging the street."""
    b = m.box(x0, y0, x1, y1)
    w, h = b[2] - b[0], b[3] - b[1]
    a = tex_flat(m, w, h, (90, 60, 130), amp=10)
    s = m.pps // 5
    a[:, ::s] -= 40
    a[::m.pps // 2, :] -= 25
    m.img.paste(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)), (b[0], b[1]))


# ============================================================
# Grid + output
# ============================================================

def grid(img, pps, alpha=90, width=2):
    lay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    W, H = img.size
    for x in range(0, W + 1, pps):
        d.line([x, 0, x, H], fill=(0, 0, 0, alpha), width=width)
    for y in range(0, H + 1, pps):
        d.line([0, y, W, y], fill=(0, 0, 0, alpha), width=width)
    return Image.alpha_composite(img.convert("RGBA"), lay).convert("RGB")


def gm_labels(m, img):
    img = img.copy()
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT, int(m.pps * 0.38))
    for x, y, t in m.labels:
        r = 0.36
        d.ellipse(m.box(x - r, y - r, x + r, y + r), fill=(250, 240, 210), outline=(150, 20, 20), width=5)
        d.text((m.px(x), m.px(y)), t, font=f, fill=(150, 20, 20), anchor="mm")
    return img


def with_coords(img, pps, margin=None):
    """Chess-style coordinates in a margin: A.. across, 1.. down."""
    margin = margin or pps // 2
    W, H = img.size
    out = Image.new("RGB", (W + 2 * margin, H + 2 * margin), (245, 240, 228))
    out.paste(img, (margin, margin))
    d = ImageDraw.Draw(out)
    f = ImageFont.truetype(FONT, int(pps * 0.28))
    for i in range(W // pps):
        s = col_name(i)
        for yy in (margin // 2, H + margin + margin // 2):
            d.text((margin + i * pps + pps // 2, yy), s, font=f, fill=(60, 50, 50), anchor="mm")
    for j in range(H // pps):
        for xx in (margin // 2, W + margin + margin // 2):
            d.text((xx, margin + j * pps + pps // 2), str(j + 1), font=f, fill=(60, 50, 50), anchor="mm")
    return out


def col_name(i):
    return chr(65 + i) if i < 26 else "A" + chr(65 + i - 26)


def print_tiles(img, pps, path, cols=8, rows=10, dpi=None):
    """Letter-size PDF pages at exactly 1 inch per square (dpi = pps)."""
    dpi = dpi or pps
    W, H = img.size
    pw, ph = int(8.5 * dpi), int(11 * dpi)
    pages = []
    nx, ny = math.ceil(W / (cols * pps)), math.ceil(H / (rows * pps))
    f = ImageFont.truetype(FONT, int(dpi * 0.16))
    for j in range(ny):
        for i in range(nx):
            crop = img.crop((i * cols * pps, j * rows * pps, min(W, (i + 1) * cols * pps), min(H, (j + 1) * rows * pps)))
            page = Image.new("RGB", (pw, ph), "white")
            ox, oy = (pw - cols * pps) // 2, (ph - rows * pps) // 2
            page.paste(crop, (ox, oy))
            d = ImageDraw.Draw(page)
            d.rectangle([ox - 1, oy - 1, ox + crop.width, oy + crop.height], outline=(160, 160, 160))
            d.text((pw // 2, oy // 2), f"tile row {j + 1}/{ny}, col {i + 1}/{nx}   (1 square = 1 inch, print at 100%)",
                   font=f, fill=(90, 90, 90), anchor="mm")
            pages.append(page)
    pages[0].save(path, save_all=True, append_images=pages[1:], resolution=dpi)
    return len(pages)


def check_grid(img, pps, w, h):
    """Debug: image size is an exact multiple of the square, and grid lines sit where they should."""
    assert img.size == (w * pps, h * pps), img.size
    a = np.asarray(img.convert("L"), np.float32)
    on = a[:, ::pps][:, :w].mean()
    off = a[:, pps // 2::pps][:, :w].mean()
    print(f"  grid check: {w}x{h} squares @ {pps}px  | mean luminance on-line {on:.1f} vs mid-square {off:.1f}")
    assert on < off, "grid lines not darker than square centres"

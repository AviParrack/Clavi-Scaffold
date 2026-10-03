"""Digital-watercolor style. Floors are painted as washes, walls as ink, then one finishing pass.

Geometry stays on the grid: wash edges wander at most ~0.1 square, and the grid is drawn after everything.
"""
import colorsys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

PAPER = np.array([250, 245, 233], np.float32)
INK = (46, 30, 64)
SPECTRUM = [(170, 90, 230), (60, 170, 190), (240, 170, 70), (230, 90, 120)]


# ============================================================
# Helpers
# ============================================================

def _noise(rng, h, w, sigma):
    return ndi.gaussian_filter(rng.standard_normal((h, w)).astype(np.float32), max(sigma, 0.5), mode="wrap")


def _norm(a):
    return a / (np.abs(a).max() + 1e-6)


def _luminous(rgb, sat=1.15, top=225):
    """Watercolour is transparent: same hue, more chroma, lifted value."""
    h, s, v = colorsys.rgb_to_hsv(*[c / 255 for c in rgb])
    r, g, b = colorsys.hsv_to_rgb(h, min(1, s * sat), max(v, top / 255 * 0.9))
    return np.array([r, g, b], np.float32) * 255


def _partner(rgb, shift=0.07):
    """Neighbouring hue for in-wash colour drift (cooler shadow side)."""
    h, s, v = colorsys.rgb_to_hsv(*[c / 255 for c in rgb])
    r, g, b = colorsys.hsv_to_rgb((h + shift) % 1, min(1, s * 1.1), v * 0.9)
    return np.array([r, g, b], np.float32) * 255


def blank(w, h, seed=0):
    rng = np.random.default_rng(seed)
    a = PAPER * (1 + 0.025 * _norm(_noise(rng, h, w, 1.5)))[..., None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


# ============================================================
# Washes
# ============================================================

def _hints(m, kind, h, w, M):
    """Sparse brush marks that suggest the material without texturing every pixel."""
    lay = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(lay)
    rng, p = m.rng, m.pps
    if kind in ("planks_h", "planks_v"):
        step = p // 2
        span, length = (h, w) if kind == "planks_h" else (w, h)
        for i in range(M, span - M, step):
            x = M
            while x < length - M:
                seg = int(rng.uniform(0.6, 2.5) * p)
                if rng.random() < 0.7:
                    pts = [(x, i), (min(x + seg, length - M), i + rng.uniform(-2, 2))]
                    if kind == "planks_v":
                        pts = [(y, x) for x, y in pts]
                    d.line(pts, fill=int(rng.uniform(90, 160)), width=int(rng.uniform(2, 4)))
                x += seg + int(rng.uniform(0.1, 0.5) * p)
    elif kind == "stone":
        for y in range(M, h - M + 1, p):
            for x in range(M, w - M + 1, p):
                if rng.random() < 0.6:
                    d.line([(x, y), (x + p, y + rng.uniform(-2, 2))], fill=int(rng.uniform(60, 120)), width=2)
                if rng.random() < 0.6:
                    d.line([(x, y), (x + rng.uniform(-2, 2), y + p)], fill=int(rng.uniform(60, 120)), width=2)
    elif kind == "cobble":
        s = p // 4
        for y in range(M, h - M, s):
            for x in range(M + (y // s % 2) * s // 2, w - M, s):
                if rng.random() < 0.55:
                    r = s * rng.uniform(0.25, 0.42)
                    d.ellipse([x - r, y - r * 0.8, x + r, y + r * 0.8], fill=int(rng.uniform(50, 110)))
    elif kind == "roof":
        for y in range(M, h - M, p // 3):
            for x in range(M, w - M, p // 5):
                d.arc([x, y - p // 8, x + p // 5, y + p // 8], 0, 180, fill=130, width=3)
    elif kind == "grass":
        for _ in range(int(w * h / p ** 2 * 18)):
            x, y = rng.uniform(M, w - M), rng.uniform(M, h - M)
            a, L = rng.uniform(-0.5, 0.5) - np.pi / 2, rng.uniform(0.08, 0.2) * p
            d.line([(x, y), (x + L * np.cos(a), y + L * np.sin(a))], fill=int(rng.uniform(80, 150)), width=2)
    return ndi.gaussian_filter(np.asarray(lay, np.float32) / 255, 0.8)


def wash(m, mask_fn, bbox, rgb, kind="flat", density=1.0, var=1.0):
    """Paint one wash. mask_fn(draw, ox, oy) draws the region (value 255) on a local L canvas."""
    p, rng = m.pps, m.rng
    M = int(0.3 * p)
    x0, y0, x1, y1 = bbox
    X0, Y0 = max(0, x0 - M), max(0, y0 - M)
    X1, Y1 = min(m.img.width, x1 + M), min(m.img.height, y1 + M)
    w, h = X1 - X0, Y1 - Y0

    canvas = Image.new("L", (w, h), 0)
    mask_fn(ImageDraw.Draw(canvas), X0, Y0)
    mask = np.asarray(canvas, np.float32) / 255

    # irregular, slightly bleeding edge
    soft = ndi.gaussian_filter(mask, 0.05 * p)
    edge = ((soft + 0.18 * _norm(_noise(rng, h, w, 0.12 * p))) > 0.5).astype(np.float32)
    a = ndi.gaussian_filter(edge, 1.2)

    # pigment density: uneven body, pooled edges, granulation, brush hints
    d = density * (1 - 0.4 * var + 0.4 * var * _norm(_noise(rng, h, w, 0.7 * p)))
    if var > 0.5:                                                    # backruns: soft inside, hard rim
        bl = (_norm(_noise(rng, h, w, 0.5 * p)) > 0.5).astype(np.float32)
        d = d + 0.2 * ndi.gaussian_filter(bl, 0.08 * p) + 0.45 * np.clip(bl - ndi.gaussian_filter(bl, 0.03 * p), 0, None)
    band = np.clip(a - ndi.gaussian_filter(a, 0.04 * p), 0, None)
    d = d + 2.6 * band
    d = d + 1.0 * _hints(m, kind, h, w, M)
    d = d * (1 + 0.22 * _norm(_noise(rng, h, w, 0.9)))

    # colour drift inside the wash
    t = np.clip(0.5 + 0.5 * _norm(_noise(rng, h, w, 1.2 * p)), 0, 1)[..., None] * 0.6 * var
    col = _luminous(rgb) * (1 - t) + _partner(_luminous(rgb)) * t
    T = (np.clip(col, 1, 255) / 255) ** d[..., None]

    under = np.asarray(m.img.crop((X0, Y0, X1, Y1)), np.float32)
    paint = PAPER * T
    out = under * (1 - a[..., None]) + np.minimum(paint, under * 0.35 + paint * 0.65) * a[..., None]
    m.img.paste(Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)), (X0, Y0))


def wash_rect(m, x0, y0, x1, y1, rgb, kind="flat", density=1.0, var=1.0):
    b = m.box(x0, y0, x1, y1)
    wash(m, lambda d, ox, oy: d.rectangle([b[0] - ox, b[1] - oy, b[2] - ox, b[3] - oy], fill=255), b, rgb, kind, density, var)


def wash_poly(m, pts, rgb, kind="flat", density=1.0, var=1.0):
    P = [(m.px(x), m.px(y)) for x, y in pts]
    b = [min(x for x, _ in P), min(y for _, y in P), max(x for x, _ in P), max(y for _, y in P)]
    wash(m, lambda d, ox, oy: d.polygon([(x - ox, y - oy) for x, y in P], fill=255), b, rgb, kind, density, var)


# ============================================================
# Ink
# ============================================================

def ink_segment(m, x0, y0, x1, y1, t=0.18, color=INK):
    """Hand-inked wall: jittered spine, overshoot at the ends, a second lighter pass."""
    p, rng = m.pps, m.rng
    L = max(abs(x1 - x0), abs(y1 - y0))
    over = 0.06
    n = max(2, int(L / 0.2) + 1)
    s = np.linspace(-over, L + over, n)
    jit = ndi.gaussian_filter1d(rng.standard_normal(n), 1.5) * 0.02
    horiz = y0 == y1
    xs = (min(x0, x1) + s) if horiz else (x0 + jit)
    ys = (y0 + jit) if horiz else (min(y0, y1) + s)
    pts = [(m.px(a), m.px(b)) for a, b in zip(xs, ys)]

    pad = int(t * p) + 10
    bx0, by0 = max(0, min(x for x, _ in pts) - pad), max(0, min(y for _, y in pts) - pad)
    bx1, by1 = min(m.img.width, max(x for x, _ in pts) + pad), min(m.img.height, max(y for _, y in pts) + pad)
    local = m.img.crop((bx0, by0, bx1, by1)).convert("RGBA")
    lay = Image.new("RGBA", local.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    loc = [(x - bx0, y - by0) for x, y in pts]
    d.line(loc, fill=color + (235,), width=int(t * p * rng.uniform(0.85, 1.05)), joint="curve")
    off = [(x + rng.uniform(-3, 3), y + rng.uniform(-3, 3)) for x, y in loc]
    d.line(off, fill=color + (90,), width=max(2, int(t * p * 0.4)), joint="curve")
    m.img.paste(Image.alpha_composite(local, lay).convert("RGB"), (bx0, by0))


# ============================================================
# Finishing pass
# ============================================================

def finish(img, pps, seed=0, wobble=0.02, pool=0.8, grain=0.07, bloom=0.06, sat=1.0, splat=True, debug=False):
    rng = np.random.default_rng(seed)
    W, H = img.size
    a = np.asarray(img, np.float32)

    amp = wobble * pps
    dy = _norm(_noise(rng, H, W, pps * 0.4)) * amp
    dx = _norm(_noise(rng, H, W, pps * 0.4)) * amp
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    a = np.stack([ndi.map_coordinates(a[..., c], [yy + dy, xx + dx], order=1, mode="nearest") for c in range(3)], -1)

    blur = np.stack([ndi.gaussian_filter(a[..., c], pps * 0.04) for c in range(3)], -1)
    a = a + pool * np.minimum(a - blur, 0)

    a = a * (1 + grain * _norm(_noise(rng, H, W, 1.0) + 0.5 * _noise(rng, H, W, 4.0)))[..., None]

    for rgb in SPECTRUM:
        m = np.clip(_norm(_noise(rng, H, W, pps * 2.5)), 0, 1)[..., None]
        a = a * (1 - bloom * m) + np.array(rgb, np.float32) * bloom * m

    lum = a.mean(axis=2, keepdims=True)
    a = lum + (a - lum) * sat

    if splat:
        for _ in range(int(W * H / pps ** 2 / 20)):
            cy, cx, r = rng.integers(0, H), rng.integers(0, W), rng.uniform(2, 8)
            rgb = np.array(SPECTRUM[rng.integers(0, len(SPECTRUM))], np.float32)
            y0, y1, x0, x1 = int(max(0, cy - r)), int(min(H, cy + r + 1)), int(max(0, cx - r)), int(min(W, cx + r + 1))
            sl = np.s_[y0:y1, x0:x1]
            mask = ((yy[sl] - cy) ** 2 + (xx[sl] - cx) ** 2 < r * r)[..., None]
            a[sl] = np.where(mask, 0.6 * a[sl] + 0.4 * rgb, a[sl])

    if debug:
        print(f"  watercolor finish: {W}x{H}, wobble max {np.abs(dx).max():.1f}px, mean rgb {a.mean(axis=(0, 1)).round(1)}")
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


# ============================================================
# Props: a dense little wash plus a loose ink outline
# ============================================================

def prop_rect(m, x0, y0, x1, y1, rgb, density=1.3, ink=0.035):
    wash_rect(m, x0, y0, x1, y1, rgb, "flat", density, var=0.25)
    for s in [(x0, y0, x1, y0), (x0, y1, x1, y1), (x0, y0, x0, y1), (x1, y0, x1, y1)]:
        ink_segment(m, *s, t=ink)


def prop_ellipse(m, cx, cy, r, rgb, density=1.3):
    P = [(cx + r * np.cos(a), cy + r * np.sin(a)) for a in np.linspace(0, 2 * np.pi, 24, endpoint=False)]
    wash_poly(m, P, rgb, "flat", density, var=0.25)
    d = ImageDraw.Draw(m.img)
    for k, (w, j) in enumerate([(4, 0.0), (2, 0.03)]):
        b = m.box(cx - r - j, cy - r + j, cx + r - j, cy + r + j)
        d.arc(b, 20 * k, 340 + 20 * k, fill=INK, width=w)

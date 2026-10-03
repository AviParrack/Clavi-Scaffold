"""The party's airship: the captured Veil ship (working name Whispering Web).

Traced on Avi's original ship map (Spectrum/battlemaps/airship/reference/original_ship_map.png):
same 14 x 25 grid, so tokens sit on the same squares. Bow (rotors, blue canopy, helm) at the top, stern at the bottom.

Run:  python3 airship.py        -> out/airship_{top,under}_*.png / .pdf + airship_gm_both.png
"""
import math
import os
import numpy as np
from PIL import Image, ImageDraw
from bm import *
import wc

W, H, PPS = 14, 25, 100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")

HOUSE = (4.0, 5.1, 10.1, 8.4)                                      # canopy house over the stern
HULL = [(4.0, 5.1), (10.1, 5.1), (10.1, 8.4), (9.6, 8.9), (9.6, 16.0), (9.3, 17.6), (8.8, 18.8), (8.1, 19.8),
        (7.4, 20.5), (6.6, 20.5), (5.9, 19.8), (5.2, 18.8), (4.7, 17.6), (4.4, 16.0), (4.4, 8.9), (4.0, 8.4)]

C_DECK, C_CANOPY, C_GOLD, C_BAG = (150, 104, 66), (45, 75, 140), (210, 170, 70), (238, 226, 196)
C_SKY, C_BRASS, C_SPARK, C_ROSE = (120, 170, 215), (200, 160, 70), (90, 220, 230), (225, 120, 150)

KEY_TOP = [
    ("1", "Helm", "Under the blue-and-gold canopy at the bow. The wheel with a web etched into its hub, the brass dial panel, and the lever marked DO NOT."),
    ("2", "Chart room", "Just aft of the helm. Chart table, a speaking tube down to the engine bay, and a ladder down to the stateroom."),
    ("3", "Main deck", "Gold centre-line fore to aft. Lashed crates, rope coils and bolts of spare envelope silk where the gun table used to be."),
    ("4", "Benches", "Two heavy benches lashed down where the gun table stood (half cover). Boarding hooks hang on the stern rail."),
    ("5", "Crow's nest", "A platform on the rotor mast above the bow. Climb the mast to reach it; sees for miles."),
    ("6", "Mooring winches", "Two under the canopy, two at the stern."),
    ("7", "Ladders and hatch", "Midship ladder down to the crew quarters; cargo hatch down to the hold."),
    ("8", "Red chest", "At the stern rail."),
    ("9", "Gasbag pontoons", "Two cream gasbags lashed along the hull. Climbable, soft, and a very bad place to start a fire."),
    ("10", "Rotors and props", "Three stacked rotors on the bow mast, a propeller on each outrigger. Reaching one means climbing out along the arm."),
]
KEY_UNDER = [
    ("1", "Meridian's stateroom", "Forward, under the chart room, the one walled room. The old captain's cabin, redone by Lord Beaumont: rose silk, a bunk piled with stuffed animals, a note on the biggest bear, a writing desk with five scrolls in pink ribbon."),
    ("2", "Crew quarters", "Hammocks slung along both sides of the open deck, with a tiny galley in the corner (stove and kettle). Room for the Harbingers if they come aboard."),
    ("3", "Drop doors", "Big double doors in the middle of the deck (10 ft by 15 ft), opening straight onto the sky. A lever by the starboard rail throws the bolts."),
    ("4", "Engine bay", "Aft of the doors, open to the deck. Sparkstone batteries at quarter charge, the burner, pipes up to the rotors. Blinkin's bench and ledger, and the speaking tube to the chart room."),
    ("5", "Hold", "Aft, under the cargo hatch. Cargo, ballast sandbags, rope, two folded Sky Perches (AC 8, HP 20), and a hooded perch built for a captured roc."),
    ("6", "Brig", "A barred cage against the port hull, with a ring bolt in the floor."),
    ("7", "Spider-latch panel", "GM only. On the hull behind the engine bay, one of three panels that don't match the manual. Sealed, a spider etched on the latch; Blinkin hasn't opened it."),
]
LADDERS = [(5.5, 9.1, 6.4, 10.0), (4.6, 12.2, 5.6, 13.2)]                          # chart room -> stateroom, midship -> crew
CARGO_HATCH = (6.5, 16.6, 7.5, 17.6)                                                 # -> hold


# ============================================================
# Pieces
# ============================================================

def ellipse_pts(cx, cy, rx, ry, n=28):
    return [(cx + rx * math.cos(t), cy + ry * math.sin(t)) for t in np.linspace(0, 2 * math.pi, n, endpoint=False)]


def clip(poly, x0, y0, x1, y1):
    def cut(P, inside, inter):
        out = []
        for i in range(len(P)):
            a, b = P[i - 1], P[i]
            if inside(b):
                if not inside(a):
                    out.append(inter(a, b))
                out.append(b)
            elif inside(a):
                out.append(inter(a, b))
        return out
    lerp = lambda a, b, t: (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
    P = cut(poly, lambda p: p[0] >= x0, lambda a, b: lerp(a, b, (x0 - a[0]) / (b[0] - a[0])))
    P = cut(P, lambda p: p[0] <= x1, lambda a, b: lerp(a, b, (x1 - a[0]) / (b[0] - a[0])))
    P = cut(P, lambda p: p[1] >= y0, lambda a, b: lerp(a, b, (y0 - a[1]) / (b[1] - a[1])))
    P = cut(P, lambda p: p[1] <= y1, lambda a, b: lerp(a, b, (y1 - a[1]) / (b[1] - a[1])))
    return P


def floor(m, x0, y0, x1, y1, rgb, kind="planks_v", density=1.0):
    wc.wash_poly(m, clip(HULL, x0, y0, x1, y1), rgb, kind, density)


def sky(m):
    wc.wash_rect(m, 0, 0, W, H, C_SKY, "flat", density=0.55)
    for cx, cy, rx, ry in [(1.5, 2.5, 2.2, 0.9), (12.2, 22.5, 2.4, 1.0), (2.0, 22.0, 1.6, 0.7), (12.5, 2.0, 1.4, 0.6)]:
        wc.wash_poly(m, ellipse_pts(cx, cy, rx, ry, 20), (235, 230, 245), "flat", density=0.5)


def propeller(m, cx, cy, span, blades=3, ang=0.4):
    d = ImageDraw.Draw(m.img)
    for k in range(blades):
        a = ang + 2 * math.pi * k / blades
        tip = (cx + span * math.cos(a), cy + span * math.sin(a))
        mid = (cx + span * 0.55 * math.cos(a), cy + span * 0.55 * math.sin(a))
        r = span * 0.45
        wc.wash_poly(m, [(cx, cy), (mid[0] + 0.18 * math.sin(a), mid[1] - 0.18 * math.cos(a)), tip,
                         (mid[0] - 0.18 * math.sin(a), mid[1] + 0.18 * math.cos(a))], (215, 195, 150), "flat", 1.0, var=0.3)
        d.line(m.box(cx, cy, *tip), fill=wc.INK, width=3)
    wc.prop_ellipse(m, cx, cy, 0.22, (120, 85, 55), density=1.4)


def flat_prop(m, cx, cy, half):
    """Stern-stack prop seen edge-on from above: a long thin lens."""
    wc.wash_poly(m, ellipse_pts(cx, cy, half, 0.12, 24), (220, 200, 160), "flat", 1.1, var=0.3)
    ImageDraw.Draw(m.img).line(m.box(cx - half, cy, cx + half, cy), fill=wc.INK, width=3)


def exterior(m):
    """Everything outside the hull: bladders, fins, props, mast, bowsprit. Same on both maps."""
    for sx in (-1, 1):
        cx = 7.0 + sx * 4.35
        for cy, rx, ry in [(9.4, 1.7, 1.3), (11.4, 1.95, 1.3), (13.5, 1.95, 1.3), (15.6, 1.8, 1.3), (17.0, 1.4, 1.0)]:
            wc.wash_poly(m, ellipse_pts(cx, cy, rx, ry), C_BAG, "flat", 1.25)
        for cy, rx, ry in [(9.4, 1.7, 1.3), (11.4, 1.95, 1.3), (13.5, 1.95, 1.3), (15.6, 1.8, 1.3), (17.0, 1.4, 1.0)]:
            a0, a1 = (90, 270) if sx < 0 else (-90, 90)
            ImageDraw.Draw(m.img).arc(m.box(cx - rx, cy - ry, cx + rx, cy + ry), a0, a1, fill=(120, 100, 80), width=4)
        d = ImageDraw.Draw(m.img)
        for y0, y1 in [(9.0, 10.2), (11.6, 12.4), (14.2, 14.8), (16.6, 16.0)]:        # straps over the bags
            d.line(m.box(7 + sx * 2.6, y0, 7 + sx * 6.2, y1), fill=(120, 90, 60), width=6)
        fx = 7 + sx * 3.5
        wc.wash_poly(m, [(fx - 0.25, 17.7), (fx + 0.25, 17.7), (fx + sx * 0.1, 19.3)], (110, 70, 45), "flat", 1.5, var=0.2)
        wc.ink_poly(m, [(fx - 0.25, 17.7), (fx + sx * 0.1, 19.3), (fx + 0.25, 17.7)], t=0.03, closed=False)
        # side outrigger + prop
        hx = 7 + sx * 5.1
        d = ImageDraw.Draw(m.img)
        d.line(m.box(7 + sx * 3.05, 6.6, hx, 6.2), fill=(100, 70, 45), width=16)
        d.line(m.box(7 + sx * 3.05, 6.6, hx, 6.2), fill=wc.INK, width=3)
        propeller(m, hx, 6.2, 1.5, ang=-1.2 if sx < 0 else 1.9)

    # stern mast and stacked props
    d = ImageDraw.Draw(m.img)
    d.line(m.box(7, 5.1, 7, 1.3), fill=(100, 70, 45), width=18)
    d.line(m.box(7, 5.1, 7, 1.3), fill=wc.INK, width=3)
    for y, half in [(1.6, 2.25), (2.3, 1.05), (3.0, 1.5), (4.0, 2.5)]:
        flat_prop(m, 7, y, half)

    # bowsprit + figurehead
    d = ImageDraw.Draw(m.img)
    d.line(m.box(7, 20.4, 7, 23.6), fill=(110, 75, 45), width=22)
    d.line(m.box(7, 20.4, 7, 23.6), fill=wc.INK, width=3)
    wc.prop_ellipse(m, 7, 23.4, 0.35, (190, 150, 90), density=1.2)


def hull_outline(m):
    wc.ink_poly(m, HULL, t=0.2)


def ladder(m, x0, y0, x1, y1):
    wc.prop_rect(m, x0 + 0.1, y0 + 0.05, x1 - 0.1, y1 - 0.05, (90, 60, 40), density=1.6, ink=0.03)
    d = ImageDraw.Draw(m.img)
    for k in range(1, 5):
        yy = y0 + (y1 - y0) * k / 5
        d.line(m.box(x0 + 0.15, yy, x1 - 0.15, yy), fill=C_BRASS, width=4)


def hatch_grate(m, x0, y0, x1, y1):
    wc.prop_rect(m, x0, y0, x1, y1, (70, 50, 40), density=1.7)
    d = ImageDraw.Draw(m.img)
    for k in np.arange(x0 + 0.2, x1, 0.2):
        d.line(m.box(k, y0 + 0.05, k, y1 - 0.05), fill=(40, 28, 24), width=3)
    for k in np.arange(y0 + 0.2, y1, 0.2):
        d.line(m.box(x0 + 0.05, k, x1 - 0.05, k), fill=(40, 28, 24), width=3)


def barrel(m, x, y, r=0.28, rgb=(140, 90, 50)):
    drop_shadow(m, [("ellipse", (x - r, y - r, x + r, y + r))])
    wc.prop_ellipse(m, x, y, r, rgb, density=1.3)
    ImageDraw.Draw(m.img).ellipse(m.box(x - r * 0.65, y - r * 0.65, x + r * 0.65, y + r * 0.65), outline=(60, 40, 30), width=2)


def wheel(m, x, y, r=0.45):
    drop_shadow(m, [("ellipse", (x - r, y - r, x + r, y + r))])
    d = ImageDraw.Draw(m.img)
    d.ellipse(m.box(x - r, y - r, x + r, y + r), outline=wc.INK, width=7)
    for k in range(8):
        a = k * math.pi / 4
        d.line(m.box(x, y, x + 1.25 * r * math.cos(a), y + 1.25 * r * math.sin(a)), fill=(90, 60, 40), width=6)
    for rr in (0.09, 0.17, 0.25):                                      # the web worn into the hub
        d.ellipse(m.box(x - rr, y - rr, x + rr, y + rr), outline=(225, 225, 240), width=2)


def weapon_rack(m, x0, y0, x1, y1, n=6, long=False):
    wc.prop_rect(m, x0, y0, x1, y1, (120, 85, 55), density=1.3)
    d = ImageDraw.Draw(m.img)
    for k in range(n):
        x = x0 + (x1 - x0) * (k + 0.5) / n
        if long:
            d.line(m.box(x, y0 + 0.2, x, y1 - 0.2), fill=(170, 175, 185), width=5)
            d.line(m.box(x, y1 - 0.6, x, y1 - 0.2), fill=(80, 55, 35), width=7)
        else:
            for yy in np.arange(y0 + 0.25, y1 - 0.1, 0.5):
                d.line(m.box(x - 0.08, yy, x + 0.08, yy + 0.3), fill=(170, 175, 185), width=4)


def chart_table(m, x0, y0, x1, y1):
    table(m, x0, y0, x1, y1)
    wc.prop_rect(m, x0 + 0.25, y0 + 0.3, x1 - 0.25, y1 - 0.3, (235, 220, 180), density=0.6, ink=0.015)
    d = ImageDraw.Draw(m.img)
    rng = np.random.default_rng(9)
    pts = [(x0 + 0.35 + rng.uniform(0, x1 - x0 - 0.7), y0 + 0.4 + k * (y1 - y0 - 0.8) / 5) for k in range(6)]
    d.line([(m.px(x), m.px(y)) for x, y in pts], fill=(150, 60, 50), width=3)       # a route, pencilled
    for x, y in pts[::2]:
        d.ellipse(m.box(x - 0.05, y - 0.05, x + 0.05, y + 0.05), fill=(150, 60, 50))


def rope_coil(m, x, y, r=0.38):
    wc.prop_ellipse(m, x, y, r, (190, 160, 110), density=1.0)
    d = ImageDraw.Draw(m.img)
    for rr in (0.27, 0.18, 0.09):
        d.ellipse(m.box(x - rr, y - rr, x + rr, y + rr), outline=(120, 95, 60), width=3)


def battery(m, x, y, r=0.38):
    glow(m, x, y, 1.1, C_SPARK, 90)
    wc.prop_ellipse(m, x, y, r, (60, 150, 170), density=1.4)
    glow(m, x, y, 0.25, (230, 255, 255), 170)


def hammock(m, x, y0, y1):
    wc.wash_poly(m, [(x - 0.22, y0), (x + 0.22, y0), (x + 0.22, y1), (x - 0.22, y1)], (190, 170, 130), "flat", 1.1, var=0.25)
    d = ImageDraw.Draw(m.img)
    d.arc(m.box(x - 0.22, y0, x + 0.22, y1), 0, 360, fill=(110, 90, 60), width=2)
    d.line(m.box(x, y0 - 0.12, x, y0), fill=wc.INK, width=3)
    d.line(m.box(x, y1, x, y1 + 0.12), fill=wc.INK, width=3)


def sky_perch(m, x0, y0, x1, y1):
    wc.prop_rect(m, x0, y0, x1, y1, (150, 120, 80), density=1.0)
    d = ImageDraw.Draw(m.img)
    d.line(m.box(x0, y0, x1, y1), fill=wc.INK, width=4)
    d.line(m.box(x0, y1, x1, y0), fill=wc.INK, width=4)


def canopy(m):
    x0, y0, x1, y1 = HOUSE
    wc.wash_poly(m, [(x0 + 0.1, y0 + 0.1), (x1 - 0.1, y0 + 0.1), (x1 - 0.1, y1 - 0.1), (x0 + 0.1, y1 - 0.1)], C_CANOPY, "flat", 1.3)
    d = ImageDraw.Draw(m.img)
    rng = np.random.default_rng(4)
    for cx, cy in [(5.0, 6.4), (6.2, 7.3), (7.8, 7.3), (9.0, 6.4), (5.6, 5.7), (8.4, 5.7)]:   # gold scrolls
        r = rng.uniform(0.3, 0.5)
        flip = 1 if cx < 7 else -1
        d.arc(m.box(cx - r, cy - r, cx + r, cy + r), 200 if flip > 0 else -20, 380 if flip > 0 else 160, fill=C_GOLD, width=10)
        d.arc(m.box(cx - r * 0.45 + flip * r * 0.4, cy - r * 0.45, cx + r * 0.45 + flip * r * 0.4, cy + r * 0.45), 0, 300, fill=C_GOLD, width=8)
    for xe, ye in [(x0, y0), (x1, y0), (x0, y1), (x1, y1), (7, y0), (7, y1)]:              # wooden ribs
        d.line(m.box(7, 6.7, xe, ye), fill=(110, 75, 45), width=12)
    d.line(m.box(x0, 6.7, x1, 6.7), fill=(110, 75, 45), width=12)
    wc.prop_ellipse(m, 7, 6.7, 0.35, (120, 85, 55), density=1.4)
    wc.ink_poly(m, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], t=0.14)


# ============================================================
# Maps
# ============================================================

def canopy_rim(m):
    """The canopy cut away: blue-and-gold fabric along the rim, ribs, the helm visible underneath."""
    x0, y0, x1, y1 = HOUSE
    t = 0.45
    for b in [(x0, y0, x1, y0 + t), (x0, y1 - t, x1, y1), (x0, y0, x0 + t, y1), (x1 - t, y0, x1, y1)]:
        wc.wash_poly(m, [(b[0], b[1]), (b[2], b[1]), (b[2], b[3]), (b[0], b[3])], C_CANOPY, "flat", 1.4, var=0.4)
    d = ImageDraw.Draw(m.img)
    for x in np.arange(x0 + 0.5, x1 - 0.3, 0.9):
        d.arc(m.box(x - 0.18, y0 + 0.05, x + 0.18, y0 + 0.4), 200, 520, fill=C_GOLD, width=5)
        d.arc(m.box(x - 0.18, y1 - 0.4, x + 0.18, y1 - 0.05), 20, 340, fill=C_GOLD, width=5)
    for xe in (x0, 7, x1):
        d.line(m.box(xe, y0, 7, 6.2), fill=(110, 75, 45, 0), width=6)
    wc.ink_poly(m, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], t=0.14)


def winch(m, x, y):
    barrel(m, x, y, 0.3, (120, 110, 100))
    ImageDraw.Draw(m.img).line(m.box(x - 0.35, y, x + 0.35, y), fill=wc.INK, width=5)


def sandbags(m, x0, y0, n=4):
    for k in range(n):
        wc.prop_ellipse(m, x0 + (k % 2) * 0.45, y0 + (k // 2) * 0.35, 0.22, (175, 155, 115), density=1.0)


def roc_perch(m, x, y):
    wc.prop_rect(m, x - 0.9, y - 0.12, x + 0.9, y + 0.12, (110, 75, 45), density=1.6, ink=0.02)
    wc.prop_ellipse(m, x, y - 0.55, 0.38, (60, 40, 30), density=1.6)                 # the hood
    ImageDraw.Draw(m.img).line(m.box(x, y - 0.2, x, y + 0.6), fill=wc.INK, width=6)


def top_deck():
    m = Map(W, H, PPS, seed=21, style="wc")
    sky(m)
    exterior(m)
    floor(m, 0, 0, W, H, C_DECK)
    floor(m, 0, 0, W, 8.4, (120, 85, 55), "planks_h")                                # helm deck under the canopy
    hull_outline(m)
    d = ImageDraw.Draw(m.img)
    d.line(m.box(7, 11.1, 7, 20.0), fill=C_GOLD, width=5)                            # gold centre-line

    # 1. helm
    wheel(m, 7, 7.2)
    wc.prop_rect(m, 5.6, 5.6, 8.4, 6.1, C_BRASS, density=1.1, ink=0.03)
    for x in np.arange(5.85, 8.3, 0.4):
        ImageDraw.Draw(m.img).ellipse(m.box(x - 0.12, 5.73, x + 0.12, 5.97), fill=(245, 235, 200), outline=wc.INK, width=2)
    wc.prop_rect(m, 8.7, 5.9, 9.0, 6.5, (200, 50, 40), density=1.3, ink=0.02)       # DO NOT
    winch(m, 4.75, 5.8), winch(m, 9.35, 5.8)
    canopy_rim(m)
    m.label(7.0, 8.0, "1")

    # 2. chart room
    for sgm in [(5.4, 8.9, 8.6, 8.9), (5.4, 8.9, 5.4, 11.0), (8.6, 8.9, 8.6, 11.0), (5.4, 11.0, 6.5, 11.0), (7.5, 11.0, 8.6, 11.0)]:
        wall(m, *sgm, t=0.12)
    door(m, 6.5, 11.0, 7.5, 11.0, t=0.12)
    chart_table(m, 6.6, 9.2, 8.3, 10.6)
    wc.prop_ellipse(m, 8.35, 9.15, 0.12, C_BRASS, density=1.2)                        # speaking tube
    m.label(7.7, 10.3, "2")

    # 3. main deck: the gun table's spot, refurnished
    crate(m, 6.2, 11.6, 7.2, 12.5), crate(m, 7.3, 11.7, 8.1, 12.4, color=(100, 80, 60))
    for y in (13.3, 14.1):
        rope_coil(m, 7.4, y)
    for y in (13.2, 13.75):
        wc.prop_rect(m, 5.8, y - 0.2, 6.9, y + 0.2, (205, 205, 220), density=0.9, ink=0.02)
    for x, y in [(9.0, 15.2), (5.2, 16.3), (5.3, 16.9)]:
        barrel(m, x, y)
    for x, y in [(4.8, 11.4), (9.2, 11.4), (4.8, 15.0), (9.2, 15.0)]:
        lantern(m, x, y, C_SPARK)
    m.label(8.5, 12.9, "3")

    # 4. benches, where the gun table stood
    table(m, 6.1, 14.8, 6.6, 16.5), table(m, 7.4, 14.8, 7.9, 16.5)
    m.label(8.4, 15.6, "4")

    # 5. crow's nest on the rotor mast
    wc.prop_ellipse(m, 7, 4.5, 0.5, (130, 95, 60), density=1.4)
    ImageDraw.Draw(m.img).ellipse(m.box(6.6, 4.1, 7.4, 4.9), outline=wc.INK, width=3)
    m.label(8.0, 4.5, "5")

    # 6. stern winches, 7. ladders + hatch, 8. red chest
    winch(m, 5.4, 18.1), winch(m, 8.6, 18.1)
    m.label(4.85, 18.75, "6")
    for b in LADDERS:
        ladder(m, *b)
    hatch_grate(m, *CARGO_HATCH)
    m.label(5.1, 13.7, "7"), m.label(7.0, 18.1, "7")
    crate(m, 6.55, 18.9, 7.6, 19.5, color=(150, 40, 40))
    m.label(7.0, 21.6, "8")
    m.label(2.6, 13.5, "9")
    m.label(1.9, 8.0, "10")
    return m


def spider_panel(img, m):
    """GM-only mark, drawn after the player image is saved."""
    d = ImageDraw.Draw(img)
    cx, cy = 9.0, 17.0
    d.rectangle(m.box(cx - 0.12, cy - 0.3, cx + 0.12, cy + 0.3), fill=(150, 150, 165), outline=wc.INK, width=2)
    for a in np.linspace(0, 2 * math.pi, 8, endpoint=False):
        d.line(m.box(cx, cy, cx + 0.09 * math.cos(a), cy + 0.14 * math.sin(a)), fill=(30, 20, 40), width=2)
    d.ellipse(m.box(cx - 0.05, cy - 0.05, cx + 0.05, cy + 0.05), fill=(30, 20, 40))


def drop_doors(m, x0, y0, x1, y1):
    wc.prop_rect(m, x0, y0, x1, y1, (95, 65, 40), density=1.5, ink=0.04)
    d = ImageDraw.Draw(m.img)
    xm = (x0 + x1) / 2
    d.line(m.box(xm, y0, xm, y1), fill=wc.INK, width=6)                              # the seam
    for y in np.arange(y0 + 0.5, y1, 0.5):
        d.line(m.box(x0 + 0.1, y, x1 - 0.1, y), fill=(70, 45, 30), width=2)          # planks
    for y in (y0 + 0.5, y1 - 0.5):                                                    # hinge straps
        d.line(m.box(x0, y, xm - 0.15, y), fill=(60, 60, 70), width=7)
        d.line(m.box(xm + 0.15, y, x1, y), fill=(60, 60, 70), width=7)
    for y in (y0 + 1.0, (y0 + y1) / 2, y1 - 1.0):                                    # bolts across the seam
        d.rectangle(m.box(xm - 0.22, y - 0.06, xm + 0.22, y + 0.06), fill=C_BRASS, outline=wc.INK, width=2)


def under_deck():
    m = Map(W, H, PPS, seed=22, style="wc")
    sky(m)
    exterior(m)
    floor(m, 0, 0, W, H, (125, 92, 62), "planks_h")
    floor(m, 0, 8.9, W, 11.6, C_ROSE, "flat", density=0.9)                          # stateroom
    floor(m, 7.9, 15.5, W, 17.6, (120, 110, 105), "stone")                           # iron plate under the engine
    hull_outline(m)
    x0, y0, x1, y1 = HOUSE
    wc.wash_poly(m, [(x0 + 0.05, y0 + 0.05), (x1 - 0.05, y0 + 0.05), (x1 - 0.05, y1 - 0.05), (x0 + 0.05, y1 - 0.05)], C_CANOPY, "flat", 0.8, var=0.3)
    wc.ink_poly(m, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], t=0.14)                 # the helm deck above, shown as a blue block

    rooms_from_walls(m, [(4.4, 8.9, 9.6, 8.9), (4.4, 11.6, 6.5, 11.6), (7.5, 11.6, 9.6, 11.6)], "wall")
    rooms_from_walls(m, [(6.5, 11.6, 7.5, 11.6)], "door")

    # 1. stateroom
    wc.prop_rect(m, 4.6, 9.1, 6.3, 10.5, (240, 200, 210), density=0.9)               # bunk
    rng = np.random.default_rng(5)
    for _ in range(18):
        cushion(m, rng.uniform(4.8, 6.1), rng.uniform(9.3, 10.3), rng.uniform(0.16, 0.26),
                [(170, 120, 80), (230, 160, 190), (150, 190, 230), (240, 220, 140)][rng.integers(0, 4)])
    cushion(m, 6.0, 10.2, 0.45, (160, 110, 70))                                       # the biggest bear
    table(m, 7.7, 10.2, 9.4, 11.3)
    for k in range(5):
        x = 7.95 + k * 0.27
        wc.prop_rect(m, x, 10.55, x + 0.2, 10.95, (245, 235, 210), density=0.6, ink=0.012)
        ImageDraw.Draw(m.img).line(m.box(x + 0.1, 10.55, x + 0.1, 10.95), fill=(230, 90, 150), width=3)
    lantern(m, 9.2, 9.3, (255, 190, 210))
    m.label(7.0, 10.0, "1")

    # 3. drop doors, centre of the open deck: 2 x 3 squares
    drop_doors(m, 6.0, 12.4, 8.0, 15.4)
    wc.prop_rect(m, 8.8, 13.7, 9.1, 14.2, (200, 50, 40), density=1.3, ink=0.02)      # bolt lever
    m.label(7.0, 13.9, "3")

    # 2. crew quarters + tiny galley, along both rails
    for x in (8.45, 9.1):
        hammock(m, x, 11.9, 13.4)
    for x in (4.85, 5.5):
        hammock(m, x, 13.45, 15.05)
    brazier(m, 8.95, 14.55)                                                            # galley stove
    barrel(m, 9.25, 15.1, 0.15, (90, 90, 100))                                        # the kettle
    m.label(5.2, 15.4, "2")

    # 4. engine bay, aft of the doors to starboard
    battery(m, 8.6, 16.0), battery(m, 8.6, 17.0)
    brazier(m, 7.75, 15.85)                                                            # the burner
    d = ImageDraw.Draw(m.img)
    for x in (8.15, 9.05):                                                             # pipes up to the rotors
        d.line(m.box(x, 15.55, x, 17.5), fill=(150, 120, 80), width=8)
    table(m, 6.0, 15.75, 6.9, 16.25)
    wc.prop_rect(m, 6.2, 15.85, 6.55, 16.12, (240, 230, 200), density=0.6, ink=0.012)  # ledger
    wc.prop_ellipse(m, 9.25, 15.7, 0.1, C_BRASS, density=1.2)                          # speaking tube
    m.label(7.85, 16.9, "4")

    # 6. brig, barred cage on the port hull
    d = ImageDraw.Draw(m.img)
    for y in np.arange(15.85, 17.6, 0.22):
        d.line(m.box(5.75, y, 5.85, y), fill=wc.INK, width=3)
    for x in np.arange(4.75, 5.8, 0.22):
        d.line(m.box(x, 15.75, x, 15.85), fill=wc.INK, width=3)
    d.line(m.box(4.6, 15.8, 5.8, 15.8), fill=wc.INK, width=3)
    d.line(m.box(5.8, 15.8, 5.8, 17.6), fill=wc.INK, width=3)
    d.ellipse(m.box(5.0, 16.9, 5.25, 17.15), outline=wc.INK, width=4)                 # ring bolt
    m.label(5.15, 16.35, "6")

    # 5. hold, aft
    sky_perch(m, 7.9, 17.9, 9.0, 18.8)
    crate(m, 5.6, 18.6, 6.5, 19.4), crate(m, 6.6, 19.3, 7.4, 20.0, color=(100, 80, 60))
    sandbags(m, 5.4, 17.85)
    rope_coil(m, 7.9, 19.3, 0.3)
    roc_perch(m, 7.0, 18.35)
    m.label(6.3, 17.75, "5")

    lantern(m, 7.0, 11.95, C_SPARK)
    for b in LADDERS:
        ladder(m, *b)
    hatch_grate(m, *CARGO_HATCH)
    m.gm_extra = [spider_panel]
    m.label(9.45, 17.65, "7")
    return m


# ============================================================
# Output
# ============================================================

def render(name, m):
    base = wc.finish(m.img, PPS, seed=3, debug=True)
    gridded = grid(base, PPS, alpha=95, rgb=(52, 30, 74))
    check_grid(gridded, PPS, W, H)
    tag = f"airship_{name}"
    base.save(f"{OUT}/{tag}_vtt_gridless.png")
    gridded.save(f"{OUT}/{tag}_gridded.png")
    gm_img = gridded.copy()
    for f in getattr(m, "gm_extra", []):
        f(gm_img, m)
    gm = with_coords(gm_labels(m, gm_img), PPS)
    gm.save(f"{OUT}/{tag}_gm.png")
    n = print_tiles(gridded, PPS, f"{OUT}/{tag}_print_1inch.pdf")
    print(f"  [{name}] wrote gridless, gridded, gm, and {n}-page print PDF")
    return gm


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.startswith("airship_"):
            os.remove(os.path.join(OUT, f))
    a = render("top", top_deck())
    b = render("under", under_deck())
    both = Image.new("RGB", (a.width + b.width, a.height), (245, 240, 228))
    both.paste(a, (0, 0)), both.paste(b, (a.width, 0))
    both.save(f"{OUT}/airship_gm_both.png")
    for title, key in (("UPPER DECK", KEY_TOP), ("LOWER DECK", KEY_UNDER)):
        print(f"  {title}")
        for k, name, note in key:
            print(f"   {k:>2}  {name:<20} {note[:70]}")


if __name__ == "__main__":
    main()

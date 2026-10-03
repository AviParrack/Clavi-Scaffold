"""The party's airship: the captured Veil ship (working name Whispering Web).

Traced on Avi's original ship map (Spectrum/battlemaps/airship/reference/original_ship_map.png):
same 14 x 25 grid, so tokens sit on the same squares. Stern (props, blue canopy) at the top, bow at the bottom.

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
STERN_LADDER, CARGO_HATCH = (4.6, 9.0, 5.6, 10.0), (6.5, 17.4, 7.5, 18.4)

C_DECK, C_CANOPY, C_GOLD, C_BAG = (150, 104, 66), (45, 75, 140), (210, 170, 70), (238, 226, 196)
C_SKY, C_BRASS, C_SPARK, C_ROSE = (120, 170, 215), (200, 160, 70), (90, 220, 230), (225, 120, 150)

KEY_TOP = [
    ("1", "Canopy house", "Blue canopy with gold scrollwork over the stern. Inside: Meridian's stateroom (interior map 1)."),
    ("2", "Helm", "The wheel with a web worn into its hub, the brass dial panel, and the lever marked DO NOT."),
    ("3", "Main deck", "Gold centre-line from helm to bow. Weapon racks down the middle (half cover)."),
    ("4", "Stern ladder", "Down to the engine room (interior 2)."),
    ("5", "Cargo hatch", "Down into the hold (interior 5)."),
    ("6", "Bow", "A red-trimmed chest at the bow rail, then the bowsprit and figurehead."),
    ("7", "Gas bladders", "Two lobed bags strapped along the hull. Climbable, soft, and a very bad place to start a fire."),
    ("8", "Propellers", "A three-tier stack on the stern mast and one on each outrigger. Reaching one means climbing out along the arm."),
]
KEY_UNDER = [
    ("1", "Meridian's stateroom", "Deck level, under the canopy (roof lifted here). The Veil captain's cabin, redone by Lord Beaumont: rose silk, a bunk of stuffed animals, a note on the biggest bear, five scrolls in pink ribbon."),
    ("2", "Engine room", "Sparkstone batteries at quarter charge feeding the props. The engineer's bench and ledger. Three panels on the stern wall that don't match the manual; one latch has a spider on it."),
    ("3", "Galley", "Stove, mess table, water casks."),
    ("4", "Crew bunks", "Hammocks both sides of the passage. Room for the Harbingers if they come aboard."),
    ("5", "Hold", "Under the cargo hatch. Two folded Sky Perches (AC 8, HP 20), crates, sealed casks."),
    ("6", "Drop doors", "In the hold floor. The Veil dropped alchemical fire on Landril from a ship like this. Whether any is left in those casks is open."),
    ("7", "Fore peak", "Chain locker and rope in the narrowing bow. Dark, cramped, good for stowaways."),
]


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

def top_deck():
    m = Map(W, H, PPS, seed=21, style="wc")
    sky(m)
    exterior(m)
    floor(m, 0, 0, W, H, C_DECK)
    hull_outline(m)
    canopy(m)
    d = ImageDraw.Draw(m.img)
    d.line(m.box(7, 9.0, 7, 20.0), fill=C_GOLD, width=5)                           # gold centre-line
    m.label(7, 5.7, "1")

    # helm, just forward of the house door
    wc.prop_rect(m, 6.5, 8.3, 7.5, 8.5, (90, 60, 40), density=1.6, ink=0.02)       # house door
    wheel(m, 7, 9.5)
    wc.prop_rect(m, 8.2, 9.1, 9.3, 9.6, C_BRASS, density=1.1, ink=0.03)
    for x in np.arange(8.4, 9.2, 0.27):
        d = ImageDraw.Draw(m.img)
        d.ellipse(m.box(x - 0.1, 9.25, x + 0.1, 9.45), fill=(245, 235, 200), outline=wc.INK, width=2)
    wc.prop_rect(m, 8.9, 9.8, 9.2, 10.4, (200, 50, 40), density=1.3, ink=0.02)     # DO NOT
    m.label(8.0, 10.6, "2")

    # main deck
    weapon_rack(m, 6.35, 11.0, 7.7, 13.9, n=4)
    weapon_rack(m, 6.9, 14.1, 7.8, 17.2, n=3, long=True)
    crate(m, 5.7, 13.8, 6.6, 14.7)
    for x, y in [(9.0, 15.2), (5.2, 16.3), (5.3, 16.9), (9.0, 9.0)]:
        barrel(m, x, y)
    for x, y in [(4.8, 11.0), (9.2, 11.0), (4.8, 15.0), (9.2, 15.0)]:
        lantern(m, x, y, C_SPARK)
    m.label(5.4, 12.4, "3")

    ladder(m, *STERN_LADDER)
    m.label(5.1, 10.5, "4")
    hatch_grate(m, *CARGO_HATCH)
    m.label(8.1, 17.9, "5")

    crate(m, 6.55, 18.7, 7.6, 19.3, color=(150, 40, 40))                            # the red-trimmed chest
    m.label(7.0, 21.6, "6")
    m.label(2.6, 13.5, "7")
    m.label(1.9, 8.0, "8")
    return m


def under_deck():
    m = Map(W, H, PPS, seed=22, style="wc")
    sky(m)
    exterior(m)
    floor(m, 0, 0, W, H, (130, 95, 65))
    floor(m, 0, 0, W, 8.4, C_ROSE, "flat", density=0.9)                             # stateroom, deck level
    floor(m, 0, 8.9, W, 11.6, (120, 110, 105), "stone")                              # engine room, iron plate
    floor(m, 0, 15.0, W, 18.6, (115, 85, 60), "planks_h")                            # hold
    hull_outline(m)
    x0, y0, x1, y1 = HOUSE
    wc.ink_poly(m, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], t=0.14)

    walls = [(4.4, 8.9, 9.6, 8.9),                                                  # stateroom / engine (deck change)
             (4.4, 11.6, 6.5, 11.6), (7.5, 11.6, 9.6, 11.6),
             (6.5, 11.6, 6.5, 12.2), (6.5, 13.0, 6.5, 13.6), (6.5, 14.4, 6.5, 15.0),
             (7.5, 11.6, 7.5, 12.6), (7.5, 13.4, 7.5, 15.0),
             (4.4, 13.6, 6.5, 13.6),
             (4.4, 15.0, 6.5, 15.0), (7.5, 15.0, 9.6, 15.0),
             (5.0, 18.6, 6.5, 18.6), (7.5, 18.6, 9.0, 18.6)]
    rooms_from_walls(m, walls, "wall")
    rooms_from_walls(m, [(6.5, 11.6, 7.5, 11.6), (6.5, 12.2, 6.5, 13.0), (6.5, 13.6, 6.5, 14.4),
                         (7.5, 12.6, 7.5, 13.4), (6.5, 15.0, 7.5, 15.0), (6.5, 18.6, 7.5, 18.6)], "door")

    # 1. stateroom (under the lifted canopy)
    wc.prop_rect(m, 4.4, 5.4, 6.4, 6.9, (240, 200, 210), density=0.9)                # bunk
    rng = np.random.default_rng(5)
    for _ in range(20):
        cushion(m, rng.uniform(4.6, 6.2), rng.uniform(5.6, 6.7), rng.uniform(0.16, 0.28),
                [(170, 120, 80), (230, 160, 190), (150, 190, 230), (240, 220, 140)][rng.integers(0, 4)])
    cushion(m, 6.0, 6.5, 0.5, (160, 110, 70))                                        # the biggest bear
    table(m, 8.0, 5.4, 9.8, 6.5)
    for k in range(5):
        x = 8.25 + k * 0.3
        wc.prop_rect(m, x, 5.75, x + 0.22, 6.15, (245, 235, 210), density=0.6, ink=0.012)
        ImageDraw.Draw(m.img).line(m.box(x + 0.11, 5.75, x + 0.11, 6.15), fill=(230, 90, 150), width=3)
    wc.wash_poly(m, ellipse_pts(7.4, 7.4, 1.0, 0.6), (200, 90, 130), "flat", 0.9)    # rug
    lantern(m, 9.4, 7.6, (255, 190, 210))
    m.label(5.0, 7.7, "1")

    # 2. engine room
    for x, y in [(8.7, 9.6), (8.7, 10.8), (5.2, 10.9)]:
        battery(m, x, y)
    table(m, 6.2, 10.4, 7.8, 11.3)
    wc.prop_rect(m, 6.5, 10.65, 6.95, 10.95, (240, 230, 200), density=0.6, ink=0.012)  # ledger
    for x in (6.0, 7.0, 8.0):                                                          # three panels that don't match
        wc.prop_rect(m, x - 0.22, 8.98, x + 0.22, 9.25, (150, 150, 165), density=1.2, ink=0.015)
    d = ImageDraw.Draw(m.img)
    cx, cy = 8.0, 9.11                                                                 # the spider latch
    for a in np.linspace(0, 2 * math.pi, 8, endpoint=False):
        d.line(m.box(cx, cy, cx + 0.13 * math.cos(a), cy + 0.09 * math.sin(a)), fill=(30, 20, 40), width=2)
    d.ellipse(m.box(cx - 0.05, cy - 0.05, cx + 0.05, cy + 0.05), fill=(30, 20, 40))
    m.label(7.0, 9.8, "2")

    # 3. galley (port, forward of the engine room)
    table(m, 4.7, 12.0, 5.9, 13.2)
    brazier(m, 6.1, 11.95)
    barrel(m, 4.85, 13.35, 0.2)
    m.label(5.3, 12.6, "3")

    # 4. crew bunks
    for x in (8.0, 8.6, 9.2):
        hammock(m, x, 11.9, 12.9), hammock(m, x, 13.6, 14.6)
    for x in (4.9, 5.6):
        hammock(m, x, 13.85, 14.85)
    m.label(7.0, 13.8, "4")

    # 5-6. hold
    sky_perch(m, 4.7, 15.3, 5.9, 16.5), sky_perch(m, 8.1, 15.3, 9.3, 16.5)
    crate(m, 7.9, 16.8, 9.0, 17.7)
    for x, y in [(6.6, 15.5), (7.3, 15.6), (6.95, 16.1)]:
        barrel(m, x, y, 0.25, (150, 60, 40))                                          # sealed casks
    wc.prop_rect(m, 5.1, 16.9, 6.3, 17.9, (60, 45, 40), density=1.8)                  # drop doors
    ImageDraw.Draw(m.img).line(m.box(5.7, 16.95, 5.7, 17.85), fill=C_BRASS, width=5)
    m.label(7.0, 17.0, "5"), m.label(5.7, 18.25, "6")

    # 7. fore peak
    barrel(m, 6.3, 19.2, 0.3, (110, 100, 100)), barrel(m, 7.7, 19.1, 0.25, (180, 160, 110))
    m.label(7.0, 19.9, "7")

    lantern(m, 7.0, 12.2, C_SPARK), lantern(m, 7.0, 14.6, C_SPARK)
    ladder(m, *STERN_LADDER)
    hatch_grate(m, *CARGO_HATCH)
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
    gm = with_coords(gm_labels(m, gridded), PPS)
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
    for title, key in (("TOP DECK", KEY_TOP), ("INTERIOR", KEY_UNDER)):
        print(f"  {title}")
        for k, name, note in key:
            print(f"   {k:>2}  {name:<20} {note[:70]}")


if __name__ == "__main__":
    main()

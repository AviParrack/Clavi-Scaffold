"""Roarke: the House Cree estate at night, the night after the festival. Grounds + tower-top office.

Run:  python3 house_cree.py        -> out/house_cree_{grounds,office}_*.png / .pdf
Grounds 36 x 30 squares = 180 x 150 ft. Office 12 x 12 squares, same tower (radius 4 squares).
GM maps carry guard markers: gray = passed out, amber = tipsy, red = sober.
"""
import math
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from bm import *
import wc

PPS = 100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")

C_SAND, C_FLAG, C_SANDSTONE = (196, 168, 118), (170, 150, 130), (150, 120, 96)
C_SILVER, C_BONE, C_NIGHT = (190, 196, 210), (232, 222, 196), (70, 70, 120)
C_CHITIN, C_TOOTH, C_RUG = (120, 100, 60), (235, 225, 200), (120, 50, 60)

KEY_GROUNDS = [
    ("1", "Gatehouse", "Portcullis down, wicket door in it barred. Two guard rooms. One guard asleep on a stool, one tipsy and singing."),
    ("2", "Outer wall", "15 ft sandstone, wall walk on top, corner turrets with ladders. A tipsy pair walks the circuit, slowly."),
    ("3", "Courtyard", "Flagstones, festival leftovers: bunting, kegs, a toppled trestle. Braziers burning low (dim light near them, dark elsewhere)."),
    ("4", "The tower", "Five storeys of sandstone, octagonal, 40 ft across. One door, south, iron-banded and locked (DC 15). Two SOBER house guards on it."),
    ("5", "Great hall", "The feast is still on the tables. Six guards asleep in the wreckage. Hearth embers. Silver-and-bone banners."),
    ("6", "Kitchens", "Scullery staff asleep by the ovens. Back door to the yard. Knives, cleavers, a cold roast."),
    ("7", "Family wing", "Lord's bedchamber (north) and solar (south). Lord Cree asleep, pendant on. Roen may be up, drunk and wandering (see doc)."),
    ("8", "Barracks", "Twelve bunks, most full and snoring. Captain's room in the south end, door shut, light under it."),
    ("9", "Stables", "Riding lizards in stalls, restless. Hay, tack, a water trough. They hiss at strangers (DC 12 Animal Handling to calm)."),
    ("10", "Armory", "Ankheg-tooth spears, chitin shields, crossbows. Locked (DC 13). Ore carts and empty ore sacks: the mines are running dry."),
    ("11", "Ankheg pit (new)", "Sand pit behind a low wall. The house ankheg sleeps under the sand. Tremorsense 60 ft: running or heavy steps nearby wake it."),
    ("12", "Cistern garden", "Stone cistern pool, desert shrubs, a bench. Dark, quiet, overlooked only by the wall walk. Best place to come over the wall."),
    ("13", "Postern", "Small door in the east wall by the stables, barred inside. The kitchen staff use it at dawn."),
]

KEY_OFFICE = [
    ("1", "Spiral stair", "Up from the ground floor, past the archive (2nd), trophy room (3rd) and guard landing (4th). Top step creaks (DC 12 Stealth or it's noise)."),
    ("2", "Lord Cree's desk", "Ledgers, sealing wax in silver, a locked drawer (DC 15). The bell rope hangs beside it: pull it and the estate wakes."),
    ("3", "Map table", "A map of Roarke with the south gate circled and troop marks outside the walls. See the evidence list."),
    ("4", "Strongbox", "Iron, bolted to the floor, DC 18 lock or the key on Lord Cree. The real evidence is in here."),
    ("5", "Shelves", "Mining charts of the Cree claims, most stamped DRY in red. Family histories. A false book hides the drawer key (DC 14 Investigation)."),
    ("6", "Blue scale case (new)", "A single blue dragon scale under glass, the size of a shield. A gift, or a receipt."),
    ("7", "Hearth", "Cold. Half-burnt papers in the grate (see evidence list)."),
    ("8", "Balcony", "Crenellated walk around the top, 70 ft up. Door from the office, east. A rope from here reaches the courtyard."),
]

# guard markers (x, y, state) in squares; state: 0 passed out, 1 tipsy, 2 sober
GUARDS_GROUNDS = [
    (16.3, 26.5, 0), (19.7, 27.3, 1),                       # gatehouse
    (6.0, 1.0, 1), (7.0, 1.0, 1),                           # wall walk pair
    (17.5, 21.0, 2), (18.5, 21.0, 2),                       # tower door
    (12.4, 4.6, 0), (13.6, 6.8, 0), (16.4, 4.6, 0), (19.6, 6.8, 0), (21.4, 4.6, 0), (14.8, 7.9, 1),   # great hall
    (3.6, 12.6, 0), (3.6, 14.6, 0), (3.6, 16.6, 0), (7.4, 12.6, 0), (7.4, 14.6, 0), (7.4, 16.6, 1),   # barracks
    (5.5, 21.0, 2),                                         # captain
    (28.5, 6.5, 1),                                         # family wing door
]
GUARDS_OFFICE = []


# ============================================================
# Pieces
# ============================================================

def octagon(cx, cy, r):
    """Flat-sided octagon, apothem r. Vertices start just right of bottom centre, go clockwise (y down)."""
    R = r / math.cos(math.pi / 8)
    return [(cx + R * math.cos(math.pi / 2 - math.pi / 8 - k * math.pi / 4), cy + R * math.sin(math.pi / 2 - math.pi / 8 - k * math.pi / 4)) for k in range(8)]


def circle_pts(cx, cy, r, n=24):
    return [(cx + r * math.cos(t), cy + r * math.sin(t)) for t in np.linspace(0, 2 * math.pi, n, endpoint=False)]


def octagon_wall(m, cx, cy, r, gap=(0.5, 0.5), t=0.28):
    """Octagon wall with a door gap centred on the south face (gap = half-widths west, east)."""
    P = octagon(cx, cy, r)
    pts = [(cx + gap[1], cy + r)] + P + [(cx - gap[0], cy + r)]          # P[0] is east end of the south face, P[7] west end
    wc.ink_poly(m, pts, t=t, closed=False)


def spiral_stair(m, cx, cy, r=1.1):
    wc.prop_ellipse(m, cx, cy, r, (140, 120, 100), density=1.1)
    d = ImageDraw.Draw(m.img)
    for k in range(12):
        a = k * math.pi / 6
        d.line(m.box(cx + 0.2 * math.cos(a), cy + 0.2 * math.sin(a), cx + r * math.cos(a + 0.35), cy + r * math.sin(a + 0.35)), fill=wc.INK, width=3)
    wc.prop_ellipse(m, cx, cy, 0.2, (90, 70, 60), density=1.5)


def bunk(m, x0, y0, x1, y1, sheet=(150, 140, 170)):
    wc.prop_rect(m, x0, y0, x1, y1, (110, 75, 50), density=1.4, ink=0.025)
    wc.wash_rect(m, x0 + 0.1, y0 + 0.1, x1 - 0.1, y1 - 0.1, sheet, "flat", 1.0, var=0.3)
    d = ImageDraw.Draw(m.img)
    if x1 - x0 > y1 - y0:
        d.rectangle(m.box(x0 + 0.1, y0 + 0.12, x0 + 0.4, y1 - 0.12), fill=(240, 235, 220))
    else:
        d.rectangle(m.box(x0 + 0.12, y0 + 0.1, x1 - 0.12, y0 + 0.4), fill=(240, 235, 220))


def keg(m, x, y, r=0.3, tipped=False):
    drop_shadow(m, [("ellipse", (x - r, y - r, x + r, y + r))])
    if tipped:
        wc.prop_rect(m, x - r * 1.3, y - r * 0.8, x + r * 1.3, y + r * 0.8, (140, 95, 55), density=1.3, ink=0.025)
        wc.wash_poly(m, circle_pts(x + r * 2.4, y + 0.2, 0.5, 16), (150, 60, 70), "flat", 0.9, var=0.6)     # spilled wine
        return
    wc.prop_ellipse(m, x, y, r, (140, 95, 55), density=1.3)
    ImageDraw.Draw(m.img).ellipse(m.box(x - r * 0.6, y - r * 0.6, x + r * 0.6, y + r * 0.6), outline=(70, 45, 30), width=2)


def banner(m, x, y, w=0.8, h=0.35, vertical=False):
    """Silver-and-bone house banner, hung flat against a wall."""
    if vertical:
        w, h = h, w
    wc.prop_rect(m, x - w / 2, y - h / 2, x + w / 2, y + h / 2, C_SILVER, density=1.2, ink=0.02)
    d = ImageDraw.Draw(m.img)
    if vertical:
        d.rectangle(m.box(x - w / 2 + 0.05, y - 0.08, x + w / 2 - 0.05, y + 0.08), fill=C_BONE)
    else:
        d.rectangle(m.box(x - 0.08, y - h / 2 + 0.05, x + 0.08, y + h / 2 - 0.05), fill=C_BONE)


def bunting(m, x0, y0, x1, y1, n=14):
    d = ImageDraw.Draw(m.img)
    d.line(m.box(x0, y0, x1, y1), fill=(90, 70, 60), width=2)
    for k in range(n):
        f = (k + 0.5) / n
        x, y = x0 + (x1 - x0) * f, y0 + (y1 - y0) * f
        col = [C_SILVER, C_BONE, (170, 90, 230), (60, 170, 190), (240, 170, 70), (230, 90, 120)][k % 6]
        d.polygon([(m.px(x - 0.12), m.px(y)), (m.px(x + 0.12), m.px(y)), (m.px(x), m.px(y + 0.25))], fill=col, outline=wc.INK)


def shrub(m, x, y, r=0.5, seed=0):
    rng = np.random.default_rng(seed)
    drop_shadow(m, [("ellipse", (x - r, y - r, x + r, y + r))], off=0.12, blur=8)
    for i in range(5):
        a, rr = rng.uniform(0, 2 * math.pi), rng.uniform(0, r * 0.4)
        wc.wash_poly(m, circle_pts(x + rr * math.cos(a), y + rr * math.sin(a), r * rng.uniform(0.45, 0.65), 14),
                     [(120, 140, 80), (150, 150, 90), (100, 120, 90)][i % 3], density=0.9)


def cactus(m, x, y):
    wc.prop_ellipse(m, x, y, 0.28, (90, 130, 90), density=1.3)
    d = ImageDraw.Draw(m.img)
    for k in range(6):
        a = k * math.pi / 3
        d.line(m.box(x, y, x + 0.25 * math.cos(a), y + 0.25 * math.sin(a)), fill=(240, 235, 200), width=2)


def weapon_rack(m, x0, y0, x1, y1, n=6):
    wc.prop_rect(m, x0, y0, x1, y1, (110, 80, 55), density=1.3, ink=0.025)
    d = ImageDraw.Draw(m.img)
    for k in range(n):
        x = x0 + (x1 - x0) * (k + 0.5) / n
        d.line(m.box(x, y0 + 0.08, x, y1 - 0.08), fill=(90, 60, 40), width=5)
        d.polygon([(m.px(x - 0.07), m.px(y0 + 0.3)), (m.px(x + 0.07), m.px(y0 + 0.3)), (m.px(x), m.px(y0 + 0.05))], fill=C_TOOTH, outline=wc.INK)


def shield(m, x, y, r=0.32):
    wc.prop_ellipse(m, x, y, r, C_CHITIN, density=1.4)
    d = ImageDraw.Draw(m.img)
    for rr in (0.2, 0.1):
        d.arc(m.box(x - rr, y - rr, x + rr, y + rr), 200, 340, fill=(60, 45, 30), width=3)


def ore_cart(m, x0, y0, x1, y1):
    wc.prop_rect(m, x0, y0, x1, y1, (90, 85, 90), density=1.4, ink=0.03)
    d = ImageDraw.Draw(m.img)
    for xx in (x0 + 0.15, x1 - 0.15):
        for yy in (y0 - 0.05, y1 + 0.05):
            d.ellipse(m.box(xx - 0.1, yy - 0.06, xx + 0.1, yy + 0.06), fill=wc.INK)


def stall(m, x0, y0, x1, y1):
    for s in [(x0, y0, x0, y1), (x1, y0, x1, y1)]:
        wall(m, *s, t=0.08)
    rng = np.random.default_rng(int(x0 * 10 + y0))
    for _ in range(4):
        x, y = rng.uniform(x0 + 0.2, x1 - 0.2), rng.uniform(y0 + 0.2, y1 - 0.2)
        wc.wash_poly(m, circle_pts(x, y, 0.3, 10), (215, 190, 110), "flat", 0.8, var=0.4)


def lizard(m, x, y, ang, col=(110, 130, 90)):
    """Riding lizard, top-down: body, tail, head."""
    ca, sa = math.cos(ang), math.sin(ang)
    body = [(x + 0.5 * ca * math.cos(t) - 0.2 * sa * math.sin(t), y + 0.5 * sa * math.cos(t) + 0.2 * ca * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 16, endpoint=False)]
    wc.wash_poly(m, body, col, "flat", 1.3, var=0.3)
    d = ImageDraw.Draw(m.img)
    d.line(m.box(x - 0.45 * ca, y - 0.45 * sa, x - 1.0 * ca, y - 1.0 * sa + 0.1), fill=col, width=7)
    d.ellipse(m.box(x + 0.55 * ca - 0.13, y + 0.55 * sa - 0.13, x + 0.55 * ca + 0.13, y + 0.55 * sa + 0.13), fill=col, outline=wc.INK, width=2)


def bed(m, x0, y0, x1, y1):
    drop_shadow(m, [("rect", (x0, y0, x1, y1))])
    wc.prop_rect(m, x0, y0, x1, y1, (100, 65, 45), density=1.4, ink=0.03)
    wc.wash_rect(m, x0 + 0.12, y0 + 0.5, x1 - 0.12, y1 - 0.12, C_SILVER, "flat", 1.1, var=0.3)
    d = ImageDraw.Draw(m.img)
    for xx in (x0 + 0.25, (x0 + x1) / 2 + 0.05):
        d.rounded_rectangle(m.box(xx, y0 + 0.12, xx + (x1 - x0) / 2 - 0.3, y0 + 0.45), radius=8, fill=(245, 240, 228), outline=wc.INK, width=2)


def rug(m, x0, y0, x1, y1, col=C_RUG):
    wc.wash_rect(m, x0, y0, x1, y1, col, "flat", 1.0, var=0.4)
    ImageDraw.Draw(m.img).rectangle(m.box(x0 + 0.15, y0 + 0.15, x1 - 0.15, y1 - 0.15), outline=(220, 180, 90), width=3)


def bookshelf(m, x0, y0, x1, y1):
    wc.prop_rect(m, x0, y0, x1, y1, (90, 60, 40), density=1.5, ink=0.03)
    d = ImageDraw.Draw(m.img)
    rng = np.random.default_rng(int(x0 * 7 + y0 * 3))
    horiz = (x1 - x0) > (y1 - y0)
    L = (x1 - x0) if horiz else (y1 - y0)
    t = 0.08
    while t < L - 0.1:
        w = rng.uniform(0.06, 0.14)
        col = [(140, 50, 50), (60, 80, 120), (150, 120, 60), (70, 100, 70), (120, 90, 140)][rng.integers(5)]
        if horiz:
            d.rectangle(m.box(x0 + t, y0 + 0.08, x0 + t + w, y1 - 0.08), fill=col)
        else:
            d.rectangle(m.box(x0 + 0.08, y0 + t, x1 - 0.08, y0 + t + w), fill=col)
        t += w + 0.02


def papers(m, x, y, n=4, seed=0):
    rng = np.random.default_rng(seed)
    d = ImageDraw.Draw(m.img)
    for _ in range(n):
        px, py, a = x + rng.uniform(-0.3, 0.3), y + rng.uniform(-0.2, 0.2), rng.uniform(0, math.pi)
        c, s = 0.16 * math.cos(a), 0.16 * math.sin(a)
        P = [(px - c + s * 0.7, py - s - c * 0.7), (px + c + s * 0.7, py + s - c * 0.7), (px + c - s * 0.7, py + s + c * 0.7), (px - c - s * 0.7, py - s + c * 0.7)]
        d.polygon([(m.px(a_), m.px(b_)) for a_, b_ in P], fill=(240, 232, 210), outline=(120, 100, 90))


def crenels(m, cx, cy, r, gap=None):
    """Merlons along an octagonal parapet."""
    P = octagon(cx, cy, r)
    for k in range(8):
        (ax, ay), (bx, by) = P[k], P[(k + 1) % 8]
        for f in np.linspace(0.12, 0.88, 4):
            x, y = ax + (bx - ax) * f, ay + (by - ay) * f
            wc.prop_rect(m, x - 0.18, y - 0.18, x + 0.18, y + 0.18, C_SANDSTONE, density=1.5, ink=0.03)


def guard_marks(guards):
    cols = {0: (150, 150, 150), 1: (230, 160, 40), 2: (200, 30, 30)}

    def draw(img, m):
        d = ImageDraw.Draw(img)
        f = ImageFont.truetype(FONT, int(m.pps * 0.26))
        for x, y, s in guards:
            r = 0.27
            d.ellipse(m.box(x - r, y - r, x + r, y + r), fill=cols[s], outline=(30, 20, 20), width=4)
            d.text((m.px(x), m.px(y)), "g", font=f, fill=(255, 255, 255), anchor="mm")
    return draw


# ============================================================
# Map 1: the grounds
# ============================================================

TOWER = (18.0, 16.0, 4.0)


def grounds():
    W, H = 36, 30
    m = Map(W, H, PPS, seed=41, style="wc")
    m.size = (W, H)

    # ---------------- ground ----------------
    wc.wash_rect(m, 0, 0, W, H, (150, 130, 110), "flat", density=0.9)                 # dusty night street + desert
    wc.wash_rect(m, 0, 28.6, W, H, (120, 105, 120), "cobble", density=1.0)
    wc.wash_rect(m, 1, 1, 35, 28, C_SAND, "flat", density=0.9)                         # yard sand
    wc.wash_rect(m, 10, 9, 27, 25, C_FLAG, "stone", density=1.0)                       # flagstone courtyard
    wc.wash_rect(m, 17, 20, 19, 28, C_FLAG, "stone", density=1.1)                      # gate path
    wc.wash_rect(m, 2, 23.5, 14, 27.5, (180, 160, 110), "flat", density=0.8)           # garden gravel

    # buildings' floors
    wc.wash_rect(m, 3, 2, 10, 9, (150, 140, 135), "stone", density=1.0)                # kitchens
    wc.wash_rect(m, 10, 2, 24, 9, (140, 100, 70), "planks_h", density=1.0)             # great hall
    wc.wash_rect(m, 24, 2, 33, 9, (125, 90, 75), "planks_v", density=1.0)              # family wing
    wc.wash_rect(m, 2, 11, 9, 23, (135, 105, 80), "planks_v", density=1.0)             # barracks
    wc.wash_rect(m, 27, 11, 34, 18, (175, 150, 100), "flat", density=1.0)              # stables
    wc.wash_rect(m, 27, 19, 34, 25, (130, 125, 130), "stone", density=1.0)             # armory
    wc.wash_rect(m, 15, 25, 21, 28, (130, 120, 125), "stone", density=1.0)             # gatehouse

    # ---------------- tower ----------------
    cx, cy, r = TOWER
    drop_shadow(m, [("ellipse", (cx - r - 0.2, cy - r - 0.2, cx + r + 0.2, cy + r + 0.2))], off=0.35, blur=14)
    wc.wash_poly(m, octagon(cx, cy, r + 0.2), C_SANDSTONE, "flat", density=1.4)
    wc.wash_poly(m, octagon(cx, cy, r - 0.25), (150, 140, 135), "stone", density=1.0)

    # ---------------- walls ----------------
    T = 0.4
    for s in [(1, 1, 35, 1), (1, 1, 1, 28), (35, 1, 35, 9.5), (35, 10.5, 35, 28),       # outer (gap = postern)
              (1, 28, 17, 28), (19, 28, 35, 28)]:                                       # south (gap = portcullis)
        wall(m, *s, t=T)
    door(m, 35, 9.5, 35, 10.5, t=0.3)
    d = ImageDraw.Draw(m.img)
    for x in np.arange(17.15, 19, 0.3):                                                  # portcullis
        d.line(m.box(x, 27.85, x, 28.15), fill=(60, 60, 70), width=6)
    d.line(m.box(17, 28, 19, 28), fill=(60, 60, 70), width=5)
    for cxx, cyy in [(1, 1), (35, 1), (1, 28), (35, 28)]:                              # corner turrets
        wc.wash_poly(m, circle_pts(cxx, cyy, 1.0), C_SANDSTONE, "flat", 1.4)
        wc.ink_poly(m, circle_pts(cxx, cyy, 1.0), t=0.12)

    walls = [
        (3, 2, 33, 2), (3, 2, 3, 9), (33, 2, 33, 9),                                    # main hall
        (3, 9, 6, 9), (7, 9, 16.5, 9), (19.5, 9, 28, 9), (29, 9, 33, 9),
        (10, 2, 10, 7), (10, 8, 10, 9), (24, 2, 24, 7), (24, 8, 24, 9),
        (24, 5.5, 27.5, 5.5), (28.5, 5.5, 33, 5.5),
        (2, 11, 9, 11), (2, 11, 2, 23), (2, 23, 9, 23), (9, 11, 9, 16), (9, 17, 9, 23),  # barracks
        (2, 19.5, 5, 19.5), (6, 19.5, 9, 19.5),
        (27, 11, 34, 11), (34, 11, 34, 18), (27, 18, 34, 18), (27, 11, 27, 13.5), (27, 15.5, 27, 18),   # stables
        (27, 19, 34, 19), (34, 19, 34, 25), (27, 25, 34, 25), (27, 19, 27, 21), (27, 22, 27, 25),        # armory
        (15, 25, 17, 25), (19, 25, 21, 25), (15, 25, 15, 28), (21, 25, 21, 28),         # gatehouse
        (17, 25, 17, 26), (17, 27, 17, 28), (19, 25, 19, 26), (19, 27, 19, 28),
    ]
    rooms_from_walls(m, walls, "wall")
    rooms_from_walls(m, [(6, 9, 7, 9), (28, 9, 29, 9), (10, 7, 10, 8), (24, 7, 24, 8), (27.5, 5.5, 28.5, 5.5),
                         (9, 16, 9, 17), (5, 19.5, 6, 19.5), (27, 21, 27, 22), (17, 26, 17, 27), (19, 26, 19, 27)], "door")
    for x0 in (16.5, 18.0):                                                              # hall double doors, ajar
        d = ImageDraw.Draw(m.img)
        d.rectangle(m.box(x0, 9, x0 + 1.5, 9.18), fill=C["wood_dark"], outline=C["wall"], width=3)
    for y0 in (13.5, 14.5):                                                              # stable doors, open
        d.rectangle(m.box(26.6, y0, 27, y0 + 0.15), fill=C["wood_dark"], outline=C["wall"], width=3)

    octagon_wall(m, cx, cy, r, gap=(0.5, 0.5), t=0.32)
    door(m, cx - 0.5, cy + r, cx + 0.5, cy + r, t=0.3)
    ImageDraw.Draw(m.img).rectangle(m.box(cx - 0.5, cy + r - 0.15, cx + 0.5, cy + r + 0.15), outline=(60, 60, 70), width=4)

    # ---------------- 1. gatehouse ----------------
    table(m, 15.4, 25.4, 16.6, 26.0)
    keg(m, 16.3, 27.4), keg(m, 20.3, 25.6, 0.25)
    brazier(m, 18, 24.2)
    m.label(18, 26.5, "1")

    # ---------------- 2. wall walk ----------------
    m.label(11, 1, "2")

    # ---------------- 3. courtyard ----------------
    bunting(m, 11, 10, 25, 10.4), bunting(m, 11, 23.8, 25, 23.4)
    bunting(m, 10.4, 10.4, 10.4, 23.4, n=10)
    brazier(m, 12, 12), brazier(m, 24, 12), brazier(m, 12, 22)
    table(m, 11.2, 17.0, 13.2, 17.6)                                                     # toppled trestle
    papers(m, 12.2, 18.3, 6, seed=2)
    keg(m, 13.5, 14.0), keg(m, 22.8, 21.2, tipped=True), keg(m, 25.2, 13.5)
    m.label(11.5, 15, "3")

    # ---------------- 4. tower ground floor ----------------
    sx, sy = cx - 2.2, cy
    spiral_stair(m, sx, sy, 1.2)
    table(m, cx + 0.6, cy + 1.0, cx + 2.2, cy + 2.0)
    weapon_rack(m, cx + 0.6, cy - 3.3, cx + 2.4, cy - 2.8, n=5)
    lantern(m, cx, cy + 2.5, (255, 210, 150))
    lantern(m, cx - 1.5, cy + r + 0.8, (255, 210, 150)), lantern(m, cx + 1.5, cy + r + 0.8, (255, 210, 150))
    m.label(cx + 1.4, cy, "4")

    # ---------------- 5. great hall ----------------
    for y in (4.0, 6.5):
        table(m, 11.5, y, 22.5, y + 0.8)
        papers(m, 14, y + 0.4, 3, seed=int(y))
        for x in np.arange(12.5, 22, 1.6):
            wc.prop_ellipse(m, x, y + 0.4, 0.15, (200, 200, 210), density=0.9)           # plates
    brazier(m, 17, 2.6)
    for x in (12, 15, 20, 23):
        banner(m, x, 2.25)
    keg(m, 23.2, 8.2, tipped=True)
    m.label(17, 5.3, "5")

    # ---------------- 6. kitchens ----------------
    wc.prop_rect(m, 3.2, 2.2, 6.5, 3.2, (120, 90, 80), density=1.5)                      # ovens
    glow(m, 4.8, 2.9, 0.9, (255, 140, 60), 80)
    table(m, 4.5, 5.0, 8.5, 6.0)
    for x, y in [(8.6, 3.0), (9.3, 3.0), (9.3, 3.7)]:
        keg(m, x, y, 0.28)
    crate(m, 3.3, 7.4, 4.5, 8.7, color=(120, 90, 60))
    m.label(6.5, 7.2, "6")

    # ---------------- 7. family wing ----------------
    bed(m, 29.5, 2.4, 32, 4.4)
    rug(m, 25, 3, 28.5, 5)
    banner(m, 26, 2.25)
    rug(m, 25, 6.2, 32, 8.4, (60, 70, 110))
    table(m, 30, 6.6, 32.4, 7.6)
    bookshelf(m, 24.25, 5.8, 24.8, 7.0)
    lantern(m, 26.5, 7.3, (255, 210, 150))
    m.label(27.5, 3.8, "7"), m.label(28.7, 7.2, "7")

    # ---------------- 8. barracks ----------------
    for y in (12.2, 14.2, 16.2):
        bunk(m, 2.3, y, 4.3, y + 0.85), bunk(m, 6.7, y, 8.7, y + 0.85)
    bunk(m, 2.3, 18.0, 4.3, 18.85)
    weapon_rack(m, 6.6, 18.2, 8.7, 18.7, n=6)
    bunk(m, 2.3, 20.2, 3.3, 22.2, sheet=C_SILVER)                                       # captain
    table(m, 6.0, 20.6, 8.3, 21.6)
    lantern(m, 7.0, 22.3, (255, 210, 150))
    m.label(5.5, 14.8, "8")

    # ---------------- 9. stables ----------------
    for k, x in enumerate((28.4, 30.6, 32.8)):
        stall(m, x - 1.0, 11.15, x + 1.0, 12.9)
        lizard(m, x, 12.1, 0.3 + k, [(110, 130, 90), (130, 110, 80), (90, 120, 120)][k])
    wc.prop_rect(m, 33.1, 15.0, 33.8, 17.6, (80, 110, 140), density=1.2, ink=0.025)      # trough
    for x, y in [(30, 16.6), (31.2, 16.8), (30.5, 15.6)]:
        wc.wash_poly(m, circle_pts(x, y, 0.45, 12), (215, 190, 110), "flat", 1.0, var=0.4)  # hay
    m.label(30.5, 14.5, "9")

    # ---------------- 10. armory ----------------
    weapon_rack(m, 28.0, 19.2, 33.8, 19.8, n=10)
    for y in (21.0, 22.0, 23.0):
        shield(m, 33.4, y)
    ore_cart(m, 28.2, 23.3, 29.6, 24.4), ore_cart(m, 30.0, 23.3, 31.4, 24.4)
    crate(m, 29.3, 21.0, 30.5, 22.0, color=(110, 90, 70))
    m.label(31.2, 21.5, "10")

    # ---------------- 11. ankheg pit ----------------
    pit = circle_pts(24.8, 20.3, 1.9, 24)
    wc.wash_poly(m, pit, (215, 185, 120), "flat", 1.1)
    wc.ink_poly(m, circle_pts(24.8, 20.3, 2.05, 28), t=0.12)
    d = ImageDraw.Draw(m.img)
    for a in np.linspace(0.3, 2.6, 6):                                                    # ripples in the sand
        d.arc(m.box(24.8 - 0.9, 20.3 - 0.6, 24.8 + 0.9, 20.3 + 0.6), math.degrees(a), math.degrees(a) + 40, fill=(150, 120, 70), width=3)
    for a in (-0.4, 0.4):                                                                 # mandible tips
        d.line(m.box(24.6 + a, 20.0, 24.8 + a * 0.4, 19.6), fill=C_TOOTH, width=6)
    m.label(24.8, 21.4, "11")

    # ---------------- 12. cistern garden ----------------
    water(m, [(5.0, 24.6), (9.5, 24.6), (10.0, 25.4), (9.5, 26.5), (5.0, 26.5), (4.4, 25.4)])
    for x, y, s in [(3.2, 24.3, 1), (11.5, 24.5, 2), (12.6, 26.5, 3), (3.0, 26.8, 4)]:
        shrub(m, x, y, 0.55, seed=s)
    cactus(m, 11.2, 27.2), cactus(m, 13.3, 25.0), cactus(m, 2.4, 25.6)
    table(m, 6.0, 27.0, 8.5, 27.5)                                                        # bench
    m.label(7.2, 25.5, "12")

    # ---------------- 13. postern ----------------
    m.label(34.2, 10, "13")

    # ---------------- night light ----------------
    lay = m.overlay()
    ImageDraw.Draw(lay).rectangle([0, 0, m.img.width, m.img.height], fill=C_NIGHT + (40,))
    m.paste(lay)
    m.gm_extra = [guard_marks(GUARDS_GROUNDS)]
    return m


# ============================================================
# Map 2: tower top, Lord Cree's office
# ============================================================

def office():
    W, H = 12, 12
    m = Map(W, H, PPS, seed=43, style="wc")
    m.size = (W, H)
    cx, cy, r = 6.0, 6.0, 4.0

    wc.wash_rect(m, 0, 0, W, H, (60, 60, 105), "flat", density=1.1)                     # night air, 70 ft up
    d = ImageDraw.Draw(m.img)
    rng = np.random.default_rng(5)
    for _ in range(40):                                                                   # moon fragments (Draco)
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        if math.hypot(x - cx, y - cy) > 5.6:
            s = rng.uniform(0.03, 0.08)
            d.ellipse(m.box(x - s, y - s, x + s, y + s), fill=(235, 235, 250))

    wc.wash_poly(m, octagon(cx, cy, 5.5), C_SANDSTONE, "stone", density=1.1)              # balcony
    crenels(m, cx, cy, 5.3)
    wc.ink_poly(m, octagon(cx, cy, 5.5), t=0.12)
    wc.wash_poly(m, octagon(cx, cy, r - 0.2), (130, 92, 66), "planks_h", density=1.0)    # office floor
    rug(m, 4.2, 4.4, 8.4, 8.6)

    # wall with a door gap on the east face (rotate gap: draw full octagon minus that face)
    P = octagon(cx, cy, r)
    east = [k for k in range(8) if abs((P[k][0] + P[(k + 1) % 8][0]) / 2 - (cx + r)) < 0.01][0]
    a, b = P[east], P[(east + 1) % 8]
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    pts = [(mid[0], mid[1] - 0.5)] + [P[(east + 1 + k) % 8] for k in range(8)] + [(mid[0], mid[1] + 0.5)]
    wc.ink_poly(m, pts, t=0.32, closed=False)
    door(m, mid[0], mid[1] - 0.5, mid[0], mid[1] + 0.5, t=0.25)

    # 1. stair
    spiral_stair(m, cx - 2.2, cy, 1.2)
    m.label(cx - 2.2, cy + 1.7, "1")

    # 2. desk + chair + bell rope
    table(m, 4.6, 2.5, 7.6, 3.4)
    papers(m, 5.4, 2.95, 4, seed=7)
    wc.prop_ellipse(m, 7.1, 2.9, 0.12, (200, 200, 210), density=1.0)                      # silver seal
    wc.prop_ellipse(m, 6.1, 3.85, 0.3, C_RUG, density=1.4)                                # chair
    lantern(m, 4.9, 2.9, (255, 210, 150))
    d = ImageDraw.Draw(m.img)
    d.line(m.box(8.0, 2.4, 8.0, 3.3), fill=(170, 40, 40), width=6)                       # bell rope
    d.ellipse(m.box(7.9, 3.25, 8.1, 3.45), fill=(170, 40, 40), outline=wc.INK, width=2)
    m.label(6.1, 1.8, "2")

    # 3. map table
    table(m, 5.0, 5.6, 7.6, 7.4)
    wc.prop_rect(m, 5.25, 5.85, 7.35, 7.15, (225, 210, 170), density=0.6, ink=0.015)
    d = ImageDraw.Draw(m.img)
    d.ellipse(m.box(5.9, 6.1, 6.9, 6.9), outline=(80, 60, 50), width=2)                   # Roarke's walls
    d.ellipse(m.box(6.25, 6.75, 6.55, 7.05), outline=(190, 40, 40), width=3)               # south gate, circled
    for x, y in [(5.4, 6.0), (5.5, 7.0), (7.2, 6.2), (7.1, 7.0), (7.25, 6.6)]:
        d.rectangle(m.box(x - 0.05, y - 0.05, x + 0.05, y + 0.05), fill=(60, 60, 150))     # troop marks
    m.label(6.3, 8.0, "3")

    # 4. strongbox
    drop_shadow(m, [("rect", (6.9, 8.4, 7.9, 9.1))])
    wc.prop_rect(m, 6.9, 8.4, 7.9, 9.1, (80, 80, 90), density=1.6, ink=0.035)
    d = ImageDraw.Draw(m.img)
    for x in (7.15, 7.65):
        d.line(m.box(x, 8.4, x, 9.1), fill=(170, 150, 90), width=4)
    m.label(8.3, 9.6, "4")

    # 5. shelves along the west/north-west faces
    bookshelf(m, 2.55, 3.8, 3.1, 5.0)
    bookshelf(m, 3.2, 2.7, 4.3, 3.2)
    bookshelf(m, 2.55, 7.0, 3.1, 8.2)
    m.label(3.6, 4.6, "5")

    # 6. blue scale case
    drop_shadow(m, [("rect", (8.3, 4.2, 9.3, 5.2))])
    wc.prop_rect(m, 8.3, 4.2, 9.3, 5.2, (200, 220, 235), density=0.6, ink=0.03)
    glow(m, 8.8, 4.7, 0.7, (80, 140, 230), 90)
    wc.wash_poly(m, [(8.8, 4.3), (9.15, 4.65), (8.8, 5.1), (8.45, 4.65)], (40, 90, 200), "flat", 1.6, var=0.3)
    m.label(9.6, 4.2, "6")

    # 7. hearth
    wc.prop_rect(m, 4.0, 9.0, 5.6, 9.6, (110, 100, 100), density=1.5)
    papers(m, 4.8, 9.3, 3, seed=11)
    d = ImageDraw.Draw(m.img)
    d.rectangle(m.box(4.2, 9.15, 5.4, 9.45), outline=(40, 30, 30), width=3)
    m.label(4.8, 8.6, "7")

    # 8. balcony
    m.label(10.6, 7.6, "8")

    lay = m.overlay()
    ImageDraw.Draw(lay).rectangle([0, 0, m.img.width, m.img.height], fill=C_NIGHT + (40,))
    m.paste(lay)
    m.gm_extra = []
    return m


# ============================================================
# Output
# ============================================================

def render(name, m):
    W, H = m.size
    base = wc.finish(m.img, PPS, seed=5, debug=True)
    gridded = grid(base, PPS, alpha=95, rgb=(52, 30, 74))
    check_grid(gridded, PPS, W, H)
    tag = f"house_cree_{name}"
    base.save(f"{OUT}/{tag}_vtt_gridless.png")
    gridded.save(f"{OUT}/{tag}_gridded.png")
    gm_img = gridded.copy()
    for f in getattr(m, "gm_extra", []):
        f(gm_img, m)
    with_coords(gm_labels(m, gm_img), PPS).save(f"{OUT}/{tag}_gm.png")
    n = print_tiles(gridded, PPS, f"{OUT}/{tag}_print_1inch.pdf")
    print(f"  [{name}] {W}x{H} squares: wrote gridless, gridded, gm, and {n}-page print PDF")


def main(which=("grounds", "office")):
    os.makedirs(OUT, exist_ok=True)
    if "grounds" in which:
        render("grounds", grounds())
    if "office" in which:
        render("office", office())
    for title, key in (("GROUNDS", KEY_GROUNDS), ("OFFICE", KEY_OFFICE)):
        print(f"  {title}")
        for k, name, note in key:
            print(f"   {k:>2}  {name:<22} {note[:70]}")


if __name__ == "__main__":
    import sys
    main(tuple(sys.argv[1:]) or ("grounds", "office"))

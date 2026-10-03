"""The party's airship: the captured Veil ship (working name Whispering Web). Two decks, same hull, same grid.

Run:  python3 airship.py        -> out/airship_{top,under}_*.png / .pdf + airship_gm_both.png
45 x 16 squares per deck = 225 x 80 ft. Bow points east (right), stern west.
Ladders sit at the same squares on both decks so tokens can move straight down.
"""
import math
import os
import numpy as np
from PIL import Image, ImageDraw
from bm import *
import wc

W, H, PPS = 45, 16, 100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")

HULL = [(6, 2), (34, 2), (38, 3.1), (41, 5.4), (42.6, 8), (41, 10.6), (38, 12.9), (34, 14), (6, 14),
        (4.3, 13.3), (3.1, 11.6), (2.6, 8), (3.1, 4.4), (4.3, 2.7)]
LADDERS = [(10, 3, 11, 4), (33, 7, 34, 8)]          # stern ladder, forward ladder (x0, y0, x1, y1)

C_DECK, C_QUARTER, C_ROSE = (150, 104, 66), (110, 70, 50), (225, 120, 150)
C_SKY, C_BRASS, C_SPARK = (120, 170, 215), (200, 160, 70), (90, 220, 230)

KEY_TOP = [
    ("1", "Helm", "Raised 5 ft. The web-hubbed wheel, the brass dial console, and the lever marked DO NOT."),
    ("2", "Main deck", "Open planking under the envelope, 40 ft overhead. Rigging cleats along both rails."),
    ("3", "Cargo hatch", "Grated, 15 x 10 ft. Opens straight into the hold below (underdeck 5)."),
    ("4", "Bow", "Mooring capstan and bowsprit. Best view, worst wind."),
    ("5", "Props", "Two sparkstone propellers on outriggers. Reaching one means climbing out along the arm."),
    ("6", "Stern ladder", "Down to the engine room (underdeck 2)."),
    ("7", "Forward ladder", "Down to the bow corridor (underdeck 7/8)."),
]
KEY_UNDER = [
    ("1", "Meridian's stateroom", "The Veil captain's cabin, redone by Lord Beaumont: rose silk, a bunk of stuffed animals, a note on the biggest bear, five scrolls in pink ribbon."),
    ("2", "Engine room", "Sparkstone batteries humming at quarter charge. The engineer's bench and ledger. Three panels that don't match the manual; one latch has a spider on it."),
    ("3", "Galley", "Stove, mess table, water casks."),
    ("4", "Crew quarters", "Hammocks. Room for the Harbingers if they come aboard."),
    ("5", "Hold", "Under the cargo hatch. Two folded Sky Perches (AC 8, HP 20), crates, and sealed casks."),
    ("6", "Drop doors", "In the hold floor. The Veil dropped alchemical fire on Landril from a ship like this. Whether any is left in those casks is open."),
    ("7", "Brig (new)", "Two barred cells, scratches on the walls. Optional: cut it if it doesn't suit."),
    ("8", "Chain locker", "Anchor chain, rope, spare envelope patches."),
    ("9", "Fore peak", "Narrow storage in the bow. Dark, cramped, good for stowaways."),
]


# ============================================================
# Geometry helpers
# ============================================================

def clip(poly, x0, y0, x1, y1):
    """Sutherland-Hodgman clip of a polygon to a box (squares)."""
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
    P = poly
    P = cut(P, lambda p: p[0] >= x0, lambda a, b: lerp(a, b, (x0 - a[0]) / (b[0] - a[0])))
    P = cut(P, lambda p: p[0] <= x1, lambda a, b: lerp(a, b, (x1 - a[0]) / (b[0] - a[0])))
    P = cut(P, lambda p: p[1] >= y0, lambda a, b: lerp(a, b, (y0 - a[1]) / (b[1] - a[1])))
    P = cut(P, lambda p: p[1] <= y1, lambda a, b: lerp(a, b, (y1 - a[1]) / (b[1] - a[1])))
    return P


def floor(m, x0, y0, x1, y1, rgb, kind="planks_h", density=1.0):
    wc.wash_poly(m, clip(HULL, x0, y0, x1, y1), rgb, kind, density)


def sky(m):
    wc.wash_rect(m, 0, 0, W, H, C_SKY, "flat", density=0.55)
    for cx, cy, r in [(5, 0.5, 2.2), (20, 15.6, 2.8), (40, 1.0, 2.0), (30, 15.4, 1.6)]:
        P = [(cx + r * 1.6 * math.cos(t), cy + r * 0.6 * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 20, endpoint=False)]
        wc.wash_poly(m, P, (235, 230, 245), "flat", density=0.5)


def ladder(m, x0, y0, x1, y1):
    wc.prop_rect(m, x0 + 0.1, y0 + 0.05, x1 - 0.1, y1 - 0.05, (90, 60, 40), density=1.6, ink=0.03)
    d = ImageDraw.Draw(m.img)
    for k in range(1, 5):
        yy = y0 + (y1 - y0) * k / 5
        d.line(m.box(x0 + 0.15, yy, x1 - 0.15, yy), fill=C_BRASS, width=4)


def hatch_grate(m, x0, y0, x1, y1):
    wc.prop_rect(m, x0, y0, x1, y1, (70, 50, 40), density=1.7)
    d = ImageDraw.Draw(m.img)
    for k in np.arange(x0 + 0.25, x1, 0.25):
        d.line(m.box(k, y0 + 0.05, k, y1 - 0.05), fill=(40, 28, 24), width=3)
    for k in np.arange(y0 + 0.25, y1, 0.25):
        d.line(m.box(x0 + 0.05, k, x1 - 0.05, k), fill=(40, 28, 24), width=3)


def barrel(m, x, y, r=0.32, rgb=(140, 90, 50)):
    drop_shadow(m, [("ellipse", (x - r, y - r, x + r, y + r))])
    wc.prop_ellipse(m, x, y, r, rgb, density=1.3)
    d = ImageDraw.Draw(m.img)
    d.ellipse(m.box(x - r * 0.65, y - r * 0.65, x + r * 0.65, y + r * 0.65), outline=(60, 40, 30), width=2)


def wheel(m, x, y, r=0.6):
    drop_shadow(m, [("ellipse", (x - r, y - r, x + r, y + r))])
    d = ImageDraw.Draw(m.img)
    d.ellipse(m.box(x - r, y - r, x + r, y + r), outline=wc.INK, width=8)
    for k in range(8):
        a = k * math.pi / 4
        d.line(m.box(x, y, x + 1.25 * r * math.cos(a), y + 1.25 * r * math.sin(a)), fill=(90, 60, 40), width=7)
    for rr in (0.12, 0.22, 0.32):                                  # the web on the hub
        d.ellipse(m.box(x - rr, y - rr, x + rr, y + rr), outline=(220, 220, 235), width=2)
    for k in range(8):
        a = k * math.pi / 4 + 0.2
        d.line(m.box(x, y, x + 0.32 * math.cos(a), y + 0.32 * math.sin(a)), fill=(220, 220, 235), width=2)


def battery(m, x, y, r=0.55):
    glow(m, x, y, 1.6, C_SPARK, 90)
    wc.prop_ellipse(m, x, y, r, (60, 150, 170), density=1.4)
    glow(m, x, y, 0.35, (230, 255, 255), 170)


def hammock(m, x0, y, x1):
    d = ImageDraw.Draw(m.img)
    wc.wash_poly(m, [(x0, y - 0.25), (x1, y - 0.25), (x1, y + 0.25), (x0, y + 0.25)], (190, 170, 130), "flat", 1.1, var=0.25)
    d.line(m.box(x0 - 0.15, y, x0, y), fill=wc.INK, width=3)
    d.line(m.box(x1, y, x1 + 0.15, y), fill=wc.INK, width=3)
    d.arc(m.box(x0, y - 0.25, x1, y + 0.25), 0, 360, fill=(110, 90, 60), width=2)


def sky_perch(m, x0, y0, x1, y1):
    wc.prop_rect(m, x0, y0, x1, y1, (150, 120, 80), density=1.0)
    d = ImageDraw.Draw(m.img)
    d.line(m.box(x0, y0, x1, y1), fill=wc.INK, width=4)
    d.line(m.box(x0, y1, x1, y0), fill=wc.INK, width=4)


def propeller(m, x, y, arm_to):
    d = ImageDraw.Draw(m.img)
    d.line(m.box(x, arm_to, x, y), fill=wc.INK, width=10)
    barrel(m, x, y, 0.45, (170, 170, 185))
    for a in (0.3, 0.3 + math.pi):
        d.line(m.box(x - 0.65, y + 0.9 * math.sin(a), x - 0.65, y - 0.9 * math.sin(a)), fill=(90, 90, 110), width=10)


# ============================================================
# Decks
# ============================================================

def top_deck():
    m = Map(W, H, PPS, seed=11, style="wc")
    sky(m)
    propeller(m, 8, 0.8, 2), propeller(m, 8, 15.2, 14)              # arms sit under the hull
    floor(m, 0, 0, W, H, C_DECK)
    floor(m, 0, 0, 10, H, C_QUARTER)                               # quarterdeck
    wc.ink_poly(m, HULL, t=0.2)
    wc.ink_segment(m, 10, 2, 10, 7, t=0.1), wc.ink_segment(m, 10, 9, 10, 14, t=0.1)
    steps(m, 10, 7, 11, 9, n=3, vertical=False)

    # helm
    wheel(m, 6.5, 8)
    wc.prop_rect(m, 3.6, 6, 4.5, 10, C_BRASS, density=1.1)
    d = ImageDraw.Draw(m.img)
    for yy in np.arange(6.4, 10, 0.55):
        d.ellipse(m.box(3.85, yy - 0.15, 4.25, yy + 0.15), fill=(245, 235, 200), outline=wc.INK, width=2)
    wc.prop_rect(m, 4.7, 10.4, 5.1, 11.2, (200, 50, 40), density=1.3, ink=0.02)   # DO NOT
    m.label(7.5, 5.5, "1")

    # rigging cleats and lines up to the envelope
    for x in range(8, 36, 4):
        for y, out in ((2, 0.4), (14, 15.6)):
            d = ImageDraw.Draw(m.img)
            d.line(m.box(x, y, x + 0.8, out), fill=(80, 70, 90), width=3)
            barrel(m, x, y + (0.35 if y == 2 else -0.35), 0.16, C_BRASS)

    # main deck
    hatch_grate(m, 21, 10, 24, 12)
    for x, y in [(15, 3), (15.7, 3), (29, 13), (29.7, 13), (18, 12.9)]:
        barrel(m, x, y)
    crate(m, 25, 2.6, 27, 3.6), crate(m, 12.5, 12, 14, 13.4, color=(100, 80, 60))
    for x, y in [(12, 2.6), (24, 2.6), (24, 13.4), (36, 3.2), (36, 12.8)]:
        lantern(m, x, y, C_SPARK)
    m.label(18, 8, "2"), m.label(22.5, 11, "3")

    # bow
    barrel(m, 39.3, 8, 0.55, (110, 80, 60))
    d = ImageDraw.Draw(m.img)
    d.line(m.box(42.4, 8, 44.8, 8), fill=wc.INK, width=10)
    m.label(39.5, 6.3, "4"), m.label(9.2, 0.8, "5")

    for i, b in enumerate(LADDERS):
        ladder(m, *b)
    m.label(11.6, 3.5, "6"), m.label(34.6, 7.5, "7")
    return m


def under_deck():
    m = Map(W, H, PPS, seed=12, style="wc")
    sky(m)
    floor(m, 0, 0, W, H, (130, 95, 65))
    floor(m, 0, 0, 10, H, C_ROSE, "flat", density=0.9)              # stateroom: rose silk
    floor(m, 10, 0, 16, H, (120, 110, 105), "stone")                  # engine room: iron plate
    floor(m, 16, 9, 32, H, (115, 85, 60), "planks_v")                 # hold
    floor(m, 32, 2, 36, 7, (105, 100, 110), "stone")                  # brig
    wc.ink_poly(m, HULL, t=0.2)

    walls = [(10, 2, 10, 7), (10, 9, 10, 14),
             (16, 2, 16, 7), (16, 9, 16, 14),
             (16, 7, 18, 7), (19, 7, 26, 7), (27, 7, 32, 7), (21, 2, 21, 7),
             (16, 9, 20, 9), (23, 9, 32, 9),
             (32, 2, 32, 7), (32, 7, 34, 7), (35, 7, 36, 7),
             (32, 9, 34, 9), (35, 9, 36, 9), (32, 9, 32, 14),
             (36, 2.9, 36, 7), (36, 9, 36, 13.1)]
    rooms_from_walls(m, walls, "wall")
    rooms_from_walls(m, [(10, 7, 10, 9), (18, 7, 19, 7), (26, 7, 27, 7), (34, 9, 35, 9), (36, 7, 36, 9)], "door")

    # 1. stateroom
    wc.prop_rect(m, 3.8, 3.2, 6.6, 5.0, (240, 200, 210), density=0.9)       # bunk
    rng = np.random.default_rng(5)
    for _ in range(26):                                                        # the stuffed animals, seating plan pending
        x, y = rng.uniform(4.05, 6.35), rng.uniform(3.4, 4.8)
        cushion(m, x, y, rng.uniform(0.18, 0.32), [(170, 120, 80), (230, 160, 190), (150, 190, 230), (240, 220, 140)][rng.integers(0, 4)])
    cushion(m, 6.0, 4.6, 0.55, (160, 110, 70))                                 # the biggest bear
    table(m, 6.8, 11.4, 9.6, 12.8)
    for k in range(5):
        x = 7.2 + k * 0.42
        wc.prop_rect(m, x, 11.8, x + 0.3, 12.3, (245, 235, 210), density=0.6, ink=0.015)
        ImageDraw.Draw(m.img).line(m.box(x + 0.15, 11.8, x + 0.15, 12.3), fill=(230, 90, 150), width=3)
    for y in (6.0, 8.0, 10.0):                                                 # stern windows
        wc.prop_rect(m, 2.75, y - 0.35, 3.05, y + 0.35, (180, 220, 240), density=0.6, ink=0.02)
    lantern(m, 8.5, 4, (255, 190, 210))
    m.label(5.2, 8, "1")

    # 2. engine room
    for x, y in [(12, 4), (14.3, 4), (12, 12), (14.3, 12)]:
        battery(m, x, y)
    table(m, 12.6, 7.3, 15.2, 8.7)
    wc.prop_rect(m, 13.0, 7.6, 13.6, 8.1, (240, 230, 200), density=0.6, ink=0.015)   # the ledger
    for x in (11.0, 13.2, 15.0):                                                       # three panels that don't match
        wc.prop_rect(m, x - 0.3, 2.15, x + 0.3, 2.55, (150, 150, 165), density=1.2, ink=0.02)
    d = ImageDraw.Draw(m.img)
    cx, cy = 15.0, 2.35                                                                # the spider latch
    for a in np.linspace(0, 2 * math.pi, 8, endpoint=False):
        d.line(m.box(cx, cy, cx + 0.16 * math.cos(a), cy + 0.12 * math.sin(a)), fill=(30, 20, 40), width=2)
    d.ellipse(m.box(cx - 0.06, cy - 0.06, cx + 0.06, cy + 0.06), fill=(30, 20, 40))
    m.label(13.2, 10, "2")

    # 3. galley
    table(m, 17.3, 4.2, 20.2, 5.4)
    for x in (17.8, 18.8, 19.8):
        for y in (3.8, 5.8):
            cushion(m, x, y, 0.38, (120, 90, 70))
    brazier(m, 17, 2.8)
    barrel(m, 20.5, 2.6), barrel(m, 20.5, 6.4)
    m.label(18.7, 3, "3")

    # 4. crew quarters
    for x in (22, 25, 28):
        for y in (3.0, 4.5, 6.0):
            hammock(m, x + 0.3, y, x + 2.3)
    m.label(30.8, 4.5, "4")

    # 5. hold
    sky_perch(m, 17, 10, 19.8, 11.6), sky_perch(m, 17, 12, 19.8, 13.6)
    for b in [(23.5, 9.5, 25, 10.6), (28.5, 9.6, 31.4, 10.8), (29, 11.2, 31.4, 13.6)]:
        crate(m, *b)
    for x, y in [(21, 12.6), (21.8, 13.3), (22.6, 12.6)]:
        barrel(m, x, y, 0.33, (150, 60, 40))                                          # sealed casks
    m.label(23, 11, "5")

    # 6. drop doors
    wc.prop_rect(m, 25.5, 11.5, 27.5, 13.5, (60, 45, 40), density=1.8)
    d = ImageDraw.Draw(m.img)
    d.line(m.box(26.5, 11.55, 26.5, 13.45), fill=C_BRASS, width=5)
    m.label(26.5, 12.5, "6")

    # 7. brig (new)
    d = ImageDraw.Draw(m.img)
    for x in np.arange(32.2, 36, 0.25):
        if not 34 <= x <= 35:
            d.line(m.box(x, 6.4, x, 7), fill=wc.INK, width=3)
    wc.ink_segment(m, 34, 3, 34, 6.4, t=0.08)
    m.label(33, 4.5, "7")

    # 8. chain locker
    barrel(m, 33, 12, 0.55, (110, 100, 100))
    barrel(m, 35, 10.6, 0.4, (180, 160, 110))
    m.label(35, 12.3, "8")

    # 9. fore peak
    crate(m, 37, 6, 38.2, 7.2), barrel(m, 38.6, 9.4, 0.4, (180, 160, 110))
    m.label(39.6, 8, "9")

    for x in (19, 24, 29):
        lantern(m, x, 8, C_SPARK)
    for b in LADDERS:
        ladder(m, *b)
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
    a = render("top", top_deck())
    b = render("under", under_deck())
    both = Image.new("RGB", (a.width, a.height + b.height), (245, 240, 228))
    both.paste(a, (0, 0)), both.paste(b, (0, a.height))
    both.save(f"{OUT}/airship_gm_both.png")
    for title, key in (("TOP DECK", KEY_TOP), ("UNDERDECK", KEY_UNDER)):
        print(f"  {title}")
        for k, name, note in key:
            print(f"   {k:>2}  {name:<20} {note[:70]}")


if __name__ == "__main__":
    main()

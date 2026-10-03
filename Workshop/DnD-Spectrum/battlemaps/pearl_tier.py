"""Liandao: the Pearl Tier players' guildhall, where Kismet's theatre sigil lands.

Run:  python3 pearl_tier.py        -> out/pearl_tier_*.png / .pdf
32 x 24 squares = 160 x 120 ft.  x runs west->east, y runs north->south.
"""
import os
from bm import *

W, H, PPS = 32, 24, 100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")

KEY = [
    ("1", "Circle room", "Chalk circle (15 ft), salted. Braziers, costume trunks. Arrival point."),
    ("2", "Backstage", "Costume racks, prop crates. Screen door west to the circle."),
    ("3", "Stage", "Raised 3 ft. Backdrop curtain; wings open both ends. Steps down front."),
    ("4", "Hall", "Lacquered pillars (half cover). Cushion rows are difficult terrain."),
    ("5", "Dressing rooms", "Tatami, shoji screens. Screens block sight, tear as an action."),
    ("6", "Foyer", "Rong Bai-Lin at the register desk. The book has 'Avenue Odyssey' in it."),
    ("7", "Tea room", "Where Master Oyu reads compatibility, if you want him here."),
    ("8", "Courtyard", "Open air. Koi pool is difficult terrain, 3 ft deep. Plum tree, stone lantern."),
    ("9", "Moon gate", "To the alley east. The quiet way out, if the Veil hasn't thought of it."),
    ("10", "Storeroom", "Set pieces, lumber, crates. Side door to the street."),
    ("11", "Front doors", "The Veil officer waits here, courteous. 'How did you come in?'"),
]


def build():
    m = Map(W, H, PPS, seed=7)

    # ---------------- floors ----------------
    roof_edge(m, 0, 0, W, 1), roof_edge(m, 0, 1, 1, 18), roof_edge(m, 31, 1, W, 18)   # neighbouring roofs
    fill(m, 0, 18, W, H, "cobble", base=C["street"])
    fill(m, 0, 18, W, 19, "stone", base=(130, 120, 140))                   # veranda
    fill(m, 1, 1, 8, 8, "stone", base=(108, 104, 112))                     # circle room
    fill(m, 8, 1, 24, 4, "planks", base=C["wood_dark"], plank=0.5)         # backstage
    fill(m, 8, 4, 24, 14, "planks", base=C["wood"], plank=0.5)             # hall
    tatami(m, 1, 8, 8, 14, vertical=True)                                  # dressing rooms
    fill(m, 8, 14, 24, 18, "stone", base=(126, 118, 116))                  # foyer
    tatami(m, 1, 14, 8, 18)                                                # tea room
    fill(m, 24, 1, 31, 12, "flat", base=C["grass"], amp=18, scale=4)       # courtyard
    fill(m, 24, 2, 31, 3, "stone", base=C["stone"])                        # path
    fill(m, 27, 3, 28, 7, "stone", base=C["stone"])
    fill(m, 28, 5, 31, 7, "stone", base=C["stone"])
    fill(m, 24, 8, 27, 10, "stone", base=C["stone"])
    fill(m, 24, 12, 31, 18, "planks", base=C["wood_dark"], plank=0.33, horizontal=False)  # storeroom

    # ---------------- courtyard features ----------------
    water(m, [(24.6, 10.6), (26.5, 10.3), (28.5, 8.6), (30.4, 8.4), (30.5, 11.4), (27.0, 11.6), (24.6, 11.5)])
    for x, y, a in [(27.2, 10.9, 0.4), (29.3, 9.4, 2.2), (25.6, 11.0, -0.6), (29.9, 10.5, 3.6)]:
        koi(m, x, y, a)
    fill(m, 28, 8, 29, 12, "planks", base=(110, 70, 50), plank=0.2, horizontal=False)  # bridge
    tree(m, 29.5, 3.0, 1.6, seed=3)
    lantern(m, 25.5, 6.5, (255, 220, 160))

    # ---------------- walls (x0, y0, x1, y1) ----------------
    walls = [
        (1, 1, 31, 1), (1, 1, 1, 18), (31, 1, 31, 5), (31, 7, 31, 18),       # outer N, W, E (gap = moon gate)
        (1, 18, 15, 18), (17, 18, 28, 18), (29, 18, 31, 18),                  # outer S (gaps: front, side door)
        (8, 1, 8, 3), (8, 5, 8, 8),                                           # circle room E
        (1, 8, 8, 8),                                                         # circle room S
        (8, 4, 10, 4), (22, 4, 24, 4),                                        # backstage / hall
        (24, 1, 24, 2), (24, 3, 24, 8), (24, 10, 24, 16), (24, 17, 24, 18),   # hall / courtyard / store
        (24, 12, 31, 12),                                                     # store N
        (1, 14, 8, 14), (8, 14, 13, 14), (19, 14, 24, 14),                    # foyer N
        (8, 14, 8, 15), (8, 16, 8, 18),                                       # tea room E
    ]
    rooms_from_walls(m, walls, "wall")
    rooms_from_walls(m, [(24, 2, 24, 3), (24, 16, 24, 17), (8, 15, 8, 16), (28, 18, 29, 18)], "door")
    rooms_from_walls(m, [(8, 3, 8, 5), (8, 8, 8, 14), (1, 11, 8, 11), (24, 8, 24, 10)], "screen")

    # front double doors, open
    d = ImageDraw.Draw(m.img)
    d.rectangle(m.box(15, 18, 15.15, 19), fill=C["lacquer"], outline=C["wall"], width=3)
    d.rectangle(m.box(16.85, 18, 17, 19), fill=C["lacquer"], outline=C["wall"], width=3)

    # moon gate
    d.arc(m.box(30.4, 4.6, 31.6, 7.4), 90, 270, fill=C["wall"], width=m.px(0.18))
    d.arc(m.box(30.4, 4.6, 31.6, 7.4), 270, 90, fill=C["wall"], width=m.px(0.18))
    fill(m, 30.9, 5, 31.1, 7, "stone", base=C["stone"])

    # ---------------- 1. circle room ----------------
    teleport_circle(m, 4.5, 4.5, r=1.5)
    brazier(m, 2, 2), brazier(m, 7, 7), brazier(m, 2, 7)
    crate(m, 5, 1.1, 7.9, 2, color=(110, 60, 50))
    crate(m, 6.2, 2, 7.9, 3, color=(80, 70, 110))
    m.label(4.5, 4.5, "1")

    # ---------------- 2. backstage ----------------
    for x in range(10, 22, 3):
        d = ImageDraw.Draw(m.img)
        d.rectangle(m.box(x, 1.15, x + 2, 1.45), fill=(70, 50, 40))
        for i in range(8):
            col = [(150, 60, 120), (60, 90, 150), (180, 140, 60), (90, 140, 90)][(x + i) % 4]
            d.rectangle(m.box(x + 0.05 + i * 0.24, 1.2, x + 0.25 + i * 0.24, 1.7), fill=col)
    crate(m, 9, 2.5, 10, 3.6), crate(m, 22, 2.4, 23.5, 3.6, color=(120, 80, 60))
    m.label(16, 2.5, "2")

    # ---------------- 3. stage ----------------
    stage(m, 10, 4, 22, 8)
    curtain(m, 11, 21, 4.2)
    steps(m, 15, 8, 17, 9)
    for x in (10.5, 21.5):
        lantern(m, x, 7.5, (255, 200, 140))
    m.label(16, 6, "3")

    # ---------------- 4. hall ----------------
    for x, y in [(9, 5), (23, 5), (9, 9), (23, 9), (9, 13), (23, 13)]:
        pillar(m, x, y)
    for y in (10.5, 11.5, 12.5):
        for x in range(11, 22):
            if x not in (15, 16):
                cushion(m, x + 0.5, y, color=C["cloth"] if y != 11.5 else (120, 50, 80))
    lantern(m, 12, 13.3), lantern(m, 20, 13.3)
    m.label(16, 11.5, "4")

    # ---------------- 5. dressing rooms ----------------
    for y in (9, 12):
        d = ImageDraw.Draw(m.img)
        d.rectangle(m.box(1.15, y, 1.6, y + 1.8), fill=(60, 40, 30))           # vanity
        d.rectangle(m.box(1.2, y + 0.3, 1.5, y + 1.5), fill=(190, 200, 210))   # mirror
        cushion(m, 2.1, y + 0.9, 0.45, (150, 60, 60))
    crate(m, 6, 9, 7.8, 9.9, color=(100, 70, 120)), crate(m, 6.5, 12.5, 7.8, 13.8)
    m.label(4.5, 9.5, "5")

    # ---------------- 6. foyer ----------------
    table(m, 10, 15, 13, 16)
    d = ImageDraw.Draw(m.img)
    d.rectangle(m.box(11.2, 15.3, 11.9, 15.7), fill=(235, 225, 200))           # the register
    for x in (19, 21):
        table(m, x, 16.6, x + 1.5, 17.1)                                       # benches
    lantern(m, 9, 17), lantern(m, 23, 17)
    m.label(16, 16, "6")

    # ---------------- 7. tea room ----------------
    table(m, 3, 15.5, 5, 16.5)
    for x, y in [(2.6, 16), (5.4, 16), (4, 15.1), (4, 16.9)]:
        cushion(m, x, y, 0.45, (60, 100, 90))
    m.label(6.5, 15, "7")

    # ---------------- 8-10 ----------------
    m.label(26, 4.5, "8")
    m.label(30, 6, "9")
    for x0, y0, x1, y1 in [(25, 13, 27, 14), (25, 14, 26, 15), (29, 13, 30.9, 15), (27.5, 16, 30, 17), (25, 16.5, 26.5, 17.9)]:
        crate(m, x0, y0, x1, y1, straps=(x1 - x0) > 1.2)
    d = ImageDraw.Draw(m.img)
    for i in range(5):                                                         # lumber stack
        d.rectangle(m.box(27.2, 13.3 + i * 0.2, 28.8, 13.45 + i * 0.2), fill=(170, 130, 90), outline=C["wall"])
    m.label(27.5, 15.5, "10")

    # ---------------- 11. street ----------------
    for x in range(2, 31, 4):
        lantern(m, x + 0.5, 19.5)
    for x0 in (3, 9, 22):
        roof_edge(m, x0, 22, x0 + 6, 24)                                       # buildings across the street
    m.label(16, 19.5, "11")
    return m


def main():
    os.makedirs(OUT, exist_ok=True)
    m = build()
    base = m.img
    gridded = grid(base, PPS)
    check_grid(gridded, PPS, W, H)

    base.save(f"{OUT}/pearl_tier_vtt_gridless.png")
    gridded.save(f"{OUT}/pearl_tier_gridded.png")
    gm = with_coords(gm_labels(m, gridded), PPS)
    gm.save(f"{OUT}/pearl_tier_gm.png")
    n = print_tiles(gridded, PPS, f"{OUT}/pearl_tier_print_1inch.pdf")
    print(f"  wrote gridless, gridded, gm, and {n}-page print PDF to {OUT}")
    for k, name, note in KEY:
        print(f"  {k:>2}  {name:<15} {note}")


if __name__ == "__main__":
    main()

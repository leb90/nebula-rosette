#!/usr/bin/env python3
"""Draws the module plan of a ship (public/img/ship.png): a hull with a grid of modules, in the game's ramps.

It illustrates the idea of building a ship; it is not an asset of the game. Needs Pillow.
"""
import sys
from PIL import Image

METAL = ["14121f", "1d1b2e", "272740", "323553", "3f4466", "4f5679", "646c8f", "7f88a6", "a3abc2"]
BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
KINDS = {
    "reactor": ["14727f", "1fa3a8", "3fd3cf", "8ff5e8"],
    "engine": ["a8501f", "d97a26", "f5a83b", "ffd27a"],
    "cargo": ["5a5034", "7d7148", "a39560", "c9bd86"],
    "med": ["1b4a2c", "2e7a3a", "55b04a", "9ae06a"],
    "crew": ["2c4680", "3f68b0", "5f8fd8", "9cc0f5"],
    "guns": ["5c1726", "9a2834", "d8434a", "ff7a6b"],
}
W, H = 150, 78


def rgb(value):
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def half_height(x):
    """How far the hull reaches from the centre line at column x. The ship points right."""
    if x < 8 or x > 143:
        return 0
    if x < 14:
        return 11
    if x < 22:
        return 19
    if x < 100:
        return 25
    return max(2, round(25 * (143 - x) / 43))


def main():
    image = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = image.load()
    cy = H // 2

    def fill(x0, y0, x1, y1, color):
        for y in range(y0, y1):
            for x in range(x0, x1):
                px[x, y] = color

    # The fins, behind the hull.
    for i in range(16):
        reach = 36 - abs(i - 2) // 2
        for side in (-1, 1):
            for y in range(25, reach):
                if i + (y - 25) < 22:
                    px[30 + i + (y - 25), cy + side * y] = rgb(METAL[2 if side == 1 else 4])

    # The hull, lit from above with the game's dithering.
    for x in range(W):
        top = half_height(x)
        for y in range(cy - top, cy + top):
            shade = 5.2 - 3.6 * (y - (cy - top)) / max(1, 2 * top)
            level = int(max(0, min(8, shade + (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.9)) + 0.5)
            px[x, y] = rgb(METAL[level])
        if top:
            px[x, cy - top] = rgb(METAL[7])
            px[x, cy + top - 1] = rgb(METAL[0])
    for y in range(H):
        for x in range(1, W):
            if px[x, y][3] and not px[x - 1, y][3]:
                px[x, y] = rgb(METAL[1])

    # The engine bells, and their fire.
    for y0 in (cy - 15, cy - 5, cy + 5):
        fill(5, y0, 9, y0 + 10, rgb(METAL[3]))
        fill(5, y0 + 1, 6, y0 + 9, rgb(METAL[0]))
        fill(1, y0 + 2, 5, y0 + 8, rgb("f5a83b"))
        fill(0, y0 + 3, 3, y0 + 7, rgb("ffd27a"))
        fill(3, y0 + 4, 5, y0 + 6, rgb("fff2c4"))

    # The grid of modules: 7 columns by 3 rows, and some slots still empty.
    plan = [
        ["engine", "cargo", "crew", "crew", "guns", None, "reactor"],
        ["engine", "reactor", "reactor", "med", None, "crew", "guns"],
        ["engine", "cargo", None, "cargo", "guns", None, None],
    ]
    cell_w, cell_h, gap = 11, 13, 2
    x_start, y_start = 21, cy - (3 * cell_h + 2 * gap) // 2
    for r, row in enumerate(plan):
        for c, kind in enumerate(row):
            x0 = x_start + c * (cell_w + gap)
            y0 = y_start + r * (cell_h + gap)
            x1, y1 = x0 + cell_w, y0 + cell_h
            fill(x0 - 1, y0 - 1, x1 + 1, y1 + 1, rgb(METAL[0]))
            if kind is None:
                # An empty slot: dark, with a corner of each edge marked.
                fill(x0, y0, x1, y1, rgb(METAL[1]))
                for x, y in [(x0, y0), (x1 - 1, y0), (x0, y1 - 1), (x1 - 1, y1 - 1), (x0 + 1, y0), (x0, y0 + 1), (x1 - 2, y1 - 1), (x1 - 1, y1 - 2)]:
                    px[x, y] = rgb(METAL[6])
                continue
            ramp = KINDS[kind]
            fill(x0, y0, x1, y1, rgb(ramp[1]))
            fill(x0, y0, x1, y0 + 1, rgb(ramp[2]))
            fill(x0, y0, x0 + 1, y1, rgb(ramp[2]))
            fill(x0, y1 - 1, x1, y1, rgb(ramp[0]))
            fill(x1 - 1, y0, x1, y1, rgb(ramp[0]))
            # A little light in each module, different per kind.
            mx, my = x0 + cell_w // 2, y0 + cell_h // 2
            if kind == "reactor":
                fill(mx - 2, my - 2, mx + 3, my + 3, rgb(ramp[3]))
                fill(mx - 1, my - 1, mx + 2, my + 2, rgb("e0fff8"))
            elif kind == "engine":
                for dy in (-3, 0, 3):
                    fill(x0 + 2, my + dy, x1 - 2, my + dy + 1, rgb(ramp[3]))
            elif kind == "cargo":
                fill(x0 + 2, y0 + 2, mx, my, rgb(ramp[3]))
                fill(mx + 1, my + 1, x1 - 2, y1 - 2, rgb(ramp[3]))
            elif kind == "med":
                fill(mx - 1, my - 3, mx + 2, my + 4, rgb(ramp[3]))
                fill(mx - 3, my - 1, mx + 4, my + 2, rgb(ramp[3]))
            elif kind == "crew":
                fill(x0 + 2, y0 + 2, x0 + 4, y1 - 2, rgb(ramp[3]))
                fill(x1 - 4, y0 + 2, x1 - 2, y1 - 2, rgb(ramp[3]))
            elif kind == "guns":
                fill(mx - 1, y0 + 2, mx + 2, y1 - 2, rgb(ramp[3]))
                fill(mx - 3, my - 1, mx - 1, my + 1, rgb(ramp[3]))

    # The bridge, at the nose.
    for x in range(114, 131):
        reach = max(1, 7 - abs(x - 120) // 2)
        for y in range(cy - reach, cy + reach):
            px[x, y] = rgb("8ff5e8" if y < cy - 1 else "1fa3a8")
    image.save(sys.argv[1] if len(sys.argv) > 1 else "public/img/ship.png", optimize=True)


main()

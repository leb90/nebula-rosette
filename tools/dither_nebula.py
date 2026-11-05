#!/usr/bin/env python3
"""Turns a photograph of the Rosette Nebula into pixel art with the game's colours.

Usage: dither_nebula.py <photo> <out.png> [width] [--gamma g]
Maps brightness onto one ramp (hydrogen-red shadows to warm light) with the same 4x4 ordered
dithering the game's menu planet uses. Needs Pillow and numpy.
"""
import sys
import numpy as np
from PIL import Image

RAMP = ["06050c", "110a17", "1c0d1f", "2a1027", "3d1430", "5c1726", "9a2834", "d8434a", "ff7a6b", "ffd27a", "fff2c4"]
BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    photo, out = args[0], args[1]
    width = int(args[2]) if len(args) > 2 else 480
    gamma = float(sys.argv[sys.argv.index("--gamma") + 1]) if "--gamma" in sys.argv else 1.0
    if "--gamma" in sys.argv:
        args = [a for a in args if a != str(sys.argv[sys.argv.index("--gamma") + 1])]
    image = Image.open(photo).convert("RGB")
    height = round(image.height * width / image.width)
    small = np.asarray(image.resize((width, height), Image.LANCZOS), dtype=np.float32) / 255
    # The red channel carries the hydrogen emission; a little of the rest keeps the stars and the blue core.
    light = small[..., 0] * 0.62 + small[..., 1] * 0.28 + small[..., 2] * 0.10
    low, high = np.percentile(light, 1), np.percentile(light, 99.7)
    light = np.clip((light - low) / (high - low), 0, 1) ** gamma
    colors = np.array([[int(c[i:i + 2], 16) for i in (0, 2, 4)] for c in RAMP], dtype=np.uint8)
    threshold = BAYER[np.indices((height, width))[0] % 4, np.indices((height, width))[1] % 4]
    level = light * (len(RAMP) - 1) + (threshold - 0.5) * 0.9
    index = np.clip(np.rint(level), 0, len(RAMP) - 1).astype(np.int32)
    Image.fromarray(colors[index], "RGB").quantize(colors=len(RAMP), dither=Image.Dither.NONE).save(out, optimize=True)


main()

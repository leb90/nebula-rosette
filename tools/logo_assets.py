"""The game's logo, icon and title font, made into the page's files.

    python tools/logo_assets.py <game>/game/assets

Reads graphics/logo (logo-stacked.png, logo-line.png, icon-1024.png) and fonts/Michroma-Regular.ttf from the
game's assets, and writes public/img/logo-stacked.webp, public/img/logo-line.webp, public/favicon.png,
public/apple-touch-icon.png and public/fonts/Michroma.woff2 (Latin only, enough for Spanish and English).
Needs Pillow, numpy, fonttools and brotli.
"""

import sys
from pathlib import Path

import numpy as np
from fontTools import subset
from PIL import Image

assets = Path(sys.argv[1])
public = Path(__file__).resolve().parent.parent / "public"


def trimmed(name, box, fade, width):
    """Crops the logo's empty margin, fades the glow line out at the cut edges and scales it to `width`."""
    image = Image.open(assets / "graphics/logo" / name).convert("RGBA").crop(box)
    pixels = np.array(image).astype(np.float32)
    ramp = np.ones(pixels.shape[1], np.float32)
    ramp[:fade] = np.linspace(0, 1, fade)
    ramp[-fade:] = np.linspace(1, 0, fade)
    pixels[:, :, 3] *= ramp
    image = Image.fromarray(pixels.clip(0, 255).astype(np.uint8))
    return image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)


trimmed("logo-stacked.png", (40, 40, 1160, 385), 90, 1120).save(public / "img/logo-stacked.webp", quality=90, method=6)
trimmed("logo-line.png", (120, 50, 2080, 225), 140, 1960).save(public / "img/logo-line.webp", quality=90, method=6)

# The icon without its drop shadow: the rounded square, transparent outside for the tab, filled for the phone's home
# screen (which would turn the transparent corners black).
icon = Image.open(assets / "graphics/logo/icon-1024.png").convert("RGBA").crop((100, 100, 924, 924))
icon.resize((48, 48), Image.LANCZOS).save(public / "favicon.png", optimize=True)
filled = Image.new("RGBA", icon.size, icon.getpixel((icon.width // 2, 60))[:3] + (255,))
filled.alpha_composite(icon)
filled.convert("RGB").resize((180, 180), Image.LANCZOS).save(public / "apple-touch-icon.png", optimize=True)

options = subset.Options()
options.flavor = "woff2"
options.layout_features = ["kern", "liga"]
font = subset.load_font(str(assets / "fonts/Michroma-Regular.ttf"), options)
subsetter = subset.Subsetter(options)
subsetter.populate(unicodes=list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026])
subsetter.subset(font)
subset.save_font(font, str(public / "fonts/Michroma.woff2"), options)
print("done")

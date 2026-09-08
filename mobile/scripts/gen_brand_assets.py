"""Regenerate Findable brand assets — ember bookmark + sparkle, sharper pass.

Everything is drawn at 4× and downsampled (LANCZOS) so edges stay crisp.
Outputs (all under mobile/assets/):
  icon.png          1024×1024 full-bleed app icon (no pre-rounded corners — Apple masks it)
  splash-icon.png   1024×1024 transparent, glyph-only (ember glyph for the splash)
  favicon.png       256×256 rounded-corner web favicon
  icon-mark.png     512×512 transparent in-app mark (login hero)

Run from mobile/:  python3 scripts/gen_brand_assets.py
"""
from PIL import Image, ImageDraw, ImageFilter
import math
import os

SS = 4                       # supersampling factor
BASE = 1024
S = BASE * SS                # working canvas

# Ember palette (matches constants/theme.ts accent family)
EMBER_TOP = (255, 122, 74)   # warm orange
EMBER_BOTTOM = (196, 60, 28) # deep ember
CREAM = (255, 248, 237)
GLOW = (255, 176, 120)

ASSETS = os.path.join(os.path.dirname(__file__), '..', 'assets')


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient_bg(size):
    """Diagonal ember gradient with a soft radial glow behind the glyph.
    Drawn small then upscaled — gradients survive scaling losslessly."""
    small = 512
    img = Image.new('RGB', (small, small))
    px = img.load()
    for y in range(small):
        for x in range(small):
            t = (x / small) * 0.35 + (y / small) * 0.65
            px[x, y] = lerp(EMBER_TOP, EMBER_BOTTOM, t)
    img = img.resize((size, size), Image.BICUBIC)
    # radial glow, upper-center — gives the flat gradient some depth
    glow = Image.new('L', (size, size), 0)
    gd = ImageDraw.Draw(glow)
    cx, cy, r = size * 0.42, size * 0.34, size * 0.52
    gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.12))
    img = Image.composite(Image.new('RGB', (size, size), GLOW), img, glow)
    return img


def bookmark_mask(size, scale=1.0, dy=0.0):
    """Rounded-top bookmark with a notched tail, centered; returns an L-mask."""
    m = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(m)
    w = size * 0.155 * scale         # half-width (tall ribbon, not a wide flag)
    top = size * 0.295 + dy * size
    bot = size * 0.735 + dy * size
    cx = size * 0.485                # nudged left so the sparkle balances it
    rad = size * 0.075 * scale       # top corner radius
    notch = size * 0.095 * scale     # V-notch depth at the bottom
    left, right = cx - w, cx + w
    # body with rounded top corners
    d.rounded_rectangle([left, top, right, bot], radius=rad, fill=255)
    # square off the bottom corners (rounded_rectangle rounds all four)
    d.rectangle([left, bot - rad * 2, right, bot], fill=255)
    # classic ribbon: carve the V notch up into the bottom edge
    d.polygon([(left - 1, bot + 1), (cx, bot - notch), (right + 1, bot + 1)], fill=0)
    return m


def sparkle_mask(size, cx, cy, r, ratio=0.26):
    """4-point star (concave diamond) — the 'AI' sparkle."""
    m = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(m)
    pts = []
    for i in range(8):
        ang = math.pi / 4 * i - math.pi / 2
        rr = r if i % 2 == 0 else r * ratio
        pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
    d.polygon(pts, fill=255)
    return m


def glyph_layers(size, color, shadow=True):
    """Bookmark + sparkle as an RGBA layer (optionally with a soft drop shadow)."""
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bm = bookmark_mask(size)
    sp = sparkle_mask(size, size * 0.70, size * 0.255, size * 0.088)
    combined = Image.new('L', (size, size), 0)
    combined.paste(bm, (0, 0))
    combined = Image.composite(Image.new('L', (size, size), 255), combined, sp)

    if shadow:
        sh = combined.filter(ImageFilter.GaussianBlur(size * 0.012))
        shadow_layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        shadow_layer.paste((120, 30, 8, 110), (0, int(size * 0.012)), sh)
        layer = Image.alpha_composite(layer, shadow_layer)

    fill = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    fill.paste(color + (255,), (0, 0), combined)
    return Image.alpha_composite(layer, fill)


def down(img, size):
    return img.resize((size, size), Image.LANCZOS)


def main():
    # ── icon.png — full-bleed 1024 ──
    icon = gradient_bg(S).convert('RGBA')
    icon = Image.alpha_composite(icon, glyph_layers(S, CREAM))
    down(icon, BASE).convert('RGB').save(os.path.join(ASSETS, 'icon.png'))
    print('icon.png')

    # ── splash-icon.png — transparent, ember glyph ──
    splash = glyph_layers(S, EMBER_TOP, shadow=False)
    down(splash, BASE).save(os.path.join(ASSETS, 'splash-icon.png'))
    print('splash-icon.png')

    # ── favicon.png — 256, rounded corners ──
    fav = gradient_bg(S).convert('RGBA')
    fav = Image.alpha_composite(fav, glyph_layers(S, CREAM))
    corner = Image.new('L', (S, S), 0)
    ImageDraw.Draw(corner).rounded_rectangle([0, 0, S, S], radius=S * 0.22, fill=255)
    fav.putalpha(corner)
    down(fav, 256).save(os.path.join(ASSETS, 'favicon.png'))
    print('favicon.png')

    # ── icon-mark.png — transparent in-app mark (login hero) ──
    mark = glyph_layers(S, EMBER_TOP, shadow=False)
    down(mark, 512).save(os.path.join(ASSETS, 'icon-mark.png'))
    print('icon-mark.png')

    # ── Android adaptive icon layers (432×432) ──
    # Foreground glyph is drawn smaller (adaptive icons crop ~66% safe zone).
    fg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    small_glyph = glyph_layers(int(S * 0.62), CREAM, shadow=False)
    off = (S - small_glyph.width) // 2
    fg.paste(small_glyph, (off, off), small_glyph)
    down(fg, 432).save(os.path.join(ASSETS, 'android-icon-foreground.png'))
    gradient_bg(S).resize((432, 432), Image.LANCZOS).save(os.path.join(ASSETS, 'android-icon-background.png'))
    mono = Image.new('L', (S, S), 0)
    mono.paste(small_glyph.split()[3], (off, off))
    down(mono, 432).save(os.path.join(ASSETS, 'android-icon-monochrome.png'))
    print('android adaptive layers')


if __name__ == '__main__':
    main()

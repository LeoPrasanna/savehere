"""Downscale + recompress the owner's 512px avatar PNGs into the app bundle.

WHY NOT SHIP THEM AS-IS: 102 files x 512x512 RGBA = 15.9 MB, against a 5.1 MB JS
bundle. That would more than quadruple the download for artwork that never
renders above ~64pt. Expo bundles every file under assets/ into the app binary
(and into the web build), so unused pixels are paid for on every install.

WHAT THIS DOES: 512 -> 128 px (LANCZOS), which is 2x the largest on-screen size
(64pt avatar in ProfilePanel) and 3x the 44pt picker cell — sharp on every
density including 3x phones. Then quantizes to a 128-colour palette, which these
flat-shaded illustrations take without visible banding, and strips metadata.
"""
import os, shutil, glob
from PIL import Image

SRC = r"C:\Users\yempa\OneDrive\Desktop\profile_avatars_FINAL_clean_1x1"
DST = r"C:\Users\yempa\Documents\gitrepositories\savehere\mobile\assets\avatars"
SIZE = 128

os.makedirs(DST, exist_ok=True)
for f in glob.glob(os.path.join(DST, "*.png")):
    os.remove(f)

rows, before, after = [], 0, 0
for path in sorted(glob.glob(os.path.join(SRC, "*.png"))):
    name = os.path.basename(path)
    before += os.path.getsize(path)
    with Image.open(path) as im:
        im = im.convert("RGBA").resize((SIZE, SIZE), Image.LANCZOS)
        # Quantize while preserving the alpha channel (method=2 = MEDIANCUT keeps
        # transparency intact; RGBA->P with an alpha-aware palette).
        q = im.quantize(colors=128, method=Image.Quantize.FASTOCTREE)
        out = os.path.join(DST, name)
        q.save(out, format="PNG", optimize=True)
    sz = os.path.getsize(out)
    after += sz
    rows.append((name, sz))

print(f"{len(rows)} files")
print(f"before: {before/1e6:.2f} MB   after: {after/1e6:.3f} MB   "
      f"saved {100*(1-after/before):.1f}%")
print(f"avg after: {after/len(rows)/1024:.1f} KB   "
      f"largest: {max(rows, key=lambda r: r[1])}")

# Run from infernal/: python ../tools/expr-eyes.py  - blink and glance frames for set A (names, EYES boxes and file names inside; copy and adjust per set)
# Build idle frames (neutral, glance, blink) for set A: from each variant take only the eyes - the spots that really
# changed - feathered and colour-matched to the neutral around them; everything else stays the neutral's own pixels.
from PIL import Image, ImageChops, ImageFilter, ImageStat
import os
N = Image.open("expressions/set-a-neutral.png").convert("RGBA")
VARS = {v: Image.open(f"opponents-{v}-draft.png").convert("RGBA") for v in ["glance", "blink"]}
names = ["persephone", "lilith", "faust", "davy-jones", "bub", "cerberus", "anubis", "kali"]
SKIP = {"bub", "cerberus"}             # asked to stay unchanged
# where the eyes are in each cell (x0, y0, x1, y1): only changes inside this box are taken
EYES = {"persephone": (175, 245, 295, 312), "lilith": (135, 248, 258, 302), "faust": (195, 262, 318, 332),
        "davy-jones": (205, 255, 322, 322), "anubis": (195, 205, 272, 266), "kali": (205, 205, 302, 268)}
cw, ch = 384, 512
DBG = os.environ.get("S")

def spots(a3, b3, alpha):
    d = ImageChops.difference(a3, b3).convert("L")
    d = ImageChops.multiply(d, alpha).filter(ImageFilter.GaussianBlur(5)).point(lambda v: min(255, v * 4))
    return d.point(lambda v: 255 if v > 175 else 0)

def save_frame(img, alpha, path):
    c = img.copy(); c.putalpha(alpha)
    box = alpha.getbbox(); c = c.crop(box)
    side = max(c.size); sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(c, ((side - c.width) // 2, side - c.height))
    sq.resize((240, 240), Image.LANCZOS).save(path, "WEBP", quality=88, method=6)

sheet_dbg = Image.new("RGBA", (1536, 1024 * 2))
for k, n in enumerate(names):
    x0, y0 = (k % 4) * cw, (k // 4) * ch
    box = (x0, y0, x0 + cw, y0 + ch)
    a = N.crop(box); alpha = a.getchannel("A"); a3 = a.convert("RGB")
    solid = alpha.point(lambda v: 255 if v > 128 else 0)
    save_frame(a3, alpha, f"expressions/frames/{n}.webp")
    if n in SKIP: continue
    crops = {v: VARS[v].crop(box).convert("RGB") for v in VARS}
    # one patch for both variants (so glance and blink change the same area)
    core = ImageChops.lighter(spots(a3, crops["glance"], solid), spots(a3, crops["blink"], solid))
    eyes = Image.new("L", core.size, 0); eyes.paste(255, EYES[n])
    core = ImageChops.multiply(core, eyes)
    core = core.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.MaxFilter(11))
    mask = core.filter(ImageFilter.GaussianBlur(9))
    mask = ImageChops.multiply(mask, solid)
    ring = ImageChops.subtract(core.filter(ImageFilter.MaxFilter(21)), core)
    for v, b in crops.items():
        # match the variant's colour to the neutral's in a ring round the patch
        sa, sb = ImageStat.Stat(a3, ring), ImageStat.Stat(b, ring)
        bands = [bd.point(lambda x, i=i: max(0, min(255, round((x - sb.mean[i]) * (sa.stddev[i] / max(1, sb.stddev[i])) + sa.mean[i]))))
                 for i, bd in enumerate(b.split())]
        b2 = Image.merge("RGB", bands)
        out = Image.composite(b2, a3, mask)
        save_frame(out, alpha, f"expressions/frames/{n}-{v}.webp")
        sheet_dbg.paste(out, (x0, y0 + (0 if v == "glance" else 1024)))
    print(n, "patch", core.getbbox())
if DBG: sheet_dbg.save(DBG + "/expr_dbg.png")

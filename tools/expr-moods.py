# Run from infernal/: python ../tools/expr-moods.py  - happy and angry frames for set A (names, FACES ellipses and file names inside; copy and adjust per set)
# Happy and angry frames: the whole face from each sheet (aligned, colour-matched, feathered) set into the neutral.
from PIL import Image, ImageChops, ImageFilter, ImageStat, ImageDraw
import os
N = Image.open("expressions/set-a-neutral.png").convert("RGBA")
names = ["persephone", "lilith", "faust", "davy-jones", "bub", "cerberus", "anubis", "kali"]
cw, ch = 384, 512
# the face areas, in fractions of the 240 frame: ellipses (cx, cy, rx, ry) - one per head
FACES = {"persephone": [(0.59, 0.43, 0.14, 0.17)], "lilith": [(0.48, 0.44, 0.15, 0.17)], "faust": [(0.63, 0.46, 0.14, 0.19)],
         "davy-jones": [(0.65, 0.40, 0.13, 0.15)], "bub": [(0.50, 0.44, 0.24, 0.17)],
         "cerberus": [(0.47, 0.47, 0.17, 0.19), (0.16, 0.56, 0.14, 0.12), (0.82, 0.55, 0.14, 0.12)],
         "anubis": [(0.62, 0.50, 0.21, 0.12)], "kali": [(0.64, 0.46, 0.12, 0.15)]}
DBG = os.environ.get("S")

def frame_geom(alpha):
    x0, y0, x1, y1 = alpha.getbbox(); w, h = x1 - x0, y1 - y0; side = max(w, h)
    return x0 - (side - w) / 2, y0 - (side - h), side          # frame origin in cell coords, and its size

def save_frame(img, alpha, path):
    c = img.copy(); c.putalpha(alpha); c = c.crop(alpha.getbbox())
    side = max(c.size); sq = Image.new("RGBA", (side, side), (0, 0, 0, 0)); sq.paste(c, ((side - c.width) // 2, side - c.height))
    sq.resize((240, 240), Image.LANCZOS).save(path, "WEBP", quality=88, method=6)

dbg = Image.new("RGB", (3 * 300, len(names) * 260), (30, 20, 16))
for mood in ["happy", "angry"]:
    V = Image.open(f"expressions/set-a-{mood}.png").convert("RGBA")
    for k, n in enumerate(names):
        x0, y0 = (k % 4) * cw, (k // 4) * ch
        a = N.crop((x0, y0, x0 + cw, y0 + ch)); alpha = a.getchannel("A"); a3 = a.convert("RGB")
        ox, oy, side = frame_geom(alpha)
        mask = Image.new("L", (cw, ch), 0); dr = ImageDraw.Draw(mask)
        for cx, cy, rx, ry in FACES[n]:
            X, Y, RX, RY = ox + cx * side, oy + cy * side, rx * side, ry * side
            dr.ellipse((X - RX, Y - RY, X + RX, Y + RY), fill=255)
        # align the variant on the face (it may have moved a little)
        best = None
        for dy in range(-12, 13, 2):
            for dx in range(-12, 13, 2):
                b = V.crop((x0 + dx, y0 + dy, x0 + dx + cw, y0 + dy + ch)).convert("RGB")
                ring = ImageChops.subtract(mask.filter(ImageFilter.MaxFilter(15)), mask)
                s = ImageStat.Stat(ImageChops.difference(a3, b).convert("L"), ring).mean[0]
                if best is None or s < best[0]: best = (s, dx, dy)
        _, dx, dy = best
        b = V.crop((x0 + dx, y0 + dy, x0 + dx + cw, y0 + dy + ch)).convert("RGB")
        ring = ImageChops.subtract(mask.filter(ImageFilter.MaxFilter(17)), mask)
        sa, sb = ImageStat.Stat(a3, ring), ImageStat.Stat(b, ring)
        bands = [bd.point(lambda x, i=i: max(0, min(255, round((x - sb.mean[i]) * (sa.stddev[i] / max(1, sb.stddev[i])) + sa.mean[i]))))
                 for i, bd in enumerate(b.split())]
        b2 = Image.merge("RGB", bands)
        soft = mask.filter(ImageFilter.GaussianBlur(7))
        out = Image.composite(b2, a3, soft)
        save_frame(out, alpha, f"expressions/frames/{n}-{mood}.webp")
        print(mood, n, "shift", dx, dy)
        if DBG:
            col = 1 if mood == "happy" else 2
            t = out.copy(); t.putalpha(alpha); t = t.crop((40, 60, 340, 320))
            bg = Image.new("RGB", t.size, (30, 20, 16)); bg.paste(t, (0, 0), t.getchannel("A")); dbg.paste(bg, (col * 300, k * 260))
            if mood == "happy":
                t = a.crop((40, 60, 340, 320)); bg = Image.new("RGB", t.size, (30, 20, 16)); bg.paste(t, (0, 0), t.getchannel("A")); dbg.paste(bg, (0, k * 260))
if DBG: dbg.save(DBG + "/moods.png")

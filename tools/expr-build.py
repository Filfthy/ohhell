# Run from the Oh Hell folder: python tools/expr-build.py b [debug.png]
#
# Builds a set's moving-portrait frames from infernal/expressions/set-<x>-*.png into infernal/expressions/frames/:
#   <name>.webp           the neutral portrait (240px, standing on its square's floor, as the game's portraits are)
#   <name>-blink/-glance  only the eyes changed: what really moved inside the eyes box, feathered and colour-matched
#   <name>-happy/-angry   the whole face: aligned on the face, colour-matched, feathered into the neutral
# Every pixel outside those patches stays the neutral's own, so nothing shimmers when the frames fade into each other.
# Positions are fractions of the 240px frame (x, y from its top-left): eyes boxes and face ellipses.
import os, sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat

SETS = {
  "a": ["persephone", "lilith", "faust", "davy-jones", "bub", "cerberus", "anubis", "kali"],   # (cerberus: done by expr-glow-eyes.py, skipped)
  "b": ["hellga", "jezebel", "morgana", "lamia", "loki", "hecate", "ereshkigal", "banshee"],
  "c": ["charon", "ammit", "brimstone", "ronnie", "sojobo", "old-nick"],
}
LM = {
  # set A: only the happy/angry faces are built here (run with "moods"); its blinks and glances came from expr-eyes.py
  "persephone": {"eyes": (0.47, 0.30, 0.74, 0.42), "faces": [(0.60, 0.43, 0.18, 0.20)]},
  "lilith":     {"eyes": (0.36, 0.30, 0.67, 0.42), "faces": [(0.51, 0.44, 0.20, 0.19)]},
  "faust":      {"eyes": (0.54, 0.32, 0.80, 0.44), "faces": [(0.66, 0.47, 0.17, 0.19)]},
  "davy-jones": {"eyes": (0.58, 0.33, 0.82, 0.43), "faces": [(0.67, 0.42, 0.16, 0.16)]},
  "bub":        {"eyes": (0.28, 0.27, 0.76, 0.43), "faces": [(0.51, 0.44, 0.25, 0.18)]},
  "anubis":     {"eyes": (0.55, 0.40, 0.68, 0.46), "faces": [(0.63, 0.48, 0.22, 0.14)]},
  "kali":       {"eyes": (0.59, 0.31, 0.80, 0.42), "faces": [(0.68, 0.45, 0.14, 0.16)]},
  "hellga":     {"eyes": (0.48, 0.31, 0.76, 0.44), "faces": [(0.61, 0.43, 0.17, 0.17)]},
  "jezebel":    {"eyes": (0.45, 0.27, 0.70, 0.37), "faces": [(0.59, 0.40, 0.15, 0.15)]},
  "morgana":    {"eyes": (0.51, 0.27, 0.75, 0.38), "faces": [(0.63, 0.41, 0.14, 0.16)]},
  "lamia":      {"eyes": (0.51, 0.37, 0.76, 0.50), "faces": [(0.62, 0.49, 0.15, 0.17)]},
  "loki":       {"eyes": (0.54, 0.28, 0.77, 0.39), "faces": [(0.63, 0.43, 0.16, 0.19)]},
  "hecate":     {"eyes": (0.49, 0.26, 0.75, 0.35), "faces": [(0.67, 0.39, 0.17, 0.17)]},
  "ereshkigal": {"eyes": (0.49, 0.31, 0.74, 0.41), "faces": [(0.62, 0.43, 0.17, 0.17)]},
  "banshee":    {"eyes": (0.49, 0.31, 0.71, 0.41), "faces": [(0.63, 0.46, 0.17, 0.18)]},
  "charon":     {"eyes": (0.55, 0.26, 0.80, 0.34), "faces": [(0.67, 0.37, 0.15, 0.16)]},
  "ammit":      {"eyes": (0.56, 0.28, 0.72, 0.37), "faces": [(0.70, 0.42, 0.24, 0.12)]},
  "brimstone":  {"eyes": (0.45, 0.32, 0.76, 0.43), "faces": [(0.60, 0.44, 0.18, 0.18)]},
  "ronnie":     {"eyes": (0.56, 0.41, 0.72, 0.49), "faces": [], "glow": (0.94, 0.06)},   # the red eye slit, done here
  "sojobo":     {"eyes": (0.55, 0.31, 0.72, 0.40), "faces": []},
  "old-nick":   {"eyes": (0.53, 0.31, 0.79, 0.41), "faces": [(0.65, 0.43, 0.17, 0.18)]},
}
SKIP = {"ronnie": {"happy"}, "sojobo": {"happy", "angry"}}   # faces the generator left alone (a helmet, a carved mask)

setx = sys.argv[1]; names = SETS[setx]
MOODS_ONLY = "moods" in sys.argv[2:]
if MOODS_ONLY: sys.argv = [a for a in sys.argv if a != "moods"]; dbg_path = sys.argv[2] if len(sys.argv) > 2 else None
D = "infernal/expressions/"
cw, ch = 384, 512
N = Image.open(f"{D}set-{setx}-neutral.png").convert("RGBA")
V = {v: Image.open(f"{D}set-{setx}-{v}.png").convert("RGBA") for v in (["happy", "angry"] if MOODS_ONLY else ["blink", "glance", "happy", "angry"])}

def geom(alpha):
    x0, y0, x1, y1 = alpha.getbbox(); w, h = x1 - x0, y1 - y0; side = max(w, h)
    return x0 - (side - w) / 2, y0 - (side - h), side          # the frame's origin in cell coords, and its size

def save_frame(img, alpha, path):
    c = img.copy(); c.putalpha(alpha); c = c.crop(alpha.getbbox())
    side = max(c.size); sq = Image.new("RGBA", (side, side), (0, 0, 0, 0)); sq.paste(c, ((side - c.width) // 2, side - c.height))
    sq.resize((240, 240), Image.LANCZOS).save(path, "WEBP", quality=88, method=6)
    return sq.resize((240, 240), Image.LANCZOS)

def colour_match(b, a, ring):
    sa, sb = ImageStat.Stat(a, ring), ImageStat.Stat(b, ring)
    return Image.merge("RGB", [bd.point(lambda x, i=i: max(0, min(255, round((x - sb.mean[i]) * (sa.stddev[i] / max(1, sb.stddev[i])) + sa.mean[i]))))
                               for i, bd in enumerate(b.split())])

def aligned(var, x0, y0, a3, ring, reach=12):
    best = None
    for dy in range(-reach, reach + 1, 2):
        for dx in range(-reach, reach + 1, 2):
            b = var.crop((x0 + dx, y0 + dy, x0 + dx + cw, y0 + dy + ch)).convert("RGB")
            s = ImageStat.Stat(ImageChops.difference(a3, b).convert("L"), ring).mean[0]
            if best is None or s < best[0]: best = (s, dx, dy)
    return var.crop((x0 + best[1], y0 + best[2], x0 + best[1] + cw, y0 + best[2] + ch)).convert("RGB"), best[1:]

rows = []
for k, n in enumerate(names):
    if n not in LM: continue          # (done another way; still counted, so everyone keeps their own cell)
    x0, y0 = (k % 4) * cw, (k // 4) * ch
    a = N.crop((x0, y0, x0 + cw, y0 + ch)); alpha = a.getchannel("A"); a3 = a.convert("RGB")
    solid = alpha.point(lambda v: 255 if v > 128 else 0)
    ox, oy, side = geom(alpha)
    P = lambda fx, fy: (ox + fx * side, oy + fy * side)
    row = [save_frame(a3, alpha, f"{D}frames/{n}.webp") if not MOODS_ONLY else a.crop(alpha.getbbox()).resize((240, 240))]
    lm, skip = LM[n], SKIP.get(n, set())
    if "glow" in lm:
        import colorsys
        ex0, ey0 = P(lm["eyes"][0], lm["eyes"][1]); ex1, ey1 = P(lm["eyes"][2], lm["eyes"][3])
        m = Image.new("L", (cw, ch), 0); mp = m.load(); px = a3.load(); lo, hi = lm["glow"]
        for yy in range(int(ey0), int(ey1)):
            for xx in range(int(ex0), int(ex1)):
                r, g, b = px[xx, yy]; h, s_, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
                if v > 0.35 and s_ > 0.45 and (h >= lo or h <= hi if lo > hi else lo <= h <= hi): mp[xx, yy] = 255
        core = m.filter(ImageFilter.MaxFilter(3)); soft = core.filter(ImageFilter.GaussianBlur(2))
        from PIL import ImageEnhance
        dark = ImageEnhance.Brightness(ImageEnhance.Color(a3).enhance(0.3)).enhance(0.25)
        def flare(k):
            hot = ImageEnhance.Brightness(a3).enhance(1 + 0.5 * k)
            halo = core.filter(ImageFilter.GaussianBlur(4 + 3 * k)).point(lambda q: min(255, q * (2 + k)))
            f = Image.composite(hot, a3, soft)
            return Image.composite(Image.new("RGB", a3.size, (255, 70, 40)), f, halo.point(lambda q: q * (0.35 + 0.15 * k)))
        print(n, "glow pixels", core.getbbox())
        row += [save_frame(Image.composite(dark, a3, soft), alpha, f"{D}frames/{n}-blink.webp"),
                save_frame(flare(1), alpha, f"{D}frames/{n}-glance.webp"), None,
                save_frame(flare(2), alpha, f"{D}frames/{n}-angry.webp")]
        rows.append(row); continue
    # blink and glance: only what changed inside the eyes box (one patch for both, so they change the same area)
    if MOODS_ONLY: lm = dict(lm); skip = skip | {"blink", "glance"}
    ex0, ey0 = P(lm["eyes"][0], lm["eyes"][1]); ex1, ey1 = P(lm["eyes"][2], lm["eyes"][3])
    box = Image.new("L", (cw, ch), 0); ImageDraw.Draw(box).rectangle((ex0, ey0, ex1, ey1), fill=255)
    core = Image.new("L", (cw, ch), 0)
    eyevars = {}
    for v in ["blink", "glance"]:
        if v in skip: continue
        b, _ = aligned(V[v], x0, y0, a3, ImageChops.subtract(box.filter(ImageFilter.MaxFilter(21)), box), reach=4)
        eyevars[v] = b
        d = ImageChops.multiply(ImageChops.difference(a3, b).convert("L"), solid).filter(ImageFilter.GaussianBlur(4)).point(lambda q: min(255, q * 4))
        core = ImageChops.lighter(core, ImageChops.multiply(d.point(lambda q: 255 if q > 150 else 0), box))
    core = core.filter(ImageFilter.MaxFilter(13)).filter(ImageFilter.MaxFilter(9))
    soft = ImageChops.multiply(core.filter(ImageFilter.GaussianBlur(7)), solid)
    ring = ImageChops.subtract(core.filter(ImageFilter.MaxFilter(21)), core)
    for v in ["blink", "glance"]:
        if v not in eyevars:
            fp = f"{D}frames/{n}-{v}.webp"
            row.append(Image.open(fp).convert("RGBA") if MOODS_ONLY and os.path.exists(fp) else None); continue
        out = Image.composite(colour_match(eyevars[v], a3, ring), a3, soft)
        row.append(save_frame(out, alpha, f"{D}frames/{n}-{v}.webp"))
    # happy and angry: the whole face
    face = Image.new("L", (cw, ch), 0); dr = ImageDraw.Draw(face)
    for cx, cy, rx, ry in lm["faces"]:
        X, Y = P(cx, cy); dr.ellipse((X - rx * side, Y - ry * side, X + rx * side, Y + ry * side), fill=255)
    fring = ImageChops.subtract(face.filter(ImageFilter.MaxFilter(17)), face)
    fsoft = ImageChops.multiply(face.filter(ImageFilter.GaussianBlur(7)), solid)
    for v in ["happy", "angry"]:
        if v in skip: row.append(None); continue
        b, shift = aligned(V[v], x0, y0, a3, ImageChops.subtract(face.filter(ImageFilter.MaxFilter(15)), face))
        out = Image.composite(colour_match(b, a3, fring), a3, fsoft)
        row.append(save_frame(out, alpha, f"{D}frames/{n}-{v}.webp"))
        print(n, v, "shift", shift)
    print(n, "eyes patch", core.getbbox())
    rows.append(row)

if dbg_path:   # neutral | blink | glance | happy | angry for each character
    sheet = Image.new("RGB", (5 * 240, len(rows) * 240), (30, 20, 16))
    for r, row in enumerate(rows):
        for c, im in enumerate(row):
            if im is None: continue
            bg = Image.new("RGB", (240, 240), (30, 20, 16)); bg.paste(im, (0, 0), im); sheet.paste(bg, (c * 240, r * 240))
    sheet.save(dbg_path)

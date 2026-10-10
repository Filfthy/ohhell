# Draws the crease overlays for the Infernal cards (img/crease-0..7.webp): a fold that wavers rather than
# runs ruler-straight, a soft shadow on one side and a sheen on the other, the ink cracked pale in broken
# patches along it, its strength coming and going, and a few small wrinkles running off it.
# The game flips each one sideways and/or upside down, so the 8 give 32 different creases.
import math, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

W, H = 320, 450
DARK = (62, 36, 14)
LIGHT = (255, 246, 222)


def wave(rnd, terms):
    parts = [(rnd.uniform(1, 1.6) * f, rnd.uniform(0, 6.283), a) for f, a in terms]
    return lambda t: sum(a * math.sin(t * f * 6.283 + ph) for f, ph, a in parts)


def crease(seed, p0, p1, kink=None, wrinkles=4, strength=1.0):
    rnd = random.Random(seed)
    # the path: start -> (kink) -> end, sampled finely, pushed sideways by a slow wobble and a little jitter
    legs = [p0, kink, p1] if kink else [p0, p1]
    pts = []
    for a, b in zip(legs, legs[1:]):
        for i in range(160):
            t = i / 160
            pts.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    pts.append(p1)
    wob = wave(rnd, [(1.5, 3.0), (3.5, 1.6), (8, 0.7)])
    out = []
    for i, (x, y) in enumerate(pts):
        j = max(1, min(len(pts) - 2, i))
        dx, dy = pts[j + 1][0] - pts[j - 1][0], pts[j + 1][1] - pts[j - 1][1]
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L, dx / L
        o = wob(i / len(pts)) + rnd.uniform(-0.25, 0.25)
        out.append((x + nx * o, y + ny * o, nx, ny))
    line = [(x, y) for x, y, _, _ in out]
    n0 = (out[0][2], out[0][3]); n1 = (out[-1][2], out[-1][3])

    # side A of the fold: a soft shadow; side B: a faint sheen
    A = Image.new("L", (W, H), 0)
    far = 3000
    poly = line + [(line[-1][0] + n1[0] * far, line[-1][1] + n1[1] * far), (line[0][0] + n0[0] * far, line[0][1] + n0[1] * far)]
    ImageDraw.Draw(A).polygon(poly, fill=255)
    bA = A.filter(ImageFilter.GaussianBlur(13))
    shadow = ImageChops.multiply(ImageChops.invert(bA), A)
    sheen = ImageChops.multiply(bA, ImageChops.invert(A))

    # the fold line and the cracked ink, both coming and going along the length
    core = Image.new("L", (W, H), 0); dc = ImageDraw.Draw(core)
    crack = Image.new("L", (W, H), 0); dk = ImageDraw.Draw(crack)
    inten = wave(rnd, [(1.2, 0.35), (3, 0.2), (7, 0.12)])
    cr = wave(rnd, [(4, 0.5), (9, 0.35), (17, 0.25)])
    N = len(out)
    for i in range(N - 1):
        t = i / N
        v = max(0.15, min(1, 0.7 + inten(t)))
        (x0, y0, nx, ny), (x1, y1, _, _) = out[i], out[i + 1]
        dc.line([(x0, y0), (x1, y1)], fill=int(255 * v), width=2)
        c = cr(t)
        if c > 0.05:
            k = min(1, (c - 0.05) * 2.2)
            dk.line([(x0 - nx * 1.4, y0 - ny * 1.4), (x1 - nx * 1.4, y1 - ny * 1.4)], fill=int(255 * k), width=1)

    # a few small wrinkles running off the fold at shallow angles
    for _ in range(wrinkles):
        i = rnd.randrange(N // 8, N - N // 8)
        x, y, nx, ny = out[i]
        tx, ty = ny, -nx                                   # along the fold
        side = rnd.choice((-1, 1)); ang = math.radians(rnd.uniform(18, 40)) * side
        dx, dy = tx * math.cos(ang) - ty * math.sin(ang), tx * math.sin(ang) + ty * math.cos(ang)
        if rnd.random() < 0.5: dx, dy = -dx, -dy
        L = rnd.uniform(0.04, 0.11) * H
        seg = []
        for s in range(13):
            q = s / 12
            seg.append((x + dx * L * q + rnd.uniform(-0.6, 0.6), y + dy * L * q + rnd.uniform(-0.6, 0.6)))
        for s in range(12):
            fade = 1 - s / 12
            dc.line([seg[s], seg[s + 1]], fill=int(110 * fade), width=1)
            if s % 3 != 2: dk.line([(seg[s][0] + 1, seg[s][1]), (seg[s + 1][0] + 1, seg[s + 1][1])], fill=int(120 * fade), width=1)

    core = core.filter(ImageFilter.GaussianBlur(0.7))
    crack = crack.filter(ImageFilter.GaussianBlur(0.45))

    def lay(color, alpha):
        im = Image.new("RGBA", (W, H), color + (0,)); im.putalpha(alpha); return im

    a_dark = Image.eval(ImageChops.add(shadow.point(lambda v: v * 0.24 * strength), core.point(lambda v: v * 0.5 * strength)), lambda v: min(255, v))
    a_light = Image.eval(ImageChops.add(sheen.point(lambda v: v * 0.15 * strength), crack.point(lambda v: v * 0.9 * strength)), lambda v: min(255, v))
    return Image.alpha_composite(lay(DARK, a_dark), lay(LIGHT, a_light))


E = 30   # endpoints start a little off the card so the fold runs right out at the edges
VARIANTS = [
    dict(p0=(-E, H * 0.46), p1=(W + E, H * 0.50)),                          # across the middle
    dict(p0=(-E, H * 0.63), p1=(W + E, H * 0.57), kink=(W * 0.55, H * 0.61)),  # across, lower, with a bend
    dict(p0=(W * 0.44, -E), p1=(W * 0.52, H + E)),                          # down the middle
    dict(p0=(W * 0.22, -E), p1=(W * 0.80, H + E)),                          # steep diagonal
    dict(p0=(-E, H * 0.18), p1=(W + E, H * 0.78), kink=(W * 0.48, H * 0.50)),  # long diagonal, slight bend
    dict(p0=(W * 0.30, -E), p1=(-E, H * 0.24), wrinkles=2),                 # a corner once bent over
    dict(p0=(W * 0.42, -E), p1=(-E, H * 0.30), wrinkles=2),                 # a bigger corner
    dict(p0=(-E, H * 0.36), p1=(W + E, H * 0.33), kink=(W * 0.35, H * 0.37), strength=0.8),  # a faint one
]

if __name__ == "__main__":
    import os, sys
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "img")
    for n, v in enumerate(VARIANTS):
        im = crease(1000 + n * 17, **v)
        im.save(os.path.join(out_dir, f"crease-{n}.webp"), "WEBP", quality=88, method=6)
    print("made", len(VARIANTS))

# Draws the ink-wear overlays for the Infernal card fronts (img/wear-0..5.webp): patches where the ink has
# been rubbed back to the paper (granular, not smooth, and heavier towards the edges and corners where fingers
# hold a card), fine scratches, and pin-prick pits. Everything is in light parchment tones; the game lays it
# over the art with a "lighten" blend, so dark ink wears back to the paper while bare parchment hardly changes.
# Sized to the art panel inside the card (.inf-court). The game flips each one, so 6 give 24 looks.
import math, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

W, H = 300, 430


def noise(rnd, cells_x, blur=0):
    """smooth random field: a small grid of random values, enlarged smoothly to full size"""
    cy = max(2, round(cells_x * H / W))
    small = Image.new("L", (cells_x + 2, cy + 2))
    small.putdata([rnd.randrange(256) for _ in range((cells_x + 2) * (cy + 2))])
    big = small.resize((W + 2 * W // cells_x, H + 2 * H // cy), Image.BICUBIC)
    big = big.crop((W // cells_x, H // cy, W // cells_x + W, H // cy + H))
    return big.filter(ImageFilter.GaussianBlur(blur)) if blur else big


def edge_weight():
    """0 in the middle of the panel, rising to 1 at the edges, more at the corners"""
    im = Image.new("L", (W, H)); px = im.load()
    for y in range(H):
        for x in range(W):
            ex = min(x, W - 1 - x) / (W / 2); ey = min(y, H - 1 - y) / (H / 2)
            e = min(ex, ey); c = (1 - ex) * (1 - ey)
            px[x, y] = int(255 * min(1, (1 - e) ** 3 * 0.9 + c ** 2 * 0.8))
    return im


EDGE = edge_weight()


def wear(seed):
    rnd = random.Random(seed)
    # rubbed patches: two scales of smooth noise, pushed up near the edges, then cut off sharply so only the
    # high spots wear, and broken up with fine grain so the ink looks flaked rather than wiped
    n = ImageChops.add(noise(rnd, 7).point(lambda v: v * 0.65), noise(rnd, 18).point(lambda v: v * 0.35))
    n = ImageChops.add(n, EDGE.point(lambda v: v * 0.45))
    patches = n.point(lambda v: max(0, min(255, (v - 178) * 4)))
    grain = noise(rnd, 190).point(lambda v: 255 if v > 120 else int(v * 0.8))
    patches = ImageChops.multiply(patches, grain).filter(ImageFilter.GaussianBlur(0.5))

    # scratches: thin, slightly bent, broken lines
    scr = Image.new("L", (W, H), 0); d = ImageDraw.Draw(scr)
    for _ in range(rnd.randint(7, 13)):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        ang = rnd.uniform(0, math.pi); bend = rnd.uniform(-0.01, 0.01)
        L = rnd.uniform(18, 130); a = rnd.randint(110, 230)
        for s in range(int(L / 3)):
            nx, ny = x + math.cos(ang) * 3, y + math.sin(ang) * 3
            if rnd.random() > 0.18: d.line([(x, y), (nx, ny)], fill=a, width=1)
            x, y, ang = nx, ny, ang + bend
    scr = scr.filter(ImageFilter.GaussianBlur(0.35))

    # pits: pin-pricks where the surface has gone
    pit = Image.new("L", (W, H), 0); d = ImageDraw.Draw(pit)
    for _ in range(rnd.randint(90, 160)):
        x, y, r = rnd.uniform(0, W), rnd.uniform(0, H), rnd.choice((0.6, 0.8, 1.2))
        d.ellipse([x - r, y - r, x + r, y + r], fill=rnd.randint(140, 255))

    alpha = ImageChops.lighter(ImageChops.lighter(patches, scr), pit)
    # the colour: light parchment, a little uneven so a worn patch isn't one flat tone
    tone = noise(rnd, 40)
    r = tone.point(lambda v: 226 + v * 22 // 255); g = tone.point(lambda v: 204 + v * 20 // 255); b = tone.point(lambda v: 152 + v * 26 // 255)
    out = Image.merge("RGBA", (r, g, b, alpha))
    return out


if __name__ == "__main__":
    import os, sys
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "img")
    for n in range(6):
        wear(500 + n * 31).save(os.path.join(out_dir, f"wear-{n}.webp"), "WEBP", quality=85, method=6)
    print("made 6")

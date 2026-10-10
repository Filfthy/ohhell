# Aged parchment edges: a crisp, uneven browned band with blotchy grime, specks and stains.
import random
from PIL import Image, ImageDraw, ImageFilter, ImageChops
def cloud(size, cell, rnd):
    w, h = size[0] // cell + 3, size[1] // cell + 3
    small = Image.new('L', (w, h)); small.putdata([int(rnd.random() * 255) for _ in range(w * h)])
    return small.resize((w * cell, h * cell), Image.BICUBIC).crop((cell, cell, cell + size[0], cell + size[1]))
def edge(size, inset, blur):
    m = Image.new('L', size, 0); ImageDraw.Draw(m).rounded_rectangle((inset, inset, size[0] - inset - 1, size[1] - inset - 1), radius=inset * 2, fill=255)
    return ImageChops.invert(m.filter(ImageFilter.GaussianBlur(blur)))
def aged(img, seed=3):
    rnd = random.Random(seed); W, H = img.size; k = W / 300
    # grime: three scales of noise mixed, contrast pushed so it's blotchy rather than smooth
    n = ImageChops.add(ImageChops.multiply(cloud(img.size, int(40 * k), rnd), Image.new('L', img.size, 160)),
                       ImageChops.multiply(cloud(img.size, int(12 * k), rnd), Image.new('L', img.size, 95)))
    n = ImageChops.add(n, ImageChops.multiply(cloud(img.size, max(2, int(3 * k)), rnd), Image.new('L', img.size, 60)))
    n = n.point(lambda v: max(0, min(255, int((v - 110) * 1.9 + 128))))
    # the band: narrower and crisper than before, its inner edge made uneven by the noise
    band = edge(img.size, int(11 * k), 5 * k)
    band = ImageChops.multiply(band, n.point(lambda v: 40 + v * 215 // 255))
    band = band.point(lambda v: min(255, int(v * 1.45)))
    rim = edge(img.size, int(3 * k), 1.6 * k)
    warm = ImageChops.multiply(img, Image.new('RGB', img.size, (214, 150, 92)))
    out = Image.composite(warm, img, band)
    deep = ImageChops.multiply(img, Image.new('RGB', img.size, (150, 88, 44)))
    out = Image.composite(deep, out, ImageChops.multiply(edge(img.size, int(5 * k), 2.2 * k), n.point(lambda v: 70 + v * 185 // 255)))
    # small warm stains near the edges, and dark specks, thicker towards the edges
    d = Image.new('L', img.size, 0); dr = ImageDraw.Draw(d)
    for _ in range(9):
        side = rnd.randrange(4); t = rnd.random(); inn = (4 + rnd.random() * 22) * k
        x, y = [(t * W, inn), (t * W, H - inn), (inn, t * H), (W - inn, t * H)][side]
        r = (5 + rnd.random() * 12) * k
        dr.ellipse((x - r, y - r * 0.75, x + r, y + r * 0.75), fill=int(60 + rnd.random() * 60))
    d = d.filter(ImageFilter.GaussianBlur(3.5 * k))
    sp = Image.new('L', img.size, 0); sd = ImageDraw.Draw(sp)
    for _ in range(int(900 * k * k)):
        x, y = rnd.random() * W, rnd.random() * H
        dist = min(x, y, W - x, H - y) / W
        if rnd.random() > (0.5 if dist < 0.05 else 0.22 if dist < 0.12 else 0.03): continue
        r = (0.35 + rnd.random() ** 3 * 1.6) * k
        sd.ellipse((x - r, y - r, x + r, y + r), fill=int(110 + rnd.random() * 140))
    d = ImageChops.lighter(d, sp.filter(ImageFilter.GaussianBlur(0.35 * k)))
    dirt = ImageChops.multiply(out, Image.new('RGB', img.size, (120, 72, 36)))
    return Image.composite(dirt, out, d)

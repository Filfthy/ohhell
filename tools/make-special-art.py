"""Turn a piece of special-card artwork (PNG/JPG/WEBP) into a card face that
sits with the Goodall court cards.

    python tools/make-special-art.py SUN    special/art/sun-art.webp
    python tools/make-special-art.py MOON   special/art/moon-art.webp
    python tools/make-special-art.py DRAGON special/art/dragon-art.webp
    python tools/make-special-art.py JOKER  special/art/joker-art.png

Options:
    --no-mirror      use the picture as drawn (don't rebuild the bottom half)
    --keep-colours   don't map colours to the court palette
    --size=0.92      how much of the card height the figure may use
    --icon=x0,y0,x1,y1
                     instead of the card, make the corner symbol
                     (special/icon-<ROLE>.svg) from that box of the picture,
                     e.g. the dragon's head:
                     python tools/make-special-art.py DRAGON special/art/dragon-art.webp --icon=350,40,785,292

Corner indices from one sheet (symbols left to right: Sun, Moon, Dragon, Joker):
    python tools/make-special-art.py --indices special/art/indices.webp

Roles: SUN, MOON, DRAGON, JOKER.  Writes special/<ROLE>.svg (a whole card face:
the court frame line with the figure drawn over it). Corner icons are separate.

What it does:
  * finds the figure (ignores the plain paper around it),
  * rebuilds it as a true double-ended card: the TOP half is kept and a copy
    rotated 180 degrees replaces the bottom half,
  * recolours it to the court palette (court blue, gold, red, black, cream)
    and turns thin black outlines into the courts' blue line work, keeping
    solid black areas black,
  * makes the surrounding paper transparent (enclosed whites stay solid),
  * draws the court frame line and puts the figure in front of it, larger than
    the frame, so it breaks out of the frame instead of being squeezed in,
  * embeds it as WEBP so the card is one self-contained file.
"""
import base64
import colorsys
import io
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "special")
ROLES = ("SUN", "MOON", "DRAGON", "JOKER")

CREAM = (0xfd, 0xf6, 0xe3)                 # court card paper (enclosed whites)

# The court palette (RevK Goodall art): paper, blue, gold, red, black.
COURT_BLUE = (0x44, 0x44, 0xFF)
COURT_GOLD = (0xFF, 0xCC, 0x44)
COURT_RED = (0xFF, 0x00, 0x00)
INK = (0, 0, 0)
PAPER = (255, 255, 255)
PALETTE = [PAPER, COURT_BLUE, COURT_GOLD, COURT_RED, INK]

# Whole card in RevK units, and the court frame line inside it.
CARD_X, CARD_Y, CARD_W, CARD_H = -120, -168, 240, 336
FRAME = '<rect x="-81.4" y="-129.4" width="162.8" height="258.8" fill="none" stroke="#44F" stroke-width="2"/>'
# The game draws cards 60x90 (2:3); RevK cards are 240x336, so the SVG is
# squashed horizontally by this much when shown. Pre-stretch the art to suit.
SQUASH = (60 / 90) / (CARD_W / CARD_H)

DEFAULT_SIZE = 0.92
MAX_PX_H = 1100


def content_box(img, tolerance=28):
    rgb = img.convert("RGB")
    bg = Image.new("RGB", rgb.size, rgb.getpixel((0, 0)))
    diff = ImageChops.difference(rgb, bg).convert("L").point(lambda v: 255 if v > tolerance else 0)
    return diff.getbbox() or (0, 0, img.width, img.height)


def whiten_paper(img):
    rgb = img.convert("RGB")
    paper = rgb.getpixel((0, 0))
    bands = [band.point(lambda v, p=max(p, 1): min(255, round(v * 255 / p)))
             for band, p in zip(rgb.split(), paper)]
    return Image.merge("RGB", bands)


def find_centre(rgb, box):
    """The point the double-ended design turns about: where the band above
    best matches the band below rotated 180 degrees. (The middle of the
    picture is often off, e.g. a crest reaching higher at the top.)"""
    l, t, r, b = box
    scale = 4
    small = rgb.convert("L").resize((rgb.width // scale, rgb.height // scale))
    L, T, R, B = (v // scale for v in box)
    bw = (R - L) // 2 - 2           # half width of the compared band
    bh = max(8, (B - T) // 8)       # height of the compared band
    best = None
    for cy in range((T + B) // 2 - (B - T) // 8, (T + B) // 2 + (B - T) // 8 + 1):
        for cx in range((L + R) // 2 - 8, (L + R) // 2 + 9):
            if cx - bw < 0 or cx + bw > small.width or cy - bh < 0 or cy + bh > small.height:
                continue
            above = small.crop((cx - bw, cy - bh, cx + bw, cy))
            below = small.crop((cx - bw, cy, cx + bw, cy + bh)).rotate(180)
            diff = ImageStat.Stat(ImageChops.difference(above, below)).mean[0]
            if best is None or diff < best[0]:
                best = (diff, cx, cy)
    if best is None:
        return (l + r) / 2, (t + b) / 2
    return best[1] * scale + scale / 2, best[2] * scale


def isolate_figure(img, mirror=True):
    """Crop to the figure. With mirror=True, keep the top half and use a copy
    rotated 180 degrees (about the figure's centre) as the bottom half."""
    rgb = img.convert("RGB")
    paper = rgb.getpixel((0, 0))
    l, t, r, b = content_box(rgb)
    if not mirror:
        m = 4
        return rgb.crop((max(0, l - m), max(0, t - m), min(rgb.width, r + m), min(rgb.height, b + m)))

    cx, cy = find_centre(rgb, (l, t, r, b))
    half_w = int(max(cx - l, r - cx)) + 4
    top_h = int(cy - t) + 4
    x0, y0 = int(round(cx)) - half_w, int(round(cy)) - top_h
    top = Image.new("RGB", (2 * half_w, top_h), paper)
    top.paste(rgb.crop((x0, y0, x0 + 2 * half_w, y0 + top_h)), (0, 0))
    out = Image.new("RGB", (2 * half_w, 2 * top_h), paper)
    out.paste(top, (0, 0))
    out.paste(top.rotate(180), (0, top_h))
    return out


def court_colour(r, g, b):
    """Classify a colour (0..1 floats) into the court palette by HUE first, so
    dark navy is still blue and dark crimson still red; only near-black and
    grey shadows become black."""
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    h *= 360
    if v < 0.20:
        return INK
    if s < 0.22:                      # greys / whites
        return PAPER if v > 0.62 else INK
    if h < 22 or h >= 330:
        return COURT_RED
    if h < 75:                        # orange -> yellow
        return COURT_GOLD if (h >= 32 or v > 0.85) else COURT_RED
    if h < 165:                       # greens (no green in the court palette)
        return INK if v < 0.55 else COURT_BLUE
    return COURT_BLUE                 # cyan .. blue .. purple


_COURT_LUT = None


def _court_lut():
    global _COURT_LUT
    if _COURT_LUT is None:
        _COURT_LUT = ImageFilter.Color3DLUT.generate(
            65, lambda r, g, b: tuple(c / 255 for c in court_colour(r, g, b)))
    return _COURT_LUT


def to_court_palette(img):
    """Map every pixel to a court colour (by hue), then turn thin black
    lines into court-blue line work (solid black areas stay black)."""
    pal = Image.new("P", (1, 1))
    flat = [c for rgb in PALETTE for c in rgb]
    pal.putpalette(flat + [0] * (768 - len(flat)))
    classified = img.convert("RGB").filter(_court_lut())
    # the LUT interpolates between grid points: snap to exact palette colours
    q = classified.quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")

    black = ImageChops.difference(q, Image.new("RGB", q.size, INK)).convert("L").point(lambda v: 255 if v < 8 else 0)
    k = max(5, (round(q.width * 0.024) // 2) * 2 + 1)
    cores = black.filter(ImageFilter.MinFilter(k))
    grown = cores.filter(ImageFilter.MaxFilter(k + 6))
    solid = ImageChops.multiply(black, grown)
    thin = ImageChops.subtract(black, solid)
    return Image.composite(Image.new("RGB", q.size, COURT_BLUE), q, thin)


def paper_to_alpha(img):
    """Paper connected to the edge of the picture becomes transparent;
    white enclosed by the figure (ermine, hands, eyes) becomes court cream."""
    rgb = img.convert("RGB")
    white = ImageChops.difference(rgb, Image.new("RGB", rgb.size, PAPER)).convert("L").point(lambda v: 255 if v < 8 else 0)
    w, h = white.size
    px = white.load()
    border = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + \
             [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    for pt in border:
        if px[pt] == 255:
            ImageDraw.floodfill(white, pt, 128)
    outside = white.point(lambda v: 255 if v == 128 else 0)
    alpha = ImageChops.invert(outside)
    inside_white = white.point(lambda v: 255 if v == 255 else 0)
    rgb = Image.composite(Image.new("RGB", rgb.size, CREAM), rgb, inside_white)
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def build(role, src, mirror=True, keep_colours=False, size=DEFAULT_SIZE):
    role = role.upper()
    if role not in ROLES:
        sys.exit(f"Unknown role {role}; use one of {', '.join(ROLES)}")

    img = isolate_figure(whiten_paper(Image.open(src)), mirror=mirror)
    if not keep_colours:
        img = to_court_palette(img)
    img = paper_to_alpha(img)
    if img.height > MAX_PX_H:
        img = img.resize((round(img.width * MAX_PX_H / img.height), MAX_PX_H), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=88, method=6)
    data = base64.b64encode(buf.getvalue()).decode("ascii")

    # Size the figure: up to `size` of the card height (and width), keeping its
    # true proportions once the card squash is applied.
    aspect = img.width / img.height
    h = CARD_H * size
    w = aspect * h / SQUASH
    if w > CARD_W * size:
        w = CARD_W * size
        h = w * SQUASH / aspect
    x, y = -w / 2, -h / 2

    svg = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<!-- Oh Hell extended deck: {role}. Artwork imported from {os.path.basename(src)} '
        'with tools/make-special-art.py -->\n'
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'viewBox="{CARD_X} {CARD_Y} {CARD_W} {CARD_H}" preserveAspectRatio="none">'
        f'{FRAME}'
        f'<image x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" preserveAspectRatio="none" '
        f'xlink:href="data:image/webp;base64,{data}"/>'
        '</svg>\n'
    )
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, f"{role}.svg")
    with open(out, "w", encoding="utf-8") as f:
        f.write(svg)
    print(f"{role}: {img.width}x{img.height}px art -> {out} ({len(svg) // 1024} KB)")
    return img


def build_icon(role, src, box, px_w=240):
    """Corner symbol cut from the artwork (same palette, transparent paper)."""
    role = role.upper()
    img = whiten_paper(Image.open(src)).crop(box)
    img = to_court_palette(img)
    # At icon size solid black shading reads as blots: draw it all as blue line.
    ink = ImageChops.difference(img, Image.new("RGB", img.size, INK)).convert("L").point(lambda v: 255 if v < 8 else 0)
    img = Image.composite(Image.new("RGB", img.size, COURT_BLUE), img, ink)
    img = paper_to_alpha(img)
    img = img.crop(img.getbbox())
    img = img.resize((px_w, round(img.height * px_w / img.width)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=90, method=6)
    data = base64.b64encode(buf.getvalue()).decode("ascii")
    svg = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<!-- Oh Hell extended deck: corner symbol for {role}, cut from {os.path.basename(src)} -->\n'
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'viewBox="0 0 {img.width} {img.height}">'
        f'<image x="0" y="0" width="{img.width}" height="{img.height}" '
        f'xlink:href="data:image/webp;base64,{data}"/></svg>\n'
    )
    out = os.path.join(OUT_DIR, f"icon-{role}.svg")
    with open(out, "w", encoding="utf-8") as f:
        f.write(svg)
    print(f"icon-{role}: {img.width}x{img.height}px -> {out} ({len(svg) // 1024} KB)")
    return img


def index_colours(img):
    """Snap colours to the court palette but keep black outlines black
    (at index size the outline is what makes the symbol readable)."""
    pal = Image.new("P", (1, 1))
    flat = [c for rgb in PALETTE for c in rgb]
    pal.putpalette(flat + [0] * (768 - len(flat)))
    return img.convert("RGB").filter(_court_lut()).quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")


def build_indices(src, roles=ROLES, px=256, gap=12):
    """Split a sheet of symbols (left to right, in `roles` order) into the
    corner indices special/icon-<ROLE>.svg, each centred in a square."""
    rgb = whiten_paper(Image.open(src))
    mask = ImageChops.difference(rgb, Image.new("RGB", rgb.size, PAPER)).convert("L").point(lambda v: 255 if v > 40 else 0)
    cols = mask.resize((mask.width, 1), Image.BOX).load()
    runs, start, last = [], None, None
    for x in range(mask.width):
        if cols[x, 0] > 0:
            if start is None:
                start = x
            elif x - last > gap:
                runs.append((start, last))
                start = x
            last = x
    if start is not None:
        runs.append((start, last))
    if len(runs) != len(roles):
        sys.exit(f"Found {len(runs)} symbols in {src}, expected {len(roles)}: {runs}")

    out_imgs = {}
    for role, (x0, x1) in zip(roles, runs):
        t = mask.crop((x0, 0, x1 + 1, mask.height)).getbbox()
        pad = 8
        box = (max(0, x0 - pad), max(0, t[1] - pad), min(rgb.width, x1 + 1 + pad), min(rgb.height, t[3] + pad))
        sym = paper_to_alpha(index_colours(rgb.crop(box)))
        sym = sym.crop(sym.getbbox())
        side = max(sym.size)
        square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        square.paste(sym, ((side - sym.width) // 2, (side - sym.height) // 2))
        square = square.resize((px, px), Image.LANCZOS)
        buf = io.BytesIO()
        square.save(buf, "WEBP", quality=92, method=6)
        data = base64.b64encode(buf.getvalue()).decode("ascii")
        svg = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<!-- Oh Hell extended deck: corner index for {role}, from {os.path.basename(src)} -->\n'
            '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            f'viewBox="0 0 {px} {px}"><image x="0" y="0" width="{px}" height="{px}" '
            f'xlink:href="data:image/webp;base64,{data}"/></svg>\n'
        )
        out = os.path.join(OUT_DIR, f"icon-{role}.svg")
        with open(out, "w", encoding="utf-8") as f:
            f.write(svg)
        print(f"icon-{role}: symbol {sym.width}x{sym.height}px from x={x0}..{x1} -> {out} ({len(svg) // 1024} KB)")
        out_imgs[role] = square
    return out_imgs


if __name__ == "__main__":
    if "--indices" in sys.argv:
        srcs = [a for a in sys.argv[1:] if not a.startswith("--")]
        if len(srcs) != 1:
            sys.exit(__doc__)
        build_indices(srcs[0])
        sys.exit(0)
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 2:
        sys.exit(__doc__)
    size = DEFAULT_SIZE
    for a in sys.argv[1:]:
        if a.startswith("--size="):
            size = float(a.split("=", 1)[1])
        if a.startswith("--icon="):
            box = tuple(int(v) for v in a.split("=", 1)[1].split(","))
            build_icon(args[0], args[1], box)
            sys.exit(0)
    build(args[0], args[1], mirror="--no-mirror" not in sys.argv,
          keep_colours="--keep-colours" in sys.argv, size=size)

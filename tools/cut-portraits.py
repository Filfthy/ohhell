# Cuts the opponent portraits out of infernal/infernal-opponents-sheet-1/2.png (4 x 2 grids, transparent
# backgrounds) into img/opp-<name>.webp, keeping only each portrait's own shape: thin slivers of the
# neighbouring portraits that cross into a cell are dropped.
from PIL import Image

NAMES = [["lilith", "persephone", "lamia", "loki", "old-nick", "bub", "cerberus", "brimstone"],
         ["hellga", "davy-jones", "banshee", "faust", "morgana", "jezebel", "player"]]


def keep_portrait(c):
    """Keep the portrait's own shape: the biggest connected patch, plus any bits wholly inside the cell.
    Anything else that touches the cell's edge is a sliver of a neighbour and is cleared."""
    w, h = c.size; a = c.getchannel("A"); px = a.load()
    seen = bytearray(w * h); comps = []
    for y0 in range(h):
        for x0 in range(w):
            if seen[y0 * w + x0] or px[x0, y0] <= 24: continue
            stack = [(x0, y0)]; seen[y0 * w + x0] = 1; pts = []; edge = False
            while stack:
                x, y = stack.pop(); pts.append((x, y))
                if x in (0, w - 1) or y in (0, h - 1): edge = True
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny] > 24:
                        seen[ny * w + nx] = 1; stack.append((nx, ny))
            comps.append((len(pts), edge, pts))
    comps.sort(key=lambda t: -t[0])
    out = Image.new("L", (w, h), 0); op = out.load()
    for i, (n, edge, pts) in enumerate(comps):
        if i == 0 or not edge:
            for x, y in pts: op[x, y] = 255
    # keep the soft edge: the original alpha, wherever it is within a pixel of what was kept
    from PIL import ImageFilter, ImageChops
    keep = out.filter(ImageFilter.MaxFilter(3))
    c.putalpha(ImageChops.multiply(a, keep))
    # a thin line along the top (the bottom edge of the portrait above, touching a crown or hood): a band of
    # wide rows at the very top that suddenly narrows; drop it, and one row more for its soft edge
    a = c.getchannel("A"); px = a.load()
    rows = [sum(1 for x in range(w) if px[x, y] > 60) for y in range(h)]
    cut = 0
    for y in range(1, h // 20):
        if rows[y - 1] > w * 0.3 and rows[y] < rows[y - 1] * 0.5: cut = y + 1
    if cut: c.paste((0, 0, 0, 0), (0, 0, w, cut))
    return c.crop(c.getchannel("A").getbbox())


def longest_run(flags):
    best, cur, start, bs = 0, 0, 0, 0
    for i, f in enumerate(flags + [False]):
        if f:
            if not cur: start = i
            cur += 1
        else:
            if cur > best: best, bs = cur, start
            cur = 0
    return bs, bs + best


for s, names in enumerate(NAMES):
    sheet = Image.open(f"infernal/infernal-opponents-sheet-{s + 1}.png").convert("RGBA")
    cw, ch = sheet.width // 4, sheet.height // 2
    for i, n in enumerate(names):
        c = sheet.crop(((i % 4) * cw, (i // 4) * ch, (i % 4 + 1) * cw, (i // 4 + 1) * ch))
        c = keep_portrait(c)
        side = max(c.size)
        sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        sq.paste(c, ((side - c.width) // 2, side - c.height))      # sitting on the bottom edge
        sq.resize((240, 240), Image.LANCZOS).save(f"img/opp-{n}.webp", "WEBP", quality=86, method=6)
        print(n, c.size)

# Old Nick also comes in three views (looking left, ahead, right): img/opp-old-nick-l/c/r.webp. The game
# shows whichever looks in towards the middle from his seat, instead of mirroring the single portrait.
sheet = Image.open("infernal/old-nick-three-views.png").convert("RGBA")
cw = sheet.width // 3
for i, v in enumerate("lcr"):
    c = keep_portrait(sheet.crop((i * cw, 0, (i + 1) * cw, sheet.height)))
    side = max(c.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(c, ((side - c.width) // 2, side - c.height))
    sq.resize((240, 240), Image.LANCZOS).save(f"img/opp-old-nick-{v}.webp", "WEBP", quality=86, method=6)
    print("old-nick", v, c.size)

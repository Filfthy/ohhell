# Cuts the opponent portraits out of the sheets in infernal/ (see SHEETS below; transparent backgrounds) into
# img/opp-<name>.webp, keeping only each portrait's own shape: thin slivers of the neighbouring portraits that cross
# into a cell are dropped.
from PIL import Image, ImageChops

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


def sheet_masks(sheet, cols, rows):
    """Which pixels belong to which portrait, following the drawings rather than the grid: every connected
    piece of the sheet goes to the cell holding most of it, so hair that strays over a grid line stays with its
    owner. (A piece that really spans two portraits - joined where they touch - is split along the grid.)"""
    from PIL import ImageFilter
    w, h = sheet.size; cw, ch = w // cols, h // rows
    a = sheet.getchannel("A"); px = a.load()
    label = [0] * (w * h); comps = [None]; sizes = [0]; seeds = [None]
    for y0 in range(h):
        for x0 in range(w):
            if label[y0 * w + x0] or px[x0, y0] <= 100: continue
            cid = len(comps); label[y0 * w + x0] = cid; stack = [(x0, y0)]; cells = {}
            while stack:
                x, y = stack.pop()
                cell = min(cols - 1, x // cw) + cols * min(rows - 1, y // ch); cells[cell] = cells.get(cell, 0) + 1
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not label[ny * w + nx] and px[nx, ny] > 100:
                        label[ny * w + nx] = cid; stack.append((nx, ny))
            ranked = sorted(cells.items(), key=lambda t: -t[1])
            split = len(ranked) > 1 and ranked[1][1] > 0.15 * ranked[0][1] and ranked[1][1] > 2000
            # a split piece is only shared among the portraits it really belongs to (cells holding a good part of it)
            comps.append([c for c, k in ranked if k > 2000] if split else ranked[0][0])
            sizes.append(sum(cells.values())); seeds.append((x0, y0))
    masks = [Image.new("L", (w, h), 0) for _ in range(cols * rows)]
    mpx = [m.load() for m in masks]
    # the figures themselves first; small loose bits (a stray lock of hair) wait
    small = {cid for cid in range(1, len(comps)) if sizes[cid] < 20000 and not isinstance(comps[cid], list)}
    def paint(only):
        for y in range(h):
            for x in range(w):
                cid = label[y * w + x]
                if not cid or (cid in small) != only: continue
                owner = comps[cid]
                if isinstance(owner, list):
                    cell = min(cols - 1, x // cw) + cols * min(rows - 1, y // ch)
                    if cell not in owner:   # the nearest of its own portraits' cells
                        def gap(c):
                            cx0, cy0 = (c % cols) * cw, (c // cols) * ch
                            return max(cx0 - x, 0, x - cx0 - cw) + max(cy0 - y, 0, y - cy0 - ch)
                        cell = min(owner, key=gap)
                    owner = cell
                mpx[owner][x, y] = 255
    paint(False)
    # each loose bit goes to the nearest figure: grow every figure outwards a step at a time, and a bit belongs
    # to whichever reaches it first
    grown = [m.copy() for m in masks]; pending = set(small)
    for _ in range(80):
        if not pending: break
        grown = [g.filter(ImageFilter.MaxFilter(3)) for g in grown]
        for cid in list(pending):
            for i, g in enumerate(grown):
                if g.getpixel(seeds[cid]):
                    comps[cid] = i; pending.discard(cid); break
    paint(True)
    # take in the soft edge round each shape (the faint pixels the cut above left out)
    return [m.filter(ImageFilter.MaxFilter(5)) for m in masks]


# each sheet: its file, its grid (columns, rows) and who is on it, left to right, top row first (None = not cut)
SHEETS = [("infernal/infernal-opponents-sheet-1.png", 4, 2, NAMES[0]),
          ("infernal/infernal-opponents-sheet-2.png", 4, 2, NAMES[1]),
          ("infernal/anubis-charon-hecate-ereshkigal-right.png", 4, 1, ["anubis", "charon", "hecate", "ereshkigal"]),
          ("infernal/ammit-kali-necro-tengu-right.png", 4, 1, ["ammit", "kali", None, None]),   # None: not used
          ("infernal/necro-right-v2.png", 1, 1, ["ronnie"]),   # The Necro(mancer)
          ("infernal/tengu-mask-right-v2.png", 1, 1, ["sojobo"])]   # king of the tengu
for path, cols, rows, names in SHEETS:
    sheet = Image.open(path).convert("RGBA")
    masks = sheet_masks(sheet, cols, rows)
    for i, n in enumerate(names):
        if not n: continue
        c = sheet.copy(); c.putalpha(ImageChops.multiply(sheet.getchannel("A"), masks[i]))
        c = c.crop(masks[i].getbbox())
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
# the old single Old Nick from sheet 1 is retired: his plain portrait is the new looking-right view too
Image.open("img/opp-old-nick-r.webp").save("img/opp-old-nick.webp", "WEBP", quality=86, method=6)

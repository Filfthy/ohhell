# Run from the Oh Hell folder: python tools/make-expr-sheet.py infernal/expressions/set-x-neutral.png name1,name2,...  (up to 8; old-nick-r for Old Nick)
# Lay 8 portraits (cut at full size from the original sheets) on a 4x2 sheet for expression edits.
import sys
from PIL import Image, ImageChops
src = open("tools/cut-portraits.py", encoding="utf-8").read()
exec(src[:src.index("# each sheet:")])
SHEETS = {"infernal/infernal-opponents-sheet-1.png": (4, 2, ["lilith", "persephone", "lamia", "loki", "old-nick", "bub", "cerberus", "brimstone"]),
          "infernal/infernal-opponents-sheet-2.png": (4, 2, ["hellga", "davy-jones", "banshee", "faust", "morgana", "jezebel", "player"]),
          "infernal/anubis-charon-hecate-ereshkigal-right.png": (4, 1, ["anubis", "charon", "hecate", "ereshkigal"]),
          "infernal/ammit-kali-necro-tengu-right.png": (4, 1, ["ammit", "kali", None, None])}
want = sys.argv[2].split(",")
cut = {}
# single portraits, and Old Nick's three views (left, ahead, right) side by side
for n, path in [("ronnie", "infernal/necro-right-v2.png"), ("sojobo", "infernal/sojobo-mask-right-v3.png")]:
    if n in want: cut[n] = keep_portrait(Image.open(path).convert("RGBA"))
if any(n.startswith("old-nick-") for n in want):
    sheet = Image.open("infernal/old-nick-three-views.png").convert("RGBA"); cw3 = sheet.width // 3
    for i, v in enumerate("lcr"):
        if "old-nick-" + v in want: cut["old-nick-" + v] = keep_portrait(sheet.crop((i * cw3, 0, (i + 1) * cw3, sheet.height)))
for path, (cols, rows, names) in SHEETS.items():
    if not any(n in want for n in names): continue
    sheet = Image.open(path).convert("RGBA"); masks = sheet_masks(sheet, cols, rows)
    for i, n in enumerate(names):
        if n not in want: continue
        c = sheet.copy(); c.putalpha(ImageChops.multiply(sheet.getchannel("A"), masks[i]))
        cut[n] = keep_portrait(c.crop(masks[i].getbbox()))
W, H, cols, rows = 1536, 1024, 4, 2
cw, ch = W // cols, H // rows
out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for k, n in enumerate(want):
    c = cut[n]; s = min((cw - 24) / c.width, (ch - 40) / c.height)
    c = c.resize((round(c.width * s), round(c.height * s)), Image.LANCZOS)
    x = (k % cols) * cw + (cw - c.width) // 2; y = (k // cols) * ch + ch - 8 - c.height   # each sits on its cell's floor
    out.alpha_composite(c, (x, y))
out.save(sys.argv[1])
print("ok", {n: cut[n].size for n in want})

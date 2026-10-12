# Run from the Oh Hell folder: python tools/pack-living.py
#
# Packs the moving portraits' frames (infernal/expressions/frames/) into living-data.js for living-portraits.js.
# Each portrait's neutral frame goes in whole; its blink, glance, happy and angry frames go in as just the patch that
# differs from it ({ src, x, y }) - the game lays the patch over the neutral when it loads. Everything outside a
# patch was the neutral's own pixels anyway (tools/expr-build.py), so nothing is lost but bytes.
import base64, io, json, os
from PIL import Image, ImageChops, ImageFilter

CAST = ["persephone", "lilith", "faust", "davy-jones", "bub", "cerberus", "anubis", "kali",
        "hellga", "jezebel", "morgana", "lamia", "loki", "hecate", "ereshkigal",
        "charon", "ammit", "brimstone", "ronnie", "sojobo", "old-nick"]      # (the Banshee is benched)
F = "infernal/expressions/frames/"
PAD = 4

def uri(img, q=88):
    b = io.BytesIO(); img.save(b, "WEBP", quality=q, method=6)
    return "data:image/webp;base64," + base64.b64encode(b.getvalue()).decode()

data = {}
for n in CAST:
    base = Image.open(F + n + ".webp").convert("RGBA")
    data[n] = uri(base)
    for v in ["blink", "glance", "happy", "angry"]:
        p = F + f"{n}-{v}.webp"
        if not os.path.exists(p): continue
        im = Image.open(p).convert("RGBA")
        # where it really differs (the two were compressed separately, so ignore the faint noise)
        d = ImageChops.difference(im, base).convert("L").filter(ImageFilter.GaussianBlur(1.5)).point(lambda q: 255 if q > 10 else 0)
        box = d.getbbox()
        if not box: continue
        x0, y0 = max(0, box[0] - PAD), max(0, box[1] - PAD)
        x1, y1 = min(im.width, box[2] + PAD), min(im.height, box[3] + PAD)
        data[f"{n}-{v}"] = {"src": uri(im.crop((x0, y0, x1, y1))), "x": x0, "y": y0}

with open("living-data.js", "w") as f:
    f.write("// living-data.js - the moving portraits' frames, for living-portraits.js (made by tools/pack-living.py):\n"
            "// <name> is the whole neutral portrait; <name>-blink/-glance/-happy/-angry are patches { src, x, y } laid over it.\n"
            "const LIVING_DATA = " + json.dumps(data) + ";\n")
print(len(data), "entries", os.path.getsize("living-data.js") // 1024, "KB")

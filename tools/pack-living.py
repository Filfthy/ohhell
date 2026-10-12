# Run from the Oh Hell folder: python tools/pack-living.py
#
# Packs the moving portraits' frames (infernal/expressions/frames/) into living-data.js for living-portraits.js.
# Each portrait's neutral frame goes in whole; its blink, glance, happy and angry frames go in as just the patch that
# differs from it ({ src, x, y }) - the game lays the patch over the neutral when it loads. Everything outside a
# patch was the neutral's own pixels anyway (tools/expr-build.py), so nothing is lost but bytes.
import base64, io, json, os
from PIL import Image, ImageChops, ImageFilter
import cv2, numpy as np      # (pip install opencv-python-headless numpy) - for the happy/angry morphs

FLOW_SIZE = 80     # the flow maps are smooth, so small: 80x80, stretched over the portrait

def flow_map(base, im):
    """Where each point of the neutral face moves to in the mood face (OpenCV's dense optical flow), kept to the
    part that changes and smoothed. Stored as a small lossless image: red/green = 128 + x/y movement / m * 127,
    m in fractions of the portrait's width."""
    a = cv2.cvtColor(np.array(base.convert("RGB")), cv2.COLOR_RGB2GRAY)
    b = cv2.cvtColor(np.array(im.convert("RGB")), cv2.COLOR_RGB2GRAY)
    a = cv2.GaussianBlur(a, (0, 0), 1.2); b = cv2.GaussianBlur(b, (0, 0), 1.2)
    f = cv2.calcOpticalFlowFarneback(a, b, None, 0.5, 4, 15, 4, 7, 1.5, 0)
    # only where the faces differ (dilated, feathered): everything else stays put
    d = np.abs(np.array(base.convert("RGB"), np.float32) - np.array(im.convert("RGB"), np.float32)).mean(2)
    mask = (cv2.GaussianBlur(d, (0, 0), 2) > 10).astype(np.float32)
    mask = cv2.dilate(mask, np.ones((13, 13), np.uint8)); mask = cv2.GaussianBlur(mask, (0, 0), 5)
    f = cv2.GaussianBlur(f, (0, 0), 3) * mask[..., None]
    f = cv2.resize(f, (FLOW_SIZE, FLOW_SIZE), interpolation=cv2.INTER_AREA)
    m = float(max(1.0, np.abs(f).max()))
    enc = np.clip(np.round(128 + f / m * 127), 0, 255).astype(np.uint8)
    img = Image.fromarray(np.dstack([enc[..., 0], enc[..., 1], np.full_like(enc[..., 0], 128), np.full_like(enc[..., 0], 255)]), "RGBA")
    out = io.BytesIO(); img.save(out, "PNG", optimize=True)
    return {"src": "data:image/png;base64," + base64.b64encode(out.getvalue()).decode(), "m": round(m / base.width, 5)}

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
        if v in ("happy", "angry"): data[f"{n}-{v}-flow"] = flow_map(base, im)
    # its depth map for head turns (tools/make-depth.py), if it has one: small, lossless
    dp = F + f"{n}-depth.png"
    if os.path.exists(dp):
        b = io.BytesIO(); Image.open(dp).convert("L").save(b, "PNG", optimize=True)
        data[f"{n}-depth"] = "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()

with open("living-data.js", "w") as f:
    f.write("// living-data.js - the moving portraits' frames, for living-portraits.js (made by tools/pack-living.py):\n"
            "// <name> is the whole neutral portrait; <name>-blink/-glance/-happy/-angry are patches { src, x, y } laid over it.\n"
            "const LIVING_DATA = " + json.dumps(data) + ";\n")
print(len(data), "entries", os.path.getsize("living-data.js") // 1024, "KB")

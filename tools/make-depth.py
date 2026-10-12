# Run from the Oh Hell folder: python tools/make-depth.py persephone,anubis,davy-jones [debug.png]
#
# Depth maps for the moving portraits' head turns (yaw): how near each pixel is, from an AI depth estimator
# (Depth Anything V2 small, via transformers; pip install torch transformers). Written to
# infernal/expressions/frames/<name>-depth.png (greyscale, white = near), at FRAME size, smoothed - the turn only
# needs the broad shape of the head, and fine detail in a depth map makes the picture ripple.
import sys
import numpy as np
from PIL import Image, ImageFilter
from transformers import pipeline

F = "infernal/expressions/frames/"
SIZE = 96
names = sys.argv[1].split(",")
est = pipeline("depth-estimation", model="depth-anything/Depth-Anything-V2-Small-hf")
rows = []
for n in names:
    im = Image.open(F + n + ".webp").convert("RGBA")
    alpha = np.array(im.getchannel("A"), np.float32) / 255
    # on a mid grey, at twice the size (the estimator likes more pixels)
    flat = Image.new("RGB", im.size, (110, 100, 95)); flat.paste(im, (0, 0), im)
    d = est(flat.resize((480, 480), Image.LANCZOS))["predicted_depth"]
    d = np.array(Image.fromarray(np.array(d.squeeze(), np.float32)).resize(im.size, Image.BILINEAR))
    # 0..1 over the figure (nearest = 1), the background as far as the figure's farthest point
    inside = alpha > 0.5
    lo, hi = np.percentile(d[inside], 2), np.percentile(d[inside], 99.5)
    d = np.clip((d - lo) / max(1e-6, hi - lo), 0, 1) * (alpha > 0.05)
    out = Image.fromarray((d * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(3)).resize((SIZE, SIZE), Image.LANCZOS)
    out.save(F + n + "-depth.png")
    rows.append((im, out))
    print(n, "ok")
if len(sys.argv) > 2:
    sheet = Image.new("RGB", (480, 240 * len(rows)), (30, 20, 16))
    for i, (im, d) in enumerate(rows):
        bg = Image.new("RGB", (240, 240), (30, 20, 16)); bg.paste(im, (0, 0), im); sheet.paste(bg, (0, i * 240))
        sheet.paste(d.resize((240, 240)).convert("RGB"), (240, i * 240))
    sheet.save(sys.argv[2])

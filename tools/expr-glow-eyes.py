# Run from infernal/: python ../tools/expr-glow-eyes.py <debug folder>  - blink/glance for a character with glowing eyes (written for Cerberus, cell 5 of set A)
# Cerberus: his glowing eyes go dark for a blink, and flare for a "glance". Only the glowing pixels change.
from PIL import Image, ImageChops, ImageFilter, ImageEnhance
import colorsys, sys
N = Image.open("expressions/set-a-neutral.png").convert("RGBA")
k = 5; box = ((k % 4) * 384, (k // 4) * 512, (k % 4) * 384 + 384, (k // 4) * 512 + 512)
a = N.crop(box); alpha = a.getchannel("A"); rgb = a.convert("RGB")
# glowing eye pixels: bright, orange-yellow, saturated - but only in the heads' upper part (not the collar studs)
m = Image.new("L", rgb.size, 0); mp = m.load(); px = rgb.load()
for y in range(150, 330):
    for x in range(rgb.width):
        r, g, b = px[x, y]
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if v > 0.62 and s > 0.55 and 0.04 < h < 0.16 and r > 170: mp[x, y] = 255
print("eye pixels", sum(1 for v in m.getdata() if v), m.getbbox())
m.save(sys.argv[1] + "/cerb_mask.png")
core = m.filter(ImageFilter.MaxFilter(5)); soft = core.filter(ImageFilter.GaussianBlur(2.5))
# blink: the glow goes out - eyes become the dark fur round them
dark = ImageEnhance.Brightness(ImageEnhance.Color(rgb).enhance(0.35)).enhance(0.22)
blink = Image.composite(dark, rgb, soft)
# glance: the glow flares (brighter, a soft halo)
hot = ImageEnhance.Brightness(rgb).enhance(1.45)
halo = core.filter(ImageFilter.GaussianBlur(6)).point(lambda v: min(255, v * 2))
glow = Image.new("RGB", rgb.size, (255, 150, 40))
flare = Image.composite(hot, rgb, soft)
flare = Image.composite(glow, flare, halo.point(lambda v: v * 0.45))
def save(img, path):
    c = img.copy(); c.putalpha(alpha); c = c.crop(alpha.getbbox())
    side = max(c.size); sq = Image.new("RGBA", (side, side), (0, 0, 0, 0)); sq.paste(c, ((side - c.width) // 2, side - c.height))
    sq.resize((240, 240), Image.LANCZOS).save(path, "WEBP", quality=88, method=6)
save(blink, "expressions/frames/cerberus-blink.webp"); save(flare, "expressions/frames/cerberus-glance.webp")
strip = Image.new("RGB", (900, 260), (30, 20, 16))
for i, im in enumerate([rgb, blink, flare]):
    c = im.crop((40, 140, 340, 400)); strip.paste(c, (i * 300, 0))
strip.save(sys.argv[1] + "/cerb_strip.png")

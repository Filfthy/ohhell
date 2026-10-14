// oh-cave.js - the "Cave" table (from Black Spider): the painting of a cobweb-choked cave (img/cave-bg.webp, from art/cave2.png).
//   - tiny spiders crawl over it all the time, only where there's something to walk on (rock, floor, web - never across
//     the dark void), bigger and quicker up close, smaller, slower and dimmer the deeper into the cave they go
//     (oh-cave-map.js: a walkable map and a depth map of the picture)
//   - now and then one lowers itself on a thread from the roof
//   - deep in the dark, the eyes of a giant spider queen glow; once in a long while the tips of her front legs reach
//     slowly out of the dark, feel about and draw back; when someone goes bust her eyes flare (CAVE.flare())
// Drawn on a canvas behind the table; it only runs while the Cave table is chosen, rests while the tab is hidden, and
// nothing moves for anyone who has asked their computer for reduced motion.

const CAVE = {
  canvas: null, ctx: null, cave: null, spiders: [], danglers: [], active: false, raf: 0, last: 0, W: 0, H: 0, dpr: 1,
  DARKEN: 0.6,     // how much of the picture's light is left after the darkening above (the spiders are lit to match)
  still: !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches),
  // the queen, in the picture's own pixels (1536 x 1024): where her eyes are, and how big
  QUEEN: { x: 1065, y: 395, size: 1 },
  // the stalactite tips that drip (picture coordinates): [x, y of the tip, y where the drop lands, lands in water]
  // (where each lands: the first ground below it at the same depth, from the depth map)
  DRIPS: [[575, 283, 693, false], [710, 297, 600, false], [814, 166, 615, false], [1050, 296, 705, true],
          [1236, 353, 725, true], [350, 146, 481, false]],

  setActive(on) {
    this.active = on;
    if (on && !this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.id = "cave-bg";
      this.canvas.setAttribute("aria-hidden", "true");
      document.body.insertBefore(this.canvas, document.body.firstChild);
      this.ctx = this.canvas.getContext("2d");
      window.addEventListener("resize", () => { if (this.active) this.build(); });
      document.addEventListener("visibilitychange", () => { if (this.active && !document.hidden) this.loop(); });
      this.unpackMap();
      this.queen = { t: 0, reach: 0, nextReach: 25 + Math.random() * 40, phase: "idle", flare: 0, blink: [], nextBlink: 3 };
    }
    if (!this.canvas) return;
    this.canvas.style.display = on ? "block" : "none";
    if (on) { this.build(); this.loop(); } else cancelAnimationFrame(this.raf);
  },

  // her eyes flare (someone has gone bust)
  flare() { if (this.queen) this.queen.flare = 1; },

  unpackMap() {
    if (typeof CAVE_MAP === "undefined") return;
    const bin = atob(CAVE_MAP.data), a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    this.map = { w: CAVE_MAP.w, h: CAVE_MAP.h, a };
    if (CAVE_MAP.light) {
      const lb = atob(CAVE_MAP.light), l = new Uint8Array(lb.length);
      for (let i = 0; i < lb.length; i++) l[i] = lb.charCodeAt(i);
      this.lmap = { w: CAVE_MAP.lw, h: CAVE_MAP.lh, l };
    }
  },
  // the light at a point on the screen: its colour (0-1 each) and brightness, as the picture shows it there
  lightAt(x, y) {
    const m = this.lmap; if (!m) return [0.3, 0.3, 0.3, 0.3];
    const f = this.f, u = Math.min(0.999, Math.max(0, (x - f.ox) / (f.iw * f.k))), v = Math.min(0.999, Math.max(0, (y - f.oy) / (f.ih * f.k)));
    const i = (Math.floor(v * m.h) * m.w + Math.floor(u * m.w)) * 3, r = m.l[i] / 255, g = m.l[i + 1] / 255, b = m.l[i + 2] / 255;
    return [r, g, b, (r + g + b) / 3];
  },
  // which way the light comes from at a point: towards where it's brighter (screen coordinates, unit length)
  lightDir(x, y) {
    const d = 18 * Math.min(this.W, this.H) / 900;
    const gx = this.lightAt(x + d, y)[3] - this.lightAt(x - d, y)[3], gy = this.lightAt(x, y + d)[3] - this.lightAt(x, y - d)[3];
    const l = Math.hypot(gx, gy);
    return l > 0.004 ? [gx / l, gy / l] : [-0.3, -0.95];    // (no clear direction: from above, a little left)
  },
  // the picture's placement on the screen (it covers the window, centred)
  fit() {
    const iw = 1536, ih = 1024, k = Math.max(this.W / iw, this.H / ih);
    return { k, ox: (this.W - iw * k) / 2, oy: (this.H - ih * k) / 2, iw, ih };
  },
  cell(x, y) {
    const m = this.map; if (!m) return 255;
    const f = this.f, u = (x - f.ox) / (f.iw * f.k), v = (y - f.oy) / (f.ih * f.k);
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0;
    return m.a[Math.floor(v * m.h) * m.w + Math.floor(u * m.w)];
  },
  walkable(x, y) { return (this.cell(x, y) & 1) === 1; },
  depth(x, y) { return (this.cell(x, y) & 0xFE) / 254; },     // 0 far .. 1 near

  // ---------------------------------------------------------------- the cave (drawn once per window size)
  build() {
    const W = window.innerWidth, H = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = W; this.H = H; this.dpr = dpr; this.f = this.fit();
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    if (!this.img) {
      this.img = new Image();
      this.img.onload = () => { if (this.active) this.build(); };
      this.img.src = "img/cave-bg.webp?v=2";
    }
    const out = document.createElement("canvas");
    out.width = this.canvas.width; out.height = this.canvas.height;
    const c = out.getContext("2d");
    c.scale(dpr, dpr);
    c.fillStyle = "#0a0806"; c.fillRect(0, 0, W, H);
    const im = this.img, f = this.f;
    if (im.complete && im.naturalWidth) c.drawImage(im, f.ox, f.oy, f.iw * f.k, f.ih * f.k);
    c.fillStyle = "rgba(0,0,0,0.4)"; c.fillRect(0, 0, W, H);
    const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.7)");
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    this.cave = out;
    // the light as it ends up on screen (after the darkening), at a quarter size, for lighting the spiders
    this.seen = null;
    try {
      const sw = Math.max(1, Math.round(W / 4)), sh = Math.max(1, Math.round(H / 4)), sc = document.createElement("canvas");
      sc.width = sw; sc.height = sh;
      const x = sc.getContext("2d", { willReadFrequently: true }); x.imageSmoothingQuality = "high";
      x.drawImage(out, 0, 0, sw, sh);
      this.seen = { w: sw, h: sh, d: x.getImageData(0, 0, sw, sh).data };
    } catch (e) { /* a file:// page can't read its own picture back: the packed light map stands in */ }
    this.buildFox();
    this.buildMist();
    this.drips = []; this.nextDrip = 2 + Math.random() * 4;
    this.scanCover();
    // the spiders: more on a bigger window
    const count = Math.round(Math.min(70, Math.max(24, W * H / 22000)));
    this.spiders = [...Array(count)].map(() => this.newSpider());
    this.danglers = [];
    this.nextDangle = 4 + Math.random() * 8;
    this.draw(performance.now() / 1000);
  },

  // ---------------------------------------------------------------- the foxfire
  // a few clusters of glowing fungus in the dark crevices: chosen once (in picture coordinates, so they stay put on
  // the rock when the window changes), on ground the spiders could walk, where the picture is dark, out of the way of
  // the cards in the middle; each a little cluster of caps and specks
  buildFox() {
    const f = this.f, W = this.W, H = this.H;
    if (!this.foxSpots) {
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const spots = [];
      for (let tries = 0; tries < 6000 && spots.length < 15; tries++) {
        // mostly high up, and as many on the right as the left
        const left = spots.filter(([sx]) => sx < 768).length, right = spots.length - left;
        const ix = left > right ? 768 + rnd() * 738 : left < right ? 30 + rnd() * 738 : 30 + rnd() * 1476;
        const iy = 30 + rnd() ** 2.4 * 950, x = f.ox + ix * f.k, y = f.oy + iy * f.k;
        if (iy > 560 && rnd() < 0.6) continue;
        if (x < 4 || x > W - 4 || y < 4 || y > H - 4 || !this.walkable(x, y)) continue;
        const d = this.depth(x, y), [r, , b, lum] = this.seenAt(x, y, 8);
        if (d < 0.12 || lum > 0.07 || lum < 0.008) continue;                  // dark, but not the black void
        if (b > r * 1.05) continue;                                            // on the rock, not the grey webs
        if (Math.abs(ix - 768) < 380 && iy > 330) continue;                    // not behind the cards
        if (spots.some(([sx, sy]) => Math.hypot(sx - ix, sy - iy) < 130)) continue;
        const caps = [...Array(4 + Math.floor(rnd() * 6))].map(() => [(rnd() - 0.5) * 2, (rnd() - 0.5) * 0.9, 0.5 + rnd() * 0.7]);
        const specks = [...Array(6 + Math.floor(rnd() * 8))].map(() => [(rnd() - 0.5) * 3.4, (rnd() - 0.4) * 1.4, rnd()]);
        spots.push([ix, iy, caps, specks, rnd() * 100, 0.6 + rnd() * 0.5]);
      }
      this.foxSpots = spots;
    }
    // on screen now: position, size (by depth), and how it breathes
    this.fox = this.foxSpots.map(([ix, iy, caps, specks, ph, sz]) => {
      const x = f.ox + ix * f.k, y = f.oy + iy * f.k;
      return { x, y, caps, specks, ph, u: 14 * sz * this.scaleAt(x, y) * Math.min(W, H) / 900, b: 0.7 };
    }).filter(p => p.x > -20 && p.x < W + 20 && p.y > -20 && p.y < H + 20);
  },
  // each glows on its own slow rhythm, and shrinks back when she stirs
  updateFox(t) {
    const q = this.queen;
    for (const p of this.fox) p.b = (0.62 + 0.22 * Math.sin(t * 0.21 + p.ph) + 0.12 * Math.sin(t * 0.083 + p.ph * 1.7)) * (1 - 0.65 * q.flare);
  },
  // the light the foxfire throws on something at (x, y): its colour, and where it comes from
  foxLight(x, y) {
    let R = 0, G = 0, B = 0, vx = 0, vy = 0;
    for (const p of this.fox) {
      const rad = p.u * 7, dist = Math.hypot(p.x - x, p.y - y);
      if (dist >= rad) continue;
      const w = p.b * (1 - dist / rad) ** 2;
      R += 25 * w; G += 120 * w; B += 80 * w;
      vx += (p.x - x) / (dist || 1) * w; vy += (p.y - y) / (dist || 1) * w;
    }
    return [R, G, B, vx, vy];
  },
  drawFox(c) {
    c.save(); c.globalCompositeOperation = "lighter";
    for (const p of this.fox) {
      const u = p.u, b = p.b;
      // the faint light it casts on the rock round it
      const h = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, u * 8);
      h.addColorStop(0, `rgba(35,140,95,${0.32 * b})`); h.addColorStop(0.3, `rgba(22,95,68,${0.12 * b})`); h.addColorStop(1, "rgba(0,40,30,0)");
      c.fillStyle = h; c.beginPath(); c.arc(p.x, p.y, u * 8, 0, Math.PI * 2); c.fill();
      // the threads of it through the rock: specks, each flickering a little on its own
      for (const [sx, sy, k] of p.specks) {
        const a = b * (0.35 + 0.3 * Math.sin(k * 40 + b * 6));
        c.fillStyle = `rgba(110,240,170,${(0.5 * a).toFixed(3)})`;
        c.beginPath(); c.arc(p.x + sx * u, p.y + sy * u, Math.max(0.5, u * 0.09), 0, Math.PI * 2); c.fill();
      }
      // the caps: little domes on short stems, brightest underneath where the gills are
      for (const [cx, cy, r] of p.caps) {
        const x = p.x + cx * u, y = p.y + cy * u, cr = u * 0.52 * r;
        c.strokeStyle = `rgba(70,170,120,${(0.35 * b).toFixed(3)})`; c.lineWidth = Math.max(0.5, cr * 0.25);
        c.beginPath(); c.moveTo(x, y + cr * 0.15); c.lineTo(x + cr * 0.1, y + cr * 1.2); c.stroke();
        const g = c.createRadialGradient(x, y + cr * 0.1, 0, x, y, cr * 1.3);
        g.addColorStop(0, `rgba(170,255,200,${(0.85 * b).toFixed(3)})`); g.addColorStop(0.5, `rgba(60,200,130,${(0.45 * b).toFixed(3)})`);
        g.addColorStop(1, "rgba(20,90,60,0)");
        c.fillStyle = g; c.beginPath(); c.ellipse(x, y, cr * 1.3, cr * 0.75, 0, Math.PI, 0); c.closePath(); c.fill();
      }
    }
    c.restore();
  },

  // ---------------------------------------------------------------- the mist
  // where it lies (a small mask, blurred): along the floor of the cave, thicker the further down the tunnel, and seen
  // by the light there is to see it by; and its texture, soft noise that tiles, which drifts through that mask
  buildMist() {
    const W = this.W, H = this.H, f = this.f, n = 6, mw = Math.ceil(W / n), mh = Math.ceil(H / n);
    const raw = document.createElement("canvas"); raw.width = mw; raw.height = mh;
    const rc = raw.getContext("2d"), img = rc.createImageData(mw, mh), cimg = rc.createImageData(mw, mh);
    const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
      const x = (i + 0.5) * n, y = (j + 0.5) * n, iy = (y - f.oy) / f.k, d = this.depth(x, y);
      const floor = sm(500, 760, iy) * (0.5 + 0.5 * (1 - d));                  // lying on the ground
      const deep = (1 - d) ** 2 * sm(380, 640, iy) * 0.85;                     // filling the far tunnel
      // its colour: the light it scatters there - lit mist glows a little, mist in the dark is dark (it only hides)
      const [R, G, B] = this.seenAt(x, y, 6), o = (j * mw + i) * 4;
      cimg.data[o] = Math.min(255, R * 1.2 + 3); cimg.data[o + 1] = Math.min(255, G * 1.2 + 3); cimg.data[o + 2] = Math.min(255, B * 1.25 + 4);
      cimg.data[o + 3] = 255;
      img.data[o + 3] = Math.round(255 * Math.min(1, Math.max(floor, deep)));
    }
    rc.putImageData(img, 0, 0);
    const mask = document.createElement("canvas"); mask.width = mw; mask.height = mh;
    const mc = mask.getContext("2d"); mc.filter = "blur(3px)"; mc.drawImage(raw, 0, 0);
    this.mistMask = mask;
    // (and its colour alone, solid, to paint the drifting mist with)
    const col = document.createElement("canvas"); col.width = mw; col.height = mh;
    const cr = document.createElement("canvas"); cr.width = mw; cr.height = mh; cr.getContext("2d").putImageData(cimg, 0, 0);
    const cc = col.getContext("2d"); cc.drawImage(cr, 0, 0); cc.filter = "blur(3px)"; cc.drawImage(cr, 0, 0);
    this.mistCol = col;
    this.mist = document.createElement("canvas"); this.mist.width = mw; this.mist.height = mh;
    this.mistCtx = this.mist.getContext("2d");
    if (!this.mistTex) {
      // soft noise that tiles: a few octaves of smoothed random values on a wrapping lattice
      const tw = 128, th = 64, tex = document.createElement("canvas"); tex.width = tw; tex.height = th;
      const tc = tex.getContext("2d"), td = tc.createImageData(tw, th), oct = [];
      for (const cells of [4, 8, 16]) {
        const ch = cells / 2, g = [...Array(cells * ch)].map(() => Math.random());
        oct.push({ cells, ch, g });
      }
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        let v = 0, w = 0, amp = 1;
        for (const o of oct) {
          const fx = x / tw * o.cells, fy = y / th * o.ch, x0 = Math.floor(fx), y0 = Math.floor(fy);
          const sx = (fx - x0) ** 2 * (3 - 2 * (fx - x0)), sy = (fy - y0) ** 2 * (3 - 2 * (fy - y0));
          const G = (a, b) => o.g[(b % o.ch) * o.cells + (a % o.cells)];
          const top = G(x0, y0) * (1 - sx) + G(x0 + 1, y0) * sx, bot = G(x0, y0 + 1) * (1 - sx) + G(x0 + 1, y0 + 1) * sx;
          v += (top * (1 - sy) + bot * sy) * amp; w += amp; amp *= 0.5;
        }
        v /= w;
        const i = (y * tw + x) * 4;
        td.data[i] = 178; td.data[i + 1] = 184; td.data[i + 2] = 196;
        td.data[i + 3] = Math.round(255 * Math.min(1, Math.max(0, (v - 0.32) * 2.2)));
      }
      tc.putImageData(td, 0, 0);
      this.mistTex = tex;
    }
    this.mistPat = this.mistCtx.createPattern(this.mistTex, "repeat");
  },
  // the mist, drifting slowly out of the tunnel towards us; tinged red by her eyes near her
  drawMist(c, t) {
    const m = this.mistCtx, mw = this.mist.width, mh = this.mist.height, S = mh / 64;
    m.globalCompositeOperation = "source-over"; m.clearRect(0, 0, mw, mh);
    const layer = (scale, vx, vy, al) => {
      const tw = 128 * scale * S, th = 64 * scale * S;
      this.mistPat.setTransform(new DOMMatrix().translate((t * vx) % tw, (t * vy) % th).scale(scale * S));
      m.globalAlpha = al; m.fillStyle = this.mistPat; m.fillRect(0, 0, mw, mh);
    };
    layer(2.2, -2.2, 0.35, 0.75);
    layer(1.3, -3.6, 0.6, 0.55);
    m.globalAlpha = 1;
    m.globalCompositeOperation = "destination-in"; m.drawImage(this.mistMask, 0, 0);
    m.globalCompositeOperation = "source-in"; m.drawImage(this.mistCol, 0, 0);
    // her eyes' glow, caught in the mist around her
    const q = this.queen, f = this.f, qx = (f.ox + this.QUEEN.x * f.k) / this.W * mw, qy = (f.oy + this.QUEEN.y * f.k) / this.H * mh;
    const r = 260 * f.k / this.W * mw, glow = 0.4 + 0.1 * Math.sin(t * 0.6) + 0.7 * q.flare;
    m.globalCompositeOperation = "source-atop";
    const g = m.createRadialGradient(qx, qy, 0, qx, qy, r);
    g.addColorStop(0, `rgba(150,20,10,${0.55 * glow})`); g.addColorStop(1, "rgba(150,20,10,0)");
    m.fillStyle = g; m.fillRect(0, 0, mw, mh);
    m.globalCompositeOperation = "source-over";
    c.save(); c.globalAlpha = 0.8; c.imageSmoothingQuality = "high";
    c.drawImage(this.mist, 0, 0, this.W, this.H);
    c.restore();
  },

  // ---------------------------------------------------------------- the drips
  updateDrips(dt) {
    const f = this.f;
    this.nextDrip -= dt;
    if (this.nextDrip <= 0) {
      const [ix, iy, ly, wet] = this.DRIPS[Math.floor(Math.random() * this.DRIPS.length)];
      const x = f.ox + ix * f.k, y = f.oy + iy * f.k, land = f.oy + ly * f.k;
      if (x > 0 && x < this.W && y > 0 && land < this.H + 20) {
        const dist = land - y, T = 0.42 + 0.3 * dist / this.H;          // a longer fall takes longer
        this.drips.push({ x, y, land, wet, g: 2 * dist / (T * T), st: "form", t: 0, fy: 0, v: 0,
          k: this.scaleAt(x, Math.min(this.H - 1, land)) });
      }
      this.nextDrip = 3 + Math.random() * 7;
    }
    for (const d of this.drips) {
      d.t += dt;
      if (d.st === "form") { if (d.t > 1.4) { d.st = "fall"; d.t = 0; } }
      else if (d.st === "fall") {
        d.v += d.g * dt; d.fy += d.v * dt;
        if (d.y + d.fy >= d.land) { d.st = "splash"; d.t = 0; }
      }
    }
    this.drips = this.drips.filter(d => !(d.st === "splash" && d.t > 1.6));
  },
  // a drop: a bead swelling at the tip, falling as a short streak, then rings on the water (or a fleck off the rock),
  // all of it only as bright as the light there
  drawDrips(c) {
    const S = Math.min(this.W, this.H) / 900;
    for (const d of this.drips) {
      const yy = d.st === "splash" ? d.land : d.y + d.fy;
      const [R, G, B] = this.seenAt(d.x, yy, 3);
      const col = a => `rgba(${Math.min(255, Math.round(R * 2.6 + 50))},${Math.min(255, Math.round(G * 2.6 + 52))},${Math.min(255, Math.round(B * 2.6 + 60))},${a})`;
      if (d.st === "form") {
        const r = Math.max(0.6, 1.6 * S * Math.min(1, d.t / 1.4));
        c.fillStyle = col(0.55); c.beginPath(); c.ellipse(d.x, d.y + r, r * 0.8, r, 0, 0, Math.PI * 2); c.fill();
      } else if (d.st === "fall") {
        const len = Math.max(2, Math.min(18 * S, d.v * 0.025));
        const g = c.createLinearGradient(d.x, yy - len, d.x, yy);
        g.addColorStop(0, col(0)); g.addColorStop(1, col(0.6));
        c.strokeStyle = g; c.lineWidth = Math.max(0.8, 1.3 * S); c.lineCap = "round";
        c.beginPath(); c.moveTo(d.x, yy - len); c.lineTo(d.x, yy); c.stroke();
      } else if (d.wet) {
        for (const lag of [0, 0.35]) {
          const p = (d.t - lag) / 1.2; if (p <= 0 || p >= 1) continue;
          const rx = (3 + 22 * p) * S * d.k;
          c.strokeStyle = col((0.45 * (1 - p)).toFixed(3)); c.lineWidth = Math.max(0.6, 1.1 * S * (1 - p * 0.5));
          c.beginPath(); c.ellipse(d.x, d.land, rx, rx * 0.28, 0, 0, Math.PI * 2); c.stroke();
        }
      } else if (d.t < 0.35) {
        const p = d.t / 0.35;
        c.fillStyle = col((0.6 * (1 - p)).toFixed(3));
        for (const sx of [-1, 1, 0]) {
          const px = d.x + sx * 6 * S * p, py = d.land - (sx ? 5 : 8) * S * Math.sin(p * Math.PI);
          c.beginPath(); c.arc(px, py, Math.max(0.5, 0.9 * S), 0, Math.PI * 2); c.fill();
        }
      }
    }
  },

  // ---------------------------------------------------------------- the spiders
  newSpider() {
    let x, y, tries = 0;
    // anywhere it can stand, more often where there's some light to see it by
    do { x = Math.random() * this.W; y = Math.random() * this.H; }
    while ((!this.walkable(x, y) || this.covered(x, y) || Math.random() > 0.55 + this.seenAt(x, y, 8)[3] * 3) && tries++ < 300);
    return { x, y, a: Math.random() * Math.PI * 2, turn: 0, base: 0.8 + Math.random() * 0.5, pace: 0.8 + Math.random() * 0.5,
      rest: 0, phase: Math.random() * 10, tone: 30 + Math.random() * 25, dark: 0, fade: 1, hid: 0, glint: Math.random() * 10 };
  },
  // what the game covers (cards, hands, portraits, panels): a coarse grid, looked at every second or two, so the
  // spiders can keep out from under it - a spider nobody can see is wasted
  scanCover() {
    // (from the boxes of the solid things on the page - cards, pictures, buttons, panels with a background - rather
    // than probing points, which is far too slow)
    const cw = 40, ch = 24, W = this.W, H = this.H, g = new Uint8Array(cw * ch);
    for (const e of document.body.querySelectorAll("*")) {
      if (e === this.canvas || e.tagName === "SCRIPT" || e.tagName === "STYLE") continue;
      let solid = e.tagName === "IMG" || e.tagName === "BUTTON" || e.classList.contains("card");
      if (!solid) {
        const cs = getComputedStyle(e);
        if (cs.backgroundImage !== "none") solid = true;
        else { const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/); if (m) { const v = m[1].split(",").map(Number); solid = v.length < 4 || v[3] > 0.3; } }
      }
      if (!solid) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.right < 0 || r.bottom < 0 || r.left > W || r.top > H) continue;
      if (r.width >= W * 0.98 && r.height >= H * 0.98) continue;            // (something full-screen, behind it all)
      const cs = getComputedStyle(e);
      if (cs.visibility === "hidden" || +cs.opacity < 0.3) continue;
      const i0 = Math.max(0, Math.ceil(r.left / W * cw - 0.5)), i1 = Math.min(cw - 1, Math.floor(r.right / W * cw - 0.5));
      const j0 = Math.max(0, Math.ceil(r.top / H * ch - 0.5)), j1 = Math.min(ch - 1, Math.floor(r.bottom / H * ch - 0.5));
      for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) g[jj * cw + ii] = 1;
    }
    this.cover = { cw, ch, g };
  },
  covered(x, y) {
    const m = this.cover; if (!m) return false;
    const i = Math.floor(x / this.W * m.cw), j = Math.floor(y / this.H * m.ch);
    return i >= 0 && j >= 0 && i < m.cw && j < m.ch && m.g[j * m.cw + i] === 1;
  },
  // somewhere worth heading for: lit rock it can stand on, out from behind the cards in the middle
  goalSpot() {
    const W = this.W, H = this.H;
    for (let i = 0; i < 12; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      if (!this.walkable(x, y) || this.seenAt(x, y, 6)[3] < 0.045) continue;
      if (this.covered(x, y)) continue;
      return [x, y];
    }
    return null;
  },
  // how big a spider is here: a giant's whisker up close, a speck deep in the cave
  scaleAt(x, y) { const d = this.depth(x, y); return 0.45 + 0.75 * d; },

  loop() {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    const step = now => {
      if (!this.active || document.hidden) return;
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      if (!this.still) this.update(dt);
      this.draw(now / 1000);
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  },

  update(dt) {
    const W = this.W, H = this.H, S = Math.min(W, H) / 900;
    this.coverIn = (this.coverIn || 0) - dt;
    if (this.coverIn <= 0) { this.scanCover(); this.coverIn = 1.5; }
    for (const s of this.spiders) {
      // one the cards have come down on: after a while it's gone, and another comes out where it can be seen
      s.hid = this.covered(s.x, s.y) ? s.hid + dt : 0;
      if (s.hid > 3) { Object.assign(s, this.newSpider(), { fade: 0 }); continue; }
      if (s.rest > 0) { s.rest -= dt; continue; }
      s.turn += (Math.random() - 0.5) * 6 * dt; s.turn *= 0.96;
      s.a += s.turn * dt * 2;
      if (!s.goal && Math.random() < dt * 0.05) s.goal = this.goalSpot();
      if (s.fade < 1) s.fade = Math.min(1, s.fade + dt * 0.7);
      if (s.goal) {
        const ga = Math.atan2(s.goal[1] - s.y, s.goal[0] - s.x), da = Math.atan2(Math.sin(ga - s.a), Math.cos(ga - s.a));
        s.a += da * Math.min(1, dt * 1.5);
        if (Math.hypot(s.goal[0] - s.x, s.goal[1] - s.y) < 30 || Math.random() < dt * 0.05) s.goal = null;
      }
      const k = this.scaleAt(s.x, s.y), sp = 26 * S * k * s.pace;       // further away: slower across the screen
      const nx = s.x + Math.cos(s.a) * sp * dt, ny = s.y + Math.sin(s.a) * sp * dt;
      // nothing to stand on there (the void, off the picture): turn back
      if (!this.walkable(nx, ny) || nx < 0 || nx > W || ny < 0 || ny > H) { s.a += Math.PI * (0.5 + Math.random()); s.turn = 0; s.goal = null; continue; }
      // they keep out from under the table (where they can, they walk out from under it)
      if (this.covered(nx, ny) && !this.covered(s.x, s.y) && Math.random() < 0.9) { s.a += Math.PI * (0.5 + Math.random()); s.turn = 0; s.goal = null; continue; }
      // they keep out of the deepest dark, mostly (it's a soft edge, like the end of the rock)
      const here = this.seenAt(nx, ny, 4)[3];
      if (here < 0.022 && Math.random() < 0.6 && here < this.seenAt(s.x, s.y, 4)[3]) { s.a += Math.PI * (0.4 + Math.random() * 0.6) * (Math.random() < 0.5 ? -1 : 1); s.turn = 0; continue; }
      // one that's been lost in the black too long goes off somewhere, and another comes out where it can be seen
      s.dark = here < 0.03 ? s.dark + dt : 0;
      if (s.dark > 15) { Object.assign(s, this.newSpider(), { fade: 0 }); continue; }
      s.x = nx; s.y = ny;
      s.phase += dt * 9 * s.pace; s.glint += dt;
      if (Math.random() < dt * 0.12) s.rest = 0.4 + Math.random() * 2.2;
    }
    this.updateDrips(dt);
    // now and then one lowers itself from the roof on a thread, hangs a while and climbs back
    this.nextDangle -= dt;
    if (this.nextDangle <= 0 && this.danglers.length < 2) {
      let x = 0, tries = 0;
      do { x = W * (0.05 + Math.random() * 0.9); } while (!this.walkable(x, 4) && tries++ < 30);
      const k = this.scaleAt(x, 4);
      this.danglers.push({ x, y: 0, max: H * (0.08 + Math.random() * 0.2), v: 30 * S * Math.max(0.4, k), k,
        state: "down", hang: 3 + Math.random() * 5, sway: Math.random() * 6 });
      this.nextDangle = 9 + Math.random() * 14;
    }
    for (const d of this.danglers) {
      d.sway += dt;
      if (d.state === "down") { d.y += d.v * dt; if (d.y >= d.max) d.state = "hang"; }
      else if (d.state === "hang") { d.hang -= dt; if (d.hang <= 0) d.state = "up"; }
      else d.y -= d.v * 0.7 * dt;
    }
    this.danglers = this.danglers.filter(d => d.y > -10);
    // the queen: breathing glow, blinks, and once in a long while her front legs
    const q = this.queen;
    q.t += dt;
    q.flare = Math.max(0, q.flare - dt * 0.6);
    this.foxT = (this.foxT || 0) + dt; this.updateFox(this.foxT);
    q.nextBlink -= dt;
    if (q.nextBlink <= 0) { q.blink.push({ pair: Math.floor(Math.random() * 4), t: 0 }); q.nextBlink = 4 + Math.random() * 9; }
    q.blink.forEach(b => b.t += dt); q.blink = q.blink.filter(b => b.t < 0.35);
    q.nextReach -= dt;
    if (q.phase === "idle" && q.nextReach <= 0) { q.phase = "out"; q.pt = 0; }
    if (q.phase !== "idle") {
      q.pt += dt;
      // out over 4s, feel about for 5s, back over 4s
      if (q.phase === "out") { q.reach = Math.min(1, q.pt / 4); if (q.pt >= 4) { q.phase = "feel"; q.pt = 0; } }
      else if (q.phase === "feel") { q.reach = 1; if (q.pt >= 5) { q.phase = "back"; q.pt = 0; } }
      else { q.reach = Math.max(0, 1 - q.pt / 4); if (q.pt >= 4) { q.phase = "idle"; q.nextReach = 60 + Math.random() * 70; } }
    }
  },

  draw(t) {
    const c = this.ctx, dpr = this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.cave, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawQueen(c, t);
    this.drawFox(c);
    const S = Math.min(this.W, this.H) / 900;
    // the far ones sink into the mist; the near ones walk over it
    const crawl = near => {
      for (const s of this.spiders) {
        if ((this.depth(s.x, s.y) > 0.3) !== near || this.covered(s.x, s.y)) continue;
        const k = this.scaleAt(s.x, s.y);
        if (s.fade < 1) c.globalAlpha = s.fade;
        this.drawSpider(c, s.x, s.y, s.a + Math.PI / 2, 19 * S * k * s.base, s.rest > 0 ? 0 : s.phase, s.tone, false, s.glint);
        c.globalAlpha = 1;
      }
    };
    crawl(false);
    this.drawMist(c, this.still ? 0 : t);
    crawl(true);
    this.drawDrips(c);
    for (const d of this.danglers) {
      const x = d.x + Math.sin(d.sway * 0.9) * 3, sz = 19 * S * d.k;
      c.strokeStyle = "rgba(200,195,190,0.28)"; c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(d.x, 0); c.lineTo(x, d.y); c.stroke();
      this.drawSpider(c, x, d.y + sz, Math.PI, sz, d.state === "hang" ? 0 : d.sway * 4, 40, true, d.sway);
    }
  },

  // ---------------------------------------------------------------- the queen
  drawQueen(c, t) {
    const q = this.queen, f = this.f, Q = this.QUEEN;
    const x = f.ox + Q.x * f.k, y = f.oy + Q.y * f.k, u = 48 * f.k * Q.size;   // u: her scale on screen
    // the front legs: two huge jointed legs reaching forward out of the dark, down onto the rocks at the cave mouth
    if (q.reach > 0) {
      const e = q.reach * q.reach * (3 - 2 * q.reach);
      for (const side of [-1, 1]) {
        const feel = q.phase === "feel" ? Math.sin(q.pt * 1.3 + (side > 0 ? 1.7 : 0)) : 0;
        const tap = q.phase === "feel" ? Math.max(0, Math.sin(q.pt * 2.6 + side * 1.1)) ** 8 : 0;
        const sx = x + side * u * 0.45, sy = y + u * 0.75;                                    // from under her face
        const kx = sx + side * u * (0.9 + 1.3 * e), ky = sy - u * (0.1 + 0.7 * e) + feel * u * 0.12;   // the knee, out and a little up
        const tx = kx + side * u * (0.2 + 0.7 * e) + feel * side * u * 0.2, ty = ky + u * (0.9 + 1.9 * e) - tap * u * 0.45;   // the tip, down onto the rock
        this.limb(c, sx, sy, kx, ky, u * 0.42, u * 0.32, -side * u * 0.25, e, 0.25);
        this.limb(c, kx, ky, tx, ty, u * 0.32, u * 0.07, side * u * 0.2, e, 0.4);
      }
    }
    // her eyes: eight glossy black-red domes - two great ones, two below, four small out to the sides - with a dim
    // ember glow that breathes, flares, and now and then a pair blinks
    const glow = 0.4 + 0.12 * Math.sin(t * 0.6) + 0.05 * Math.sin(t * 1.7) + q.flare * 0.7;
    const EYES = [[-0.3, 0, 0.24], [0.3, 0, 0.24], [-0.2, 0.42, 0.13], [0.2, 0.42, 0.13],
                  [-0.68, -0.14, 0.11], [0.68, -0.14, 0.11], [-0.58, 0.3, 0.09], [0.58, 0.3, 0.09]];
    // a faint red light around her face, so the dark there isn't quite empty
    const halo = c.createRadialGradient(x, y + u * 0.1, 0, x, y + u * 0.1, u * 1.6);
    halo.addColorStop(0, `rgba(90,6,3,${0.08 * glow})`); halo.addColorStop(1, "rgba(80,0,0,0)");
    c.fillStyle = halo; c.beginPath(); c.arc(x, y + u * 0.1, u * 1.6, 0, Math.PI * 2); c.fill();
    EYES.forEach(([ex, ey, r], i) => {
      const b = q.blink.find(b => b.pair === Math.floor(i / 2));
      const open = b ? Math.abs(Math.cos(b.t / 0.35 * Math.PI)) : 1;
      const px = x + ex * u, py = y + ey * u, rr = r * u, ry = rr * Math.max(0.06, open);
      c.save();
      c.beginPath(); c.ellipse(px, py, rr, ry, 0, 0, Math.PI * 2); c.clip();
      const g = c.createRadialGradient(px - rr * 0.25, py - ry * 0.3, 0, px, py, rr);
      g.addColorStop(0, `rgba(${Math.round(55 + 50 * glow + 60 * q.flare)},${Math.round(4 + 14 * q.flare)},3,1)`);
      g.addColorStop(0.6, `rgba(${Math.round(18 + 18 * glow)},2,2,1)`); g.addColorStop(1, "rgba(4,1,1,1)");
      c.fillStyle = g; c.fillRect(px - rr, py - rr, rr * 2, rr * 2);
      // the wet highlight
      c.fillStyle = `rgba(190,200,215,${0.22 + 0.1 * q.flare})`;   // a wet glint of the cave's cold light
      c.beginPath(); c.ellipse(px - rr * 0.35, py - ry * 0.4, rr * 0.16, ry * 0.1, -0.5, 0, Math.PI * 2); c.fill();
      c.restore();
      // the glow round it
      c.save(); c.globalCompositeOperation = "lighter";
      const gl = c.createRadialGradient(px, py, rr * 0.6, px, py, rr * 2.4);
      gl.addColorStop(0, `rgba(120,12,5,${0.1 * glow * open})`); gl.addColorStop(1, "rgba(120,0,0,0)");
      c.fillStyle = gl; c.beginPath(); c.arc(px, py, rr * 2.4, 0, Math.PI * 2); c.fill();
      c.restore();
    });
  },
  // one segment of her leg: curved, tapering, near-black and bristly, a faint cold sheen along its upper edge, and
  // fading into the dark at the end nearest her body (fadeAt: how far along it's fully seen)
  limb(c, x1, y1, x2, y2, w1, w2, bow, e, fadeAt) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, len = Math.hypot(x2 - x1, y2 - y1);
    const nx = -(y2 - y1) / len, ny = (x2 - x1) / len, cx = mx + nx * bow, cy = my + ny * bow;
    const P = (t, o) => {     // a point along the curve, offset o across it
      const ax = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2, ay = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2;
      const tx = 2 * (1 - t) * (cx - x1) + 2 * t * (x2 - cx), ty = 2 * (1 - t) * (cy - y1) + 2 * t * (y2 - cy), tl = Math.hypot(tx, ty) || 1;
      return [ax - ty / tl * o, ay + tx / tl * o];
    };
    const N = 16, left = [], right = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, w = w1 + (w2 - w1) * t, bulge = 1 + 0.18 * Math.sin(t * Math.PI);
      left.push(P(t, w * bulge)); right.push(P(t, -w * bulge));
    }
    c.save();
    c.globalAlpha = Math.min(1, e * 1.4);
    const g = c.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, "rgba(2,2,2,0)"); g.addColorStop(fadeAt, "rgba(3,3,3,0.97)"); g.addColorStop(1, "rgba(7,6,6,1)");
    c.fillStyle = g;
    c.beginPath(); left.forEach(([px, py], i) => i ? c.lineTo(px, py) : c.moveTo(px, py));
    for (let i = right.length - 1; i >= 0; i--) c.lineTo(right[i][0], right[i][1]);
    c.closePath(); c.fill();
    const sh = c.createLinearGradient(x1, y1, x2, y2);
    sh.addColorStop(0, "rgba(140,150,165,0)"); sh.addColorStop(Math.min(1, fadeAt + 0.3), "rgba(120,130,150,0.05)"); sh.addColorStop(1, "rgba(120,130,150,0.12)");
    c.strokeStyle = sh; c.lineWidth = Math.max(0.7, w2 * 0.5);
    c.beginPath(); for (let i = 0; i <= N; i++) { const [px, py] = P(i / N, (w1 + (w2 - w1) * i / N) * 0.75); i ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke();
    // fine hairs, both sides, at odd angles, barely there
    c.strokeStyle = "rgba(4,3,3,0.9)"; c.lineWidth = Math.max(0.4, w2 * 0.12);
    for (let i = 0; i < 26; i++) {
      const t = fadeAt + (1 - fadeAt) * ((i * 0.618) % 1), side = i % 2 ? 1 : -1;
      const w = w1 + (w2 - w1) * t, [bx, by] = P(t, side * w * 0.95), [ex, ey] = P(Math.min(1, t + 0.035), side * w * (1.5 + (i % 3) * 0.2));
      c.beginPath(); c.moveTo(bx, by); c.lineTo(ex, ey); c.stroke();
    }
    c.restore();
  },

  // the light on screen at a point, averaged over a small patch (radius r): colour 0-255 and brightness 0-1
  seenAt(x, y, r = 4) {
    const m = this.seen;
    if (!m) { const [lr, lg, lb, l] = this.lightAt(x, y), D = this.DARKEN * 255; return [lr * D, lg * D, lb * D, l * this.DARKEN]; }
    let R = 0, G = 0, B = 0, n = 0;
    for (let oy = -r; oy <= r; oy += r || 1) for (let ox = -r; ox <= r; ox += r || 1) {
      const u = Math.min(m.w - 1, Math.max(0, Math.round((x + ox) / 4))), v = Math.min(m.h - 1, Math.max(0, Math.round((y + oy) / 4)));
      const i = (v * m.w + u) * 4; R += m.d[i]; G += m.d[i + 1]; B += m.d[i + 2]; n++;
    }
    R /= n; G /= n; B /= n;
    return [R, G, B, (R + G + B) / 765];
  },
  // where the light comes from: the scene's key light (above, a little left), turned towards the brighter side nearby
  seenDir(x, y) {
    const d = 14 * Math.max(0.6, Math.min(this.W, this.H) / 900);
    let gx = this.seenAt(x + d, y, 6)[3] - this.seenAt(x - d, y, 6)[3], gy = this.seenAt(x, y + d, 6)[3] - this.seenAt(x, y - d, 6)[3];
    const l = Math.hypot(gx, gy) || 1, w = Math.min(1, l * 12);
    gx = -0.3 * (1 - w) + gx / l * w; gy = -0.95 * (1 - w) + gy / l * w;
    const n = Math.hypot(gx, gy) || 1;
    return [gx / n, gy / n];
  },
  // a small spider facing `a` (0 = up), lit like everything else in the picture: a dark glossy creature, so it's
  // darker than whatever it's on - a silhouette on lit rock, all but lost in the shadows - with only what the light
  // there gives it: glints on its back and a thin gleam along the legs on the side the light comes from (in the
  // scene's terms, so they stay put as it turns), and a soft shadow where there's light to cast one
  drawSpider(c, x, y, a, s, phase, tone, hanging = false, glint = 0) {
    let [R, G, B, lum] = this.seenAt(x, y, Math.max(2, s * 0.8));
    // even the darkest corner has a little cold light in it - enough for a faint gleam
    R = Math.max(R, 30); G = Math.max(G, 32); B = Math.max(B, 38);
    // and any foxfire nearby: its green light, and the light then comes from there as much as from above
    const [fr, fg, fb, fvx, fvy] = this.fox ? this.foxLight(x, y) : [0, 0, 0, 0, 0];
    R += fr * 0.3; G += fg * 0.3; B += fb * 0.3; lum += (fr + fg + fb) / 765 * 0.5;   // a tinge on it; the glints catch more
    const L = Math.max(0.32, Math.min(1, lum * 3.2));                                   // how lit it is here (0 dark - 1 well lit)
    let [dx, dy] = this.seenDir(x, y);
    const fw = Math.min(1, Math.hypot(fvx, fvy) * 1.5);
    if (fw > 0.02) {
      const fl = Math.hypot(fvx, fvy);
      dx = dx * (1 - fw) + fvx / fl * fw; dy = dy * (1 - fw) + fvy / fl * fw;
      const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
    }
    // a dark spider, darker than the lit rock it's on - but in the gloom further in it doesn't go on darkening into
    // the black: it stays a dark brown that still shows against it
    const k = 0.4 + tone / 300;
    const dark = `rgb(${Math.round(Math.max(R * k * 0.55 + 3, 21))},${Math.round(Math.max(G * k * 0.5 + 2, 17))},${Math.round(Math.max(B * k * 0.48 + 2, 14))})`;
    const lit = (f, al) => `rgba(${Math.round(Math.min(255, R * f + 12))},${Math.round(Math.min(255, G * f + 12))},${Math.round(Math.min(255, B * f + 14))},${al})`;
    const ca = Math.cos(a), sa = Math.sin(a);
    const W = (px, py) => [px * ca - py * sa, px * sa + py * ca];      // its own frame -> the scene's
    c.save();
    c.translate(x, y);
    if (!hanging && L > 0.05) {
      // (a soft gradient, not a blur filter: far cheaper with a lot of spiders)
      const sx = -dx * s * 0.45, sy = -dy * s * 0.45 + s * 0.2, sh = c.createRadialGradient(sx, sy, 0, sx, sy, s * 1.6);
      sh.addColorStop(0, `rgba(0,0,0,${0.45 * L})`); sh.addColorStop(0.55, `rgba(0,0,0,${0.22 * L})`); sh.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = sh; c.beginPath(); c.ellipse(sx, sy, s * 1.6, s * 1.25, 0, 0, Math.PI * 2); c.fill();
    }
    // the legs: two segments each, dark; a thin gleam on the lit side of the segments that lie across the light
    const lw = Math.max(0.7, s * 0.14), gleams = [];
    c.strokeStyle = dark; c.lineWidth = lw; c.lineCap = "round"; c.lineJoin = "round";
    for (let side = -1; side <= 1; side += 2) {
      for (let j = 0; j < 4; j++) {
        const base = (-0.55 + j * 0.38) * Math.PI;
        const step = Math.sin(phase + j * 1.6 + (side > 0 ? Math.PI : 0)) * 0.22;
        const a1 = base + step, kx = Math.cos(a1) * s * 1.2 * side, ky = Math.sin(a1) * s * 1.1;
        const fx = kx + Math.cos(a1 + 0.5 * side) * s * 1.1 * side * 0.9, fy = ky + s * (j < 2 ? -0.5 : 0.7);
        const P = [[0, 0], W(kx, ky - s * 0.25), W(fx, fy)];
        c.beginPath(); c.moveTo(...P[0]); c.lineTo(...P[1]); c.lineTo(...P[2]); c.stroke();
        gleams.push(P);
      }
    }
    if (L > 0.04) {
      c.lineWidth = Math.max(0.5, lw * 0.45);
      for (const P of gleams) for (let q = 0; q < 2; q++) {
        const [x1, y1] = P[q], [x2, y2] = P[q + 1], len = Math.hypot(x2 - x1, y2 - y1) || 1;
        let nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
        if (nx * dx + ny * dy < 0) { nx = -nx; ny = -ny; }
        const face = nx * dx + ny * dy;                                 // 1: lying square across the light
        if (face < 0.3) continue;
        const o = lw * 0.3;
        c.strokeStyle = lit(1.6 + L, (0.8 * L * face).toFixed(3));
        c.beginPath(); c.moveTo(x1 + nx * o, y1 + ny * o); c.lineTo(x2 + nx * o, y2 + ny * o); c.stroke();
      }
    }
    // the body: abdomen and head, each a dark dome shaded from the light side
    const dome = (cx, cy, rx, ry, spec) => {
      const [px, py] = W(cx, cy), hx = px + dx * rx * 0.45, hy = py + dy * ry * 0.45;
      const g = c.createRadialGradient(hx, hy, 0, px, py, Math.max(rx, ry) * 1.05);
      g.addColorStop(0, lit(0.75 + 0.6 * L, 1)); g.addColorStop(0.6, dark); g.addColorStop(1, dark);
      c.fillStyle = g;
      c.beginPath(); c.ellipse(px, py, rx, ry, a, 0, Math.PI * 2); c.fill();
      if (L > 0.06) {                                                   // the glint: the light, reflected
        const sx = px + dx * rx * 0.5, sy = py + dy * ry * 0.5, sr = Math.max(0.6, rx * spec);
        const h = c.createRadialGradient(sx, sy, 0, sx, sy, sr);
        h.addColorStop(0, lit(2.4 + 1.5 * L, Math.min(1, 0.9 * L + 0.1).toFixed(3))); h.addColorStop(1, lit(2, 0));
        c.fillStyle = h; c.beginPath(); c.arc(sx, sy, sr, 0, Math.PI * 2); c.fill();
      }
    };
    dome(0, s * 0.75, s * 0.6, s * 0.78, 0.45);
    dome(0, -s * 0.25, s * 0.38, s * 0.4, 0.4);
    // eyeshine: its eyes throw the light back, as a wolf spider's do in a torch beam - brightest when it faces us
    // (walking down the screen) or the light; a faint pair of pinpoints even in the dark, flaring as it turns
    const [hx, hy] = W(0, -1), face = Math.max(0, hy) * 0.6 + Math.max(0, hx * dx + hy * dy) * 0.4;
    const shine = Math.min(1, 0.22 + 0.78 * face ** 2) * (0.85 + 0.15 * Math.sin(glint * 2.3));
    const er = Math.max(0.6, s * 0.075);
    c.globalCompositeOperation = "lighter";
    for (const ex of [-1, 1]) {
      const [px, py] = W(ex * s * 0.1, -s * 0.56);
      const g = c.createRadialGradient(px, py, 0, px, py, er * 2.2);
      g.addColorStop(0, `rgba(${Math.round(150 + fr)},${Math.round(200 + Math.min(55, fg))},${Math.round(170 + fb * 0.5)},${(0.85 * shine).toFixed(3)})`);
      g.addColorStop(0.4, `rgba(90,150,120,${(0.35 * shine).toFixed(3)})`); g.addColorStop(1, "rgba(40,80,60,0)");
      c.fillStyle = g; c.beginPath(); c.arc(px, py, er * 2.2, 0, Math.PI * 2); c.fill();
    }
    c.globalCompositeOperation = "source-over";
    c.restore();
  }
};

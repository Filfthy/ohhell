// oh-souls.js - the "Souls" table: dark soul sand packed with faces of the damned, drifting a little in
// the sand, rocking slowly (always mostly upright) and groaning: each mouth slowly opens and closes and
// the eyes slowly narrow and widen, every face at its own pace. Wisps of dark smoke rise among them, embers drift up and licks of flame flare from the sand. Drawn on a canvas behind the table; it only runs while the Souls table is chosen, rests
// while the tab is hidden, and stays still for anyone who has asked their computer for reduced motion.

const t0 = q => q * 1.5;   // how much a wisp's haze has spread by this point in its life

// Look settings (the temporary tuning panel changes these live)
const SOULS_P = { faces: 0.76, headSolid: 0.6, headTone: 1, faceSize: 1, drift: 1, rock: 1, smoke: 1.7, smokeDark: 1.55,
  embers: 1.5, emberSpeed: 1, emberBright: 0.45, flames: 2.7, flameSize: 0.7, cracks: 0.9, vignette: 1.35,
  hue: 5, saturation: 1.3, brightness: 0.85,
  glowShow: 0.46, glowBright: 0.3, glowHeat: 0.35, glowScale: 0.4, breathAmt: 1, breathSecs: 8, patchBreath: 1,
  ripple: 3.5, rippleSize: 85, rippleSpeed: 0.25 };
const SOULS_TUNER = false;   // true shows a sliders panel on the Souls table, for tuning the look

const SOULS = {
  P: SOULS_P,
  canvas: null, ctx: null, sand: null, faces: [], active: false, raf: 0, last: 0, W: 0, H: 0, dpr: 1, k: 1,
  still: !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches),

  setActive(on) {
    this.active = on;
    if (on && !this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.id = "souls-bg";
      this.canvas.setAttribute("aria-hidden", "true");
      document.body.insertBefore(this.canvas, document.body.firstChild);
      this.ctx = this.canvas.getContext("2d");
      window.addEventListener("resize", () => { if (this.active) this.build(); });
      document.addEventListener("visibilitychange", () => { if (this.active && !document.hidden) this.loop(); });
    }
    if (!this.canvas) return;
    this.canvas.style.display = on ? "block" : "none";
    const tn = document.getElementById("souls-tuner"); if (tn) tn.style.display = on ? "" : "none";
    if (on) { this.build(); this.loop(); } else cancelAnimationFrame(this.raf);
  },

  // The sand, drawn once per window size; the faces drift, rock and groan on top of it.
  build() {
    const W = window.innerWidth, H = window.innerHeight;
    if (!W || !H) { this.sand = null; return; }   // no size yet (a background tab): wait for the resize
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.W = W; this.H = H; this.dpr = dpr;
    this.k = Math.max(0.55, Math.min(1.1, Math.min(W, H) / 820));   // faces scale with the screen (smaller on phones)
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    // the souls are drawn on a layer of their own first, so it can be laid down with a heat-haze ripple
    this.fl = document.createElement("canvas"); this.fl.width = this.canvas.width; this.fl.height = this.canvas.height;
    this.flc = this.fl.getContext("2d");
    const s = document.createElement("canvas");
    s.width = this.canvas.width; s.height = this.canvas.height;
    const c = s.getContext("2d");
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // Volcanic soul sand: layers of soft colour cloud (charred black, oxblood, burnt umber, dull ochre)
    // at three scales, so it has depth instead of one flat brown; then glowing cracks and old scorch marks.
    c.fillStyle = "#1f120c"; c.fillRect(0, 0, s.width, s.height);
    const cloud = (cell, palette, alpha) => {
      const cw = Math.ceil(s.width / cell) + 2, chh = Math.ceil(s.height / cell) + 2;
      const t = document.createElement("canvas"); t.width = cw; t.height = chh;
      const tc = t.getContext("2d"), id = tc.createImageData(cw, chh);
      for (let i = 0; i < cw * chh; i++) {
        const col = palette[Math.floor(rnd() * palette.length)];
        id.data[i * 4] = col[0]; id.data[i * 4 + 1] = col[1]; id.data[i * 4 + 2] = col[2]; id.data[i * 4 + 3] = col[3] * 255;
      }
      tc.putImageData(id, 0, 0);
      c.save(); c.globalAlpha = alpha; c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
      c.drawImage(t, -cell, -cell, cw * cell, chh * cell); c.restore();
    };
    cloud(260 * dpr, [[18, 9, 6, 1], [58, 22, 14, 1], [74, 44, 24, 1], [40, 24, 16, 1], [26, 14, 10, 1], [88, 30, 16, 1]], 1);
    cloud(80 * dpr, [[10, 5, 3, 1], [92, 58, 32, 1], [64, 24, 14, 1], [36, 20, 12, 1], [0, 0, 0, 0]], 0.5);
    cloud(22 * dpr, [[8, 4, 2, 1], [110, 72, 42, 1], [52, 30, 18, 1], [0, 0, 0, 0], [0, 0, 0, 0]], 0.3);
    // scorch marks
    for (let i = 0; i < 18; i++) {
      const x = rnd() * s.width, y = rnd() * s.height, r = (40 + rnd() * 120) * dpr;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(4, 2, 1, 0.45)"); g.addColorStop(1, "rgba(4, 2, 1, 0)");
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // cracks with a dull ember glow in them
    for (let i = 0; i < Math.max(6, Math.round(W * H / 90000)); i++) {
      let x = rnd() * s.width, y = rnd() * s.height, ang = rnd() * Math.PI * 2;
      const pts = [[x, y]];
      for (let j = 0, n = 6 + Math.floor(rnd() * 10); j < n; j++) {
        ang += (rnd() - 0.5) * 1.1; const step = (10 + rnd() * 22) * dpr;
        x += Math.cos(ang) * step; y += Math.sin(ang) * step; pts.push([x, y]);
      }
      const path = () => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) c.lineTo(q[0], q[1]); };
      c.lineCap = "round"; c.lineJoin = "round";
      const K = this.P.cracks;
      c.save(); c.globalCompositeOperation = "lighter"; c.shadowColor = `rgba(220, 60, 0, ${Math.min(1, 0.45 * K)})`; c.shadowBlur = 16 * dpr;
      path(); c.strokeStyle = `rgba(150, 40, 5, ${Math.min(1, 0.18 * K)})`; c.lineWidth = 3 * dpr; c.stroke(); c.restore();
      path(); c.strokeStyle = `rgba(8, 3, 1, ${Math.min(1, 0.35 * K)})`; c.lineWidth = 1.2 * dpr; c.stroke();
      path(); c.save(); c.globalCompositeOperation = "lighter"; c.strokeStyle = `rgba(255, 120, 30, ${Math.min(1, 0.08 * K)})`; c.lineWidth = 0.6 * dpr; c.stroke(); c.restore();
    }
    // the faces: one per cell of a tight, loose grid, so they fill the table without piling up
    this.faces = [];
    const cw = 84 * this.k, ch = 96 * this.k;
    for (let row = 0, y0 = -ch * 0.3; y0 < H + ch * 0.3; row++, y0 += ch) {
      for (let x0 = (row % 2) * cw * 0.5 - cw * 0.3; x0 < W + cw * 0.3; x0 += cw) {
        const per = lo => (Math.PI * 2) / lo;
        this.faces.push({
          x: x0 + (rnd() - 0.5) * cw * 0.4, y: y0 + (rnd() - 0.5) * ch * 0.35,
          size: (0.72 + rnd() * 0.4) * this.k, shape: rnd(),
          // drifting a little, each its own way round
          ax: (4 + rnd() * 8) * this.k, ay: (4 + rnd() * 8) * this.k,
          wx: per(9 + rnd() * 10), wy: per(11 + rnd() * 10), px: rnd() * 6.3, py: rnd() * 6.3,
          // rocking slowly, but always mostly upright
          t0: (rnd() - 0.5) * 0.25, ra: 0.1 + rnd() * 0.18, rw: per(12 + rnd() * 14), pr: rnd() * 6.3,
          // a slow groan every 5-11 s, the eyes on their own rhythm
          mw: per(5 + rnd() * 6), mp: rnd() * 6.3, mo: 0.35 + rnd() * 0.35,
          ew: per(4 + rnd() * 7), ep: rnd() * 6.3
        });
      }
    }
    // grains
    const img = c.getImageData(0, 0, s.width, s.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rnd() - 0.5) * 30, k = rnd() < 0.012 ? 22 : 0;
      d[i] = Math.max(0, Math.min(255, d[i] + n + k));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 0.8 + k * 0.7));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.6 + k * 0.5));
    }
    c.putImageData(img, 0, 0);
    this.sand = s;
    this.makeGlow();
    this.shade = this.vignette();
    this.makeHead();
    this.makeSprites();
    // smoke: lots of thin wisps curling up out of the sand
    // they're drawn on a small layer (a third of the size) and softened as it's laid down, so they look
    // hazy and diffuse rather than drawn
    this.sm = document.createElement("canvas");
    this.sm.width = Math.ceil(W / 3); this.sm.height = Math.ceil(H / 3);
    this.smc = this.sm.getContext("2d");
    this.wisps = [];
    this.fit("wisps", Math.round(Math.max(110, W * H / 3000) * this.P.smoke), () => this.newWisp(Math.random()));
    // embers drifting up, and now and then a lick of flame from a crack in the sand
    this.embers = [];
    this.fit("embers", Math.round(Math.max(25, W * H / 9000) * this.P.embers), () => this.newEmber(true));
    this.flames = [];
    this.flameEvery = 1100000 / (W * H);   // seconds between new licks: about 3 at once on a big screen
    this.tint();
    if (SOULS_TUNER) this.tuner();
    this.flameT = 0;
    this.draw(performance.now());
  },

  // overall colour: a filter on the whole canvas (free to run)
  tint() {
    if (!this.canvas) return;
    const P = this.P;
    this.canvas.style.filter = (P.hue || P.saturation !== 1 || P.brightness !== 1)
      ? `hue-rotate(${P.hue}deg) saturate(${P.saturation}) brightness(${P.brightness})` : "";
  },
  // ---- the glow beneath: two soft mottled images, made once at a small size and drawn smoothly enlarged
  makeGlow() {
    const P = this.P, gw = Math.ceil(this.W / 8), gh = Math.ceil(this.H / 8);
    const one = seed => {
      let x = seed; const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
      // smooth noise at three scales, added together
      const layer = (cells, amp) => {
        const cw = Math.max(2, Math.round(gw / (cells / P.glowScale))), ch = Math.max(2, Math.round(gh / (cells / P.glowScale)));
        const t = document.createElement("canvas"); t.width = Math.ceil(gw / cw) + 2; t.height = Math.ceil(gh / ch) + 2;
        const tc = t.getContext("2d"), id = tc.createImageData(t.width, t.height);
        for (let i = 0; i < t.width * t.height; i++) { const v = rnd() * 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
        tc.putImageData(id, 0, 0);
        return { t, cw, ch, amp };
      };
      const layers = [layer(5, 0.6), layer(12, 0.28), layer(28, 0.12)];
      const cv = document.createElement("canvas"); cv.width = gw; cv.height = gh;
      const c = cv.getContext("2d");
      const acc = new Float32Array(gw * gh);
      for (const L of layers) {
        const tmp = document.createElement("canvas"); tmp.width = gw; tmp.height = gh;
        const tc = tmp.getContext("2d"); tc.imageSmoothingEnabled = true; tc.imageSmoothingQuality = "high";
        tc.drawImage(L.t, -L.cw, -L.ch, L.t.width * L.cw, L.t.height * L.ch);
        const d = tc.getImageData(0, 0, gw, gh).data;
        for (let i = 0; i < gw * gh; i++) acc[i] += d[i * 4] / 255 * L.amp;
      }
      const out = c.createImageData(gw, gh);
      for (let i = 0; i < gw * gh; i++) {
        // stretch the contrast so it's mottled rather than flat, then colour it: dark crimson -> red -> orange
        let v = Math.max(0, Math.min(1, (acc[i] - 0.3) * 2.2));
        v = v * v * (3 - 2 * v);
        const k = Math.min(1, v * P.glowBright);
        out.data[i * 4] = Math.min(255, 30 + 190 * k);
        out.data[i * 4 + 1] = Math.min(255, 3 + 25 * k + 110 * Math.max(0, k - 0.5) * (0.4 + P.glowHeat * 1.4));
        out.data[i * 4 + 2] = Math.min(255, 2 + 20 * Math.max(0, k - 0.75) * P.glowHeat);
        out.data[i * 4 + 3] = 255;
      }
      c.putImageData(out, 0, 0);
      return cv;
    };
    this.glowA = one(31); this.glowB = one(77);
  },
  drawGlowAndSand(c, s) {
    const P = this.P, W = this.canvas.width, H = this.canvas.height;
    c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
    if (this.glowA) {
      c.drawImage(this.glowA, 0, 0, W, H);
      // the second glow fades in and out over the first, very slowly, so patches warm and cool in place
      const f = 0.5 + 0.5 * Math.sin((s / Math.max(2, P.breathSecs * 1.7)) * Math.PI * 2);
      c.globalAlpha = Math.min(1, f * P.patchBreath * 1.5);
      if (c.globalAlpha > 0.01) c.drawImage(this.glowB, 0, 0, W, H);
    }
    // the sand over it, partly see-through so the warmth comes up from beneath; the glow breathes by the sand
    // thinning and thickening very slightly
    const breath = Math.sin((s / Math.max(2, P.breathSecs)) * Math.PI * 2) * P.breathAmt * 0.5;
    c.globalAlpha = Math.max(0, Math.min(1, 1 - P.glowShow * (1 + breath)));
    c.drawImage(this.sand, 0, 0);
    c.restore();
  },
  // ---- sprite sheets
  makeSprites() { this.makeWispSheet(); this.makeFaceSheet(); this.makeEmberSprites(); },
  // Smoke: 12 kinds of wisp, each drawn at 12 stages of its curl (the curl climbs the thread as it
  // turns), at a third of full size and softened, the way the smoke layer used to be drawn every frame.
  makeWispSheet() {
    const S = 1 / 3, L0 = 140 * this.k, cw = Math.ceil(70 * this.k * S * 1.4) + 8, ch = Math.ceil(L0 * S) + 10, V = 12, F = 12;
    const sheet = document.createElement("canvas"); sheet.width = cw * F; sheet.height = ch * V;
    const c = sheet.getContext("2d");
    let seed = 41; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let v = 0; v < V; v++) {
      const amp = (5 + rnd() * 9) * this.k, freq = 0.035 + rnd() * 0.04, lean = (rnd() - 0.5) * 0.5, wid = (1.3 + rnd() * 1.5) * this.k;
      for (let f = 0; f < F; f++) {
        const ox = f * cw + cw / 2, oy = v * ch + ch - 5, L = L0 * S, ph = (f / F) * Math.PI * 2;
        const g = c.createLinearGradient(0, oy, 0, oy - L);
        g.addColorStop(0, "rgba(8, 4, 2, 0)"); g.addColorStop(0.2, "rgba(8, 4, 2, 1)"); g.addColorStop(0.75, "rgba(8, 4, 2, 0.5)"); g.addColorStop(1, "rgba(8, 4, 2, 0)");
        c.save(); c.beginPath(); c.rect(f * cw, v * ch, cw, ch); c.clip();
        c.filter = "blur(0.6px)"; c.strokeStyle = g; c.lineCap = "round"; c.lineJoin = "round";
        c.beginPath();
        for (let j = 0; j <= 12; j++) {
          const t = j / 12, x = ox + (Math.sin(t * L0 * freq - ph) * amp * (0.25 + t) + lean * L0 * t) * S, y = oy - L * t;
          if (j) c.lineTo(x, y); else c.moveTo(x, y);
        }
        c.lineWidth = wid * 1.75 * 1.6 * S * 3; c.globalAlpha = 0.45; c.stroke();
        c.lineWidth = wid * S * 3 * 0.6; c.globalAlpha = 1; c.stroke();
        c.restore();
      }
    }
    this.wispSheet = { img: sheet, cw, ch, F, L0 };
  },
  // Faces: every expression a face can pull (3 shapes x 16 mouth openings x 5 eye openings), each with its
  // head, drawn once at the largest face size.
  makeFaceSheet() {
    if (!this.head) return;
    const P = this.P, big = 1.15 * this.k, d = this.dpr, u = 34 * big * d;
    const fw = Math.ceil(this.head.width * big), fh = Math.ceil(this.head.height * big);
    const SH = 3, MO = 16, EY = 5, cols = MO * EY;
    const sheet = document.createElement("canvas"); sheet.width = fw * cols; sheet.height = fh * SH;
    const c = sheet.getContext("2d");
    for (let sh = 0; sh < SH; sh++) for (let mo = 0; mo < MO; mo++) for (let ey = 0; ey < EY; ey++) {
      const shape = (sh + 0.5) / SH, open = mo / (MO - 1) * 0.7, e = ey / (EY - 1), g = Math.min(1, open / 0.5);
      const mouth = u * (0.12 + open * 0.6), eye = u * (0.27 - 0.13 * e - 0.04 * g);
      c.save(); c.translate((mo * EY + ey) * fw + fw / 2, sh * fh + fh / 2);
      c.globalAlpha = Math.min(1, P.headSolid); c.drawImage(this.head, -fw / 2, -fh / 2, fw, fh);
      c.globalAlpha = 1; this.misery(c, u, eye, mouth, g, shape);
      c.restore();
    }
    this.faceSheet = { img: sheet, fw, fh, SH, MO, EY, big };
  },
  // Embers: two soft glowing dots (hot and warm), painted at each ember's place and brightness.
  makeEmberSprites() {
    const mk = hot => {
      const R = 16, cv = document.createElement("canvas"); cv.width = cv.height = R * 2; const c = cv.getContext("2d");
      const g = c.createRadialGradient(R, R, 0, R, R, R);
      g.addColorStop(0, hot ? "rgba(255, 210, 120, 1)" : "rgba(255, 140, 40, 1)"); g.addColorStop(0.3, "rgba(240, 80, 10, 0.5)"); g.addColorStop(1, "rgba(200, 40, 0, 0)");
      c.fillStyle = g; c.fillRect(0, 0, R * 2, R * 2); return cv;
    };
    this.emberHot = mk(true); this.emberWarm = mk(false);
  },
  // keep a list at n items (the sliders change how many wisps and embers there are)
  fit(key, n, make) {
    const a = this[key] || (this[key] = []);
    while (a.length < n) a.push(make());
    if (a.length > n) a.length = Math.max(0, n);
  },
  makeHead() {
    const U = 34 * this.dpr, hs = document.createElement("canvas"), T = this.P.headTone;
    hs.width = Math.ceil(U * 2.2); hs.height = Math.ceil(U * 2.8);
    const hc = hs.getContext("2d"), col = (r, g, b, a) => `rgba(${Math.min(255, Math.round(r * T))}, ${Math.min(255, Math.round(g * T))}, ${Math.min(255, Math.round(b * T))}, ${a})`;
    hc.translate(hs.width / 2, hs.height / 2);
    const head = hc.createRadialGradient(0, -U * 0.15, 0, 0, 0, U * 1.3);
    head.addColorStop(0, col(116, 80, 55, 1)); head.addColorStop(0.62, col(90, 60, 41, 0.95)); head.addColorStop(0.8, col(70, 46, 32, 0.6)); head.addColorStop(1, col(60, 40, 28, 0));
    hc.fillStyle = head;
    hc.beginPath(); hc.ellipse(0, 0, U * 1.0, U * 1.3, 0, 0, Math.PI * 2); hc.fill();
    this.head = hs;
  },
  // A wisp: a thin thread of smoke rising from one spot, curling as it goes; it lives a while, then
  // fades and another rises somewhere else. age0 lets the first ones start part-way through.
  newWisp(age0 = 0) {
    const k = this.k, life = 6 + Math.random() * 6;
    return { x: Math.random() * this.W, y: this.H * (0.15 + Math.random() * 0.95), age: age0 * life, life,
      len: (50 + Math.random() * 90) * k, amp: (5 + Math.random() * 9) * k, freq: 0.035 + Math.random() * 0.04,
      speed: 1.2 + Math.random() * 1.4, ph: Math.random() * 6.3, lean: (Math.random() - 0.5) * 0.5,
      rise: (6 + Math.random() * 8) * k, w: (1.3 + Math.random() * 1.5) * k, a: 0.6 + Math.random() * 0.3,
      v: Math.floor(Math.random() * 12), flip: Math.random() < 0.5 };
  },
  newEmber(anywhere) {
    const k = this.k;
    return { x: Math.random() * this.W, y: Math.random() * this.H * 1.05,   // born anywhere, so they spread evenly
      vy: (4 + Math.random() * 8) * k, vx: (Math.random() - 0.5) * 4 * k, r: (0.8 + Math.random() * 1.6) * k,
      age: anywhere ? Math.random() * 6 : 0, life: 5 + Math.random() * 6, fl: Math.random() * 6.3, fs: 0.6 + Math.random() * 1.4, hot: Math.random() };
  },
  // a lick of flame: a few tongues rising from one spot, flaring up and dying back over a second or two
  newFlame() {
    const k = this.k, n = 2 + Math.floor(Math.random() * 3), tongues = [];
    for (let i = 0; i < n; i++) tongues.push({ dx: (i - (n - 1) / 2) * 7 * k + (Math.random() - 0.5) * 4 * k,
      h: (38 + Math.random() * 42) * k, w: (4 + Math.random() * 3) * k, ph: Math.random() * 6.3, sp: 7 + Math.random() * 5 });
    return { x: Math.random() * this.W, y: this.H * (0.15 + Math.random() * 0.85), age: 0, life: 1.4 + Math.random() * 1.6, tongues };
  },
  stepFire(dt) {
    for (let i = 0; i < this.embers.length; i++) {
      const e = this.embers[i];
      const v = dt * this.P.emberSpeed;
      e.age += v; e.y -= e.vy * v; e.x += (e.vx + Math.sin(e.age * 0.8 + e.fl) * 4 * this.k) * v;
      if (e.age >= e.life || e.y < -10) this.embers[i] = this.newEmber(false);
    }
    this.flameT += dt * this.P.flames;
    while (this.flameT >= this.flameEvery) { this.flameT -= this.flameEvery; this.flames.push(this.newFlame()); }
    for (const f of this.flames) f.age += dt;
    this.flames = this.flames.filter(f => f.age < f.life);
    for (const f of this.flames) if (Math.random() < dt * 3) this.embers.push(Object.assign(this.newEmber(false), { x: f.x, y: f.y - 10 * this.k, life: 1.5 + Math.random() * 2, hot: 1 }));
    const cap = Math.max(400, Math.round(Math.max(25, this.W * this.H / 9000) * this.P.embers * 1.5));
    if (this.embers.length > cap) this.embers.splice(0, this.embers.length - cap);
  },
  stepSmoke(dt) {
    for (let i = 0; i < this.wisps.length; i++) {
      const w = this.wisps[i];
      w.age += dt;
      if (w.age >= w.life) this.wisps[i] = this.newWisp(0);
    }
  },
  vignette() {
    const v = document.createElement("canvas");
    v.width = this.canvas.width; v.height = this.canvas.height;
    const c = v.getContext("2d");
    const g = c.createRadialGradient(v.width / 2, v.height / 2, Math.min(v.width, v.height) * 0.3, v.width / 2, v.height / 2, Math.max(v.width, v.height) * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.55)");
    c.fillStyle = g; c.fillRect(0, 0, v.width, v.height);
    return v;
  },

  // A hollow in the sand: dark inside, a lighter lip along its lower edge where the light catches it.
  hollow(c, x, y, rx, ry, rot) {
    if (rx < 0.4 || ry < 0.4) return;
    c.fillStyle = "rgba(150, 108, 76, 0.38)";
    c.beginPath(); c.ellipse(x, y + ry * 0.22, rx * 1.05, ry * 1.02, rot, 0, Math.PI * 2); c.fill();
    c.fillStyle = "rgba(16, 8, 4, 0.82)";
    c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); c.fill();
  },

  // A miserable face, drawn into the sand: brows pinched up in the middle, eyes drooping at the outer
  // corners in sunken sockets, and a mouth whose corners sag as it wails. g = groan (0..1).
  misery(c, u, eye, mouth, g, shape) {
    const dark = "rgba(16, 8, 4, 0.82)", lip = "rgba(150, 108, 76, 0.38)";
    for (const side of [-1, 1]) {
      const ex = side * u * 0.34, ey = -u * 0.2;
      // sunken socket: a soft shadow around and below the eye
      const sock = c.createRadialGradient(ex, ey + u * 0.05, 0, ex, ey + u * 0.05, u * 0.32);
      sock.addColorStop(0, "rgba(14, 7, 3, 0.45)"); sock.addColorStop(1, "rgba(14, 7, 3, 0)");
      c.fillStyle = sock; c.fillRect(ex - u * 0.32, ey - u * 0.27, u * 0.64, u * 0.64);
      // the eye: wider than tall, its outer corner sagging down
      const droop = -side * (0.5 + 0.15 * shape);
      const ry = Math.max(0.5, eye * 0.72);
      c.fillStyle = lip; c.beginPath(); c.ellipse(ex, ey + ry * 0.25, u * 0.2, ry * 1.04, droop, 0, Math.PI * 2); c.fill();
      c.fillStyle = dark; c.beginPath(); c.ellipse(ex, ey, u * 0.19, ry, droop, 0, Math.PI * 2); c.fill();
      // the brow: a faint crease, gently curved (arching over the eye), its inner end raised a little
      // more as the groan comes; lighter and thinner than the eyes and mouth
      const lift = u * (0.06 + 0.05 * g);
      c.strokeStyle = "rgba(24, 12, 6, 0.42)"; c.lineWidth = u * 0.05; c.lineCap = "round";
      c.beginPath();
      c.moveTo(ex + side * u * 0.2, ey - u * 0.22);
      c.quadraticCurveTo(ex + side * u * 0.03, ey - u * 0.3 - lift * 0.55, ex - side * u * 0.19, ey - u * 0.31 - lift);
      c.stroke();
    }
    // the mouth: corners dragged down, the top arching up in the middle, opening downward as it wails
    const w = u * (0.2 + 0.04 * shape - 0.05 * g), top = u * 0.36, h = Math.max(u * 0.12, mouth * 1.6);
    const path = dy => {
      c.beginPath();
      c.moveTo(-w, top + h * 0.45 + dy);
      c.quadraticCurveTo(0, top - h * 0.25 + dy, w, top + h * 0.45 + dy);
      c.quadraticCurveTo(w * 1.05, top + h + dy, 0, top + h * 1.08 + dy);
      c.quadraticCurveTo(-w * 1.05, top + h + dy, -w, top + h * 0.45 + dy);
      c.closePath();
    };
    c.fillStyle = lip; path(u * 0.04); c.fill();
    c.fillStyle = dark; path(0); c.fill();
  },

  draw(now) {
    if (!this.sand || !this.sand.width || !this.sand.height) return;
    let c = this.ctx; const d = this.dpr, s = now / 1000;
    this.drawGlowAndSand(c, s);
    // the smoke, under the faces: wisp sprites, cross-fading between curl stages as the curl climbs
    if (this.wispSheet) {
      const WS = this.wispSheet, img = WS.img;
      c.save(); c.imageSmoothingEnabled = true;
      for (const w of this.wisps) {
        const q = w.age / w.life, fade = Math.min(1, Math.sin(Math.PI * q) ** 1.2 * this.P.smokeDark);
        if (fade < 0.02) continue;
        const sc = (w.len / WS.L0) * 3 * d, dw = WS.cw * sc * (1 + q * 0.6), dh = WS.ch * sc;
        const x = w.x * d - dw / 2, y = (w.y - w.rise * w.age) * d - dh + 5 * sc;
        let ph = ((w.age * w.speed + w.ph) / (Math.PI * 2)) % 1; if (ph < 0) ph += 1;
        const fp = ph * WS.F, f0 = Math.floor(fp) % WS.F, f1 = (f0 + 1) % WS.F, mix = fp - Math.floor(fp);
        if (w.flip) { c.setTransform(-1, 0, 0, 1, 2 * (x + dw / 2), 0); }
        c.globalAlpha = Math.min(1, w.a * fade * 1.4 * (1 - mix)); c.drawImage(img, f0 * WS.cw, w.v * WS.ch, WS.cw, WS.ch, x, y, dw, dh);
        c.globalAlpha = Math.min(1, w.a * fade * 1.4 * mix); c.drawImage(img, f1 * WS.cw, w.v * WS.ch, WS.cw, WS.ch, x, y, dw, dh);
        if (w.flip) c.setTransform(1, 0, 0, 1, 0, 0);
      }
      c.restore();
    }
    // fire, behind the souls: licks of flame, then the embers
    c.globalCompositeOperation = "lighter";
    for (const f of this.flames) {
      const q = f.age / f.life, life = Math.sin(Math.PI * Math.min(1, q * 1.15)) ** 0.8;
      if (life < 0.02) continue;
      const x0 = f.x * d, y0 = f.y * d;
      const glow = c.createRadialGradient(x0, y0, 0, x0, y0, 34 * this.k * d);
      glow.addColorStop(0, `rgba(255, 110, 20, ${(0.22 * life).toFixed(3)})`); glow.addColorStop(1, "rgba(255, 60, 0, 0)");
      c.fillStyle = glow; c.fillRect(x0 - 34 * this.k * d, y0 - 34 * this.k * d, 68 * this.k * d, 68 * this.k * d);
      for (const t of f.tongues) {
        const h = t.h * life * d * this.P.flameSize, w = t.w * d * Math.sqrt(this.P.flameSize), bx = x0 + t.dx * d;
        const sway = Math.sin(s * t.sp + t.ph) * w * 0.9, tipx = bx + sway * 1.6;
        // fades in from the sand, brightest low down, thinning to nothing at the tip
        const g = c.createLinearGradient(0, y0 + w, 0, y0 - h);
        g.addColorStop(0, "rgba(255, 150, 40, 0)");
        g.addColorStop(0.18, `rgba(255, 185, 70, ${(0.5 * life).toFixed(3)})`);
        g.addColorStop(0.55, `rgba(235, 85, 15, ${(0.32 * life).toFixed(3)})`);
        g.addColorStop(1, "rgba(150, 20, 0, 0)");
        c.fillStyle = g;
        c.beginPath();
        // a tongue: rounded at the root, bellying out, then curling to a thin tip
        c.moveTo(bx, y0 + w * 0.8);
        c.quadraticCurveTo(bx - w * 1.4, y0 + w * 0.5, bx - w * 1.2 + sway * 0.3, y0 - h * 0.3);
        c.quadraticCurveTo(bx - w * 0.6 + sway * 1.2, y0 - h * 0.75, tipx, y0 - h);
        c.quadraticCurveTo(bx + w * 0.6 + sway * 1.1, y0 - h * 0.7, bx + w * 1.2 + sway * 0.3, y0 - h * 0.3);
        c.quadraticCurveTo(bx + w * 1.4, y0 + w * 0.5, bx, y0 + w * 0.8);
        c.closePath(); c.fill();
      }
    }
    for (const e of this.embers) {
      const q = e.age / e.life, a = this.P.emberBright * Math.min(1, q * 3) * Math.min(1, (1 - q) * 3) * (0.75 + 0.25 * Math.sin(e.age * e.fs + e.fl))   /* a slow glow, not a blink */;
      if (a < 0.03) continue;
      const x = e.x * d, y = e.y * d, r = e.r * d;
      c.globalAlpha = Math.min(1, a); c.drawImage(e.hot > 0.5 ? this.emberHot : this.emberWarm, x - r * 4, y - r * 4, r * 8, r * 8);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    // the souls, on top of everything (smoke and fire pass behind them), solid
    const P = this.P, rip = P.ripple > 0.05 && this.flc;
    const main = c;
    if (rip) { c = this.flc; c.clearRect(0, 0, this.fl.width, this.fl.height); }
    for (const f of this.faces) {
      const size = f.size * P.faceSize, u = 34 * size * d;
      // the groan: the mouth slowly opens wide and sags shut again
      const m = 0.5 - 0.5 * Math.cos(s * f.mw + f.mp);
      // the eyes slowly squeeze half shut and open again
      const e = 0.5 - 0.5 * Math.cos(s * f.ew + f.ep);
      const x = f.x + f.ax * P.drift * Math.sin(s * f.wx + f.px), y = f.y + f.ay * P.drift * Math.sin(s * f.wy + f.py);
      const tilt = (f.t0 + f.ra * Math.sin(s * f.rw + f.pr)) * P.rock;
      const FS = this.faceSheet;
      const sh = Math.min(FS.SH - 1, Math.floor(f.shape * FS.SH)), mo = Math.round(Math.min(1, f.mo * m / 0.7) * (FS.MO - 1)), ey = Math.round(e * (FS.EY - 1));
      const k = size / FS.big, dw = FS.fw * k, dh = FS.fh * k;
      c.save();
      c.translate(x * d, y * d);
      c.rotate(tilt);
      c.globalAlpha = P.faces;
      c.drawImage(FS.img, (mo * FS.EY + ey) * FS.fw, sh * FS.fh, FS.fw, FS.fh, -dw / 2, -dh / 2, dw, dh);
      c.restore();
    }
    if (rip) {
      // heat haze: lay the souls layer down in thin bands, each nudged sideways by a slow wave rising up the
      // screen (two waves mixed so it never looks regular)
      c = main;
      const FW = this.fl.width, FH = this.fl.height, band = Math.max(2, Math.round(3 * d)), lam = P.rippleSize * d, amp = P.ripple * d;
      const t = s * P.rippleSpeed;
      for (let y = 0; y < FH; y += band) {
        const h = Math.min(band, FH - y), q = y / lam;
        const dx = amp * (0.7 * Math.sin((q + t) * 6.283) + 0.3 * Math.sin((q * 2.3 + t * 1.7) * 6.283 + 1.3));
        c.drawImage(this.fl, 0, y, FW, h, dx, y, FW, h);
      }
    }
    c.globalAlpha = Math.min(1, P.vignette);
    c.drawImage(this.shade, 0, 0);
    c.globalAlpha = 1;
  },

  // TEMPORARY: sliders for tuning the look (only while SOULS_TUNER is on)
  tuner() {
    if (document.getElementById("souls-tuner")) return;
    const P = this.P, rows = [
      ["faces", "Face opacity", 0, 1, 0.01, ""], ["headSolid", "Head solidity", 0, 1.5, 0.05, "head"], ["headTone", "Head brightness", 0.4, 1.6, 0.05, "head"],
      ["faceSize", "Face size", 0.5, 1.6, 0.05, ""], ["drift", "Float amount", 0, 3, 0.1, ""], ["rock", "Rotation amount", 0, 3, 0.1, ""],
      ["smoke", "Smoke amount", 0, 3, 0.1, "count"], ["smokeDark", "Smoke darkness", 0, 2.5, 0.05, ""],
      ["embers", "Ember amount", 0, 3, 0.1, "count"], ["emberSpeed", "Ember speed", 0.1, 3, 0.05, ""], ["emberBright", "Ember brightness", 0, 2, 0.05, ""],
      ["flames", "Flame frequency", 0, 4, 0.1, ""], ["flameSize", "Flame size", 0.3, 2.5, 0.05, ""],
      ["cracks", "Crack glow", 0, 3, 0.1, "sand"], ["vignette", "Edge darkening", 0, 1.8, 0.05, ""],
      ["glowShow", "Glow through the sand", 0, 1, 0.02, ""], ["glowBright", "Glow brightness", 0.2, 2, 0.05, "glow"], ["glowHeat", "Glow heat (red-orange)", 0, 1, 0.05, "glow"],
      ["glowScale", "Glow patch size", 0.3, 3, 0.05, "glow"], ["breathAmt", "Breathing amount", 0, 1, 0.05, ""], ["breathSecs", "Breathing time (s)", 4, 40, 1, ""],
      ["patchBreath", "Patches warming/cooling", 0, 1, 0.05, ""],
      ["ripple", "Soul ripple strength", 0, 12, 0.25, ""], ["rippleSize", "Ripple wave size", 20, 300, 5, ""], ["rippleSpeed", "Ripple speed", 0, 2, 0.05, ""],
      ["hue", "Overall hue", -180, 180, 1, "tint"], ["saturation", "Saturation", 0, 2.5, 0.05, "tint"], ["brightness", "Brightness", 0.4, 1.8, 0.05, "tint"]];
    const el = document.createElement("div");
    el.id = "souls-tuner";
    el.style.cssText = "position:fixed;left:8px;top:8px;z-index:40000;background:rgba(20,10,6,0.92);color:#f1dcae;border:1px solid #a87a52;border-radius:8px;padding:6px 10px 8px;font:12px/1.3 system-ui,sans-serif;width:290px;max-height:94vh;overflow-y:auto;overflow-x:hidden;box-sizing:border-box";
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><b>Souls tuning (temporary)</b>'
      + '<button type="button" data-t="hide" style="margin:0;padding:1px 7px;font-size:12px">-</button></div><div data-t="body">'
      + rows.map(([k, label, lo, hi, st]) => '<label style="display:grid;grid-template-columns:100px 1fr 40px;gap:4px;align-items:center">' + label
        + '<input type="range" min="' + lo + '" max="' + hi + '" step="' + st + '" value="' + P[k] + '" data-k="' + k + '"><span data-v="' + k + '">' + P[k] + '</span></label>').join("")
      + '<div style="display:flex;gap:6px;margin-top:6px"><button type="button" data-t="copy" style="margin:0;padding:3px 8px;font-size:12px">Copy values</button>'
      + '<button type="button" data-t="reset" style="margin:0;padding:3px 8px;font-size:12px">Reset</button></div><div data-t="msg" style="min-height:1.2em;margin-top:3px;opacity:0.85"></div></div>';
    document.body.appendChild(el);
    el.style.display = this.active ? "" : "none";
    const defaults = Object.assign({}, P);
    let sandT = 0;
    const kindOf = k => rows.find(x => x[0] === k)[5];
    const apply = (k, v) => {
      P[k] = v; el.querySelector('[data-v="' + k + '"]').textContent = v;
      const kind = kindOf(k);
      if (kind === "tint") this.tint();
      else if (kind === "glow") this.makeGlow();
      else if (kind === "head") { this.makeHead(); this.makeFaceSheet(); }
      else if (k === "smoke") this.fit("wisps", Math.round(Math.max(110, this.W * this.H / 3000) * v), () => this.newWisp(Math.random()));
      else if (k === "embers") this.fit("embers", Math.round(Math.max(25, this.W * this.H / 9000) * v), () => this.newEmber(true));
      else if (kind === "sand") { clearTimeout(sandT); sandT = setTimeout(() => this.build(), 250); }
      if (this.still) this.draw(performance.now());
    };
    el.querySelectorAll("input[type=range]").forEach(r => r.addEventListener("input", () => apply(r.dataset.k, +r.value)));
    ["pointerdown", "mousedown", "keydown"].forEach(ev => el.addEventListener(ev, e => e.stopPropagation()));
    el.addEventListener("click", e => {
      e.stopPropagation();
      const t = e.target.dataset && e.target.dataset.t;
      if (t === "hide") { const b = el.querySelector('[data-t="body"]'); b.style.display = b.style.display ? "" : "none"; e.target.textContent = b.style.display ? "+" : "-"; }
      if (t === "reset") el.querySelectorAll("input[type=range]").forEach(r => { r.value = defaults[r.dataset.k]; apply(r.dataset.k, defaults[r.dataset.k]); });
      if (t === "copy") {
        const txt = "Souls: " + rows.map(([k, label]) => label + " " + P[k]).join(", ");
        const msg = el.querySelector('[data-t="msg"]');
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => { msg.textContent = "Copied - paste it to Claude"; }, () => { msg.textContent = txt; });
      }
    });
  },

  loop() {
    cancelAnimationFrame(this.raf);
    if (!this.active || document.hidden) return;
    if (this.still) { this.draw(performance.now()); return; }
    this.last = 0;
    const tick = now => {
      if (!this.active || document.hidden) return;
      this.raf = requestAnimationFrame(tick);
      if (now - this.last < 1000 / 24) return;   // slow movement: 24 frames a second is plenty
      const dt = this.last ? Math.min(0.25, (now - this.last) / 1000) : 0;
      this.last = now;
      this.stepSmoke(dt);
      this.stepFire(dt);
      this.draw(now);
    };
    this.raf = requestAnimationFrame(tick);
  }
};

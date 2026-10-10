// oh-souls.js - the "Souls" table: dark soul sand packed with faces of the damned, drifting a little in
// the sand, rocking slowly (always mostly upright) and groaning: each mouth slowly opens and closes and
// the eyes slowly narrow and widen, every face at its own pace. Wisps of dark smoke rise among them, embers drift up and licks of flame flare from the sand. Drawn on a canvas behind the table; it only runs while the Souls table is chosen, rests
// while the tab is hidden, and stays still for anyone who has asked their computer for reduced motion.

const t0 = q => q * 1.5;   // how much a wisp's haze has spread by this point in its life

const SOULS = {
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
      c.save(); c.globalCompositeOperation = "lighter"; c.shadowColor = "rgba(220, 60, 0, 0.45)"; c.shadowBlur = 16 * dpr;
      path(); c.strokeStyle = "rgba(150, 40, 5, 0.18)"; c.lineWidth = 3 * dpr; c.stroke(); c.restore();
      path(); c.strokeStyle = "rgba(8, 3, 1, 0.35)"; c.lineWidth = 1.2 * dpr; c.stroke();
      path(); c.save(); c.globalCompositeOperation = "lighter"; c.strokeStyle = "rgba(255, 120, 30, 0.08)"; c.lineWidth = 0.6 * dpr; c.stroke(); c.restore();
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
    this.shade = this.vignette();
    const U = 34 * dpr, hs = document.createElement("canvas");
    hs.width = Math.ceil(U * 2.2); hs.height = Math.ceil(U * 2.8);
    const hc = hs.getContext("2d");
    hc.translate(hs.width / 2, hs.height / 2);
    const head = hc.createRadialGradient(0, -U * 0.15, 0, 0, 0, U * 1.3);
    head.addColorStop(0, "rgba(116, 80, 55, 1)"); head.addColorStop(0.62, "rgba(90, 60, 41, 0.95)"); head.addColorStop(0.8, "rgba(70, 46, 32, 0.6)"); head.addColorStop(1, "rgba(60, 40, 28, 0)");
    hc.fillStyle = head;
    hc.beginPath(); hc.ellipse(0, 0, U * 1.0, U * 1.3, 0, 0, Math.PI * 2); hc.fill();
    this.head = hs;
    // smoke: lots of thin wisps curling up out of the sand
    // they're drawn on a small layer (a third of the size) and softened as it's laid down, so they look
    // hazy and diffuse rather than drawn
    this.sm = document.createElement("canvas");
    this.sm.width = Math.ceil(W / 3); this.sm.height = Math.ceil(H / 3);
    this.smc = this.sm.getContext("2d");
    this.wisps = [];
    const nw = Math.max(110, Math.round(W * H / 3000));
    for (let i = 0; i < nw; i++) this.wisps.push(this.newWisp(rnd() ));
    // embers drifting up, and now and then a lick of flame from a crack in the sand
    this.embers = [];
    for (let i = 0; i < Math.max(25, Math.round(W * H / 9000)); i++) this.embers.push(this.newEmber(true));
    this.flames = [];
    this.flameEvery = 1100000 / (W * H);   // seconds between new licks: about 3 at once on a big screen
    this.flameT = 0;
    this.draw(performance.now());
  },

  // A wisp: a thin thread of smoke rising from one spot, curling as it goes; it lives a while, then
  // fades and another rises somewhere else. age0 lets the first ones start part-way through.
  newWisp(age0 = 0) {
    const k = this.k, life = 6 + Math.random() * 6;
    return { x: Math.random() * this.W, y: this.H * (0.15 + Math.random() * 0.95), age: age0 * life, life,
      len: (50 + Math.random() * 90) * k, amp: (5 + Math.random() * 9) * k, freq: 0.035 + Math.random() * 0.04,
      speed: 1.2 + Math.random() * 1.4, ph: Math.random() * 6.3, lean: (Math.random() - 0.5) * 0.5,
      rise: (6 + Math.random() * 8) * k, w: (1.3 + Math.random() * 1.5) * k, a: 0.6 + Math.random() * 0.3 };
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
      e.age += dt; e.y -= e.vy * dt; e.x += (e.vx + Math.sin(e.age * 0.8 + e.fl) * 4 * this.k) * dt;
      if (e.age >= e.life || e.y < -10) this.embers[i] = this.newEmber(false);
    }
    this.flameT += dt;
    while (this.flameT >= this.flameEvery) { this.flameT -= this.flameEvery; this.flames.push(this.newFlame()); }
    for (const f of this.flames) f.age += dt;
    this.flames = this.flames.filter(f => f.age < f.life);
    for (const f of this.flames) if (Math.random() < dt * 3) this.embers.push(Object.assign(this.newEmber(false), { x: f.x, y: f.y - 10 * this.k, life: 1.5 + Math.random() * 2, hot: 1 }));
    if (this.embers.length > 400) this.embers.splice(0, this.embers.length - 400);
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

  draw(now) {
    if (!this.sand || !this.sand.width || !this.sand.height) return;
    const c = this.ctx, d = this.dpr, s = now / 1000;
    c.drawImage(this.sand, 0, 0);
    // the smoke, under the faces: thin wisps curling up, drawn small and softened
    const m = this.smc, S = 1 / 3;
    m.clearRect(0, 0, this.sm.width, this.sm.height);
    m.lineCap = "round"; m.lineJoin = "round";
    for (const w of this.wisps) {
      const q = w.age / w.life, fade = Math.sin(Math.PI * q) ** 1.2;
      if (fade < 0.02) continue;
      const x0 = w.x * S, y0 = (w.y - w.rise * w.age) * S, L = w.len * S;
      const g = m.createLinearGradient(0, y0, 0, y0 - L);
      g.addColorStop(0, "rgba(8, 4, 2, 0)");
      g.addColorStop(0.2, `rgba(8, 4, 2, ${(w.a * fade).toFixed(3)})`);
      g.addColorStop(0.75, `rgba(8, 4, 2, ${(w.a * fade * 0.5).toFixed(3)})`);
      g.addColorStop(1, "rgba(8, 4, 2, 0)");
      m.strokeStyle = g;
      m.beginPath();
      for (let j = 0; j <= 12; j++) {
        const t = j / 12, yy = y0 - L * t;
        // the curl grows as the thread climbs, and travels up it as the smoke rises
        const xx = x0 + (Math.sin(t * w.len * w.freq - w.age * w.speed + w.ph) * w.amp * (0.25 + t) + w.lean * w.len * t) * S;
        if (j) m.lineTo(xx, yy); else m.moveTo(xx, yy);
      }
      m.lineWidth = w.w * (1 + t0(q)) * 1.6 * S * 3; m.globalAlpha = 0.45; m.stroke();   // the spreading haze
      m.lineWidth = w.w * S * 3 * 0.6; m.globalAlpha = 1; m.stroke();                    // the thread
    }
    m.globalAlpha = 1;
    c.save();
    if ("filter" in c) c.filter = `blur(${(1.6 * d).toFixed(1)}px)`;
    c.drawImage(this.sm, 0, 0, this.canvas.width, this.canvas.height);
    c.restore();
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
        const h = t.h * life * d, w = t.w * d, bx = x0 + t.dx * d;
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
      const q = e.age / e.life, a = Math.min(1, q * 3) * Math.min(1, (1 - q) * 3) * (0.75 + 0.25 * Math.sin(e.age * e.fs + e.fl))   /* a slow glow, not a blink */;
      if (a < 0.03) continue;
      const x = e.x * d, y = e.y * d, r = e.r * d;
      const g = c.createRadialGradient(x, y, 0, x, y, r * 4);
      g.addColorStop(0, e.hot > 0.5 ? `rgba(255, 210, 120, ${a.toFixed(3)})` : `rgba(255, 140, 40, ${a.toFixed(3)})`);
      g.addColorStop(0.3, `rgba(240, 80, 10, ${(a * 0.5).toFixed(3)})`); g.addColorStop(1, "rgba(200, 40, 0, 0)");
      c.fillStyle = g; c.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    }
    c.globalCompositeOperation = "source-over";
    // the souls, on top of everything (smoke and fire pass behind them), solid
    c.globalAlpha = 1;
    for (const f of this.faces) {
      const u = 34 * f.size * d;
      // the groan: the mouth slowly opens wide and sags shut again
      const m = 0.5 - 0.5 * Math.cos(s * f.mw + f.mp);
      const mouth = u * (0.12 + f.mo * m * 0.6);
      // the eyes slowly squeeze half shut and open again
      const e = 0.5 - 0.5 * Math.cos(s * f.ew + f.ep);
      const eye = u * (0.27 - 0.13 * e - 0.04 * m);
      const slant = 0.32 + f.shape * 0.25 + 0.12 * m;   // the brows lift as it groans
      const x = f.x + f.ax * Math.sin(s * f.wx + f.px), y = f.y + f.ay * Math.sin(s * f.wy + f.py);
      const tilt = f.t0 + f.ra * Math.sin(s * f.rw + f.pr);
      c.save();
      c.translate(x * d, y * d);
      c.rotate(tilt);
      const hw = this.head.width * f.size, hh = this.head.height * f.size;
      c.drawImage(this.head, -hw / 2, -hh / 2, hw, hh);
      this.hollow(c, -u * 0.36, -u * 0.25, u * 0.19, eye, slant);
      this.hollow(c, u * 0.36, -u * 0.25, u * 0.19, eye, -slant);
      this.hollow(c, 0, u * 0.42 + mouth * 0.3, u * (0.17 + 0.05 * f.shape - 0.03 * m), mouth, 0);
      c.restore();
    }
    c.globalAlpha = 1;
    c.drawImage(this.shade, 0, 0);
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

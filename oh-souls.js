// oh-souls.js - the "Souls" table: dark soul sand packed with faces of the damned, drifting a little in
// the sand, rocking slowly (always mostly upright) and groaning: each mouth slowly opens and closes and
// the eyes slowly narrow and widen, every face at its own pace. Wisps of dark smoke rise among them. Drawn on a canvas behind the table; it only runs while the Souls table is chosen, rests
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
    const base = c.createRadialGradient(s.width * 0.5, s.height * 0.55, 0, s.width * 0.5, s.height * 0.55, Math.max(s.width, s.height) * 0.7);
    base.addColorStop(0, "#47311f"); base.addColorStop(0.6, "#33231a"); base.addColorStop(1, "#1c120c");
    c.fillStyle = base; c.fillRect(0, 0, s.width, s.height);
    // swirls in the sand
    for (let i = 0; i < 40; i++) {
      const x = rnd() * s.width, y = rnd() * s.height, r = (60 + rnd() * 200) * dpr;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rnd() < 0.45 ? "rgba(112, 78, 54, 0.14)" : "rgba(10, 5, 3, 0.2)");
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      c.fillStyle = g;
      c.save(); c.translate(x, y); c.scale(1.8 + rnd(), 0.6 + rnd() * 0.5); c.rotate(rnd() * 0.6 - 0.3); c.translate(-x, -y);
      c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
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
    head.addColorStop(0, "rgba(120, 84, 58, 0.55)"); head.addColorStop(0.6, "rgba(96, 66, 46, 0.25)"); head.addColorStop(1, "rgba(96, 66, 46, 0)");
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
    const nw = Math.max(70, Math.round(W * H / 5000));
    for (let i = 0; i < nw; i++) this.wisps.push(this.newWisp(rnd() ));
    this.draw(performance.now());
  },

  // A wisp: a thin thread of smoke rising from one spot, curling as it goes; it lives a while, then
  // fades and another rises somewhere else. age0 lets the first ones start part-way through.
  newWisp(age0 = 0) {
    const k = this.k, life = 6 + Math.random() * 6;
    return { x: Math.random() * this.W, y: this.H * (0.15 + Math.random() * 0.95), age: age0 * life, life,
      len: (50 + Math.random() * 90) * k, amp: (5 + Math.random() * 9) * k, freq: 0.035 + Math.random() * 0.04,
      speed: 1.2 + Math.random() * 1.4, ph: Math.random() * 6.3, lean: (Math.random() - 0.5) * 0.5,
      rise: (6 + Math.random() * 8) * k, w: (1.3 + Math.random() * 1.5) * k, a: 0.5 + Math.random() * 0.3 };
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
    // the faces, above the smoke but only partly solid, so it shows through them
    c.globalAlpha = 0.68;
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
      this.draw(now);
    };
    this.raf = requestAnimationFrame(tick);
  }
};

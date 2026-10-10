// oh-souls.js - the "Souls" table: dark soul sand packed with faces of the damned, pressed into the sand
// and groaning: each mouth slowly opens and closes and the eyes slowly narrow and widen, every face at
// its own pace. Drawn on a canvas behind the table; it only runs while the Souls table is chosen, rests
// while the tab is hidden, and stays still for anyone who has asked their computer for reduced motion.

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

  // The sand and the faces' heads, drawn once per window size; only the eyes and mouths move.
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
    // the faces: one per cell of a loose grid, so they fill the table without piling up
    this.faces = [];
    const cw = 118 * this.k, ch = 132 * this.k;
    for (let row = 0, y0 = -ch * 0.3; y0 < H + ch * 0.3; row++, y0 += ch) {
      for (let x0 = (row % 2) * cw * 0.5 - cw * 0.3; x0 < W + cw * 0.3; x0 += cw) {
        const f = {
          x: x0 + (rnd() - 0.5) * cw * 0.45, y: y0 + (rnd() - 0.5) * ch * 0.4,
          size: (0.85 + rnd() * 0.45) * this.k, tilt: (rnd() - 0.5) * 0.5, shape: rnd(),
          // slow, each at its own pace: a groan every 5-11 s, the eyes on their own rhythm
          mw: (Math.PI * 2) / (5 + rnd() * 6), mp: rnd() * Math.PI * 2, mo: 0.35 + rnd() * 0.35,
          ew: (Math.PI * 2) / (4 + rnd() * 7), ep: rnd() * Math.PI * 2
        };
        this.faces.push(f);
        // the head: a smoothed bulge of lighter sand
        const u = 34 * f.size * dpr, hx = f.x * dpr, hy = f.y * dpr;
        c.save(); c.translate(hx, hy); c.rotate(f.tilt);
        const head = c.createRadialGradient(0, -u * 0.15, 0, 0, 0, u * 1.3);
        head.addColorStop(0, "rgba(120, 84, 58, 0.55)"); head.addColorStop(0.6, "rgba(96, 66, 46, 0.25)"); head.addColorStop(1, "rgba(96, 66, 46, 0)");
        c.fillStyle = head;
        c.beginPath(); c.ellipse(0, 0, u * 1.0, u * 1.3, 0, 0, Math.PI * 2); c.fill();
        c.restore();
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
    this.draw(performance.now());
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
    for (const f of this.faces) {
      const u = 34 * f.size * d;
      // the groan: the mouth slowly opens wide and sags shut again
      const m = 0.5 - 0.5 * Math.cos(s * f.mw + f.mp);
      const mouth = u * (0.12 + f.mo * m * 0.6);
      // the eyes slowly squeeze half shut and open again
      const e = 0.5 - 0.5 * Math.cos(s * f.ew + f.ep);
      const eye = u * (0.27 - 0.13 * e - 0.04 * m);
      const slant = 0.32 + f.shape * 0.25 + 0.12 * m;   // the brows lift as it groans
      c.save();
      c.translate(f.x * d, f.y * d);
      c.rotate(f.tilt);
      this.hollow(c, -u * 0.36, -u * 0.25, u * 0.19, eye, slant);
      this.hollow(c, u * 0.36, -u * 0.25, u * 0.19, eye, -slant);
      this.hollow(c, 0, u * 0.42 + mouth * 0.3, u * (0.17 + 0.05 * f.shape - 0.03 * m), mouth, 0);
      c.restore();
    }
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
      this.last = now;
      this.draw(now);
    };
    this.raf = requestAnimationFrame(tick);
  }
};

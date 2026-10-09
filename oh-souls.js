// oh-souls.js - the "Souls" table: dark soul sand with the faces of the damned slowly surfacing and
// sinking back, and pale soul-wisps drifting up. Drawn on a canvas behind the table; it only runs while
// the Souls table is chosen, rests while the tab is hidden, and stays still for anyone who has asked their
// computer for reduced motion.

const SOULS = {
  canvas: null, ctx: null, sand: null, faces: [], wisps: [], active: false, raf: 0, last: 0, W: 0, H: 0, dpr: 1,
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

  // The sand, drawn once per window size: dark grains, slow ripples, and a burnt glow from below.
  build() {
    const W = window.innerWidth, H = window.innerHeight;
    if (!W || !H) { this.sand = null; return; }   // no size yet (a background tab): wait for the resize
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.W = W; this.H = H; this.dpr = dpr;
    this.k = Math.max(0.6, Math.min(1.1, Math.min(W, H) / 820));   // faces scale with the screen (smaller on phones)
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    const s = document.createElement("canvas");
    s.width = this.canvas.width; s.height = this.canvas.height;
    const c = s.getContext("2d");
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // base colour, a little lighter where the faces are pressed in
    const base = c.createRadialGradient(s.width * 0.5, s.height * 0.55, 0, s.width * 0.5, s.height * 0.55, Math.max(s.width, s.height) * 0.7);
    base.addColorStop(0, "#4a3326"); base.addColorStop(0.55, "#33231a"); base.addColorStop(1, "#160d09");
    c.fillStyle = base; c.fillRect(0, 0, s.width, s.height);
    // swirls and ripples in the sand: soft dark and light smears
    for (let i = 0; i < 46; i++) {
      const x = rnd() * s.width, y = rnd() * s.height, r = (60 + rnd() * 220) * dpr;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      const light = rnd() < 0.45;
      g.addColorStop(0, light ? "rgba(120, 82, 58, 0.16)" : "rgba(10, 5, 3, 0.22)");
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      c.fillStyle = g;
      c.save(); c.translate(x, y); c.scale(1.8 + rnd(), 0.6 + rnd() * 0.5); c.rotate(rnd() * 0.6 - 0.3); c.translate(-x, -y);
      c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
    }
    // imprints of old faces, frozen into the sand (the moving ones come and go on top)
    for (let i = 0; i < Math.round(W * H / 110000); i++) this.drawFace(c, rnd() * s.width, rnd() * s.height, (1.1 + rnd() * 1.1) * this.k * dpr, 0.3 + rnd() * 0.18, rnd(), rnd() * 0.6, true);
    // grains
    const img = c.getImageData(0, 0, s.width, s.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rnd() - 0.5) * 34, k = rnd() < 0.015 ? 26 : 0;   // a few brighter grains
      d[i] = Math.max(0, Math.min(255, d[i] + n + k));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 0.8 + k * 0.7));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.6 + k * 0.5));
    }
    c.putImageData(img, 0, 0);
    // the edges sink into darkness
    const v = c.createRadialGradient(s.width / 2, s.height / 2, Math.min(s.width, s.height) * 0.35, s.width / 2, s.height / 2, Math.max(s.width, s.height) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.6)");
    c.fillStyle = v; c.fillRect(0, 0, s.width, s.height);
    this.sand = s;
    this.faces = []; this.wisps = [];
    const n = Math.max(3, Math.round(W * H / 230000));
    for (let i = 0; i < n; i++) this.faces.push(this.newFace(Math.random()));
    for (let i = 0; i < Math.round(W * H / 70000); i++) this.wisps.push(this.newWisp(true));
    this.draw(performance.now());
  },

  // A face: a pale smear with hollow eyes and a wailing mouth. depth 0..1 shapes the brow and how open
  // the mouth is; imprint draws it as a dent in the sand, otherwise it glows faintly with soul-light.
  drawFace(c, x, y, size, alpha, shape, wail, imprint) {
    if (alpha <= 0.003) return;
    const u = 34 * size;
    c.save();
    c.translate(x, y);
    c.rotate((shape - 0.5) * 0.35);
    c.globalAlpha = Math.min(1, alpha);
    // the head: a smear of lighter sand (or soul-light)
    const head = c.createRadialGradient(0, -u * 0.1, 0, 0, 0, u * 1.25);
    if (imprint) { head.addColorStop(0, "rgba(110, 76, 54, 0.75)"); head.addColorStop(1, "rgba(110, 76, 54, 0)"); }
    else { head.addColorStop(0, "rgba(150, 205, 215, 0.55)"); head.addColorStop(0.55, "rgba(90, 150, 165, 0.22)"); head.addColorStop(1, "rgba(60, 110, 125, 0)"); }
    c.fillStyle = head;
    c.beginPath(); c.ellipse(0, 0, u * 0.95, u * 1.25, 0, 0, Math.PI * 2); c.fill();
    // hollow eyes, slanted in sorrow
    const dark = imprint ? "rgba(8, 4, 2, 0.85)" : "rgba(6, 10, 12, 0.9)";
    const tilt = 0.35 + shape * 0.25;
    c.fillStyle = dark;
    c.beginPath(); c.ellipse(-u * 0.36, -u * 0.25, u * 0.2, u * 0.27, tilt, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(u * 0.36, -u * 0.25, u * 0.2, u * 0.27, -tilt, 0, Math.PI * 2); c.fill();
    // the mouth, stretching open as it wails
    const open = 0.22 + 0.3 * shape + 0.28 * wail;
    c.beginPath(); c.ellipse(0, u * 0.42, u * (0.15 + 0.06 * shape), u * open, 0, 0, Math.PI * 2); c.fill();
    if (!imprint) {
      // a faint glimmer deep in the eyes
      c.globalCompositeOperation = "lighter";
      c.fillStyle = "rgba(120, 230, 240, 0.35)";
      c.beginPath(); c.arc(-u * 0.33, -u * 0.22, u * 0.05, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(u * 0.33, -u * 0.22, u * 0.05, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  },

  newFace(age = 0) {
    const life = 9 + Math.random() * 8;
    return { x: Math.random() * this.W, y: Math.random() * this.H, size: 1.4 + Math.random() * 1.3, shape: Math.random(),
      life, t: age * life, rise: 10 + Math.random() * 18, peak: 0.42 + Math.random() * 0.2, sp: 0.4 + Math.random() * 0.6 };
  },
  newWisp(anywhere) {
    return { x: Math.random() * this.W, y: anywhere ? Math.random() * this.H : this.H + 30, r: 2.5 + Math.random() * 3,
      vy: 12 + Math.random() * 18, sway: Math.random() * Math.PI * 2, sw: 0.5 + Math.random() * 0.8, a: 0.22 + Math.random() * 0.25, fl: Math.random() * 9 };
  },

  draw(now) {
    if (!this.sand || !this.sand.width || !this.sand.height) return;
    const c = this.ctx, d = this.dpr, s = now / 1000;
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    c.drawImage(this.sand, 0, 0);
    // faces rise out of the sand, wail, and sink back
    for (const f of this.faces) {
      const p = f.t / f.life;
      const a = f.peak * Math.sin(Math.PI * Math.min(1, Math.max(0, p))) ** 1.5;
      const wail = 0.5 + 0.5 * Math.sin(s * f.sp * 2 + f.shape * 9);
      this.drawFace(c, f.x * d, (f.y - f.rise * p) * d, f.size * this.k * d, a, f.shape, wail, false);
    }
    // soul-wisps drifting upward
    c.globalCompositeOperation = "lighter";
    for (const w of this.wisps) {
      // a soft flame, taller than wide, flickering as it rises
      const x = (w.x + Math.sin(s * w.sw + w.sway) * 14) * d, y = w.y * d, r = w.r * d;
      const a = w.a * (0.75 + 0.25 * Math.sin(s * 7 + w.fl));
      c.save(); c.translate(x, y); c.scale(1, 2.1);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, r * 4);
      g.addColorStop(0, `rgba(190, 245, 250, ${a})`); g.addColorStop(0.35, `rgba(110, 210, 225, ${a * 0.45})`); g.addColorStop(1, "rgba(60, 150, 170, 0)");
      c.fillStyle = g;
      c.fillRect(-r * 4, -r * 4, r * 8, r * 8);
      c.restore();
    }
    c.globalCompositeOperation = "source-over";
  },

  step(dt) {
    for (let i = 0; i < this.faces.length; i++) {
      const f = this.faces[i];
      f.t += dt;
      if (f.t >= f.life) this.faces[i] = this.newFace(0);
    }
    for (let i = 0; i < this.wisps.length; i++) {
      const w = this.wisps[i];
      w.y -= w.vy * dt;
      w.a *= 1 - dt * 0.05;
      if (w.y < -20 || w.a < 0.04) this.wisps[i] = this.newWisp(false);
    }
  },

  loop() {
    cancelAnimationFrame(this.raf);
    if (!this.active || document.hidden) return;
    if (this.still) { this.draw(performance.now()); return; }
    this.last = performance.now();
    const tick = now => {
      if (!this.active || document.hidden) return;
      this.raf = requestAnimationFrame(tick);
      const dt = (now - this.last) / 1000;
      if (dt < 1 / 30) return;   // 30 frames a second is plenty for drifting souls
      this.last = now;
      this.step(Math.min(dt, 0.25));
      this.draw(now);
    };
    this.raf = requestAnimationFrame(tick);
  }
};

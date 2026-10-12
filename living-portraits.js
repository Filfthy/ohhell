// living-portraits.js - gently animated opponent portraits (shared between the games).
//
// The original portrait, warped a little in WebGL, in layers each on its own irregular timing: the head drifting round
// the neck, the brow, the cheeks, the mouth (corners, lips pressing, a slight parting), the chest breathing (the
// bottom edge never moves), with blink and glance frames faded in over the top. Only the characters in LP_RIGS move;
// everyone else stays a still picture. The images come from living-data.js (LIVING_DATA) as data URIs, because WebGL
// can't read image files on a file:// page.
//
// LivingPortraits.mood(el, "happy" | "angry") fades in a whole new face for a moment (a won trick, a sunk bid), still
// moving underneath; blinks and glances wait while it shows.
//
// Use: LivingPortraits.sync(portraitEl, "persephone", on) whenever a portrait is set. It adds (or removes) a canvas
// inside the portrait element; the element's own transforms (mirroring, reactions) and filters still apply.

const LivingPortraits = (() => {
  // how much of each layer (1 = the tuned amount); "speed" scales the drifting, not the blinks
  const settings = { strength: 2.4, speed: 2.3, head: 1.8, brow: 1.6, cheeks: 1.6, mouth: 1.6, breath: 2.9, blink: 1.0, glance: 1.7, yaw: 0.8 };

  // each rig, in fractions of the portrait's square: heads (centre, radii, neck pivot), brow (x, y, rx, ry), cheeks (one or two;
  // cr their reach - kept clear of the nose), mouth (x, y, half width, half height), mc the reach of the mouth's corners
  const LP_RIGS = {
    // set A
    persephone: { heads: [{ c: [0.55, 0.32], r: [0.27, 0.30], p: [0.585, 0.68] }], brow: [0.62, 0.335, 0.12, 0.025], cheeks: [[0.50, 0.48], [0.715, 0.49]], cr: 0.033, mouth: [0.62, 0.522, 0.05, 0.02] },
    lilith:     { heads: [{ c: [0.48, 0.32], r: [0.30, 0.32], p: [0.50, 0.68] }], brow: [0.51, 0.34, 0.14, 0.025], cheeks: [[0.39, 0.47], [0.65, 0.48]], cr: 0.035, mouth: [0.515, 0.522, 0.055, 0.022] },
    faust:      { heads: [{ c: [0.56, 0.33], r: [0.28, 0.30], p: [0.56, 0.68] }], brow: [0.64, 0.36, 0.10, 0.025], cheeks: [[0.61, 0.50]], cr: 0.035, mouth: [0.72, 0.555, 0.035, 0.018] },
    "davy-jones": { heads: [{ c: [0.55, 0.29], r: [0.56, 0.36], p: [0.63, 0.72] }], brow: [0.69, 0.34, 0.10, 0.025], cheeks: [[0.596, 0.444], [0.80, 0.48]], cr: 0.03, mouth: [0.65, 0.505, 0.05, 0.02] },
    bub:        { heads: [{ c: [0.50, 0.44], r: [0.30, 0.27], p: [0.50, 0.82] }], brow: [0.53, 0.29, 0.18, 0.04], cheeks: [[0.37, 0.50], [0.71, 0.49]], cr: 0.05, mouth: [0.55, 0.46, 0.10, 0.02] },
    cerberus:   { heads: [{ c: [0.47, 0.42], r: [0.18, 0.22], p: [0.47, 0.78] }, { c: [0.15, 0.53], r: [0.15, 0.14], p: [0.24, 0.70], a: 0.8 },
                          { c: [0.83, 0.52], r: [0.15, 0.14], p: [0.74, 0.70], a: 0.8 }], brow: [0.474, 0.37, 0.10, 0.03], cheeks: [], cr: 0, mouth: [0.474, 0.59, 0.07, 0.05] },
    anubis:     { heads: [{ c: [0.52, 0.34], r: [0.32, 0.40], p: [0.44, 0.76] }], brow: [0.60, 0.41, 0.07, 0.025], cheeks: [], cr: 0, mouth: [0.70, 0.54, 0.09, 0.02] },
    kali:       { heads: [{ c: [0.56, 0.34], r: [0.30, 0.34], p: [0.56, 0.72] }], brow: [0.67, 0.345, 0.09, 0.025], cheeks: [[0.60, 0.46]], cr: 0.035, mouth: [0.71, 0.515, 0.035, 0.02], mc: 0.025 },
    // set B
    hellga:     { heads: [{ c: [0.57, 0.33], r: [0.40, 0.34], p: [0.56, 0.68] }], brow: [0.62, 0.30, 0.13, 0.025], cheeks: [[0.48, 0.44], [0.73, 0.475]], cr: 0.035, mouth: [0.617, 0.50, 0.07, 0.02] },
    jezebel:    { heads: [{ c: [0.58, 0.30], r: [0.28, 0.30], p: [0.60, 0.63] }], brow: [0.58, 0.282, 0.13, 0.025], cheeks: [[0.50, 0.41], [0.69, 0.40]], cr: 0.033, mouth: [0.615, 0.435, 0.06, 0.022] },
    morgana:    { heads: [{ c: [0.55, 0.29], r: [0.46, 0.38], p: [0.58, 0.66] }], brow: [0.62, 0.28, 0.12, 0.025], cheeks: [[0.533, 0.42], [0.73, 0.42]], cr: 0.033, mouth: [0.625, 0.455, 0.06, 0.022] },
    lamia:      { heads: [{ c: [0.52, 0.36], r: [0.56, 0.40], p: [0.58, 0.70] }], brow: [0.63, 0.37, 0.12, 0.03], cheeks: [[0.544, 0.517], [0.735, 0.56]], cr: 0.03, mouth: [0.605, 0.575, 0.05, 0.02], mc: 0.02 },
    loki:       { heads: [{ c: [0.55, 0.33], r: [0.30, 0.32], p: [0.50, 0.68] }], brow: [0.64, 0.285, 0.13, 0.025], cheeks: [[0.523, 0.41]], cr: 0.033, mouth: [0.59, 0.48, 0.075, 0.02], mc: 0.028 },
    hecate:     { heads: [{ c: [0.62, 0.30], r: [0.28, 0.30], p: [0.62, 0.66] }], brow: [0.62, 0.265, 0.13, 0.025], cheeks: [[0.57, 0.40]], cr: 0.033, mouth: [0.73, 0.445, 0.045, 0.02], mc: 0.03 },
    ereshkigal: { heads: [{ c: [0.58, 0.32], r: [0.30, 0.32], p: [0.60, 0.70] }], brow: [0.61, 0.32, 0.12, 0.025], cheeks: [[0.533, 0.444]], cr: 0.035, mouth: [0.69, 0.49, 0.05, 0.02], mc: 0.03 },
    banshee:    { heads: [{ c: [0.60, 0.40], r: [0.30, 0.32], p: [0.60, 0.72] }], brow: [0.60, 0.325, 0.10, 0.025], cheeks: [[0.575, 0.444]], cr: 0.033, mouth: [0.70, 0.50, 0.05, 0.04], mc: 0.03 },
    // set C (face: false - a helmet or a carved mask: the head drifts and breathes, but nothing on the face bends)
    charon:     { heads: [{ c: [0.58, 0.33], r: [0.30, 0.32], p: [0.60, 0.72] }], brow: [0.65, 0.275, 0.11, 0.025], cheeks: [[0.575, 0.39]], cr: 0.033, mouth: [0.71, 0.465, 0.045, 0.02], mc: 0.025 },
    ammit:      { heads: [{ c: [0.62, 0.38], r: [0.32, 0.28], p: [0.50, 0.75] }], brow: [0.62, 0.30, 0.07, 0.025], cheeks: [], cr: 0, mouth: [0.72, 0.49, 0.15, 0.02], mc: 0.035 },
    brimstone:  { heads: [{ c: [0.55, 0.36], r: [0.30, 0.30], p: [0.55, 0.72] }], brow: [0.61, 0.335, 0.14, 0.03], cheeks: [[0.46, 0.444], [0.752, 0.465]], cr: 0.035, mouth: [0.63, 0.50, 0.055, 0.02], mc: 0.03 },
    ronnie:     { heads: [{ c: [0.62, 0.38], r: [0.25, 0.32], p: [0.60, 0.75] }], face: false, brow: [0, 0, 1, 1], cheeks: [], cr: 0, mouth: [0, 0, 0.01, 0.01] },
    sojobo:     { heads: [{ c: [0.55, 0.36], r: [0.28, 0.30], p: [0.50, 0.72] }], face: false, brow: [0, 0, 1, 1], cheeks: [], cr: 0, mouth: [0, 0, 0.01, 0.01] },
    "old-nick": { heads: [{ c: [0.62, 0.30], r: [0.30, 0.30], p: [0.62, 0.68] }], brow: [0.67, 0.30, 0.14, 0.03], cheeks: [[0.544, 0.433]], cr: 0.035, mouth: [0.66, 0.515, 0.07, 0.02], mc: 0.03 }
  };


  const VS = `attribute vec2 a; varying vec2 uv; void main() { uv = vec2(a.x * 0.5 + 0.5, 0.5 - a.y * 0.5); gl_Position = vec4(a, 0.0, 1.0); }`;
  const FS = `precision highp float;
varying vec2 uv; uniform sampler2D tex, texBlink, texGlance, texHappy, texAngry, flowHappy, flowAngry; uniform float blinkMix, glanceMix, happyMix, angryMix, flowMH, flowMA, swapLo, swapHi;
uniform sampler2D depthTex; uniform float yaw, depthAt;
uniform int nHeads; uniform vec2 hC[3]; uniform vec2 hR[3]; uniform vec2 hP[3]; uniform float hRot[3]; uniform vec2 hT[3];
uniform vec4 brow; uniform float browAmt; uniform vec2 ck[2]; uniform float ckR; uniform float ckAmt; uniform int nCk;
uniform vec4 mouth; uniform vec4 mouthAmt; uniform float mouthCr; uniform vec2 chest; uniform float breath;
float g2(vec2 q) { return exp(-dot(q, q)); }
void main() {
  vec2 d = vec2(0.0);
  // a head turn (yaw): each point of the head slides sideways by how near it is (the depth map: nose most, ears
  // least, the far side the other way), so it reads as the head rotating rather than the picture sliding
  {
    float e0 = length((uv - hC[0]) / hR[0]);
    float w0 = (1.0 - smoothstep(0.8, 1.55, e0)) * (1.0 - smoothstep(hP[0].y - 0.06, hP[0].y + 0.10, uv.y));
    d.x += yaw * (texture2D(depthTex, uv).r - depthAt) * w0;
  }
  for (int i = 0; i < 3; i++) {
    if (i >= nHeads) break;
    float e = length((uv - hC[i]) / hR[i]);
    float w = (1.0 - smoothstep(0.8, 1.55, e)) * (1.0 - smoothstep(hP[i].y - 0.06, hP[i].y + 0.10, uv.y));
    float s = sin(hRot[i]), c = cos(hRot[i]);
    vec2 q = uv - hP[i];
    d += (hP[i] + vec2(c * q.x - s * q.y, s * q.x + c * q.y) + hT[i] - uv) * w;
  }
  d += vec2(0.0, -browAmt) * g2((uv - brow.xy) / brow.zw);
  for (int i = 0; i < 2; i++) {
    if (i >= nCk) break;
    d += vec2(sign(uv.x - 0.5 * (ck[0].x + ck[1].x)) * 0.35, -1.0) * ckAmt * g2((uv - ck[i]) / ckR);
  }
  float cr = mouthCr;                     // the corners' reach: kept small so they never tug the nose
  d += vec2(0.0, -mouthAmt.x) * g2((uv - vec2(mouth.x - mouth.z, mouth.y)) / cr);
  d += vec2(0.0, -mouthAmt.y) * g2((uv - vec2(mouth.x + mouth.z, mouth.y)) / cr);
  d.y += -(uv.y - mouth.y) * mouthAmt.z * g2((uv - mouth.xy) / vec2(mouth.z * 1.3, mouth.w * 1.6));
  d.y += mouthAmt.w * g2((uv - vec2(mouth.x, mouth.y + mouth.w * 1.4)) / vec2(mouth.z * 1.6, mouth.w * 1.8));
  float base = 1.0 - smoothstep(chest.y, 0.97, uv.y);
  float upper = smoothstep(chest.y - 0.12, chest.y + 0.08, uv.y);
  d += vec2((uv.x - chest.x) * 0.6 * base * upper, -0.35 * base * mix(0.35, 1.0, upper)) * breath;
  vec2 src = uv - d;
  if (src.x < 0.0 || src.y < 0.0 || src.x > 1.0 || src.y > 1.0) { gl_FragColor = vec4(0.0); return; }
  // a mood morphs rather than fades: the neutral face is bent along the flow (where each point moves to in the mood
  // face) as far as the mood has come, the mood face is bent back from the neutral shape the rest of the way, and
  // the colours change over the middle of the movement - so the shape moves first and the swap hides inside it
  float m = happyMix + angryMix;
  vec2 f = happyMix > 0.0 ? (texture2D(flowHappy, src).rg - 0.5) * 2.0 * flowMH : (texture2D(flowAngry, src).rg - 0.5) * 2.0 * flowMA;
  vec2 fromN = src - m * f, fromM = src + (1.0 - m) * f;
  vec4 col = texture2D(tex, fromN);
  col = mix(col, texture2D(texGlance, fromN), glanceMix);
  col = mix(col, texture2D(texBlink, fromN), blinkMix);
  float swap = smoothstep(swapLo, swapHi, m);
  if (happyMix > 0.0) col = mix(col, texture2D(texHappy, fromM), swap);
  if (angryMix > 0.0) col = mix(col, texture2D(texAngry, fromM), swap);
  gl_FragColor = col;
}`;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const ease = v => v * v * (3 - 2 * v);
  // a smooth wandering value in [-1, 1]: three slow sines at unrelated rates
  function wander() { const f = [rnd(0.13, 0.2), rnd(0.29, 0.41), rnd(0.61, 0.83)], p = f.map(() => rnd(0, 6.3)); return t => 0.55 * Math.sin(f[0] * t + p[0]) + 0.3 * Math.sin(f[1] * t + p[1]) + 0.15 * Math.sin(f[2] * t + p[2]); }
  // now-and-then events: rise, hold, relax, then rest a while
  function moments(minGap, maxGap, rise = [0.4, 0.8], hold = [0.3, 1.4], fall = [0.7, 1.3]) {
    let start = rnd(1, maxGap), r = 0.6, h = 1, f = 1, size = 1;
    return t => {
      let x = t - start;
      if (x > r + h + f) { start = t + rnd(minGap, maxGap); r = rnd(...rise); h = rnd(...hold); f = rnd(...fall); size = rnd(0.5, 1); x = t - start; }
      if (x < 0) return 0;
      if (x < r) return size * ease(x / r);
      if (x < r + h) return size;
      return size * (1 - ease((x - r - h) / f));
    };
  }
  // breathing: each breath a little different in length and depth (in, a short turn, out, a pause)
  function breathing() {
    let start = -rnd(0, 4), len = rnd(3.6, 5.2), depth = rnd(0.7, 1);
    return t => {
      while (t - start > len) { start += len; len = rnd(3.6, 5.2); depth = rnd(0.7, 1); }
      const x = (t - start) / len;
      if (x < 0.4) return depth * ease(x / 0.4);
      if (x < 0.48) return depth;
      if (x < 0.9) return depth * (1 - ease((x - 0.48) / 0.42));
      return 0;
    };
  }
  // blinks run on real time; now and then a double blink
  function blinker() {
    let next = performance.now() + rnd(800, 5000), queue = [];
    return (now, rate) => {
      if (rate <= 0) { next = now + 1000; return 0; }
      if (!queue.length && now >= next) {
        queue.push(now);
        if (Math.random() < 0.18) queue.push(now + 330);
        next = now + rnd(2600, 7500) / rate;
      }
      while (queue.length && now - queue[0] > 280) queue.shift();
      if (!queue.length || now < queue[0]) return 0;
      const x = now - queue[0];
      return x < 70 ? x / 70 : x < 170 ? 1 : 1 - (x - 170) / 110;
    };
  }

  const live = new Set();
  let running = false, clock = 0, last = 0;

  // One WebGL context, shared by every moving portrait (browsers allow only a handful): it draws each portrait in
  // turn, and each is copied onto that portrait's own plain canvas.
  let G = null;
  function shared() {
    if (G) return G.gl ? G : null;
    G = {};
    const cv = document.createElement("canvas");
    const gl = cv.getContext("webgl", { premultipliedAlpha: true, alpha: true });
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return null;
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr); gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "a"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const cache = {};
    const U = n => n in cache ? cache[n] : (cache[n] = gl.getUniformLocation(pr, n));
    ["tex", "texBlink", "texGlance", "texHappy", "texAngry", "flowHappy", "flowAngry", "depthTex"].forEach((n, unit) => gl.uniform1i(U(n), unit));
    G = { cv, gl, U };
    return G;
  }

  const FRAMES = ["", "-blink", "-glance", "-happy", "-angry"];
  function make(el, who) {
    const g = shared();
    if (!g) return null;
    const { gl, U } = g, rig = LP_RIGS[who];
    const cv = document.createElement("canvas");
    cv.className = "lp-canvas";
    const ctx = cv.getContext("2d");
    const lp = { el, who, cv, rig, loaded: 0, tex: [],
      heads: rig.heads.map(() => ({ rot: wander(), tx: wander(), ty: wander() })),
      brow: moments(4, 11), browDrift: wander(), cheek: moments(4, 11),
      mouthDrift: wander(), smirk: moments(4, 10), press: wander(), part: moments(5, 13, [0.5, 0.9], [0.6, 2], [0.8, 1.4]), skew: rnd(-0.2, 0.2),
      breath: breathing(), blink: blinker(), glance: moments(9, 22, [0.7, 1.1], [1.8, 3.8], [0.8, 1.2]),
      moodKind: null, moodStart: 0, moodHold: 0 };
    // the neutral portrait, then each other frame: a patch laid over a copy of it (living-data.js stores only the
    // part that changes); a frame that's missing is just the neutral again
    const upload = (unit, src, data = false) => {
      const tex = lp.tex[unit] = lp.tex[unit] || gl.createTexture();
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !data);      // (a flow map holds numbers, not colours)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (++lp.loaded === FRAMES.length + 3 && !lp.gone) el.classList.add("lp-on");    // the still picture steps aside once the moving one is ready
    };
    const base = new Image();
    base.onload = () => {
      if (lp.gone) return;
      upload(0, base);
      FRAMES.slice(1).forEach((suf, k) => {
        const unit = k + 1, f = LIVING_DATA[who + suf];
        if (!f) { upload(unit, base); return; }
        const patch = new Image();
        patch.onload = () => {
          if (lp.gone) return;
          const c = document.createElement("canvas"); c.width = base.naturalWidth; c.height = base.naturalHeight;
          const x = c.getContext("2d");
          x.drawImage(base, 0, 0);
          x.clearRect(f.x, f.y, patch.naturalWidth, patch.naturalHeight);
          x.drawImage(patch, f.x, f.y);
          upload(unit, c);
        };
        patch.src = f.src;
      });
    };
    base.src = LIVING_DATA[who];
    // the happy and angry flow maps (units 5 and 6); none = no movement (128, 128)
    // the depth map for head turns (unit 7); none = flat, so no turn
    lp.hasDepth = !!LIVING_DATA[who + "-depth"];
    lp.yawNow = 0; lp.yawLook = 0; lp.yawDrift = wander(); lp.yawLast = 0;
    // now and then a slow turn to one side: about 1.5s to turn, held 2-5s, about 1.5s back, then a while before the next
    lp.turn = moments(9, 24, [1.2, 2.0], [2.0, 5.0], [1.2, 2.0]); lp.turnDir = Math.random() < 0.5 ? -1 : 1;
    if (lp.hasDepth) { const im = new Image(); im.onload = () => { if (!lp.gone) upload(7, im, true); }; im.src = LIVING_DATA[who + "-depth"]; }
    else { const c = document.createElement("canvas"); c.width = c.height = 1; const x = c.getContext("2d"); x.fillStyle = "rgb(128,128,128)"; x.fillRect(0, 0, 1, 1); upload(7, c, true); }
    lp.flowM = [0, 0];
    ["-happy-flow", "-angry-flow"].forEach((suf, k) => {
      const f = LIVING_DATA[who + suf];
      if (!f) { const c = document.createElement("canvas"); c.width = c.height = 1; const x = c.getContext("2d"); x.fillStyle = "rgb(128,128,128)"; x.fillRect(0, 0, 1, 1); upload(5 + k, c, true); return; }
      lp.flowM[k] = f.m;
      const im = new Image();
      im.onload = () => { if (!lp.gone) upload(5 + k, im, true); };
      im.src = f.src;
    });
    lp.draw = (t, now) => {
      if (lp.loaded < FRAMES.length + 3) return;
      const w = cv.clientWidth;
      if (!w) return;                                           // hidden (e.g. the Classic style has no portraits)
      const px = Math.round(w * Math.min(2, window.devicePixelRatio || 1));
      if (cv.width !== px) cv.width = cv.height = px;
      if (g.cv.width < px || g.cv.height < px) g.cv.width = g.cv.height = Math.max(px, g.cv.width, g.cv.height);
      gl.viewport(0, g.cv.height - px, px, px);
      lp.tex.forEach((tx, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx); });
      const S = settings, k = S.strength, kh = k * S.head;
      // a mood: quick to come on (IN ms), held, quick to relax (OUT ms) - a slow fade reads as a dissolve, not a face
      // changing. Each change also moves the head a touch (jolt: up into a grin, down into a scowl, then it settles),
      // which is what makes it read as movement. Blinks and glances wait while it shows.
      const IN = 350, OUT = 900;    // (relaxing back is slower than the reaction: a face lets go of a grin gradually)
      let mood = 0, jolt = 0;
      if (lp.moodKind) {
        const x = now - lp.moodStart, h = lp.moodHold;
        if (x < IN) { mood = ease(x / IN); jolt = Math.sin(Math.PI * x / IN); }
        else if (x < IN + h) mood = 1;
        else if (x < IN + h + OUT) { const q = (x - IN - h) / OUT; mood = 1 - ease(q); jolt = 0.6 * Math.sin(Math.PI * q); }
        else lp.moodKind = null;
        if (lp.moodKind === "angry") jolt = -jolt;
      }
      if (lp.hold != null) { mood = lp.hold; jolt = 0; }     // (testing: held part way through a change)
      const C = [], R = [], P = [], ROT = [], T = [];
      rig.heads.forEach((h, i) => {
        const m = lp.heads[i], a = (h.a || 1) * kh;
        C.push(...h.c); R.push(...h.r); P.push(...h.p);
        ROT.push(a * m.rot(t) * 1.6 * Math.PI / 180);
        T.push(a * m.tx(t) * 0.004, a * m.ty(t) * 0.004 - jolt * 0.012 * (h.a || 1));
        ROT[ROT.length - 1] += jolt * 0.035 * (h.a || 1);
      });
      while (C.length < 6) { C.push(0, 0); R.push(1, 1); P.push(0, 0); ROT.push(0); T.push(0, 0); }
      gl.uniform1i(U("nHeads"), rig.heads.length); gl.uniform2fv(U("hC"), C); gl.uniform2fv(U("hR"), R); gl.uniform2fv(U("hP"), P);
      gl.uniform1fv(U("hRot"), ROT); gl.uniform2fv(U("hT"), T);
      const calm = rig.face === false ? 0 : 1 - mood;      // a happy or angry face has its own brow and mouth: the small face movements step aside for it
      gl.uniform4fv(U("brow"), rig.brow); gl.uniform1f(U("browAmt"), calm * k * S.brow * (lp.brow(t) * 0.0042 + lp.browDrift(t) * 0.0012));
      gl.uniform2fv(U("ck"), rig.cheeks.length === 2 ? rig.cheeks.flat() : rig.cheeks.length ? [...rig.cheeks[0], ...rig.cheeks[0]] : [0, 0, 0, 0]); gl.uniform1f(U("ckR"), rig.cr || 1);
      gl.uniform1f(U("ckAmt"), calm * k * S.cheeks * lp.cheek(t) * 0.006); gl.uniform1i(U("nCk"), rig.cheeks.length);
      // the mouth moves in proportion to its own size (its half-height mh), and never more than about a third of it,
      // so the lips keep their shape however strong the sliders are
      const km = calm * k * S.mouth, mh = rig.mouth[3], cap = v => Math.max(-0.4 * mh, Math.min(0.4 * mh, v));
      const lift = (lp.mouthDrift(t) * 0.05 + lp.smirk(t) * 0.09) * mh;
      gl.uniform4fv(U("mouth"), rig.mouth); gl.uniform1f(U("mouthCr"), rig.mc || Math.min(rig.mouth[2] * 0.75, 0.035));
      gl.uniform4f(U("mouthAmt"), cap(km * lift * (1 + lp.skew)), cap(km * lift * (1 - lp.skew)),
        Math.min(0.1, km * Math.max(0, lp.press(t)) * 0.05), Math.min(0.3 * mh, km * lp.part(t) * 0.06 * mh));
      gl.uniform2f(U("chest"), rig.heads[0].p[0], rig.heads[0].p[1]);
      gl.uniform1f(U("breath"), k * S.breath * lp.breath(t) * 0.0045);
      // the head turn: a slow drift, plus look(): turning towards something, easing there and back
      const dt = lp.yawLast ? Math.min(0.1, (now - lp.yawLast) / 1000) : 0; lp.yawLast = now;
      lp.yawNow += (lp.yawLook - lp.yawNow) * Math.min(1, dt * 3.5);
      const tv = lp.turn(t * 0.5);
      if (tv === 0) lp.turnDir = Math.random() < 0.5 ? -1 : 1;     // which way the next turn goes
      const yawAmt = lp.hasDepth ? S.yaw * k * 0.4 * (lp.yawDrift(t * 0.6) * 0.35 + tv * lp.turnDir * 0.9 + lp.yawNow) * 0.05 : 0;
      gl.uniform1f(U("yaw"), yawAmt); gl.uniform1f(U("depthAt"), 0.6);
      gl.uniform1f(U("flowMH"), lp.flowM[0]); gl.uniform1f(U("flowMA"), lp.flowM[1]);
      // the colours change quickly going into a mood (hidden in the movement), but over most of the way back, so a
      // face that changes a lot (Faust's grin) lets go gradually instead of snapping back
      const relaxing = lp.moodKind && now - lp.moodStart > IN + lp.moodHold;
      gl.uniform1f(U("swapLo"), relaxing ? 0.05 : 0.35); gl.uniform1f(U("swapHi"), relaxing ? 0.95 : 0.7);
      gl.uniform1f(U("happyMix"), lp.moodKind === "happy" ? mood : 0);
      gl.uniform1f(U("angryMix"), lp.moodKind === "angry" ? mood : 0);
      gl.uniform1f(U("blinkMix"), Math.min(1, lp.blink(now, S.blink * Math.min(1, k * 4))) * (1 - mood));
      gl.uniform1f(U("glanceMix"), (S.glance > 0 && k > 0 ? lp.glance(t * Math.min(2, S.glance)) : 0) * (1 - mood));
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      ctx.clearRect(0, 0, px, px);
      ctx.drawImage(g.cv, 0, 0, px, px, 0, 0, px, px);
    };
    lp.dispose = () => {
      lp.gone = true;
      lp.tex.forEach(tx => gl.deleteTexture(tx));
      cv.remove(); el.classList.remove("lp-on");
    };
    el.appendChild(cv);
    return lp;
  }

  function frame(now) {
    if (!live.size) { running = false; return; }
    clock += Math.min(0.1, (now - last) / 1000) * settings.speed; last = now;
    if (!document.hidden) live.forEach(lp => { if (lp.el.isConnected) lp.draw(clock, now); else { lp.dispose(); live.delete(lp); } });
    requestAnimationFrame(frame);
  }

  // add, keep or remove the moving portrait on a portrait element
  function sync(el, who, on) {
    const want = !!(on && typeof LIVING_DATA !== "undefined" && LP_RIGS[who] && LIVING_DATA[who]);
    const cur = el._lp;
    if (cur && (!want || cur.who !== who)) { cur.dispose(); live.delete(cur); el._lp = null; }
    if (want && !el._lp) {
      const lp = make(el, who);
      if (!lp) return;
      el._lp = lp; live.add(lp);
      if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
    }
  }
  // show a mood on a moving portrait (if it is one and has that face): "happy" or "angry", held for holdMs
  function mood(el, kind, holdMs = 1600) {
    const lp = el && el._lp;
    if (!lp || !LIVING_DATA[lp.who + "-" + kind]) return false;
    const now = performance.now();
    if (lp.moodKind === kind && now - lp.moodStart < 350 + lp.moodHold) lp.moodHold = now - lp.moodStart - 350 + holdMs;   // already showing: stays on longer
    else { lp.moodKind = kind; lp.moodStart = now; lp.moodHold = holdMs; }
    return true;
  }
  // ?living (trying them out): H makes everyone happy, A angry, for a good look
  if (/[?&]living(&|=|$)/.test(location.search)) document.addEventListener("keydown", e => {
    const kind = { h: "happy", a: "angry" }[e.key.toLowerCase()];
    if (kind && !e.ctrlKey && !e.metaKey && !e.altKey) live.forEach(lp => mood(lp.el, kind, 3000));
  });
  // turn a moving portrait's head: dir -1 (its left as seen) .. 1 (right), for holdMs, then back
  function look(el, dir, holdMs = 1500) {
    const lp = el && el._lp;
    if (!lp) return false;
    lp.yawLook = dir; clearTimeout(lp.lookTimer);
    lp.lookTimer = setTimeout(() => { lp.yawLook = 0; }, holdMs);
    return true;
  }
  return { sync, mood, look, settings, rigs: LP_RIGS };
})();

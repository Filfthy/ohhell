// oh-music.js - the music of Oh Hell! Extended, synthesised live with Web Audio (no recordings): the instruments,
// the tunes and their organ / chiptune arrangements. The source of all the music: jukebox.html plays from it live, and
// tools/render-music.js records the game's tunes from it into music/<id>.mp3, which the game plays (oh-music-player.js).
// Wrapped up so none of its names clash; what the rest needs is handed out on window.OHMusicLib.
(function () {
// ===================================================================== the synthesiser
const A4 = 440, NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midiOf(n) {   // "C#5", "Bb4", "D3"
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  return 12 * (+m[3] + 1) + NAMES[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
}
const hz = midi => A4 * Math.pow(2, (midi - 69) / 12);
const CHORD = { "": [0, 4, 7], m: [0, 3, 7], "7": [0, 4, 7, 10], m7: [0, 3, 7, 10], dim: [0, 3, 6] };
function chordOf(name) {   // "Dm", "A7", "Bb", "Ab7" -> { root (pitch class), tones }
  const m = /^([A-G][#b]?)(m7|m|7|dim)?$/.exec(name);
  return { root: (midiOf(m[1] + "4") % 12), tones: CHORD[m[2] || ""] };
}

class Synth {
  constructor(ctx) {
    this.ctx = ctx;
    this.out = ctx.createGain(); this.out.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25;
    this.out.connect(comp); comp.connect(ctx.destination);
    // a dark hall: a generated impulse, longer and darker than a room
    const len = Math.floor(ctx.sampleRate * 2.8), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.22;
    const tone = ctx.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 3200;
    this.verb.connect(tone); tone.connect(wet); wet.connect(this.out);
    // noise for percussion, crackle and breath
    const nl = ctx.sampleRate * 2; this.noise = ctx.createBuffer(1, nl, ctx.sampleRate);
    const nd = this.noise.getChannelData(0); for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
  }
  // a bus that a tune plays through, so it can be faded out cleanly; send sets how much echoes in the hall
  bus(send = 1) { const g = this.ctx.createGain(), s = this.ctx.createGain(); s.gain.value = send; g.connect(this.out); g.connect(s); s.connect(this.verb); return g; }
  pan(dest, p) { if (!p || !this.ctx.createStereoPanner) return dest; const s = this.ctx.createStereoPanner(); s.pan.value = p; s.connect(dest); return s; }
  osc(type, f, t, stop) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(t); o.stop(stop); return o; }
  amp(t, a, peak, d, stop) {   // attack a, then exponential fall over d (to near silence by stop)
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, Math.max(t + a + 0.01, t + d)); return g;
  }
  held(t, a, peak, dur, rel) {   // attack, hold for dur, release
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + Math.max(a, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, dur) + rel); return g;
  }
  vibrato(o, t, rate, depth, delay) {
    const l = this.osc("sine", rate, t, t + 30), g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(depth, t + delay); l.connect(g); g.connect(o.frequency);
    return l;
  }
  filter(type, f, q = 0.7) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }

  // ---- instruments: (t, frequency, duration in seconds, velocity 0..1, destination)
  harpsichord(t, f, dur, v, dest) {
    const end = t + Math.min(2, dur + 0.9), lp = this.filter("lowpass", Math.min(9000, f * 14), 1.2);
    lp.frequency.setValueAtTime(Math.min(9000, f * 14), t); lp.frequency.exponentialRampToValueAtTime(f * 3, t + 0.5);
    const g = this.amp(t, 0.003, 0.16 * v, Math.min(1.6, dur + 0.7), end);
    this.osc("sawtooth", f, t, end).connect(lp); const o2 = this.osc("square", f * 2.001, t, end), g2 = this.ctx.createGain(); g2.gain.value = 0.35; o2.connect(g2); g2.connect(lp);
    lp.connect(g); g.connect(dest);
  }
  pizz(t, f, dur, v, dest) {
    const end = t + 0.7, lp = this.filter("lowpass", 700 + f * 1.5, 1), g = this.amp(t, 0.004, 0.5 * v, 0.55, end);
    this.osc("triangle", f, t, end).connect(lp); this.osc("sine", f, t, end).connect(lp); lp.connect(g); g.connect(dest);
  }
  bassoon(t, f, dur, v, dest) {
    const end = t + dur + 0.25, o = this.osc("sawtooth", f, t, end), lp = this.filter("lowpass", 500 + f * 1.4, 2.5);
    const nasal = this.filter("peaking", 1100, 2); nasal.gain.value = 6;
    this.vibrato(o, t, 5, f * 0.006, 0.3).stop(end);
    const g = this.held(t, 0.05, 0.2 * v, dur, 0.12); o.connect(lp); lp.connect(nasal); nasal.connect(g); g.connect(dest);
  }
  reed(t, f, dur, v, dest) {   // bandoneon-ish: two reeds slightly out of tune with each other
    const end = t + dur + 0.2, lp = this.filter("lowpass", 1900, 1.2), g = this.held(t, 0.025, 0.1 * v, dur * 0.92, 0.07);
    this.osc("sawtooth", f * 1.004, t, end).connect(lp); this.osc("square", f * 0.996, t, end).connect(lp); lp.connect(g); g.connect(dest);
  }
  violin(t, f, dur, v, dest) {
    const end = t + dur + 0.3, o = this.osc("sawtooth", f, t, end), lp = this.filter("lowpass", 3400, 0.9), hp = this.filter("highpass", 260);
    const body = this.filter("peaking", 2600, 1.5); body.gain.value = 5;
    this.vibrato(o, t, 5.6, f * 0.009, 0.18).stop(end);
    const g = this.held(t, 0.07, 0.13 * v, dur, 0.16); o.connect(hp); hp.connect(lp); lp.connect(body); body.connect(g); g.connect(dest);
  }
  xylo(t, f, dur, v, dest) {
    const end = t + 0.6;
    [[1, 0.32], [3.93, 0.09], [9.2, 0.03]].forEach(([k, a]) => {
      const g = this.amp(t, 0.002, a * v, k > 1 ? 0.12 : 0.4, end); this.osc("sine", f * k, t, end).connect(g); g.connect(dest);
    });
  }
  piano(t, f, dur, v, dest) {   // a slightly out-of-tune saloon upright
    const end = t + Math.min(3, dur + 1.2), lp = this.filter("lowpass", Math.min(5000, f * 8), 0.8), g = this.amp(t, 0.004, 0.17 * v, Math.min(2.6, dur + 1.0), end);
    this.osc("triangle", f, t, end).connect(lp); this.osc("triangle", f * 1.007, t, end).connect(lp);
    const h = this.osc("sine", f * 2, t, end), hg = this.ctx.createGain(); hg.gain.value = 0.3; h.connect(hg); hg.connect(lp);
    lp.connect(g); g.connect(dest);
  }
  hit(t, v, dest, f = 1800, q = 3, d = 0.07, type = "bandpass") {   // a knock, a brush, a crackle
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const b = this.filter(type, f, q), g = this.amp(t, 0.002, v, d, t + d + 0.05);
    s.connect(b); b.connect(g); g.connect(dest); s.start(t, Math.random() * 1.5, d + 0.05);
  }
  sax(t, f, dur, v, dest) {   // a smoky saxophone: reedy, scooping up into each note, with a wide vibrato
    const end = t + dur + 0.3, o = this.osc("sawtooth", f, t, end), o2 = this.osc("square", f * 1.002, t, end);
    o.frequency.setValueAtTime(f * 0.965, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    this.vibrato(o, t, 5.2, f * 0.012, 0.28).stop(end);
    const mix = this.ctx.createGain(), g2 = this.ctx.createGain(); g2.gain.value = 0.35; o.connect(mix); o2.connect(g2); g2.connect(mix);
    const lp = this.filter("lowpass", 2300, 1), reed = this.filter("peaking", 1350, 1.3); reed.gain.value = 8;
    const g = this.held(t, 0.05, 0.1 * v, dur, 0.14); mix.connect(lp); lp.connect(reed); reed.connect(g); g.connect(dest);
  }
  tuba(t, f, dur, v, dest) {
    const end = t + 0.9, lp = this.filter("lowpass", 260 + f, 1.2), g = this.amp(t, 0.02, 0.32 * v, Math.min(0.6, dur + 0.25), end);
    this.osc("sawtooth", f, t, end).connect(lp); this.osc("sine", f, t, end).connect(g); lp.connect(g); g.connect(dest);
  }
  strings(t, f, dur, v, dest) {
    const end = t + dur + 0.3, lp = this.filter("lowpass", 1600, 0.8), g = this.held(t, 0.04, 0.045 * v, dur, 0.18);
    this.osc("sawtooth", f * 0.996, t, end).connect(lp); this.osc("sawtooth", f * 1.004, t, end).connect(lp); lp.connect(g); g.connect(dest);
  }
  pad(t, f, dur, v, dest) {   // a wide, slowly breathing synth pad
    const end = t + dur + 3, lp = this.filter("lowpass", 400, 1.5), g = this.held(t, 1.6, 0.032 * v, dur, 2.6);
    lp.frequency.setValueAtTime(380, t); lp.frequency.linearRampToValueAtTime(1150, t + dur * 0.55); lp.frequency.linearRampToValueAtTime(520, t + dur + 2);
    [-0.006, 0, 0.006].forEach(k => this.osc("sawtooth", f * (1 + k), t, end).connect(lp)); lp.connect(g); g.connect(dest);
  }
  pluck(t, f, dur, v, dest) {   // a soft synth pluck for arpeggios
    const end = t + 0.7, lp = this.filter("lowpass", 2400, 4), g = this.amp(t, 0.003, 0.07 * v, 0.5, end);
    lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(320, t + 0.28);
    this.osc("square", f, t, end).connect(lp); lp.connect(g); g.connect(dest);
  }
  sub(t, f, dur, v, dest) {
    const end = t + dur + 1.2, g = this.held(t, 0.35, 0.24 * v, dur, 1);
    this.osc("sine", f, t, end).connect(g); g.connect(dest);
  }
  rumble(t, v, dest) {   // something huge moving far below
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const lp = this.filter("lowpass", 160, 1), g = this.ctx.createGain(), len = 6;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + len * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(lp); lp.connect(g); g.connect(dest); s.start(t); s.stop(t + len + 0.1);
  }
  // ---- the organ: full organ, in the manner of a cathedral plenum (the Mr Crowley intro sound): many ranks
  // from 16' up to a bright mixture, buzzy reed-like tone, no tremulant, a slow swell and a long release
  // into a big hall. A faint second rank keeps it thick rather than wobbly.
  ranks(t, f, dur, v, dest, stops, level, bright) {
    const end = t + dur + 0.8, g = this.held(t, 0.03, level * v, dur, 0.4);
    const lp = this.filter("lowpass", Math.min(12000, f * bright), 0.6), mix = this.ctx.createGain();
    for (const [k, a, type] of stops) for (const det of [1, 1.0015]) {
      const o = this.osc(type || "sine", f * k * det, t, end), ga = this.ctx.createGain(); ga.gain.value = a / 2; o.connect(ga); ga.connect(mix);
    }
    mix.connect(lp); lp.connect(g); g.connect(dest);
  }
  organ(t, f, dur, v, dest) {   // the chords: principals, reeds and mixture
    this.ranks(t, f, Math.max(dur, 0.2), v, dest,
      [[0.5, 0.35, "square"], [1, 0.6, "sawtooth"], [1, 0.35, "square"], [2, 0.4, "sawtooth"], [3, 0.12], [4, 0.15, "square"], [6, 0.06], [8, 0.05]], 0.03, 14);
  }
  organLead(t, f, dur, v, dest) {   // the tune: the same full sound, a touch brighter so it rides on top
    this.ranks(t, f, dur, v, dest,
      [[1, 0.7, "sawtooth"], [1, 0.3, "square"], [2, 0.45, "sawtooth"], [3, 0.15], [4, 0.2, "square"], [8, 0.07]], 0.075, 18);
  }
  organPedal(t, f, dur, v, dest) {   // 16' and 8' pedal pipes, with a reed to give it bite
    this.ranks(t, f, Math.max(dur, 0.3), v, dest, [[0.5, 0.8, "square"], [1, 0.6, "sawtooth"], [2, 0.2, "sawtooth"]], 0.075, 9);
  }
  choir(t, f, dur, v, dest) {   // "aah": two detuned saws through three vowel formants
    const end = t + dur + 2.2, g = this.held(t, 1.4, 0.05 * v, dur, 2), mix = this.ctx.createGain();
    [0.996, 1.004].forEach(k => { const o = this.osc("sawtooth", f * k, t, end); this.vibrato(o, t, 4.3 + Math.random(), f * 0.005, 0.8).stop(end); o.connect(mix); });
    [[700, 1], [1150, 0.55], [2800, 0.22]].forEach(([ff, a]) => { const b = this.filter("bandpass", ff, 7), ga = this.ctx.createGain(); ga.gain.value = a; mix.connect(b); b.connect(ga); ga.connect(g); });
    g.connect(dest);
  }
  groan(t, dest) {   // a distant soul: a low voice sliding down through "oh"
    const len = 2.6 + Math.random() * 1.8, end = t + len + 0.5, f0 = 130 + Math.random() * 70;
    const o = this.osc("sawtooth", f0, t, end); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + len);
    this.vibrato(o, t, 3.5, f0 * 0.02, 0.4).stop(end);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + len * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const mix = this.ctx.createGain(); o.connect(mix);
    [[450, 1], [800, 0.6]].forEach(([ff, a]) => { const b = this.filter("bandpass", ff, 6), ga = this.ctx.createGain(); ga.gain.value = a; mix.connect(b); b.connect(ga); ga.connect(g); });
    g.connect(this.pan(dest, Math.random() * 1.6 - 0.8));
  }
}

// ===================================================================== writing music down
// A bar is written "D5:1 F5:0.5 r:0.5 A4+Eb5:1" - note:beats, r for a rest, + for notes together.
function parseBar(str) {
  const ev = []; let at = 0;
  for (const tok of str.trim().split(/\s+/)) {
    if (!tok) continue;
    const [n, d] = tok.split(":"), beats = +d;
    if (n !== "r") ev.push({ at, beats, midi: n.split("+").map(midiOf) });
    at += beats;
  }
  return ev;
}
const bars = s => s.split("|").map(parseBar);
const rests = (n, beats) => Array(n).fill("r:" + beats).join(" | ");
const sectionOf = (tune, b) => { let name = ""; for (const [at, n] of tune.sections || []) if (b >= at) name = n; return name; };

// ===================================================================== the tunes
const TUNES = [
  { id: "black", title: "Waltz in Black", meta: "Grand waltz · C minor · organ or saxophone over strings and tuba",
    desc: "After Shostakovich's Second Waltz, only darker: a slow, sweeping ballroom waltz for a ball nobody leaves. Intro, two themes, a variation with a violin counter-tune, a hushed middle section, the return and a coda.",
    bpm: 150, beats: 3, send: 1.4, gain: 1.7, organ: true, useOrgan: true, organGain: 1,
    // intro 4 | A 16 | B 16 | A' 16 (violin counter-tune) | C 16 (the middle section, hushed) | A'' 16 | coda 4
    sections: [[0, "intro"], [4, "A"], [20, "B"], [36, "A2"], [52, "C"], [68, "A3"], [84, "coda"]],
    chords: ("Cm Cm G7 G7 " +
             "Cm Cm Cm G7 G7 G7 G7 Cm Cm Cm C7 Fm Fm Cm G7 Cm " +
             "Ab Ab Fm Fm Cm Cm D7 G7 Ab Ab Fm G7 Cm G7 Cm Cm " +
             "Cm Cm Cm G7 G7 G7 G7 Cm Cm Cm C7 Fm Fm Cm G7 Cm " +
             "Eb Eb Bb7 Bb7 Eb Ab Fm G7 Cm Cm Ab Ab Fm Fm G7 G7 " +
             "Cm Cm Cm G7 G7 G7 G7 Cm Cm Cm C7 Fm Fm Cm G7 Cm " +
             "Cm Ab G7 Cm").split(" "),
    parts: [
      { inst: "sax", vel: 1, shift: -12, notes: bars(
        rests(4, 3) + " | " +
        "G4:2 C5:1 | Eb5:3 | D5:1 Eb5:1 F5:1 | D5:3 | B4:2 D5:1 | F5:3 | Eb5:1 D5:1 C5:1 | C5:2 r:1 |" +
        "G4:2 C5:1 | Eb5:3 | E5:1 G5:1 Bb5:1 | Ab5:3 | Ab5:1 G5:1 F5:1 | Eb5:2 C5:1 | D5:2 B4:1 | C5:3 |" +
        "C5:2 Eb5:1 | Ab5:3 | G5:1 F5:1 Eb5:1 | F5:3 | Eb5:1 D5:1 C5:1 | G5:3 | F#5:2 A5:1 | G5:3 |" +
        "C6:2 Ab5:1 | Eb5:3 | F5:1 Ab5:1 C6:1 | D6:2 B5:1 | C6:2 G5:1 | F5:1 D5:1 B4:1 | C5:3 | r:3 |" +
        // A': the theme decorated with turns
        "G4:1 B4:0.5 C5:0.5 C5:1 | Eb5:2 G5:1 | F5:1 Eb5:1 D5:1 | D5:2 G4:1 | B4:1 C5:0.5 D5:0.5 D5:1 | F5:2 Ab5:1 | G5:1 F5:1 Eb5:1 | C5:2 r:1 |" +
        "G4:1 B4:0.5 C5:0.5 C5:1 | Eb5:2 G5:1 | Bb5:1 G5:1 E5:1 | Ab5:2 C6:1 | Ab5:1 G5:1 F5:1 | Eb5:1 D5:1 C5:1 | D5:1 F5:1 B4:1 | C5:3 |" +
        // C: long, sighing notes in E flat, sinking back to C minor
        "G5:3 | Bb5:2 G5:1 | F5:3 | D5:2 Ab5:1 | G5:2 Eb5:1 | C6:3 | Ab5:1 G5:1 F5:1 | D5:2 B4:1 |" +
        "C5:2 Eb5:1 | G5:3 | Ab5:2 C6:1 | Eb6:3 | D6:1 C6:1 Ab5:1 | F5:3 | B5:1 D6:1 F6:1 | G5:2 r:1 |" +
        // A'': the theme once more, plainly
        "G4:2 C5:1 | Eb5:3 | D5:1 Eb5:1 F5:1 | D5:3 | B4:2 D5:1 | F5:3 | Eb5:1 D5:1 C5:1 | C5:2 r:1 |" +
        "G4:2 C5:1 | Eb5:3 | E5:1 G5:1 Bb5:1 | Ab5:3 | Ab5:1 G5:1 F5:1 | Eb5:2 C5:1 | D5:2 B4:1 | C5:3 |" +
        // coda
        "C6:2 G5:1 | Ab5:2 Eb5:1 | D5:1 F5:1 B4:1 | C5:3") },
      { inst: "violin", vel: 0.6, shift: 0, notes: bars(
        rests(4 + 16 + 16, 3) + " | " +
        // a counter-tune of long notes over the decorated theme
        "Eb5:3 | G5:3 | C6:3 | B5:3 | D6:3 | B5:3 | G5:3 | C6:2 r:1 | Eb6:3 | D6:3 | Bb5:3 | C6:3 | Ab5:3 | G5:3 | F5:2 D5:1 | Eb5:3 | " +
        rests(16, 3) + " | " +
        "Eb5:3 | G5:3 | C6:3 | B5:3 | D6:3 | B5:3 | G5:3 | C6:2 r:1 | Eb6:3 | D6:3 | Bb5:3 | C6:3 | Ab5:3 | G5:3 | F5:2 D5:1 | Eb5:3 | " +
        "Eb6:3 | C6:3 | B5:3 | C6:3") }
    ],
    // the big oom-pah-pah: tuba on the downbeat, strings on two and three, a soft snare tap, a crash at each
    // section; hushed held strings in the middle section; a long final chord
    accomp(S, bus, t, b, ch, beat) {
      const sec = sectionOf(this, b), bass = hz(36 + ch.root - (ch.root > 4 ? 12 : 0));
      const chord = ch.tones.map(tone => hz(55 + ((ch.root + tone + 5) % 12)));
      if (this.sections.some(x => x[0] === b) && sec !== "C") S.hit(t, 0.07, bus, 5200, 0.7, 2.2, "highpass");
      if (sec === "C") {
        S.tuba(t, bass, beat, 0.7, bus);
        for (const f of chord) S.strings(t, f, beat * 2.9, 0.7, bus);
        return;
      }
      if (sec === "coda" && b === this.chords.length - 1) {
        S.tuba(t, bass, beat * 3, 1, bus);
        for (const f of chord) S.strings(t, f, beat * 2.9, 1, bus);
        S.hit(t, 0.09, bus, 5200, 0.7, 2.8, "highpass");
        return;
      }
      S.tuba(t, bass, beat, 0.95, bus);
      for (const k of [1, 2]) for (const f of chord) S.strings(t + k * beat, f, beat * 0.55, 0.8, S.pan(bus, 0.15 * (k === 1 ? -1 : 1)));
      S.hit(t + beat, 0.04, bus, 3200, 2, 0.05); S.hit(t + 2 * beat, 0.035, bus, 3200, 2, 0.05);
    } },

  { id: "parlour", title: "The Devil's Parlour", meta: "Waltz · D minor · organ or bassoon over harpsichord and pizzicato",
    desc: "A sly, slightly crooked waltz for a card room run by the Devil himself. Intro, the tune twice, a second theme, a skipping middle section in F major, a variation with a harpsichord counter-tune, the return and a coda.",
    bpm: 138, beats: 3, organ: true, useOrgan: true, organGain: 1,
    // intro 4 | A1 8 | A2 8 | B 8 | C 16 (the middle section) | A1' 8 (counter-tune) | A2 8 | coda 4
    sections: [[0, "intro"], [4, "A"], [20, "B"], [28, "C"], [44, "A2"], [60, "coda"]],
    chords: ("Dm Dm A7 A7 " +
             "Dm Dm A7 A7 Dm Dm Gm A7 Dm Dm Gm Gm Dm A7 Dm Dm " +
             "Bb Bb F F Gm A7 Dm A7 " +
             "F F C7 C7 F F Bb A7 Gm Gm Dm Dm Bb Bb A7 A7 " +
             "Dm Dm A7 A7 Dm Dm Gm A7 Dm Dm Gm Gm Dm A7 Dm Dm " +
             "Dm Gm A7 Dm").split(" "),
    parts: [
      { inst: "bassoon", vel: 1, shift: -12, notes: bars(
        rests(4, 3) + " | " +
        "A4:1 D5:1 E5:1 | F5:2 E5:1 | C#5:1 E5:1 G5:1 | G5:1 F5:1 E5:1 | A4:1 D5:1 F5:1 | A5:2 G5:1 | Bb5:1 G5:1 E5:1 | C#5:2 r:1 |" +
        "A4:1 D5:1 E5:1 | F5:2 G5:1 | Bb5:1 A5:1 G5:1 | D5:2 Bb4:1 | A4:1 F5:1 E5:1 | E5:1 G5:1 C#5:1 | D5:3 | r:3 | " +
        rests(8 + 16, 3) + " | " +
        "A4:1 D5:1 E5:1 | F5:2 E5:1 | C#5:1 E5:1 G5:1 | G5:1 F5:1 E5:1 | A4:1 D5:1 F5:1 | A5:2 G5:1 | Bb5:1 G5:1 E5:1 | C#5:2 r:1 |" +
        "A4:1 D5:1 E5:1 | F5:2 G5:1 | Bb5:1 A5:1 G5:1 | D5:2 Bb4:1 | A4:1 F5:1 E5:1 | E5:1 G5:1 C#5:1 | D5:3 | r:3 |" +
        "D5:3 | Bb4:2 G4:1 | A4:2 C#5:1 | D5:3") },
      { inst: "harpsichord", vel: 0.9, shift: 0, notes: bars(
        rests(4 + 16, 3) + " | " +
        "D5:1 F5:1 Bb5:1 | A5:2 F5:1 | C5:1 F5:1 A5:1 | C6:2 A5:1 | G5:1 Bb5:1 D6:1 | C#6:1 A5:1 G5:1 | F5:1 E5:1 D5:1 | E5:1 C#5:1 A4:1 |" +
        // C: skipping, in F major, then darkening on the way back
        "A5:0.5 C6:0.5 F6:1 C6:1 | A5:1 F5:1 C5:1 | E5:0.5 G5:0.5 C6:1 Bb5:1 | G5:2 r:1 | F5:0.5 A5:0.5 C6:1 F6:1 | E6:1 D6:1 C6:1 | D6:1 Bb5:1 F5:1 | E5:2 r:1 |" +
        "D5:1 G5:1 Bb5:1 | A5:1 G5:1 F5:1 | F5:1 A5:1 D6:1 | C6:1 A5:1 F5:1 | D5:1 F5:1 Bb5:1 | A5:1 Bb5:1 D6:1 | C#6:1 E6:1 G6:1 | A5:2 r:1 |" +
        // a counter-tune over the bassoon's return
        "D6:1 F6:0.5 E6:0.5 D6:1 | A5:3 | E6:1 G6:0.5 F6:0.5 E6:1 | C#6:3 | F6:1 A6:0.5 G6:0.5 F6:1 | D6:3 | G6:1 Bb6:0.5 A6:0.5 G6:1 | E6:2 C#6:1 | " +
        rests(8 + 4, 3)) }
    ],
    // oom-pah-pah: a plucked bass note, then two crisp harpsichord chords; in the middle section a plucked
    // bass on every beat instead; a long final chord
    accomp(S, bus, t, b, ch, beat) {
      const sec = sectionOf(this, b), root = 36 + ch.root;
      if (sec === "C") {
        [0, ch.tones[1], 7].forEach((x, k) => S.pizz(t + k * beat, hz(root + x), beat, k ? 0.7 : 0.95, bus));
        for (const tone of ch.tones.slice(0, 3)) S.harpsichord(t + 2 * beat, hz(60 + ((ch.root + tone) % 12)), beat * 0.25, 0.3, S.pan(bus, 0.25));
        return;
      }
      if (sec === "coda" && b === this.chords.length - 1) {
        S.pizz(t, hz(root), beat, 0.6, bus); S.pizz(t, hz(root - 12), beat, 0.6, bus);
        for (const tone of ch.tones.slice(0, 3)) S.harpsichord(t, hz(60 + ((ch.root + tone) % 12)), beat * 3, 0.4, bus);
        return;
      }
      S.pizz(t, hz(root), beat, 0.9, bus);
      for (const k of [1, 2]) for (const tone of ch.tones.slice(0, 3)) S.harpsichord(t + k * beat, hz(60 + ((ch.root + tone) % 12)), beat * 0.25, 0.45, S.pan(bus, 0.25));
    } },

  { id: "danse", title: "Danse of the Damned", meta: "Danse macabre · G minor · violin, xylophone, pizzicato",
    desc: "Skeletons at midnight: a fiddler tuning to the devil's interval, then a jig with rattling bones.",
    bpm: 168, beats: 3,
    chords: "D7 D7 D7 D7 Gm Gm D7 D7 Gm Gm Cm D7 Eb Eb Cm Cm Gm D7 Gm Gm".split(" "),
    parts: [
      { inst: "violin", vel: 1, shift: 0, notes: bars(
        "A4+Eb5:1 r:2 | A4+Eb5:1 r:2 | A4+Eb5:1 r:2 | A4+Eb5:2 r:1 |" +
        "G5:1 r:0.5 D5:0.5 G5:1 | Bb5:2 A5:1 | F#5:1 r:0.5 D5:0.5 F#5:1 | A5:2 G5:1 |" +
        "G5:0.5 A5:0.5 Bb5:0.5 C6:0.5 D6:1 | D6:1 Bb5:1 G5:1 | Eb6:1 D6:1 C6:1 | D6:3 |" +
        "Eb6:1 Bb5:1 G5:1 | Eb5:1 G5:1 Bb5:1 | C6:1 G5:1 Eb5:1 | D5:1 Eb5:1 C5:1 |" +
        "Bb4:1 D5:1 G5:1 | F#5:1 A5:1 C6:1 | Bb5:1 A5:1 F#5:1 | G5:2 r:1") }
    ],
    // a plucked bass, and bones (xylophone) rattling through the chord
    accomp(S, bus, t, b, ch, beat) {
      S.pizz(t, hz(31 + ch.root + (ch.root < 5 ? 12 : 0)), beat, 0.9, bus);
      if (b < 4) { S.xylo(t + 1.5 * beat, hz(74), beat * 0.4, 0.5, S.pan(bus, 0.4)); return; }
      const tones = ch.tones.slice(0, 3).map(x => 72 + ((ch.root + x) % 12));
      [1, 1.5, 2, 2.5].forEach((at, i) => S.xylo(t + at * beat, hz(tones[i % 3] + (i === 3 ? 12 : 0)), beat * 0.4, 0.55, S.pan(bus, 0.35)));
    } },

  { id: "cardroom", title: "Old Nick's Card Room", meta: "Slow swing · C minor · saloon piano, walking bass, brushes",
    desc: "Late, smoky and in no hurry: the band that plays after the last hand has been dealt.",
    bpm: 92, beats: 4, swing: 0.64, gain: 0.8,
    chords: "Cm Cm Fm Fm Cm Cm G7 G7 Ab7 Ab7 Cm Cm Fm G7 Cm G7".split(" "),
    parts: [{ inst: "piano", vel: 1, shift: 0, notes: bars(
      "G4:1 Eb5:1 D5:0.5 C5:0.5 Bb4:1 | C5:3 r:1 | F4:1 Ab4:1 C5:0.5 Eb5:0.5 D5:1 | C5:3 r:1 |" +
      "G4:0.5 C5:0.5 Eb5:0.5 G5:0.5 F5:1 Eb5:1 | D5:1 C5:1 Bb4:1 G4:1 | B4:1 D5:1 F5:1 Ab5:1 | G5:4 |" +
      "Gb5:1 Eb5:1 C5:0.5 Eb5:0.5 Gb5:1 | F5:2 Eb5:1 C5:1 | G5:1 Eb5:0.5 C5:0.5 G4:1 C5:1 | Eb5:3 r:1 |" +
      "Ab5:1 F5:1 C5:1 Ab4:1 | B4:1 D5:1 F5:1 G5:1 | Eb5:1 D5:1 C5:2 | r:4") }],
    // walking bass (chord tones, then a step into the next chord), soft chords on 2 and 4, brushes
    accomp(S, bus, t, b, ch, beat, next) {
      const r = 36 + ch.root, walk = [r, r + ch.tones[1], r + 7, 36 + next.root + (next.root > ch.root ? -1 : 1)];
      walk.forEach((n, i) => S.pizz(t + i * beat, hz(n), beat, 0.85, bus));
      for (const at of [1, 3]) for (const tone of ch.tones) S.piano(t + at * beat, hz(55 + ((ch.root + tone + 5) % 12)), beat * 0.3, 0.32, S.pan(bus, -0.3));
      for (let i = 0; i < 4; i++) { S.hit(t + i * beat, i % 2 ? 0.05 : 0.025, bus, 7000, 0.7, 0.12, "highpass"); S.hit(t + (i + 0.64) * beat, 0.02, bus, 7000, 0.7, 0.05, "highpass"); }
    } },

  { id: "souls", title: "The Souls Below", meta: "Ambient · for the Souls table · drone, choir, groans, fire",
    desc: "No tune at all: a low drone, a distant choir, the damned groaning and the crackle of fire. Endless.",
    ambient: true },

  { id: "echoes", title: "Echoes Below", meta: "Ambient · drone, choir, groans, fire · and ghosts of the other tunes",
    desc: "The Souls Below, but now and then a phrase from one of the other tunes drifts up from somewhere far off: slowed, muffled, half remembered.",
    ambient: true, echoes: true }
];


// Original dances: each has a distinct theme, contrasting middle and a quieter loop seam.
const scorePart = (inst, vel, sections) => ({ inst, vel, shift: 0, notes: bars(sections.join(" | ")) });
const silentBars = (n, beats) => rests(n, beats);
const bellA = "B4:1 E5:1 G5:1 | F#5:1.5 E5:0.5 D#5:1 | G5:1 B5:1 A5:1 | G5:2 E5:1 | A5:1 G5:0.5 F#5:0.5 E5:1 | F#5:1 A5:1 C6:1 | B5:1 A5:1 D#5:1 | E5:2 r:1";
const bellV = "B4:0.5 E5:0.5 G5:1 B5:1 | A5:1 F#5:1 D#5:1 | G5:0.5 A5:0.5 B5:1 E6:1 | D6:1 B5:1 G5:1 | A5:1.5 G5:0.5 E5:1 | C6:1 A5:1 F#5:1 | D#5:0.5 F#5:0.5 A5:1 B5:1 | G5:2 E5:1";
const bellB = "E5:1 G5:1 C6:1 | B5:2 G5:1 | A5:1 C6:1 B5:1 | A5:2 F#5:1 | G5:1 B5:1 D6:1 | C6:1 B5:1 A5:1 | F#5:1 A5:1 C6:1 | B5:2 r:1";
const wheelA = "D5:0.5 G5:0.5 Bb5:1 A5:1 | G5:0.5 F#5:0.5 G5:1 D5:1 | F#5:1 A5:0.5 Bb5:0.5 C6:1 | A5:1 F#5:1 D5:1 | G5:0.5 Bb5:0.5 D6:1 C6:1 | Bb5:1 G5:1 Eb5:1 | A5:0.5 G5:0.5 F#5:1 D5:1 | G5:2 r:1";
const wheelV = "D5:0.5 G5:0.5 Bb5:0.5 D6:0.5 C6:1 | Bb5:1 A5:0.5 G5:0.5 D5:1 | F#5:0.5 A5:0.5 C6:1 Eb6:1 | D6:0.5 C6:0.5 A5:1 F#5:1 | Bb5:0.5 D6:0.5 G6:1 F6:1 | Eb6:1 D6:0.5 C6:0.5 Bb5:1 | A5:0.5 Bb5:0.5 A5:0.5 G5:0.5 F#5:1 | G5:2 r:1";
const wheelB = "Bb5:1 G5:1 Eb5:1 | D5:1 F5:1 Bb5:1 | A5:0.5 Bb5:0.5 C6:1 F5:1 | D6:2 Bb5:1 | C6:1 Eb6:1 D6:1 | C6:1 Bb5:1 G5:1 | Bb5:0.5 A5:0.5 G5:1 E5:1 | F#5:2 D5:1";
const veilA = "E5:2 A5:1 B5:1 C6:2 | B5:1 A5:2 G#5:1 E5:2 | A5:1 C6:2 E6:1 D6:2 | C6:3 A5:2 r:1 | F5:2 A5:1 C6:1 B5:2 | A5:1 F5:2 D5:1 E5:2 | G#5:1 B5:2 D6:1 C6:1 B5:1 | A5:4 r:2";
const veilB = "G5:2 C6:1 E6:1 D6:2 | B5:3 G5:3 | A5:2 C6:1 F6:1 E6:2 | D6:3 A5:2 r:1 | C6:2 A5:1 F5:1 G5:2 | A5:1 F5:2 D5:1 F5:2 | G#5:2 B5:1 D6:1 F6:2 | E6:3 B5:2 r:1";
const veilV = "E5:1 A5:1 C6:1 B5:1 A5:2 | G#5:2 B5:1 E6:1 D6:2 | C6:1 E6:2 A6:1 G6:2 | E6:3 C6:2 A5:1 | F5:1 A5:2 C6:1 D6:2 | C6:2 A5:1 F5:1 D5:2 | B5:1 D6:1 F6:1 E6:1 G#5:2 | A5:4 r:2";
function danceBacking(P, bus, t, b, ch, beat) {
  const section = sectionOf(this, b), quiet = section === "middle", last = b === this.chords.length - 1;
  const root = 36 + ch.root, notes = ch.tones.map(x => 48 + ch.root + x);
  if (this.id === "bell13") {
    P.pizz(t, hz(root - 12), beat * (quiet || last ? 2.9 : 0.85), quiet ? 0.42 : 0.62, bus);
    for (const at of quiet || last ? [0] : [1, 2])
      for (const n of notes) P.strings(t + at * beat, hz(n), beat * (quiet || last ? 2.8 : 0.7), quiet ? 0.45 : 0.6, bus);
    if (!quiet && !last && b >= 4) P.harpsichord(t + 2.5 * beat, hz(root + 24 + ch.tones[1]), beat * 0.4, 0.23, bus);
  } else if (this.id === "carousel") {
    P.tuba(t, hz(root - 12), beat, quiet ? 0.4 : 0.62, bus);
    for (const at of last ? [0] : [1, 2])
      for (const n of notes) P.harpsichord(t + at * beat, hz(n + 12), beat * (last ? 2.8 : 0.35), quiet ? 0.25 : 0.38, P.pan(bus, -0.15));
    if (!quiet && !last) P.hit(t + 2 * beat, 0.018, bus, 2100, 1.2, 0.04);
  } else {
    P.pizz(t, hz(root - 12), beat * 2, quiet ? 0.4 : 0.65, bus);
    if (!last) P.pizz(t + 3 * beat, hz(root - 5), beat * 1.5, 0.38, bus);
    for (const n of notes) P.strings(t, hz(n), beat * 5.6, quiet ? 0.36 : 0.43, P.pan(bus, -0.2));
    if (!quiet && !last) [0, 1, 2, 3, 4, 5].forEach((at, i) =>
      P.harpsichord(t + at * beat, hz(root + 24 + ch.tones[[0, 2, 1, 0, 1, 2][i]]), beat * 0.7, 0.22, P.pan(bus, 0.25)));
  }
}
TUNES.splice(4, 0,
  { id: "bell13", title: "The Thirteenth Bell", meta: "Organ waltz · E minor · 40 bars · organ or violin and chamber strings",
    desc: "A solemn invitation behind a locked door. A low pedal, rising minor phrases and a brief glimpse of light before the organ draws the room back into shadow.",
    bpm: 116, beats: 3, send: 1.15, gain: 0.85, organ: true, useOrgan: true, organGain: 2.4,
    sections: [[0, "intro"], [4, "theme"], [12, "variation"], [20, "middle"], [28, "return"], [36, "coda"]],
    chords: ("Em D C B7 Em B7 C Em Am F#dim B7 Em Em B7 C Em Am F#dim B7 Em C G Am D7 G C F#dim B7 Em B7 C Em Am F#dim B7 Em C Am B7 Em").split(" "),
    parts: [scorePart("violin", 0.72, ["E4:3 | D4:2 F#4:1 | E4:1 G4:1 C5:1 | D#5:2 r:1", bellA, bellV, bellB, bellA, "G5:2 E5:1 | A5:1 C6:1 E5:1 | F#5:1 D#5:1 B4:1 | E5:2 r:1"]),
      scorePart("harpsichord", 0.25, [silentBars(12, 3), "G4:3 | F#4:3 | E4:3 | B4:3 | C5:3 | A4:3 | F#4:3 | G4:3", silentBars(8, 3), "G4:3 | F#4:3 | E4:3 | B4:3 | C5:3 | A4:3 | F#4:3 | G4:3", silentBars(4, 3)])], accomp: danceBacking },
  { id: "carousel", title: "The Last Carousel", meta: "Sinister fairground waltz · G minor · 48 bars · reeds, bells and tuba",
    desc: "A cheerful mechanical smile that never quite reaches the eyes. Reeds and little bells circle a crooked tune; the ride slows into a dream, then starts again.",
    bpm: 144, beats: 3, send: 0.65, gain: 0.8, organ: true, useOrgan: false, organGain: 2.5,
    sections: [[0, "intro"], [4, "theme"], [12, "variation"], [20, "second theme"], [28, "middle"], [36, "return"], [44, "coda"]],
    chords: ("Gm Gm D7 D7 Gm Gm D7 D7 Gm Cm D7 Gm Gm Gm D7 D7 Gm Cm D7 Gm Eb Bb F Bb Cm Cm Edim D7 Eb Bb Cm D7 Gm Eb Edim D7 Gm Gm D7 D7 Gm Cm D7 Gm Eb Cm D7 Gm").split(" "),
    parts: [scorePart("reed", 0.65, ["r:3 | D5:0.5 r:0.5 G5:1 Bb5:1 | A5:1 F#5:1 D5:1 | C5:1 D5:1 r:1", wheelA, wheelV, wheelB, "G5:3 | F5:2 D5:1 | Eb5:3 | F#5:2 r:1 | G5:3 | Bb5:2 G5:1 | Bb5:1 G5:1 E5:1 | F#5:2 r:1", wheelA, "G5:1 Bb5:1 Eb6:1 | C6:2 G5:1 | A5:1 F#5:1 D5:1 | G5:2 r:1"]),
      scorePart("xylo", 0.25, [silentBars(12, 3), "G6:1 r:1 D6:1 | Bb5:1 r:1 G5:1 | A5:1 r:1 F#5:1 | D6:1 r:2 | Bb5:1 r:1 D6:1 | Eb6:1 r:1 C6:1 | A5:1 r:1 F#5:1 | G5:1 r:2", silentBars(16, 3), "G6:1 r:1 D6:1 | Bb5:1 r:1 G5:1 | A5:1 r:1 F#5:1 | D6:1 r:2 | Bb5:1 r:1 D6:1 | Eb6:1 r:1 C6:1 | A5:1 r:1 F#5:1 | G5:1 r:2", silentBars(4, 3)])], accomp: danceBacking },
  { id: "veil", title: "Behind the Velvet Door", meta: "Mysterious dance · A minor · 6/8 · 48 bars · violin, plucked keys and strings",
    desc: "A measured dance heard from the next room: two swaying pulses, an unanswered phrase and a warmer middle passage that quietly turns uneasy.",
    bpm: 180, beats: 6, send: 1.1, gain: 0.8, organ: true, useOrgan: false, organGain: 2.2,
    sections: [[0, "intro"], [4, "theme"], [12, "second theme"], [20, "middle"], [28, "variation"], [36, "return"], [44, "coda"]],
    chords: ("Am Am F E7 Am E7 Am Am F Dm E7 Am C G F Dm F Dm E7 E7 F C Dm E7 F Dm Bdim E7 Am E7 Am Am F Dm E7 Am Am E7 Am Am F Dm E7 Am F Dm E7 Am").split(" "),
    parts: [scorePart("violin", 0.65, ["r:6 | E5:3 A5:2 r:1 | C6:3 A5:3 | G#5:3 E5:2 r:1", veilA, veilB, "A5:3 F5:3 | G5:2 C6:1 E6:3 | F6:3 D6:3 | E6:2 D6:1 B5:3 | C6:3 A5:3 | F5:2 A5:1 D6:3 | F5:3 B5:3 | G#5:3 E5:2 r:1", veilV, veilA, "A5:2 C6:1 F6:3 | D6:2 A5:1 F5:3 | G#5:2 B5:1 E6:3 | A5:4 r:2"])], accomp: danceBacking }
);


// A crooked village dance: Dorian warmth, a Phrygian shadow, then eight bars of D Locrian.
// Durations are eighth notes; displaced 2+2+2 accents occasionally interrupt the 3+3 lilt.
const ashA = "D5:2 F5:1 G5:2 A5:1 | C6:1 A5:2 G5:1 E5:2 | F5:1 E5:1 D5:1 A4:2 C5:1 | D5:3 r:1 A4:2 | D5:1 F5:2 A5:1 B5:2 | A5:2 G5:1 E5:2 C5:1 | G5:2 B5:2 A5:1 G5:1 | F5:1 E5:2 D5:2 r:1";
const ashV = "A4:1 D5:1 F5:1 G5:2 A5:1 | C6:2 G5:1 A5:2 E5:1 | F5:2 D5:1 E5:1 C5:1 A4:1 | D5:2 A4:2 D5:1 r:1 | F5:1 A5:1 B5:2 A5:1 G5:1 | E5:2 G5:1 A5:1 C6:2 | B5:1 G5:2 A5:1 E5:2 | F5:2 E5:1 D5:2 r:1";
const ashB = "A5:3 F5:2 E5:1 | G5:2 C6:1 A5:3 | G5:1 F5:2 Eb5:1 D5:2 | F5:3 Eb5:2 r:1 | D5:2 F5:1 A5:2 G5:1 | Bb5:1 A5:2 G5:1 F5:2 | Eb5:2 F5:2 D5:1 C5:1 | Eb5:1 D5:2 r:1 D5:2";
const ashL = "D5:2 Eb5:1 F5:2 Ab5:1 | G5:1 F5:2 Eb5:1 D5:2 | Ab5:2 G5:2 F5:1 Eb5:1 | C5:1 Eb5:2 D5:2 r:1 | D5:1 F5:2 Ab5:1 Bb5:2 | Ab5:2 G5:1 Eb5:2 F5:1 | G5:2 Eb5:2 D5:1 C5:1 | Eb5:1 F5:1 Ab5:1 D5:2 r:1";
function ashBacking(P, bus, t, b, ch, beat) {
  const section = sectionOf(this, b), locrian = section === "locrian", hushed = section === "middle";
  const last = b === this.chords.length - 1;
  // The lowered fifth is confined to the Locrian passage; the tonic drone remains D.
  P.strings(t, hz(50), beat * 5.7, 0.25, P.pan(bus, -0.25));
  P.strings(t, hz(locrian ? 56 : 57), beat * 5.7, locrian ? 0.16 : 0.2, P.pan(bus, 0.2));
  P.pizz(t, hz(38), beat * 2.2, hushed ? 0.35 : 0.5, bus);
  if (last) return;
  P.pizz(t + 3 * beat, hz(locrian ? 44 : 45), beat * 1.8, 0.32, bus);
  const tones = ch.tones.map(n => 60 + ch.root + n);
  const crooked = locrian || b % 4 === 2;
  const pulse = crooked ? [0, 2, 4] : [0, 3];
  for (let i = 0; i < pulse.length; i++) {
    P.harpsichord(t + pulse[i] * beat, hz(tones[i % 3]), beat * 1.3, hushed ? 0.18 : 0.28, P.pan(bus, 0.25));
    if (!hushed && b >= 4) P.hit(t + pulse[i] * beat, i === 0 ? 0.025 : 0.015, bus, 950, 0.8, 0.065);
  }
  if (!hushed && b >= 4) P.harpsichord(t + 5 * beat, hz(tones[1]), beat * 0.65, 0.16, P.pan(bus, 0.25));
}
TUNES.splice(TUNES.findIndex(t => t.ambient), 0,
  { id: "ashfolk", title: "The Ash-Tree Gathering",
    meta: "Uneasy folk dance · 6/8 · Dorian, Phrygian and Locrian · fiddle, reeds and plucked strings",
    desc: "A village dance after dusk. A familiar lilting refrain acquires misplaced footsteps, a flattened second and, briefly, a fifth that refuses to stand straight. The dancers find their way home, almost.",
    bpm: 174, beats: 6, send: 0.65, gain: 0.85, organ: true, useOrgan: false, organGain: 2.2,
    sections: [[0, "intro"], [4, "theme"], [12, "variation"], [20, "middle"], [28, "locrian"], [36, "return"], [44, "coda"]],
    chords: "Dm C Dm Dm Dm C Dm Dm Dm C G Dm Dm C Dm Dm Dm C G Dm Dm C Eb F Dm Bb Eb Dm Ddim Eb Fm Cm Ddim Fm Cm Ddim Dm C Dm Dm Dm C G Dm Dm C Dm Dm".split(" "),
    parts: [scorePart("violin", 0.56, ["D5:3 A4:2 r:1 | E5:2 G5:1 E5:2 r:1 | F5:2 E5:1 D5:3 | A4:3 r:1 C5:2", ashA, ashV, ashB, ashL, ashA, "A5:2 F5:1 D5:3 | G5:1 E5:2 C5:3 | F5:1 E5:1 D5:1 A4:2 C5:1 | D5:4 r:2"]),
      scorePart("reed", 0.24, [silentBars(12, 6), "F4:3 A4:3 | E4:3 G4:3 | D4:3 F4:3 | A4:4 r:2 | A4:2 B4:1 A4:3 | G4:3 E4:3 | B4:3 G4:3 | F4:3 D4:2 r:1", silentBars(8, 6), "Ab4:3 F4:3 | G4:2 Eb4:1 F4:3 | F4:3 Ab4:3 | Eb4:3 C4:2 r:1 | F4:3 Ab4:3 | Ab4:2 F4:1 Eb4:3 | Eb4:3 C4:3 | Ab4:3 D4:2 r:1", silentBars(12, 6)])],
    accomp: ashBacking }
);


// Original hymn: measured four-part phrases are progressively undermined by flat seconds and tritones.
const hymnA = "D5:0.5 F5:0.5 A5:1 r:0.5 A5:0.5 G5:0.5 F5:0.5 | Bb5:1.5 A5:0.5 F5:1 r:0.5 F5:0.5 | G5:0.5 A5:0.5 C6:1.5 A5:0.5 G5:1 | G5:1 r:0.5 G5:0.5 E5:1 C5:1 | G5:1 Bb5:0.5 A5:0.5 G5:1 A5:0.5 Bb5:0.5 | F5:0.5 E5:0.5 D5:1 r:0.5 A4:0.5 C5:0.5 D5:0.5 | E5:0.5 G5:0.5 A5:1 G5:0.5 E5:0.5 C#5:1 | D5:1 A4:0.5 C5:0.5 D5:1 r:1";
const hymnWrong = "D5:1 F5:1 A5:2 | Bb5:2 Ab5:1 F5:1 | Ab5:1 Bb5:1 C6:2 | Ab5:3 Eb5:1 | Ab5:2 C6:1 B5:1 | F5:1 D5:1 B4:2 | Eb5:1 G5:1 Bb5:2 | Ab5:3 r:1";
const hymnReturn = "D5:1 F5:1 A5:2 | Bb5:2 A5:1 F5:1 | G5:1 Ab5:1 Bb5:2 | Ab5:3 F5:1 | G5:2 Bb5:1 A5:1 | Ab5:1 G5:1 Eb5:2 | E5:1 G5:1 C#5:2 | D5:3 r:1";
function hymnBacking(P,bus,t,b,ch,beat) {
  const warped=sectionOf(this,b)==="corruption", ending=b>=28;
  const root=36+ch.root;
  if (b < 12) {
    // A firm two-and-four backbeat, with pickups between the bass steps.
    const fifth=ch.tones.includes(6)?6:7;
    [[0,root-12,0.55],[1.5,root-12+fifth,0.32],[2,root,0.48],[3.5,root-12+fifth,0.3]].forEach(([at,n,v]) =>
      P.pizz(t+at*beat,hz(n),beat*0.42,v,bus));
    for (const at of [1,3]) for (const n of ch.tones)
      P.harpsichord(t+at*beat,hz(48+ch.root+n),beat*0.42,0.48,bus);
    for (const at of [0.5,2.5]) P.harpsichord(t+at*beat,hz(60+ch.root+ch.tones[1]),beat*0.22,0.23,bus);
    P.hit(t+beat,0.03,bus,1800,0.8,0.07); P.hit(t+3*beat,0.035,bus,1800,0.8,0.07);
    return;
  }
  P.pizz(t,hz(root-12),beat*3.7,0.48,bus);
  if(!ending) P.pizz(t+2*beat,hz(root+(ch.tones.includes(6)?6:7)-12),beat*1.8,0.28,bus);
  for(const n of ch.tones) P.strings(t,hz(48+ch.root+n),beat*3.7,0.48,P.pan(bus,-0.12));
  // A quiet tonic pedal makes the foreign harmonies feel like a damaged service rather than a key change.
  if(warped||ending) P.strings(t,hz(50),beat*3.8,0.3,bus);
}
TUNES.splice(TUNES.findIndex(t=>t.ambient),0,
  { id: "hymn", title: "The Hollow Benediction",
    meta: "Corrupted hymn · 4/4 · D minor and fractured modes · overdriven organ or chamber ensemble",
    desc: "A foot-tapping chapel tune with something wrong beneath the floorboards. Familiar phrases gather foreign chords, the fifth buckles, and the final blessing will not settle. A driven organ growls through a slow rotating-speaker shimmer.",
    bpm:96, beats:4, send:0.65, gain:0.7, organ:true, useOrgan:true, organGain:1, drivenOrgan:true,
    sections:[[0,"intro"],[4,"hymn"],[12,"corruption"],[20,"return"],[28,"coda"]],
    chords:"Dm Bb Gm A7 Dm Bb F C Gm Dm A7 Dm Dm Eb Ab Ddim Fm Bdim Eb Ddim Dm Bb Eb Ddim Gm Ab A7 Dm Bb Eb Ddim Ddim".split(" "),
    parts:[scorePart("violin",0.62,["D4:0.5 A4:0.5 D5:0.5 F5:0.5 A5:1 G5:0.5 F5:0.5 | Bb4:0.5 D5:0.5 F5:1 r:0.5 F5:0.5 D5:1 | G4:0.5 D5:0.5 G5:0.5 Bb5:0.5 A5:1 G5:1 | E5:0.5 G5:0.5 A5:1 r:0.5 E5:0.5 C#5:1",hymnA,hymnWrong,hymnReturn,"F5:2 Bb5:2 | G5:2 Eb5:2 | F5:1 Eb5:1 D5:2 | D5+Ab5:3 r:1"]),
      scorePart("reed",0.3,[silentBars(12,4),"F4:2 A4:2 | Eb4:2 G4:2 | C5:2 Eb5:2 | F4:2 Ab4:2 | C5:2 Ab4:2 | D5:2 F5:2 | Bb4:2 G4:2 | F4:3 r:1","F4:2 A4:2 | D5:2 F5:2 | Eb5:2 G4:2 | F4:2 Ab4:2 | Bb4:2 D5:2 | C5:2 Ab4:2 | G4:2 E4:2 | F4:3 r:1","D5:4 | Bb4:4 | Ab4:4 | F4:3 r:1"])],accomp:hymnBacking }
);


// SID-style remix: three monophonic lanes, with chord tones rapidly time-shared on voice two.
// This is a browser synthesis arrangement, not an emulation or a .sid program.
const blackSource=TUNES.find(t=>t.id==="black");
const blackChipLead=blackSource.parts[0].notes.map(bar=>bar.map(ev=>({...ev,midi:[...ev.midi]})));
blackChipLead.splice(0,4,...bars("C5:0.5 G5:0.5 C6:1 G5:1 | Eb5:0.5 G5:0.5 C6:1 Bb5:1 | B4:0.5 D5:0.5 G5:1 F5:1 | D5:1 B4:1 r:1"));
function chipWaltzBacking(P,bus,t,b,ch,beat) {
  const sec=sectionOf(this,b),quiet=sec==="C",last=b===this.chords.length-1;
  const root=36+ch.root-(ch.root>4?12:0);
  const steps=last?[0]:quiet?[0,1,2]:[0,1.5,2.5];
  for(let i=0;i<steps.length;i++) P.sidBass(t+steps[i]*beat,hz(root+(i===1?7:0)),beat*(last?2.9:0.42),quiet?0.6:0.85,bus);
  // Rapid 50 Hz arpeggios supply the missing polyphony, gated into the two waltz chord accents.
  const spans=quiet||last?[[0,2.9]]:[[1,0.7],[2,0.7]];
  for(const [at,len] of spans) {
    const start=t+at*beat,end=start+len*beat;
    const counter=blackSource.parts[1].notes[b]||[];
    for(let tick=0,when=start;when<end-0.005;tick++,when=start+tick*0.02) {
      let midi=60+ch.root+ch.tones[tick%ch.tones.length];
      // Return sections interleave the original counter-tune with the chord arpeggio.
      if(counter.length && tick%4===3) {
        const ev=counter.find(e=>e.at<=((when-t)/beat)&&e.at+e.beats>((when-t)/beat));
        if(ev)midi=ev.midi[0];
      }
      P.sidArp(when,hz(midi),Math.min(0.019,end-when),quiet?0.42:0.64,bus);
    }
  }
}
TUNES.splice(TUNES.findIndex(t=>t.id==="black")+1,0,
  {id:"blackSID",title:"Waltz in Black — SID Remix",
   meta:"Chiptune waltz · C minor · three voices · pulse lead, triangle bass and rapid arpeggios",
   desc:"The ballroom squeezed into a haunted home computer: a bright pulse-wave melody, bubbling chord arpeggios and a clipped bass keep the original waltz turning. The middle softens before the final return.",
   bpm:blackSource.bpm,beats:3,send:0.08,gain:0.9,sid:true,
   chords:[...blackSource.chords],sections:blackSource.sections.map(s=>[...s]),
   parts:[{inst:"sidLead",vel:0.8,shift:0,notes:blackChipLead}],accomp:chipWaltzBacking}
);

function chipped(S,bus) {
  const P=Object.create(S),ctx=S.ctx;
  const cabinet=S.filter("lowpass",6000,0.7);cabinet.connect(bus);
  const voices=["triangle","pulse","pulse"].map((type,lane)=>{
    const osc=ctx.createOscillator(),amp=ctx.createGain(),filter=S.filter("lowpass",lane===0?1600:lane===1?4800:6200,0.7);
    if(type==="pulse") {
      const real=new Float32Array(65),imag=new Float32Array(65),duty=lane===1?0.25:0.38;
      for(let n=1;n<65;n++){real[n]=2*Math.sin(2*Math.PI*n*duty)/(Math.PI*n);imag[n]=2*(1-Math.cos(2*Math.PI*n*duty))/(Math.PI*n);}
      osc.setPeriodicWave(ctx.createPeriodicWave(real,imag));
    } else osc.type=type;
    amp.gain.value=0;osc.connect(filter);filter.connect(amp);amp.connect(cabinet);osc.start();
    return {osc,amp,level:[0.24,0.105,0.14][lane]};
  });
  function note(lane,t,f,dur,vel) {
    const v=voices[lane],end=t+Math.max(0.012,dur),attack=lane===1?0.001:0.004;
    v.osc.frequency.setValueAtTime(f,t);
    if(lane===2&&dur>0.25) {
      for(let at=t+0.16;at<end-0.015;at+=0.02) v.osc.frequency.setValueAtTime(f*Math.pow(2,Math.sin((at-t)*2*Math.PI*5.5)*0.07/12),at);
    }
    const g=v.amp.gain,peak=v.level*vel;
    g.setValueAtTime(0,t);g.linearRampToValueAtTime(peak,t+attack);
    g.setValueAtTime(peak*(lane===2?0.8:1),Math.max(t+attack,end-0.006));g.linearRampToValueAtTime(0,end);
  }
  P.sidBass=(t,f,d,v)=>note(0,t,f,d,v);
  P.sidArp=(t,f,d,v)=>note(1,t,f,d,v);
  P.sidLead=(t,f,d,v)=>note(2,t,f,d,v);
  P.release=()=>{voices.forEach(v=>{v.osc.stop();v.osc.disconnect();});cabinet.disconnect();};
  return P;
}


// Original aristocratic processional: broad brass phrases above deliberate, clipped dance steps.
Synth.prototype.brass=function(t,f,dur,v,dest) {
  this.ranks(t,f,dur,v,dest,[[1,0.75,"sawtooth"],[2,0.2,"square"],[0.5,0.18,"sine"]],0.085,7);
};
const ironA="D5:1.5 A4:0.5 F4:1 A4:1 | Bb4:1 A4:1 F4:1 E4:1 | D5:1.5 Bb4:0.5 G4:1 Bb4:1 | A4:2 F4:1 D4:1 | D5:1.5 A4:0.5 F4:1 A4:1 | Bb4:1 A4:1 F4:1 E4:1 | C#5:1.5 A4:0.5 E4:1 G4:1 | F4:2 D4:1 r:1";
const ironB="F5:1.5 C5:0.5 A4:1 C5:1 | D5:1 C5:1 A4:1 G4:1 | G5:1.5 Eb5:0.5 Bb4:1 Eb5:1 | F5:2 D5:1 A4:1 | D5:1.5 Bb4:0.5 G4:1 Bb4:1 | F5:1 D5:1 Bb4:1 A4:1 | E5:1.5 C#5:0.5 A4:1 G4:1 | F4:2 D4:1 r:1";
const ironMiddle="A4:2 C5:1 F5:1 | E5:3 C5:1 | D5:1 F5:1 A5:2 | G5:2 E5:1 C5:1 | F5:2 D5:1 Bb4:1 | Eb5:3 Bb4:1 | A4:1 C#5:1 E5:1 G5:1 | C#5:2 A4:1 r:1";
function ironBacking(P,bus,t,b,ch,beat) {
  const sec=sectionOf(this,b),soft=sec==="middle",last=b===this.chords.length-1;
  const root=36+ch.root-(ch.root>5?12:0),tones=ch.tones.map(n=>48+ch.root+n);
  if(soft||last) {
    P.pizz(t,hz(root),beat*3.6,soft?0.44:0.8,bus);
    for(const n of tones) P.strings(t,hz(n),beat*3.7,soft?0.38:0.72,bus);
    if(soft)P.harpsichord(t+2.5*beat,hz(tones[1]+12),beat*0.5,0.2,P.pan(bus,0.2));
    return;
  }
  // Two heavy floor-strokes; chords arrive just late enough to suggest an imperious bow.
  for(const at of [0,2]) {
    P.tuba(t+at*beat,hz(root),beat*0.7,at===0?0.95:0.8,bus);
    P.pizz(t+at*beat,hz(root-12),beat*0.7,0.65,bus);
    P.hit(t+at*beat,0.06,bus,110,0.8,0.13,"lowpass");
  }
  for(const at of [0.75,1,2.75,3])for(const n of tones)
    P.strings(t+at*beat,hz(n),beat*(at%1?0.22:0.48),at%1?0.42:0.8,P.pan(bus,-0.12));
  if(sec==="return"||sec==="coda") for(const at of [1,3]) P.hit(t+at*beat,0.024,bus,2600,1,0.065);
  if(this.sections.some(s=>s[0]===b)&&b>0)P.hit(t,0.03,bus,5000,0.7,0.75,"highpass");
}
TUNES.splice(TUNES.findIndex(t=>t.ambient),0,
  {id:"ironCourt",title:"The Court of Iron",
   meta:"Imperious dance · 4/4 · D minor · low brass, clipped strings and a quiet chamber interlude",
   desc:"An impeccably mannered procession with steel beneath its gloves. Broad brass phrases stride over heavy footsteps; a graceful interlude briefly clears the floor before the court returns in force.",
   bpm:112,beats:4,send:0.85,gain:0.85,organ:true,useOrgan:false,organGain:1.9,
   sections:[[0,"entrance"],[4,"first dance"],[12,"second dance"],[20,"middle"],[28,"return"],[36,"coda"]],
   chords:"Dm Dm Eb A7 Dm Bb Gm Dm Dm Bb A7 Dm Dm Bb Eb Dm Gm Bb A7 Dm F C Dm C Bb Eb A7 A7 Dm Bb Gm Dm Dm Bb A7 Dm Bb Eb A7 Dm".split(" "),
   parts:[scorePart("brass",0.76,["D4:1 r:1 A3:1 r:1 | F4:1.5 E4:0.5 D4:1 r:1 | Eb4:1 Bb3:1 G4:1 r:1 | E4:1 C#4:1 A3:1 r:1",ironA,ironB,silentBars(8,4),ironA,"F4:1 Bb4:1 D5:1 F5:1 | Eb5:1 Bb4:1 G4:1 Eb4:1 | E4:1 G4:1 C#5:1 E5:1 | D5:3 r:1"]),
    scorePart("reed",0.52,[silentBars(20,4),ironMiddle,silentBars(12,4)]),
    scorePart("violin",0.32,[silentBars(28,4),"A5:3 F5:1 | F5:3 D5:1 | Bb5:2 G5:2 | F5:3 D5:1 | Bb5:2 G5:2 | D6:2 Bb5:2 | G5:2 E5:2 | F5:3 r:1",silentBars(4,4)])],accomp:ironBacking}
);


// E Phrygian dominant: E F G# A B C D. Strong accent at 2.5 quarter beats = the AND of beat THREE.
const knockA="E5:0.5 F5:0.5 G#5:1 r:0.5 B5:1.5 | F5:0.5 E5:0.5 D5:1 r:0.5 C5:1.5 | G#5:0.5 A5:0.5 B5:1 r:0.5 G#5:1.5 | F5:0.5 E5:0.5 D5:0.5 B4:0.5 r:0.5 E5:1.5 | E5:0.5 F5:0.5 G#5:1 r:0.5 B5:1.5 | C6:0.5 B5:0.5 A5:1 r:0.5 F5:1.5 | D6:0.5 C6:0.5 B5:1 r:0.5 G#5:1.5 | F5:0.5 E5:0.5 D5:0.5 B4:0.5 r:0.5 E5:1.5";
const knockB="B5:0.5 C6:0.5 D6:1 r:0.5 B5:1.5 | A5:0.5 G#5:0.5 F5:1 r:0.5 A5:1.5 | G#5:0.5 B5:0.5 E6:1 r:0.5 D6:1.5 | C6:0.5 B5:0.5 A5:0.5 G#5:0.5 r:0.5 B5:1.5 | A5:0.5 B5:0.5 C6:1 r:0.5 E6:1.5 | D6:0.5 C6:0.5 A5:1 r:0.5 F5:1.5 | G#5:0.5 A5:0.5 B5:1 r:0.5 D6:1.5 | C6:0.5 B5:0.5 G#5:0.5 F5:0.5 r:0.5 E5:1.5";
const knockMiddle="A5:1 C6:1 r:0.5 E6:1.5 | D6:1 A5:1 r:0.5 F5:1.5 | C6:1 A5:1 r:0.5 F5:1.5 | B5:1 G#5:1 r:0.5 E5:1.5 | A5:1 E5:1 r:0.5 C6:1.5 | F5:1 A5:1 r:0.5 D6:1.5 | G#5:1 B5:1 r:0.5 F5:1.5 | F5:0.5 E5:0.5 D5:1 r:0.5 G#5:1.5";
// The middle eight anticipates the accent by an eighth each bar, wrapping around the barline.
function knockAccent(b){return b>=20&&b<28?0:2.5;}
Synth.prototype.trumpet=function(t,f,dur,v,dest) {
  const end=t+dur+0.16,lp=this.filter("lowpass",Math.min(7200,f*10),0.8);
  lp.frequency.setValueAtTime(Math.min(8000,f*12),t);lp.frequency.exponentialRampToValueAtTime(Math.min(5000,f*7),t+0.065);
  const body=this.filter("peaking",1400,0.9);body.gain.value=3;
  const g=this.held(t,0.007,0.115*v,dur*0.9,0.085);
  const osc=this.osc("sawtooth",f,t,end);this.vibrato(osc,t,5.7,f*0.004,0.18).stop(end);
  osc.connect(lp);lp.connect(body);body.connect(g);g.connect(dest);
};
Synth.prototype.swellingString=function(t,f,dur,v0,v1,dest) {
  const end=t+dur+0.2,lp=this.filter("lowpass",1450,0.65),g=this.ctx.createGain();
  g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.055*v0,t+0.08);
  g.gain.linearRampToValueAtTime(0.055*v1,t+dur);g.gain.linearRampToValueAtTime(0,t+dur+0.16);
  for(const ratio of [0.996,1,1.004])this.osc("sawtooth",f*ratio,t,end).connect(lp);
  lp.connect(g);g.connect(dest);
};
function voiceLeadKnock(chords) {
  const choices=chords.map(name=>{
    const ch=chordOf(name),pcs=ch.tones.slice(0,3).map(n=>(ch.root+n)%12),out=[];
    for(let a=48;a<=60;a++)for(let b=55;b<=67;b++)for(let c=62;c<=74;c++){
      const notes=[a,b,c];if(b-a<3||c-b<3||c-a>19)continue;
      if(pcs.every(pc=>notes.some(n=>n%12===pc)))out.push(notes);
    }return out;
  });
  const distance=(a,b)=>a.reduce((sum,n,i)=>sum+(n-b[i])**2+(n===b[i]?-2:0),0);
  const anchor=[52,59,68];let states=choices[0].map(notes=>({notes,cost:distance(notes,anchor)*5,path:[notes]}));
  for(let bar=1;bar<choices.length;bar++)states=choices[bar].map(notes=>{
    let best=null;for(const previous of states){const cost=previous.cost+distance(previous.notes,notes);if(!best||cost<best.cost)best={notes,cost,path:[...previous.path,notes]};}return best;
  });
  states.sort((a,b)=>(a.cost+distance(a.notes,anchor)*5)-(b.cost+distance(b.notes,anchor)*5));
  const voicings=states[0].path,starts=voicings.map(()=>[]);
  for(let voice=0;voice<3;voice++)for(let bar=0;bar<voicings.length;){
    const midi=voicings[bar][voice];let stop=bar+1;while(stop<voicings.length&&voicings[stop][voice]===midi)stop++;
    starts[bar].push({midi,bars:stop-bar,endBar:stop});bar=stop;
  }
  return {voicings,starts};
}
Synth.prototype.marimba=function(t,f,dur,v,dest) {
  const end=t+0.55;
  for(const [ratio,level,decay] of [[1,0.3,0.36],[4,0.055,0.095],[10,0.009,0.045]]) {
    const g=this.amp(t,0.002,level*v,decay,end);this.osc("sine",f*ratio,t,end).connect(g);g.connect(dest);
  }
};
function buildKnockCascade(tune) {
  const scale=[64,65,68,69,71,72,74,76,77,80,81,83,84,86,88];
  const melody=Array.from({length:40},()=>[]),mallets=Array.from({length:40},()=>[]);
  // The three-eighth grouping never restarts at a barline: 0, 1.5, 3, 4.5 ...
  for(let at=0;at<32;at+=0.5) {
    const bar=Math.floor(at/4),phase=Math.round(at*2)%3,group=Math.floor(at/1.5),progress=at/32;
    const index=3+Math.floor(group/3)+[0,2,1][phase];
    melody[20+bar].push({at:at%4,beats:0.43-0.19*progress,midi:[scale[index]],vel:(phase===0?0.57:0.34)+0.1*progress});
    // Small sixteenth pickups join the second half of the climb without resetting the motif.
    if(at>=16)melody[20+bar].push({at:at%4+0.25,beats:0.17,midi:[scale[Math.min(index+1,scale.length-1)]],vel:0.24+0.08*progress});
  }
  for(let bar=22;bar<40;bar++) {
    const ch=chordOf(tune.chords[bar]),step=bar<24?0.5:0.25,progress=(bar-22)/17;
    const notes=ch.tones.slice(0,3).map(n=>60+ch.root+n),pattern=[0,1,2,1,0,2,1,2];
    for(let at=0,i=0;at<4;at+=step,i++) {
      // The last bar runs up to the final accent, then leaves room for its resolution.
      if(bar===39&&at>2.5)break;
      mallets[bar].push({at,beats:step*0.72,midi:[notes[pattern[i%8]]],vel:(i%4===0?0.24:0.15)+progress*0.1});
    }
  }
  return {melody,mallets};
}
function knockBacking(P,bus,t,b,ch,beat) {
  const soft=sectionOf(this,b)==="middle",last=b===this.chords.length-1,accent=knockAccent(b);
  const root=36+ch.root,tones=ch.tones.map(n=>48+ch.root+n);
  const swell=bar=>0.08+0.62*Math.pow(Math.min(bar,this.chords.length-1)/(this.chords.length-1),1.2);
  // Common tones remain physically held across bars; each changed voice moves independently.
  for(const line of this.padLines.starts[b])P.swellingString(t,hz(line.midi),line.bars*4*beat,swell(b),swell(line.endBar),P.pan(bus,-0.2));
  if(soft) {
    // Firm 4/4 footing underneath the crossing trumpet groups, not a moving isolated accent.
    for(const at of [0,2]) {
      P.pizz(t+at*beat,hz(root-12),beat*0.6,at===0?0.65:0.6,bus);
      P.hit(t+at*beat,0.045,bus,120,0.8,0.12,"lowpass");
    }
    for(const n of tones)P.harpsichord(t+beat,hz(n+12),beat*0.28,0.16,bus);
    return;
  }
  if(accent!==0)P.pizz(t,hz(root-12),beat*0.45,soft?0.28:0.5,bus);
  if(!last&&Math.abs(accent-1.5)>0.01)P.pizz(t+1.5*beat,hz(root-5),beat*0.35,0.25,bus);
  P.pizz(t+accent*beat,hz(root-12),beat*Math.min(0.7,4-accent),0.95,bus);
  P.pizz(t+accent*beat,hz(root),beat*Math.min(0.55,4-accent),0.65,bus);
  for(const n of tones){
    if(!last)for(const at of [0.5,1.5])if(Math.abs(at-accent)>0.01)P.harpsichord(t+at*beat,hz(n+12),beat*0.25,soft?0.12:0.25,P.pan(bus,0.2));
    P.strings(t+accent*beat,hz(n),beat*Math.min(0.55,4-accent),0.75,bus);
  }
  if(accent!==0)P.hit(t,0.028,bus,140,0.8,0.08,"lowpass");
  P.hit(t+accent*beat,0.095,bus,120,0.9,0.14,"lowpass");P.hit(t+accent*beat,0.035,bus,2400,1,0.065);
  if(!soft)for(const at of [0.5,1.5,3.5])if(Math.abs(at-accent)>0.01)P.hit(t+at*beat,0.008,bus,6500,0.7,0.035,"highpass");
}
TUNES.splice(TUNES.findIndex(t=>t.ambient),0,
 {id:"thirdKnock",title:"The Third Knock",
  meta:"Fast dance · 4/4 · E Phrygian dominant · 152 BPM · accent on the and of 3",
  desc:"A bright, sharp-edged refrain with a devilish sideways kick. The bass and clipped strings hit hardest just after beat three; the flattened second rubs against a gleaming major third, and a fast-attack trumpet carries the hook over smoothly connected strings. The middle eight tumbles across the barlines in rising trumpet groups; rapid marimba joins the build and carries through the return to the ending.",
  bpm:152,beats:4,send:0.5,gain:0.8,organ:true,useOrgan:false,organGain:2.1,
  sections:[[0,"pickup"],[4,"hook"],[12,"second theme"],[20,"middle"],[28,"return"],[36,"coda"]],
  chords:"E F E7 E E F E7 E E F E7 E Bdim Dm E E7 Am F E7 E Am Dm F E Am Dm Bdim E7 E F E7 E E F E7 E F Dm E7 E".split(" "),
  parts:[scorePart("trumpet",0.62,["E4:0.5 F4:0.5 G#4:1 r:0.5 B4:1.5 | A4:0.5 G#4:0.5 F4:1 r:0.5 C5:1.5 | B4:0.5 D5:0.5 G#5:1 r:0.5 F5:1.5 | G#5:0.5 F5:0.5 E5:1 r:0.5 B4:1.5",knockA,knockB,silentBars(8,4),knockA,"A5:0.5 G#5:0.5 F5:1 r:0.5 C6:1.5 | D6:0.5 C6:0.5 A5:1 r:0.5 F5:1.5 | G#5:0.5 A5:0.5 B5:1 r:0.5 D6:1.5 | F5:0.5 E5:0.5 B4:1 r:0.5 E5:1.5"]),
   scorePart("trumpet",0.52,[silentBars(20,4),"A5:1 C6:1 r:0.5 E6:1.5 | D6:1 A5:1 F5:2 | C6:0.5 A5:0.5 r:0.5 F5:2.5 | B5:0.5 G#5:0.5 E5:2 r:1 | A5:0.5 C6:2.5 E5:1 | D6:2 F5:1 A5:1 | G#5:1 B5:1 F5:1 r:0.5 D6:0.5 | F5:0.5 E5:0.5 D5:1 r:1 G#5:1",silentBars(12,4)]),
   scorePart("xylo",0.2,[silentBars(28,4),"r:2.5 B6:1.5 | r:2.5 C6:1.5 | r:2.5 G#6:1.5 | r:2.5 E6:1.5 | r:2.5 B6:1.5 | r:2.5 F6:1.5 | r:2.5 G#6:1.5 | r:2.5 E6:1.5",silentBars(4,4)])],accomp:knockBacking}
);

const knockTune=TUNES.find(t=>t.id==="thirdKnock");
knockTune.padLines=voiceLeadKnock(knockTune.chords);
const knockBuild=buildKnockCascade(knockTune);
knockTune.parts[1]={inst:"trumpet",vel:0.52,shift:0,notes:knockBuild.melody};
knockTune.parts[2]={inst:"marimba",vel:0.22,shift:0,notes:knockBuild.mallets};


// Analogue arrangement: two detuned oscillators, moving resonant filters and short envelopes.
// These voices belong to this arrangement; the original orchestral/organ score is untouched.
Synth.prototype.analogVoice = function(t,f,dur,v,dest,kind) {
  const bass=kind==='bass', pad=kind==='chord', counter=kind==='counter';
  const attack=bass?0.004:pad?0.009:0.005, release=bass?0.13:pad?0.2:0.18;
  const length=Math.max(dur,attack+0.02), end=t+length+release+0.02;
  const mix=this.ctx.createGain(), lp=this.filter('lowpass',800,bass?5:pad?3.2:counter?7:6);
  const peak=bass?0.19:pad?0.025:counter?0.047:0.089;
  const gain=this.held(t,attack,peak*v,length,release);
  const brightness=bass?1450:pad?3600:counter?6200:5600;
  const floor=bass?100:pad?280:counter?180:350;
  lp.frequency.setValueAtTime(counter?brightness:floor,t);
  if(counter)lp.frequency.exponentialRampToValueAtTime(floor,t+length);
  else {
    lp.frequency.exponentialRampToValueAtTime(Math.min(7500,brightness+f),t+attack+0.015);
    lp.frequency.exponentialRampToValueAtTime(floor,t+Math.max(attack+0.035,length*0.8));
  }
  const o1=this.osc(bass?'sawtooth':pad?'sawtooth':'square',f,t,end);
  const o2=this.osc('sawtooth',f*(counter?1.005:1),t,end), second=this.ctx.createGain();
  o1.detune.value=pad?-9:-6;o2.detune.value=pad?9:7;second.gain.value=bass?0.8:1.05;
  o1.connect(mix);o2.connect(second);second.connect(mix);
  if(bass){const sub=this.osc('square',f/2,t,end),sg=this.ctx.createGain();sg.gain.value=0.18;sub.connect(sg);sg.connect(mix);}
  if(!bass){
    const lfo=this.osc('sine',counter?6.2:4.8,t,end),depth=this.ctx.createGain();
    depth.gain.setValueAtTime(0,t);depth.gain.linearRampToValueAtTime(pad?4:counter?12:7,t+Math.min(0.22,length));
    lfo.connect(depth);depth.connect(o1.detune);depth.connect(o2.detune);
  }
  const drive=this.ctx.createWaveShaper(),curve=new Float32Array(2048);
  for(let i=0;i<curve.length;i++){const x=2*i/(curve.length-1)-1;curve[i]=Math.tanh((bass?6:pad?3:7)*x);}
  drive.curve=curve;drive.oversample='2x';
  // Drive before the resonant filter gives it a raw, harmonically dense input.
  const pre=this.ctx.createGain();pre.gain.value=bass?2.2:pad?1.5:2.5;
  mix.connect(pre);pre.connect(drive);drive.connect(lp);
  const rasp=this.ctx.createWaveShaper(),rough=new Float32Array(2048);
  for(let i=0;i<rough.length;i++){const x=2*i/(rough.length-1)-1;rough[i]=Math.tanh(2*x);}
  rasp.curve=rough;rasp.oversample='2x';
  const edge=this.filter('peaking',bass?650:1850,0.9);edge.gain.value=bass?4:pad?1:5;
  lp.connect(edge);edge.connect(rasp);rasp.connect(gain);gain.connect(dest);
  // Faint band-limited circuit hiss follows the note envelope rather than running constantly.
  if(!pad){const noise=this.ctx.createBufferSource(),ng=this.ctx.createGain(),nt=this.filter('bandpass',bass?850:2400,0.6);
    noise.buffer=this.noise;noise.loop=true;ng.gain.value=bass?0.012:0.023;
    noise.connect(nt);nt.connect(ng);ng.connect(gain);noise.start(t);noise.stop(end);}
  // A dark tape-like repeat leaves the front of the note sharp and adds space behind it.
  if(!bass&&!pad){
    const echo=this.ctx.createDelay(1),tone=this.filter('lowpass',2400,0.7),wet=this.ctx.createGain();
    echo.delayTime.value=0.3;wet.gain.value=counter?0.23:0.19;
    gain.connect(echo);echo.connect(tone);tone.connect(wet);wet.connect(this.pan(dest,counter?-0.3:0.3));
  }
};
for(const [name,kind] of Object.entries({analogLead:'lead',analogCounter:'counter',analogBass:'bass',analogChord:'chord'}))
  Synth.prototype[name]=function(t,f,d,v,dest){this.analogVoice(t,f,d,v,dest,kind);};
Synth.prototype.analogKick=function(t,v,dest){
  const end=t+0.23,o=this.osc('sine',110,t,end),g=this.amp(t,0.003,0.19*v,0.21,end);
  o.frequency.setValueAtTime(110,t);o.frequency.exponentialRampToValueAtTime(43,t+0.1);o.connect(g);g.connect(dest);
};
// A separate chord bus keeps the melody intelligible through the jet sweep.
const analogJets=new WeakMap();
function jetChords(S,bus,t,length,beat){
  const c=S.ctx,input=c.createGain(),delay=c.createDelay(0.05),wet=c.createGain(),feedback=c.createGain();
  const dark=S.filter('lowpass',3800,0.7),lfo=c.createOscillator(),depth=c.createGain();
  delay.delayTime.value=0.006;wet.gain.value=-0.95;feedback.gain.value=0.55;
  input.connect(bus);input.connect(delay);delay.connect(dark);dark.connect(wet);wet.connect(bus);
  dark.connect(feedback);feedback.connect(delay);
  lfo.frequency.setValueAtTime(0.15,t);lfo.frequency.linearRampToValueAtTime(0.24,t+68*3*beat);
  depth.gain.setValueAtTime(0.0048,t);depth.gain.linearRampToValueAtTime(0.0048,t+52*3*beat);
  depth.gain.setValueAtTime(0.0048,t+68*3*beat);depth.gain.linearRampToValueAtTime(0.0028,t+84*3*beat);
  lfo.connect(depth);depth.connect(delay.delayTime);lfo.start(t);lfo.stop(t+length+1);
  lfo.onended=()=>{lfo.disconnect();depth.disconnect();feedback.disconnect();delay.disconnect();dark.disconnect();wet.disconnect();input.disconnect();};
  analogJets.set(bus,input);return input;
}
Synth.prototype.spaceWarp=function(t,f,dur,v,dest,rising){
  const end=t+dur+1,o=this.osc('sawtooth',f,t,end),o2=this.osc('square',f*1.02,t,end);
  const lp=this.filter('lowpass',900,9),g=this.held(t,0.3,0.055*v,dur,0.9);
  const first=rising?f*0.22:f*5,last=rising?f*5:f*0.2;
  for(const osc of [o,o2]){osc.frequency.setValueAtTime(first,t);osc.frequency.exponentialRampToValueAtTime(last,t+dur);}
  lp.frequency.setValueAtTime(rising?140:8000,t);lp.frequency.exponentialRampToValueAtTime(rising?8000:140,t+dur);
  const wobble=this.osc('sine',7.2,t,end),wg=this.ctx.createGain();wg.gain.value=30;
  wobble.connect(wg);wg.connect(o.detune);wg.connect(o2.detune);
  const mix=this.ctx.createGain(),quiet=this.ctx.createGain();quiet.gain.value=0.4;
  o.connect(mix);o2.connect(quiet);quiet.connect(mix);mix.connect(lp);lp.connect(g);
  g.connect(this.pan(dest,rising?-0.35:0.35));
  // Heavy regenerating delay: many audible repeats, alternating stereo positions.
  const d1=this.ctx.createDelay(2),d2=this.ctx.createDelay(2),tone=this.filter('lowpass',3400,0.7);
  const fb=this.ctx.createGain(),w1=this.ctx.createGain(),w2=this.ctx.createGain();
  d1.delayTime.value=0.48;d2.delayTime.value=0.48;fb.gain.setValueAtTime(0.59,t);fb.gain.setValueAtTime(0.59,t+dur+6);fb.gain.linearRampToValueAtTime(0,t+dur+8);w1.gain.value=0.72;w2.gain.value=0.6;
  g.connect(d1);d1.connect(w1);w1.connect(this.pan(dest,-0.65));d1.connect(d2);
  d2.connect(w2);w2.connect(this.pan(dest,0.65));d2.connect(tone);tone.connect(fb);fb.connect(d1);
};
Synth.prototype.jetWash=function(t,dur,dest){
  const c=this.ctx,n=c.createBufferSource();n.buffer=this.noise;n.loop=true;
  const bp=this.filter('bandpass',180,5),amp=this.held(t,2,0.032,dur-3,3);
  bp.frequency.setValueAtTime(180,t);bp.frequency.exponentialRampToValueAtTime(5500,t+dur*0.58);bp.frequency.exponentialRampToValueAtTime(160,t+dur);
  const delay=c.createDelay(0.05),feedback=c.createGain(),wet=c.createGain(),lfo=c.createOscillator(),depth=c.createGain();
  delay.delayTime.value=0.008;feedback.gain.value=0.64;wet.gain.value=-0.95;
  lfo.frequency.value=0.11;depth.gain.value=0.007;lfo.connect(depth);depth.connect(delay.delayTime);
  n.connect(bp);bp.connect(amp);amp.connect(dest);amp.connect(delay);delay.connect(wet);wet.connect(dest);delay.connect(feedback);feedback.connect(delay);
  n.start(t);n.stop(t+dur+0.1);lfo.start(t);lfo.stop(t+dur+4);
  lfo.onended=()=>{feedback.disconnect();delay.disconnect();wet.disconnect();depth.disconnect();lfo.disconnect();};
};
Synth.prototype.spaceSnare=function(t,v,dest){
  const noise=this.ctx.createBufferSource();noise.buffer=this.noise;
  const hp=this.filter('highpass',950,0.7),body=this.filter('peaking',2100,0.8);body.gain.value=4;
  const env=this.amp(t,0.001,0.14*v,0.17,t+0.22);
  noise.connect(hp);hp.connect(body);body.connect(env);env.connect(dest);noise.start(t,0,0.22);
  const thump=this.osc('triangle',185,t,t+0.14),g=this.amp(t,0.001,0.08*v,0.12,t+0.14);
  thump.frequency.exponentialRampToValueAtTime(105,t+0.1);thump.connect(g);g.connect(dest);
};
Synth.prototype.spaceTom=function(t,f,v,dest){
  const end=t+0.28,o=this.osc('sine',f*1.6,t,end),g=this.amp(t,0.003,0.18*v,0.26,end);
  o.frequency.exponentialRampToValueAtTime(f,t+0.055);o.connect(g);g.connect(dest);
};
function spaceDrums(S,bus,t,b,beat,sec){
  const solo=b>=68&&b<132,quiet=sec==='C'||sec==='space break',level=quiet?0.35:solo?1:0.78;
  S.analogKick(t,level,bus);
  if(!quiet)S.analogKick(t+1.5*beat,level*0.7,bus);
  S.spaceSnare(t+2*beat,level,bus);
  if(solo&&!quiet)S.spaceSnare(t+0.75*beat,0.18,bus);
  for(let k=0;k<6;k++)S.hit(t+k*beat*0.5,level*(k%2?0.028:0.018),S.pan(bus,0.2),8000,0.7,k===5&&!quiet?0.12:0.035,'highpass');
  if(!quiet&&(b+1)%8===0){
    [210,170,135,95].forEach((f,k)=>S.spaceTom(t+(2+k*0.25)*beat,f,level*0.85,S.pan(bus,-0.3+k*0.2)));
    S.spaceSnare(t+2.75*beat,level*0.55,bus);
  }
  if([4,20,36,68,84,116,132,148].includes(b))S.hit(t,0.09,bus,5500,0.6,0.6,'highpass');
}
const blackOriginal=TUNES.find(t=>t.id==='black');
TUNES.splice(TUNES.indexOf(blackOriginal)+1,0,{
  ...blackOriginal,chords:[...blackOriginal.chords],id: "blackAnalog",title:'Waltz in Black — Analogue',
  meta:'Space-rock synth waltz · C minor · biting lead, driven bass and resonant sweeps',
  desc:'The complete waltz with space-rock bite: overdriven square-and-saw lead, growling resonant bass, hard-edged synth chords and a sweeping high counter-melody. Dark echo trails follow the lead while electronic percussion keeps the ballroom pulse.',
  organ:false,useOrgan:false,sid:false,gain:1.1,send:0.35,
  parts:blackOriginal.parts.map(p=>({...p,notes:p.notes.map(bar=>bar.map(ev=>({...ev,midi:[...ev.midi]}))),inst:p.inst==='sax'?'analogLead':'analogCounter',shift:p.inst==='sax'?0:p.shift,vel:p.inst==='sax'?0.75:0.5})),
  accomp(S,bus,t,b,ch,beat){
    const sec=sectionOf(this,b),last=b===this.chords.length-1;
    const jet=b===0?jetChords(S,bus,t,this.chords.length*3*beat,beat):analogJets.get(bus)||bus;
    if([0,16,32,52,64,84,100,116,128,144].includes(b))S.spaceWarp(t,hz(b===64?60:55),beat*(b===64?18:12),b===64?0.95:0.8,bus,b===64||b===16||b===52);
    if(b===48||b===96)S.jetWash(t,beat*3*30,bus);
    // Six eighth-notes per bar, opening the filter as the quiet section gains momentum.
    if(b>=52&&!last){const pitches=ch.tones.slice(0,3).map(n=>60+ch.root+n),pattern=[0,1,2,0,2,1];
      for(let k=0;k<6;k++)S.analogCounter(t+k*beat*0.5,hz(pitches[pattern[k]]+(k>=3?12:0)),beat*0.22,b<60?0.23:b<68?0.36:0.42,S.pan(bus,k%2?-0.3:0.3));
    }
    const bass=hz(36+ch.root-(ch.root>4?12:0));
    const chord=ch.tones.map(n=>hz(55+((ch.root+n+5)%12)));
    S.analogBass(t,bass,last?beat*2.7:beat*0.7,sec==='C'?0.6:0.85,bus);
    if(sec==='C'||sec==='space break'||last){for(const f of chord)S.analogChord(t,f,beat*2.85,sec==='C'?0.65:0.85,jet);}
    else {for(const k of [1,2])for(const f of chord)S.analogChord(t+k*beat,f,beat*0.6,0.72,S.pan(jet,k===1?-0.17:0.17));}
    if(!last)spaceDrums(S,bus,t,b,beat,sec);
    if(this.sections.some(x=>x[0]===b)&&sec!=='C')S.hit(t,0.027,bus,3400,0.7,0.35,'highpass');
  }
});


// Extended analogue version: 64 bars of solo development, breakdown and climax.
const spaceSoloA=bars(
 'G5:0.5 C6:0.5 Eb6:1 D6:0.5 C6:0.5 | G5:0.5 Bb5:0.5 C6:0.5 Eb6:0.5 G6:1 | F6:0.5 Eb6:0.5 D6:0.5 C6:0.5 Bb5:0.5 G5:0.5 | B5:0.5 D6:0.5 F6:1 D6:1 | '+
 'G5:0.5 B5:0.5 D6:0.5 F6:0.5 Ab6:0.5 G6:0.5 | F6:0.5 D6:0.5 B5:0.5 G5:0.5 Ab5:0.5 B5:0.5 | D6:0.5 F6:0.5 D6:0.5 B5:0.5 G5:1 | Eb6:1 D6:0.5 C6:1.5 | '+
 'C6:0.5 Eb6:0.5 G6:1 Eb6:0.5 D6:0.5 | C6:0.5 G5:0.5 Bb5:0.5 C6:0.5 Eb6:1 | E6:0.5 G6:0.5 Bb6:0.5 G6:0.5 E6:0.5 C6:0.5 | Ab6:1 G6:0.5 F6:1.5 | '+
 'C6:0.5 F6:0.5 Ab6:1 G6:0.5 F6:0.5 | Eb6:0.5 D6:0.5 C6:0.5 G5:0.5 Eb5:1 | D6:0.5 F6:0.5 Ab6:0.5 G6:0.5 F6:0.5 B5:0.5 | C6:2 r:1');
const spaceSoloB=bars(
 'Eb6:0.5 Ab6:0.5 C7:0.5 Bb6:0.5 Ab6:1 | G6:0.5 Ab6:0.5 Eb6:0.5 C6:0.5 Eb6:1 | C6:0.5 F6:0.5 Ab6:0.5 C7:0.5 Ab6:1 | G6:0.5 F6:0.5 Eb6:0.5 C6:0.5 F6:1 | '+
 'G5:0.25 C6:0.25 Eb6:0.25 G6:0.25 C7:1 Bb6:0.5 G6:0.5 | Eb6:0.5 D6:0.5 C6:0.5 Bb5:0.5 G5:1 | F#6:0.5 A6:0.5 C7:0.5 A6:0.5 F#6:1 | G6:1 F6:0.5 D6:0.5 B5:1 | '+
 'C6:0.25 Eb6:0.25 Ab6:0.25 C7:0.25 Eb7:1 C7:0.5 Ab6:0.5 | G6:0.5 Ab6:0.5 C7:0.5 Ab6:0.5 Eb6:1 | F6:0.25 Ab6:0.25 C7:0.25 Ab6:0.25 F6:1 Eb6:0.5 C6:0.5 | B5:0.5 D6:0.5 F6:0.5 Ab6:0.5 G6:1 | '+
 'C7:1 Bb6:0.5 G6:0.5 Eb6:1 | D6:0.25 F6:0.25 Ab6:0.25 B6:0.25 D7:1 B6:0.5 G6:0.5 | C7:0.5 G6:0.5 Eb6:0.5 D6:0.5 C6:1 | G5:1 C6:1 r:1');
const spaceSoloClimax=spaceSoloA.map((bar,i)=>bar.flatMap(ev=>{
 if(ev.beats<1||i===15)return [{...ev,midi:ev.midi.map(n=>n+12),vel:0.78}];
 const root=ev.midi[0],steps=ev.beats*4;
 return Array.from({length:steps},(_,k)=>({at:ev.at+k*0.25,beats:0.22,midi:[root+12+[0,7,12,7][k%4]],vel:k%4===0?0.8:0.55}));
}));
const spaceTune=TUNES.find(t=>t.id==='blackAnalog');
const originalA=spaceTune.chords.slice(4,20),originalB=spaceTune.chords.slice(20,36);
spaceTune.chords.splice(68,0,...originalA,...originalB,...spaceTune.chords.slice(52,68),...originalA);
spaceTune.parts[0].notes.splice(68,0,...spaceSoloA,...spaceSoloB,...bars(rests(16,3)),...spaceSoloClimax);
spaceTune.parts[1].notes.splice(68,0,...bars(rests(64,3)));
spaceTune.sections=[[0,'intro'],[4,'A'],[20,'B'],[36,'A2'],[52,'C'],[68,'solo'],[84,'solo development'],[100,'space break'],[116,'solo climax'],[132,'A3'],[148,'coda']];
spaceTune.desc+=' Extended with a full synth solo, rising development, a sixteen-bar space breakdown and a rapid solo climax before the waltz returns.';

// ===================================================================== Waltz in Black: Event Horizon
// A heavier space-rock arrangement: a screaming lead and twin rhythm guitars through their own amps, warping
// supersaw pads, sequencer and hi-hats through tape-style jet flangers, a theremin for the hushed middle, a 32-bar solo.
const ehFx=new WeakMap();
function ehRig(S,bus,t,length,beat){   // the amps, flangers and echoes one pass of the tune plays through
  const c=S.ctx,stop=t+length+12,nodes=[],keep=(...n)=>(nodes.push(...n),n[0]);
  const pingPong=(src,time,fb,wet,cut)=>{
    const dl=keep(c.createDelay(2)),dr=keep(c.createDelay(2)),tone=keep(S.filter('lowpass',cut,0.7)),f=keep(c.createGain()),w=keep(c.createGain());
    dl.delayTime.value=time;dr.delayTime.value=time;f.gain.value=fb;w.gain.value=wet;
    src.connect(dl);dl.connect(w);w.connect(S.pan(bus,-0.7));dl.connect(dr);dr.connect(tone);tone.connect(S.pan(bus,0.7));tone.connect(f);f.connect(dl);
  };
  const amp=(drive,cab,level,pan)=>{
    const input=keep(c.createGain()),shape=keep(c.createWaveShaper()),curve=new Float32Array(4096);
    for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=Math.tanh(drive*(x+0.12*x*x))/Math.tanh(drive);}   // a little asymmetry, like valves
    shape.curve=curve;shape.oversample='4x';
    const hp=keep(S.filter('highpass',95,0.7)),mid=keep(S.filter('peaking',cab*0.3,0.9)),lp=keep(S.filter('lowpass',cab,1)),out=keep(c.createGain());
    mid.gain.value=5;out.gain.value=level;
    input.connect(shape);shape.connect(hp);hp.connect(mid);mid.connect(lp);lp.connect(out);out.connect(S.pan(bus,pan));
    return {input,out};
  };
  // Two feed-forward flanger stages on one sweep (Web Audio clamps delays inside feedback loops to 3 ms, which
  // would cut off the top of the sweep): deep notches that fly from 0.3 ms to 9 ms and back.
  const jet=(rate,phase)=>{
    const input=keep(c.createGain()),lfo=keep(c.createOscillator()),depth=keep(c.createGain());
    lfo.type='triangle';lfo.frequency.value=rate;depth.gain.value=0.0044;lfo.connect(depth);
    let stage=input;
    for(let k=0;k<2;k++){
      const d=keep(c.createDelay(0.05)),sum=keep(c.createGain());d.delayTime.value=0.0048;depth.connect(d.delayTime);sum.gain.value=0.6;
      stage.connect(sum);stage.connect(d);d.connect(sum);stage=sum;
    }
    stage.connect(bus);lfo.start(t+phase/rate);lfo.stop(stop);return {input,lfo};
  };
  const lead=amp(7,5200,0.1,0),rhythmL=amp(10,3300,0.065,-0.75),rhythmR=amp(10,3100,0.065,0.75);
  pingPong(lead.out,beat*0.75,0.36,0.3,2800);
  const pad=jet(0.07,0),kit=jet(0.13,0.5),echo=keep(c.createGain());echo.gain.value=1;
  pingPong(echo,beat*1.5,0.48,0.55,2400);echo.connect(pad.input);
  pad.lfo.onended=()=>nodes.forEach(n=>n.disconnect());
  const rig={lead:lead.input,rhythm:[rhythmL.input,rhythmR.input],pad:pad.input,kit:kit.input,echo,glide:{}};
  ehFx.set(bus,rig);return rig;
}
const ehDrive=new Float32Array(1024).map((_,i)=>Math.tanh(3*(i*2/1023-1)));
// the lead: saw and square into the lead amp, bending a whole tone up into the long notes with a wide, late vibrato;
// dive (from the arrangement) is the whammy bar pushed all the way down
Synth.prototype.ehLead=function(t,f,dur,v,dest,dive){
  const c=this.ctx,fx=ehFx.get(dest),into=fx?fx.lead:dest,end=t+dur+(dive?0.8:0.3);
  const o1=this.osc('sawtooth',f,t,end),o2=this.osc('square',f,t,end),mix=c.createGain(),g2=c.createGain();
  o2.detune.value=7;g2.gain.value=0.6;o1.connect(mix);o2.connect(g2);g2.connect(mix);
  for(const o of [o1,o2]){const p=o.frequency;
    if(dive){p.setValueAtTime(f,t);p.setValueAtTime(f,t+0.12);p.exponentialRampToValueAtTime(f/12,t+dur);}
    else if(dur>0.7){p.setValueAtTime(f*0.8909,t);p.setValueAtTime(f*0.8909,t+0.035);p.exponentialRampToValueAtTime(f,t+0.15);}
    else{p.setValueAtTime(f*0.985,t);p.exponentialRampToValueAtTime(f,t+0.025);}
  }
  if(dur>0.5||dive){const l=this.osc('sine',dive?11:6.1,t,end),d=c.createGain();
    d.gain.setValueAtTime(0,t);d.gain.setValueAtTime(0,t+0.22);d.gain.linearRampToValueAtTime(dive?60:38,t+Math.min(dur,0.55));l.connect(d);d.connect(o1.detune);d.connect(o2.detune);}
  const hp=this.filter('highpass',140,0.7),g=this.held(t,0.004,0.5*v,dur,dive?0.6:0.09);
  mix.connect(hp);hp.connect(g);g.connect(into);
  this.hit(t,0.12*v,fx?fx.lead:dest,3200,0.8,0.012,'highpass');   // the pick
};
// twin rhythm guitars, hard left and right: root, fifth and octave, palm-muted or ringing
Synth.prototype.ehRhythm=function(t,f,dur,v,dest,ring){
  const c=this.ctx,fx=ehFx.get(dest);if(!fx)return;
  fx.rhythm.forEach((into,side)=>{
    const s=t+side*0.009,end=s+dur+0.3,lp=this.filter('lowpass',ring?4200:1100,ring?0.7:1.4),g=this.held(s,0.003,0.45*v,dur,ring?0.25:0.05);
    if(!ring){lp.frequency.setValueAtTime(1300,s);lp.frequency.exponentialRampToValueAtTime(380,s+0.09);}
    [[1,1],[1.4983,0.8],[2,0.5]].forEach(([k,a])=>{const o=this.osc('sawtooth',f*k,s,end),ga=c.createGain();o.detune.value=side?-5:5;ga.gain.value=a;o.connect(ga);ga.connect(lp);});
    lp.connect(g);g.connect(into);
  });
};
Synth.prototype.ehBass=function(t,f,dur,v,dest){
  const c=this.ctx,end=t+dur+0.2,lp=this.filter('lowpass',1700,2),g=this.held(t,0.003,0.08*v,dur,0.1),sh=c.createWaveShaper();
  lp.frequency.setValueAtTime(1900,t);lp.frequency.exponentialRampToValueAtTime(320,t+Math.min(0.35,dur+0.05));
  sh.curve=ehDrive;this.osc('sawtooth',f,t,end).connect(lp);lp.connect(sh);sh.connect(g);
  const sub=this.osc('sine',f,t,end),sg=c.createGain();sg.gain.value=0.6;sub.connect(sg);sg.connect(g);g.connect(dest);
};
// the warp pad: four detuned saws that swoop up into the chord and drift in and out of tune like stretched tape
Synth.prototype.ehPad=function(t,f,dur,v,dest){
  const c=this.ctx,fx=ehFx.get(dest),into=fx?fx.pad:dest,end=t+dur+1.6;
  const lp=this.filter('lowpass',400,2.2),g=this.held(t,0.35,0.032*v,dur,1.3),warp=this.osc('sine',0.3+Math.random()*0.25,t,end),wd=c.createGain();
  lp.frequency.setValueAtTime(380,t);lp.frequency.exponentialRampToValueAtTime(2600,t+dur*0.5+0.1);lp.frequency.exponentialRampToValueAtTime(650,t+dur+1.2);
  wd.gain.value=18;warp.connect(wd);
  [-14,-5,5,14].forEach(cents=>{const o=this.osc('sawtooth',f,t,end);o.detune.value=cents;wd.connect(o.detune);
    o.frequency.setValueAtTime(f*0.94,t);o.frequency.exponentialRampToValueAtTime(f,t+0.4);o.connect(lp);});
  lp.connect(g);g.connect(into);
};
// a gliding analogue lead for the counter-tune: slides from the note before, filter wah-ing, into the long echo
Synth.prototype.ehWarp=function(t,f,dur,v,dest){
  const c=this.ctx,fx=ehFx.get(dest),end=t+dur+0.4,last=fx&&fx.glide.warp;
  const lp=this.filter('lowpass',1800,6),wah=this.osc('sine',2.4,t,end),wg=c.createGain(),g=this.held(t,0.02,0.05*v,dur,0.25);
  wg.gain.value=900;wah.connect(wg);wg.connect(lp.frequency);
  const pitch=[[0,1,'sawtooth'],[8,1,'sawtooth'],[-1200,0.5,'square']].map(([cents,a,type])=>{
    const o=this.osc(type,f,t,end),ga=c.createGain();o.detune.value=cents;ga.gain.value=a;o.connect(ga);ga.connect(lp);
    if(last&&t-last.end<0.3){o.frequency.setValueAtTime(last.f,t);o.frequency.exponentialRampToValueAtTime(f,t+0.09);}
    return o;});
  this.vibrato(pitch[0],t,5.4,f*0.008,0.25).stop(end);
  lp.connect(g);g.connect(this.pan(dest,-0.25));if(fx){g.connect(fx.echo);fx.glide.warp={f,end:t+dur};}
};
// the theremin: near-sine, always sliding from the last note, trembling
Synth.prototype.ehTheremin=function(t,f,dur,v,dest){
  const c=this.ctx,fx=ehFx.get(dest),end=t+dur+0.5,last=fx&&fx.glide.ther,mix=c.createGain(),g=this.held(t,0.1,0.11*v,dur,0.3);
  const oscs=[[1,1],[2,0.12],[3,0.04]].map(([k,a])=>{const o=this.osc('sine',f*k,t,end),ga=c.createGain();ga.gain.value=a;o.connect(ga);ga.connect(mix);
    if(last&&t-last.end<0.8){o.frequency.setValueAtTime(last.f*k,t);o.frequency.exponentialRampToValueAtTime(f*k,t+0.16);}return o;});
  const l=this.osc('sine',6.3,t,end),d=c.createGain();d.gain.setValueAtTime(0,t);d.gain.linearRampToValueAtTime(24,t+0.35);l.connect(d);oscs.forEach(o=>d.connect(o.detune));
  mix.connect(g);g.connect(this.pan(dest,0.15));if(fx){g.connect(fx.echo);fx.glide.ther={f,end:t+dur};}
};
Synth.prototype.ehSeq=function(t,f,dur,v,dest,cut=2000){
  const end=t+0.3,lp=this.filter('lowpass',cut,9),g=this.amp(t,0.002,0.1*v,0.16,end);
  lp.frequency.setValueAtTime(cut,t);lp.frequency.exponentialRampToValueAtTime(Math.max(120,cut*0.25),t+0.1);
  this.osc('square',f,t,end).connect(lp);this.osc('sawtooth',f*1.003,t,end).connect(lp);lp.connect(g);g.connect(dest);
};
Synth.prototype.ehZap=function(t,f,v,dest){   // a laser, falling
  const end=t+0.4,o=this.osc('square',f*6,t,end),g=this.amp(t,0.002,0.035*v,0.32,end),lp=this.filter('lowpass',5000,4);
  o.frequency.exponentialRampToValueAtTime(f/3,t+0.32);o.connect(lp);lp.connect(g);g.connect(dest);const fx=ehFx.get(dest);if(fx)g.connect(fx.echo);
};
// a jet taking off (or landing): noise and an engine whine through a comb whose delay closes from 9 ms to 0.3 ms
Synth.prototype.ehJet=function(t,dur,v,dest,rising){
  const c=this.ctx,end=t+dur+0.6,n=c.createBufferSource(),bp=this.filter('bandpass',rising?300:5000,0.9),g=c.createGain();
  n.buffer=this.noise;n.loop=true;bp.frequency.setValueAtTime(rising?300:5000,t);bp.frequency.exponentialRampToValueAtTime(rising?6000:250,t+dur);
  g.gain.setValueAtTime(0.0001,t);
  if(rising){g.gain.exponentialRampToValueAtTime(0.09*v,t+dur*0.92);g.gain.exponentialRampToValueAtTime(0.0001,t+dur+0.5);}
  else{g.gain.exponentialRampToValueAtTime(0.09*v,t+0.3);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);}
  const whine=this.osc('sawtooth',rising?180:1400,t,end),wg=c.createGain();wg.gain.value=0.05;whine.frequency.exponentialRampToValueAtTime(rising?1400:90,t+dur);
  n.connect(bp);whine.connect(wg);wg.connect(bp);
  let stage=bp;for(let k=0;k<2;k++){const d=c.createDelay(0.05),sum=c.createGain();sum.gain.value=0.6;
    d.delayTime.setValueAtTime(rising?0.009:0.0003,t);d.delayTime.exponentialRampToValueAtTime(rising?0.0003:0.009,t+dur);
    stage.connect(sum);stage.connect(d);d.connect(sum);stage=sum;}
  stage.connect(g);g.connect(dest);n.start(t);n.stop(end);
};
// the big warp: a supersaw sweeping four octaves through a screaming filter, into the flanger and the long echo
Synth.prototype.ehSweep=function(t,f,dur,v,dest,rising){
  const c=this.ctx,fx=ehFx.get(dest),end=t+dur+1,lp=this.filter('lowpass',600,12),g=this.held(t,0.4,0.04*v,dur,0.8);
  const a=rising?f/4:f*4,b=rising?f*4:f/4;
  lp.frequency.setValueAtTime(rising?200:9000,t);lp.frequency.exponentialRampToValueAtTime(rising?9000:200,t+dur);
  [-20,0,20].forEach(cents=>{const o=this.osc('sawtooth',a,t,end);o.detune.value=cents;o.frequency.exponentialRampToValueAtTime(b,t+dur);o.connect(lp);});
  lp.connect(g);g.connect(fx?fx.pad:dest);if(fx)g.connect(fx.echo);
};
Synth.prototype.ehKick=function(t,v,dest){
  const end=t+0.35,o=this.osc('sine',165,t,end),g=this.amp(t,0.002,0.6*v,0.32,end);
  o.frequency.exponentialRampToValueAtTime(46,t+0.09);o.connect(g);g.connect(dest);this.hit(t,0.09*v,dest,3500,0.8,0.006,'highpass');
};
Synth.prototype.ehSnare=function(t,v,dest){
  const c=this.ctx,n=c.createBufferSource(),bp=this.filter('bandpass',1900,0.6),g=this.amp(t,0.001,0.45*v,0.24,t+0.3),room=c.createGain();
  n.buffer=this.noise;n.connect(bp);bp.connect(g);g.connect(dest);room.gain.value=0.5;g.connect(room);room.connect(this.verb);n.start(t,Math.random(),0.3);
  const body=this.osc('triangle',230,t,t+0.15),bg=this.amp(t,0.001,0.3*v,0.12,t+0.15);body.frequency.exponentialRampToValueAtTime(165,t+0.08);body.connect(bg);bg.connect(dest);
};
Synth.prototype.ehHat=function(t,v,dest,open){this.hit(t,0.07*v,dest,7800,0.8,open?0.3:0.045,'highpass');};
Synth.prototype.ehCrash=function(t,v,dest){this.hit(t,0.12*v,dest,4800,0.5,2.4,'highpass');this.hit(t,0.05*v,dest,9000,0.7,1.2,'highpass');};
Synth.prototype.ehTom=function(t,f,v,dest){
  const end=t+0.4,o=this.osc('sine',f*1.7,t,end),g=this.amp(t,0.002,0.42*v,0.36,end);
  o.frequency.exponentialRampToValueAtTime(f,t+0.07);o.connect(g);g.connect(dest);this.hit(t,0.06*v,dest,1200,1,0.03);
};
function ehDrums(S,bus,fx,t,b,beat,style,fill){
  const K=(at,l)=>S.ehKick(t+at*beat,l,bus),SN=(at,l)=>S.ehSnare(t+at*beat,l,bus),H=(at,l,o)=>S.ehHat(t+at*beat,l,fx.kit,o);
  if(style==='heavy'){   // a half-time 6/4 stomp across each pair of bars
    if(b%2===0){K(0,1);K(1.5,0.75);}else{SN(0,1);K(2,0.8);SN(2.5,0.3);}
    for(let k=0;k<6;k++)H(k*0.5,k%2?0.5:0.9,k===5&&b%2===1);
  }else if(style==='drive'){
    K(0,1);SN(1,1);K(1.5,0.8);SN(2,1);K(2.5,0.55);
    for(let k=0;k<12;k++)H(k*0.25,k%2?0.35:0.75,k===11);
  }else if(style==='hush'){K(0,0.45);for(const k of [0,1,2])H(k,0.35);}
  if(fill){const toms=[300,250,210,170,135,105];toms.forEach((f,k)=>S.ehTom(t+(1.5+k*0.25)*beat,f,0.9,S.pan(bus,-0.5+k*0.2)));}
}
const ehSolo=bars(
  // over the A chords: a singing start, then faster
  'C6:2 Bb5:0.5 G5:0.5 | Bb5:0.5 C6:0.5 Eb6:2 | F6:0.5 Eb6:0.5 C6:0.5 Bb5:0.5 G5:1 | Ab5:0.5 B5:0.5 D6:2 | '+
  'F6:1.5 D6:0.5 B5:1 | Ab5:0.25 B5:0.25 D6:0.25 F6:0.25 Ab6:1 G6:1 | F6:0.25 D6:0.25 B5:0.25 G5:0.25 F5:0.25 D5:0.25 B4:0.5 D5:0.5 F5:0.5 | G5:0.5 C6:2.5 | '+
  'C6:0.25 D6:0.25 Eb6:0.25 G6:0.25 C7:1 G6:0.5 Eb6:0.5 | D6:0.25 Eb6:0.25 D6:0.25 C6:0.25 Bb5:0.25 G5:0.25 Bb5:0.25 C6:0.25 Eb6:1 | E6:0.5 G6:0.5 Bb6:1.5 G6:0.5 | Ab6:2 F6:0.5 C6:0.5 | '+
  'Ab6:0.25 G6:0.25 F6:0.25 C6:0.25 Ab6:0.25 G6:0.25 F6:0.25 C6:0.25 Ab6:0.25 G6:0.25 F6:0.25 C6:0.25 | G6:0.25 Eb6:0.25 C6:0.25 G5:0.25 G6:0.25 Eb6:0.25 C6:0.25 G5:0.25 Eb6:1 | D6:0.25 F6:0.25 Ab6:0.25 B6:0.25 D7:2 | C7:1.5 B6:0.25 G6:0.25 Eb6:0.5 C6:0.5 | '+
  // over the B chords: soaring, then everything at once
  'Eb6:0.5 Ab6:0.5 C7:2 | Bb6:0.5 C7:0.5 Bb6:0.5 Ab6:0.5 Eb6:1 | F6:0.25 Ab6:0.25 C7:0.25 Ab6:0.25 F6:0.25 C6:0.25 Ab5:0.5 C6:0.5 F6:0.5 | Ab6:1.5 G6:0.5 F6:0.5 Eb6:0.5 | '+
  'G6:3 | G6:0.25 F6:0.25 Eb6:0.25 D6:0.25 C6:0.25 Bb5:0.25 G5:0.25 Bb5:0.25 C6:0.25 Eb6:0.25 G6:0.25 C7:0.25 | C7:0.5 A6:0.5 F#6:0.5 D6:0.5 C6:0.5 A5:0.5 | B5:0.25 D6:0.25 F6:0.25 G6:0.25 B6:1 D7:1 | '+
  'C7:0.125 C7:0.125 C7:0.125 C7:0.125 C7:0.125 C7:0.125 C7:0.125 C7:0.125 Eb7:1 C7:1 | Ab6:0.25 C7:0.25 Eb7:0.25 C7:0.25 Ab6:0.25 Eb6:0.25 C6:0.25 Eb6:0.25 Ab6:0.25 C7:0.25 Eb7:0.5 | '+
  'C7:0.25 Ab6:0.25 F6:0.25 C6:0.25 Ab6:0.25 F6:0.25 C6:0.25 Ab5:0.25 F6:0.25 C6:0.25 Ab5:0.25 F5:0.25 | F5:0.25 G5:0.25 B5:0.25 D6:0.25 F6:0.25 G6:0.25 B6:0.25 D7:0.25 B6:1 | '+
  'C7:3 | B6:0.25 G6:0.25 D6:0.25 B5:0.25 D6:0.25 F6:0.25 Ab6:0.25 B6:0.25 D7:1 | C7:0.5 G6:0.5 Eb6:0.5 C6:0.5 G5:0.5 Eb5:0.5 | r:3');
{
  const src=blackOriginal.parts[0].notes,vio=blackOriginal.parts[1].notes,A=blackOriginal.chords.slice(4,20),B=blackOriginal.chords.slice(20,36);
  const quiet=n=>bars(rests(n,3)),cp=a=>a.map(bar=>bar.map(ev=>({...ev,midi:[...ev.midi]})));
  TUNES.splice(TUNES.findIndex(t=>t.id==='blackAnalog')+1,0,{
    id:'blackHorizon',title:'Waltz in Black — Event Horizon',
    meta:'Epic space rock · C minor · screaming lead, twin guitars, warp synths, jet flangers and a 32-bar solo',
    desc:'The waltz flung into deep space. A jet takes off over a sequencer, the band crashes in on a half-time stomp, a distorted lead sings the theme over twin guitars and warping synths, and a theremin floats through the hushed middle. Then a blistering 32-bar solo ending in a whammy-bar dive, a lift-off and the theme in octaves.',
    bpm:156,beats:3,send:0.3,gain:0.85,
    // intro 8 | A 16 | B 16 | A2 16 (gliding counter-tune) | C 16 (theremin) | solo 32 | lift-off 4 | A3 16 (octaves) | coda 4
    sections:[[0,'intro'],[8,'A'],[24,'B'],[40,'A2'],[56,'C'],[72,'solo'],[104,'lift-off'],[108,'A3'],[124,'coda']],
    chords:['Cm','Cm','Cm','Cm','Cm','Cm','G7','G7',...A,...B,...A,...blackOriginal.chords.slice(52,68),...A,...B,'Ab','Fm','G7','G7',...A,'Cm','Ab','G7','Cm'],
    parts:[
      {inst:'ehLead',vel:0.85,shift:0,notes:[...quiet(8),...cp(src.slice(4,52)),...quiet(16),...ehSolo,...quiet(4),...cp(src.slice(68,88))]},
      {inst:'ehLead',vel:0.55,shift:12,notes:[...quiet(108),...cp(src.slice(68,88))]},
      {inst:'ehTheremin',vel:0.9,shift:0,notes:[...quiet(56),...cp(src.slice(52,68)),...quiet(56)]},
      {inst:'ehWarp',vel:0.7,shift:0,notes:[...quiet(40),...cp(vio.slice(36,52)),...quiet(52),...cp(vio.slice(68,88))]}],
    accomp(S,bus,t,b,ch,beat){
      const fx=b===0||!ehFx.get(bus)?ehRig(S,bus,t,this.chords.length*3*beat,beat):ehFx.get(bus);
      const sec=sectionOf(this,b),last=b===this.chords.length-1,bar=3*beat,phraseEnd=(b+1)%8===0;
      const r=ch.root,gtr=hz(40+(r+8)%12),bass=hz(28+(r+8)%12),pad=[43+(r+5)%12,...ch.tones.map(n=>55+(r+n+5)%12)];
      const P=(v,d=bar*0.97)=>pad.forEach(m=>S.ehPad(t,hz(m),d,v,bus));
      const seq=(cut,v)=>{const ns=[0,12,7,12,ch.tones[1],12,7,19,12,ch.tones[1]+12,7,12];
        for(let k=0;k<12;k++)S.ehSeq(t+k*beat*0.25,hz(48+r+ns[k]),beat*0.2,v*(k%3===0?1:0.7),fx.pad,cut*(1+0.4*Math.sin(k/6*Math.PI)));};
      const heavy=()=>{
        S.ehRhythm(t,gtr,beat*1.4,1,bus,true);for(const k of [1.5,2,2.5])S.ehRhythm(t+k*beat,gtr,beat*0.3,0.85,bus,false);
        S.ehBass(t,bass,beat*1.4,1,bus);for(const k of [1.5,2,2.5])S.ehBass(t+k*beat,bass,beat*0.4,0.8,bus);
      };
      if(sec==='intro'){
        P(0.7);seq(300*Math.pow(10,b/7),0.5+b*0.06);
        if(b===0){S.ehSweep(t,hz(48),bar*4,1,bus,true);S.ehZap(t+bar*2.5,hz(72),0.8,bus);}
        if(b===4)S.ehJet(t,bar*4,1,bus,true);
        if(b>=4){S.ehKick(t,0.7,bus);for(let k=0;k<6;k++)S.ehBass(t+k*beat*0.5,bass,beat*0.4,0.45+0.1*(b-4),bus);}
        if(b===6)[1,2].forEach(k=>S.ehTom(t+k*beat,k===1?210:170,0.7,bus));
        if(b===7)for(let k=0;k<12;k++)(k<6?S.ehSnare(t+k*beat*0.25,0.3+k*0.08,bus):S.ehTom(t+k*beat*0.25,[260,230,200,170,140,110][k-6],1,S.pan(bus,0.5-(k-6)*0.2)));
        return;
      }
      if(sec==='C'){   // the hush: pads, the sequencer, a slow bass, the theremin above
        P(0.9);seq(700+500*Math.sin(b/16*Math.PI*2),0.42);S.ehBass(t,bass,bar*0.95,0.5,bus);
        ehDrums(S,bus,fx,t,b,beat,'hush',false);
        if(b%4===2)S.ehZap(t+beat*1.5,hz(76+(b%8===2?3:0)),0.6,bus);
        if(b===56)S.ehSweep(t,hz(60),bar*3,0.8,bus,false);
        if(b===71){for(let k=0;k<6;k++)S.ehSnare(t+(1.5+k*0.25)*beat,0.4+k*0.1,bus);S.ehSweep(t,hz(48),bar*1.5,1,bus,true);}
        return;
      }
      if(sec==='lift-off'){   // ringing chords, the snare speeding up, a jet taking off into the last theme
        const k=b-104;S.ehRhythm(t,gtr,bar*0.97,1,bus,true);S.ehBass(t,bass,bar*0.95,1,bus);P(1);seq(800*Math.pow(6,k/3),0.6);
        if(k===0){S.ehJet(t,bar*4,1.1,bus,true);S.ehSweep(t,hz(36),bar*4,1.1,bus,true);S.ehCrash(t,1,fx.kit);}
        const hits=[3,6,12,12][k];for(let i=0;i<hits;i++)S.ehSnare(t+i*bar/hits,0.35+0.65*(k*12+i*12/hits)/48,bus);
        S.ehKick(t,1,bus);if(k===3){S.ehKick(t+beat,1,bus);S.ehKick(t+2*beat,1,bus);}
        return;
      }
      if(last){   // the final chord, the whammy dive and the jet landing
        S.ehRhythm(t,gtr,bar*2,1,bus,true);S.ehBass(t,bass,bar*1.8,1,bus);P(1,bar*2);
        S.ehKick(t,1,bus);S.ehCrash(t,1.2,fx.kit);S.ehSnare(t,0.9,bus);
        S.ehLead(t+beat*1.8,hz(84),bar*2.2,0.9,bus,true);S.ehSweep(t,hz(72),bar*2.5,0.9,bus,false);S.ehJet(t+beat,bar*2.5,0.8,bus,false);
        return;
      }
      const solo=sec==='solo';
      if(solo){
        S.ehRhythm(t,gtr,beat*0.45,1,bus,true);for(let k=1;k<6;k++)S.ehRhythm(t+k*beat*0.5,gtr,beat*0.3,0.8,bus,false);
        for(let k=0;k<6;k++)S.ehBass(t+k*beat*0.5,k===5?bass*2:bass,beat*0.4,k===0?1:0.8,bus);
        P(0.35);if(b>=88)seq(1400+(b-88)*120,0.3);
        if(b===103)S.ehLead(t,hz(84),bar*0.95,0.95,bus,true);
      }else if(sec==='B'){S.ehRhythm(t,gtr,bar*0.93,1,bus,true);S.ehBass(t,bass,beat*1.5,1,bus);for(const k of [2,2.5])S.ehBass(t+k*beat,bass,beat*0.4,0.8,bus);P(0.8);}
      else{heavy();P(sec==='A'?0.35:0.55);}
      ehDrums(S,bus,fx,t,b,beat,solo?'drive':'heavy',phraseEnd&&b!==103);
      if(this.sections.some(x=>x[0]===b)||b%8===0)S.ehCrash(t,b%8===0?1:0.7,fx.kit);
      if(sec==='B'&&b%4===0)S.ehZap(t+beat*2,hz(79),0.5,bus);
      if(b===40)S.ehSweep(t,hz(60),bar*2,0.7,bus,false);
      if(b===72){S.ehJet(t,bar*2,0.6,bus,false);}
    }
  });
}

// ===================================================================== Starlight Autobahn
// Motorik space rock in 4/4, on the Event Horizon rig: a relentless kick-snare beat, eighth-note bass and a
// sixteenth-note sequencer that never stops, with a gliding synth lead in place of the guitar.
// The synth lead: two detuned saws and a square an octave up, a filter that snaps open on each note, sliding
// legato from the note before (each voice slides only from its own last note, so a doubled part doesn't cross over).
function ehSynVoice(key){return function(t,f,dur,v,dest){
  const c=this.ctx,fx=ehFx.get(dest),end=t+dur+0.35,last=fx&&fx.glide[key],lp=this.filter('lowpass',1200,5),g=this.held(t,0.006,0.1*v,dur,0.2);
  lp.frequency.setValueAtTime(Math.min(9000,f*10),t);lp.frequency.exponentialRampToValueAtTime(Math.min(4500,f*3),t+0.25);
  const glide=last&&t-last.end<0.12?Math.min(0.07,dur*0.4):0;
  const oscs=[[-7,1,'sawtooth',1],[7,1,'sawtooth',1],[0,0.35,'square',2]].map(([cents,a,type,k])=>{
    const o=this.osc(type,f*k,t,end),ga=c.createGain();o.detune.value=cents;ga.gain.value=a;o.connect(ga);ga.connect(lp);
    if(glide){o.frequency.setValueAtTime(last.f*k,t);o.frequency.exponentialRampToValueAtTime(f*k,t+glide);}return o;});
  if(dur>0.5){const l=this.osc('sine',5.8,t,end),d=c.createGain();d.gain.setValueAtTime(0,t);d.gain.setValueAtTime(0,t+0.2);d.gain.linearRampToValueAtTime(22,t+0.6);l.connect(d);oscs.forEach(o=>d.connect(o.detune));}
  lp.connect(g);g.connect(dest);
  if(fx){const send=c.createGain();send.gain.value=0.5;g.connect(send);send.connect(fx.echo);fx.glide[key]={f,end:t+dur};}
};}
Synth.prototype.ehSynLead=ehSynVoice('syn');Synth.prototype.ehSynHigh=ehSynVoice('synHigh');
{
  const quiet=n=>bars(rests(n,4));
  const themeA=bars('B4:1.5 E5:1.5 G5:1 | F#5:1 E5:1 D5:1 E5:1 | B4:1.5 E5:1.5 G5:1 | A5:2 G5:1 F#5:1 | G5:1.5 E5:1.5 C5:1 | E5:2 G5:2 | F#5:1.5 A5:1.5 D6:1 | C6:1 A5:1 F#5:2 | '+
    'B4:1.5 E5:1.5 G5:1 | F#5:1 E5:1 D5:1 E5:1 | B5:1.5 A5:1.5 G5:1 | F#5:1 G5:1 A5:1 B5:1 | C6:3 B5:1 | G5:2 E5:2 | A5:1.5 F#5:1.5 D5:1 | F#5:2 D5:2');
  const themeB=bars('E5:1 A5:1 C6:2 | B5:1 A5:1 E5:2 | G5:1 C6:1 E6:2 | D6:1 C6:1 G5:2 | B5:1.5 D6:1.5 G6:1 | F#6:2 D6:2 | E6:1 D6:1 A5:1 F#5:1 | A5:4 | '+
    'E5:1 A5:1 C6:2 | E6:2 C6:2 | G6:2 E6:1 C6:1 | D6:1 E6:1 G6:2 | B6:2 A6:1 G6:1 | F#6:1 G6:1 D6:2 | E6:1 F#6:1 A6:2 | F#6:3 r:1');
  const drift=bars('B5:4 | G5:2 A5:2 | B5:3 E6:1 | D6:4 | C6:2 B5:2 | A5:4 | G5:2 F#5:2 | E5:4');
  const solo=bars(
    'E5:0.25 G5:0.25 B5:0.25 E6:0.25 G6:1 F#6:0.5 E6:0.5 D6:0.5 B5:0.5 | E6:0.25 D6:0.25 B5:0.25 G5:0.25 E6:0.25 D6:0.25 B5:0.25 G5:0.25 A5:0.5 B5:0.5 E6:1 | '+
    'G6:0.25 E6:0.25 C6:0.25 G5:0.25 G6:0.25 E6:0.25 C6:0.25 G5:0.25 E6:2 | F#6:0.25 A6:0.25 D7:0.5 C7:0.5 A6:0.5 F#6:0.5 D6:0.5 E6:1 | '+
    'B6:2 A6:0.5 G6:0.5 F#6:0.5 E6:0.5 | E6:0.25 B5:0.25 G5:0.25 B5:0.25 E6:0.25 B5:0.25 G5:0.25 B5:0.25 G6:0.25 E6:0.25 B5:0.25 E6:0.25 G6:0.25 E6:0.25 B5:0.25 E6:0.25 | '+
    'C7:1 B6:0.5 G6:0.5 E6:0.5 G6:0.5 C7:1 | D7:0.25 C7:0.25 A6:0.25 F#6:0.25 D6:0.25 C6:0.25 A5:0.25 F#5:0.25 D5:1 F#5:0.5 A5:0.5 | '+
    'E6:3 G6:1 | F#6:0.25 G6:0.25 F#6:0.25 E6:0.25 D6:0.25 E6:0.25 D6:0.25 B5:0.25 A5:0.25 B5:0.25 A5:0.25 G5:0.25 E5:1 | '+
    'E5:0.25 G5:0.25 C6:0.25 E6:0.25 G6:0.25 C7:0.25 B6:1.5 G6:1 | A6:0.25 F#6:0.25 D6:0.25 A5:0.25 A6:0.25 F#6:0.25 D6:0.25 A5:0.25 D6:0.5 E6:0.5 F#6:1 | '+
    'B6:0.125 B6:0.125 B6:0.125 B6:0.125 B6:0.125 B6:0.125 B6:0.125 B6:0.125 G6:0.5 A6:0.5 B6:2 | '+
    'D7:0.25 B6:0.25 G6:0.25 E6:0.25 D7:0.25 B6:0.25 G6:0.25 E6:0.25 B6:0.25 G6:0.25 E6:0.25 B5:0.25 G5:0.25 E5:0.25 B4:0.5 | '+
    'C6:0.25 E6:0.25 G6:0.25 C7:0.25 B6:0.5 G6:0.5 E6:0.5 G6:0.5 C7:1 | D7:2 F#6:0.5 A6:0.5 D7:1');
  const counter=bars('E6:4 | D6:4 | B5:4 | C6:2 B5:2 | C6:4 | E6:4 | D6:4 | F#6:4 | G6:4 | F#6:4 | E6:4 | D6:4 | E6:4 | G6:4 | F#6:4 | A6:2 F#6:2');
  const em=n=>Array(n).fill('Em'),A=['Em','Em','Em','Em','C','C','D','D'];
  TUNES.splice(TUNES.findIndex(t=>t.id==='blackHorizon')+1,0,{
    id:'autobahn',title:'Starlight Autobahn',
    meta:'Motorik space rock · E minor · 4/4 · sequencer, gliding synth lead, theremin and a synth solo',
    desc:'A straight road out of the solar system. The sequencer starts alone, a jet takes off and the motorik beat locks in and never lets go: eighth-note bass, warping pads, a gliding synth lead. A drift through deep space on the theremin, a racing synth solo, a lift-off, the theme in octaves, and the long fade into the dark.',
    bpm:138,beats:4,send:0.3,gain:0.85,
    // intro 8 | A 16 | B 16 | drift 8 (theremin) | solo 16 | lift-off 4 | A2 16 (octaves and counter-tune) | outro 8
    sections:[[0,'intro'],[8,'A'],[24,'B'],[40,'drift'],[48,'solo'],[64,'lift-off'],[68,'A2'],[84,'outro']],
    chords:[...em(8),...A,...A,'Am','Am','C','C','G','G','D','D','Am','Am','C','C','G','G','D','D',...em(8),
      'Em','Em','C','D','Em','Em','C','D','Em','Em','C','D','Em','Em','C','D','C','D','B7','B7',...A,...A,...em(8)],
    parts:[
      {inst:'ehSynLead',vel:1,shift:0,notes:[...quiet(8),...themeA,...themeB,...quiet(8),...solo,...quiet(4),...themeA,...themeA.slice(0,4),...quiet(4)]},
      {inst:'ehSynHigh',vel:0.5,shift:12,notes:[...quiet(68),...themeA,...quiet(8)]},
      {inst:'ehTheremin',vel:0.9,shift:0,notes:[...quiet(40),...drift,...quiet(44)]},
      {inst:'ehWarp',vel:0.7,shift:-12,notes:[...quiet(68),...counter,...quiet(8)]}],
    accomp(S,bus,t,b,ch,beat){
      const fx=b===0||!ehFx.get(bus)?ehRig(S,bus,t,this.chords.length*4*beat,beat):ehFx.get(bus);
      const sec=sectionOf(this,b),n=this.chords.length,last=b===n-1,bar=4*beat,phraseEnd=(b+1)%8===0;
      const r=ch.root,bass=hz(28+(r+8)%12),third=ch.tones[1],pad=[43+(r+5)%12,...ch.tones.map(k=>55+(r+k+5)%12)];
      const P=(v,d=bar*0.97)=>pad.forEach(m=>S.ehPad(t,hz(m),d,v,bus));
      const seq=(cut,v)=>{const ns=[0,12,7,12,third+12,12,7,12,0,12,7,19,third+12,12,7,24];
        for(let k=0;k<16;k++)S.ehSeq(t+k*beat*0.25,hz(48+r+ns[k]),beat*0.2,1.5*v*(k%4===0?1:0.7),fx.pad,cut*(1+0.35*Math.sin(k/8*Math.PI)));};
      const B8=(v)=>{for(let k=0;k<8;k++)S.ehBass(t+k*beat*0.5,k===3||k===7?bass*2:bass,beat*0.4,(k%2?0.65:0.8)*v,bus);};
      const K=(at,l)=>S.ehKick(t+at*beat,l,bus),SN=(at,l)=>S.ehSnare(t+at*beat,l,bus),H=(at,l,o)=>S.ehHat(t+at*beat,l,fx.kit,o);
      const motorik=(v=1)=>{K(0,v);K(2,v);K(2.5,0.7*v);SN(1,v);SN(3,v);for(let k=0;k<8;k++)H(k*0.5,(k%2?0.5:0.85)*v,k===7&&b%2===1);};
      const fill=()=>[320,280,240,200,170,140,115,95].forEach((f,k)=>S.ehTom(t+(2+k*0.25)*beat,f,0.9,S.pan(bus,-0.6+k*0.17)));
      if(sec==='intro'){
        P(0.7);seq(300*Math.pow(8,b/7),0.55+b*0.05);
        if(b===0)S.ehSweep(t,hz(52),bar*3,1,bus,true);
        if(b===2)S.ehJet(t,bar*2,1,bus,true);
        if(b===3)S.ehZap(t+beat*2,hz(76),0.8,bus);
        if(b>=4){B8(0.5+0.1*(b-4));K(0,0.8);K(2,0.8);for(let k=0;k<8;k++)H(k*0.5,k%2?0.35:0.6);}
        if(b===7)fill();
        return;
      }
      if(sec==='drift'){   // the drums fall away to hats and a heartbeat; the theremin floats over the drone
        P(0.9);seq(700+400*Math.sin((b-40)/8*Math.PI),0.45);S.ehBass(t,bass,bar*0.95,0.6,bus);
        K(0,0.5);for(let k=0;k<8;k++)H(k*0.5,k%2?0.25:0.4);
        if(b===40)S.ehSweep(t,hz(64),bar*2,0.8,bus,false);
        if(b%2===1)S.ehZap(t+beat*(1.5+b%4),hz(76+(b%4===1?3:0)),0.6,bus);
        if(b===47){for(let k=0;k<8;k++)S.ehSnare(t+(2+k*0.25)*beat,0.35+k*0.08,bus);S.ehSweep(t,hz(52),bar,1,bus,true);}
        return;
      }
      if(sec==='lift-off'){
        const k=b-64;P(1);B8(1);seq(1200*Math.pow(4,k/3),0.65);K(0,1);K(2,1);
        if(k===0){S.ehJet(t,bar*4,1.1,bus,true);S.ehSweep(t,hz(40),bar*4,1.1,bus,true);S.ehCrash(t,1,fx.kit);}
        const hits=[4,8,16,16][k];for(let i=0;i<hits;i++)S.ehSnare(t+i*bar/hits,0.35+0.65*(k*16+i*16/hits)/64,bus);
        return;
      }
      if(sec==='outro'){   // the band peels away, the sequencer closes, the jet lands
        const k=b-84;seq(2500*Math.pow(0.6,k),0.6-k*0.04);
        if(last){P(1,bar*2.5);S.ehBass(t,bass,bar*2,1,bus);K(0,1);S.ehCrash(t,1.2,fx.kit);S.ehSweep(t,hz(76),bar*2.5,0.9,bus,false);S.ehJet(t,bar*2.5,0.8,bus,false);return;}
        P(0.8);if(k<6)B8(1-k*0.12);
        if(k<4){motorik();if(k===0)S.ehCrash(t,1,fx.kit);if(k===3)fill();}
        else if(k<6){K(0,0.8);K(2,0.8);for(let i=0;i<8;i++)H(i*0.5,i%2?0.4:0.7);}
        else for(let i=0;i<8;i++)H(i*0.5,i%2?0.3:0.5);
        return;
      }
      // A, B, the solo and A2: the beat that never stops
      B8(1);motorik();
      const cut={A:1600,B:2200,solo:2800,A2:3200}[sec]||2000;
      seq(cut*(1+0.25*Math.sin(b/8*Math.PI)),sec==='solo'?0.5:0.6);
      P(sec==='A'?0.4:sec==='solo'?0.3:0.6);
      if(phraseEnd&&b!==63)fill();
      if(this.sections.some(x=>x[0]===b)||b%8===0)S.ehCrash(t,b%8===0?1:0.7,fx.kit);
      if(sec==='B'&&b%4===2)S.ehZap(t+beat*3,hz(79),0.5,bus);
      if(b===24||b===68)S.ehSweep(t,hz(64),bar*2,0.7,bus,false);
      if(b===63)S.ehJet(t,bar,0.7,bus,true);
    }
  });
}

// ===================================================================== Pulse Width Panic
// Early-arcade space rock: pulse waves whose width never sits still, through bit-crushers for that raspy
// sound-board grit, with arpeggiators running against each other at 32nds and triplets.
// A pulse made from two band-limited saws, one inverted and delayed by width/f; moving that delay moves the width.
Synth.prototype.pwOsc=function(f,t,end,w=0.5,rate=0,depth=0){
  const c=this.ctx,saw=this.osc('sawtooth',f,t,end),d=c.createDelay(0.1),inv=c.createGain(),out=c.createGain();
  d.delayTime.value=w/f;inv.gain.value=-1;saw.connect(out);saw.connect(d);d.connect(inv);inv.connect(out);
  if(rate){const l=this.osc('sine',rate,t,end),g=c.createGain();g.gain.value=depth/f;l.connect(g);g.connect(d.delayTime);}
  return {out,saw};
};
// the crushers, added to the Event Horizon rig: coarse staircases with no oversampling, so they alias and rasp
function pwRig(S,bus,t,length,beat){
  const rig=ehRig(S,bus,t,length,beat),c=S.ctx;
  const crush=(levels,level,pan,to)=>{
    const input=c.createGain(),sh=c.createWaveShaper(),curve=new Float32Array(4096),hp=S.filter('highpass',45,0.7),out=c.createGain();
    for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=Math.round(x*levels)/levels;}
    sh.curve=curve;sh.oversample='none';out.gain.value=level;
    input.connect(sh);sh.connect(hp);hp.connect(out);out.connect(to||S.pan(bus,pan));return {input,out};
  };
  const lead=crush(16,0.18,0),chord=crush(16,0.12,0,rig.pad);
  const echo=c.createGain();echo.gain.value=0.35;lead.out.connect(echo);echo.connect(rig.echo);
  rig.pw={lead:lead.input,arp:[crush(8,0.17,-0.6).input,crush(8,0.17,0.6).input],chord:chord.input,bass:crush(32,0.09,0).input,fx:crush(4,0.1,0).input};
  return rig;
}
// the lead: two pulses breathing at different rates, a late vibrato
Synth.prototype.pwLead=function(t,f,dur,v,dest){
  const c=this.ctx,fx=ehFx.get(dest),into=fx&&fx.pw?fx.pw.lead:dest,end=t+dur+0.2,g=this.held(t,0.004,0.42*v,dur,0.08),hp=this.filter('highpass',90,0.7);
  const a=this.pwOsc(f,t,end,0.25,3.5,0.2),b=this.pwOsc(f*1.005,t,end,0.4,2.7,0.25),bg=c.createGain();bg.gain.value=0.6;
  a.out.connect(hp);b.out.connect(bg);bg.connect(hp);
  for(const o of [a.saw,b.saw]){o.frequency.setValueAtTime(f*0.97,t);o.frequency.exponentialRampToValueAtTime(o===a.saw?f:f*1.005,t+0.03);}
  if(dur>0.4){const l=this.osc('sine',6.5,t,end),d=c.createGain();d.gain.setValueAtTime(0,t);d.gain.setValueAtTime(0,t+0.18);d.gain.linearRampToValueAtTime(28,t+0.5);l.connect(d);d.connect(a.saw.detune);d.connect(b.saw.detune);}
  hp.connect(g);g.connect(into);
};
// one arpeggio note: a fixed width per note, so a run flickers between thin and fat
Synth.prototype.pwArp=function(t,f,dur,v,dest,side=0,w=0.5){
  const fx=ehFx.get(dest),into=fx&&fx.pw?fx.pw.arp[side]:dest,end=t+dur+0.08,g=this.held(t,0.002,1.1*v,dur,0.03);
  this.pwOsc(f,t,end,w).out.connect(g);g.connect(into);
};
// a chord played the old way: one pulse cycling through the notes thirty times a second
Synth.prototype.pwChord=function(t,fs,dur,v,dest){
  const fx=ehFx.get(dest),into=fx&&fx.pw?fx.pw.chord:dest,end=t+dur+0.2,p=this.pwOsc(fs[0],t,end,0.5,0.8,0.3),g=this.held(t,0.01,0.9*v,dur,0.12);
  for(let k=0,s=t;s<end;k++,s+=1/30)p.saw.frequency.setValueAtTime(fs[k%fs.length],s);
  p.out.connect(g);g.connect(into);
};
Synth.prototype.pwBass=function(t,f,dur,v,dest){
  const c=this.ctx,fx=ehFx.get(dest),into=fx&&fx.pw?fx.pw.bass:dest,end=t+dur+0.15,lp=this.filter('lowpass',2400,2),g=this.held(t,0.003,0.5*v,dur,0.07);
  lp.frequency.setValueAtTime(2600,t);lp.frequency.exponentialRampToValueAtTime(450,t+Math.min(0.3,dur+0.05));
  this.pwOsc(f,t,end,0.3,0.6,0.18).out.connect(lp);lp.connect(g);g.connect(into);
  const sub=this.osc('sine',f,t,end),sg=this.held(t,0.003,0.07*v,dur,0.07);sub.connect(sg);sg.connect(dest);
};
Synth.prototype.pwZap=function(t,f,v,dest){   // the laser
  const fx=ehFx.get(dest),into=fx&&fx.pw?fx.pw.fx:dest,end=t+0.3,p=this.pwOsc(f*6,t,end,0.5,30,0.4),g=this.amp(t,0.002,0.55*v,0.22,end);
  p.saw.frequency.exponentialRampToValueAtTime(f/2,t+0.2);p.out.connect(g);g.connect(into);if(fx)g.connect(fx.echo);
};
Synth.prototype.pwBoom=function(t,v,dest,len=2){   // an explosion, crunched down to a few bits
  const c=this.ctx,fx=ehFx.get(dest),into=fx&&fx.pw?fx.pw.fx:dest,n=c.createBufferSource(),lp=this.filter('lowpass',3000,1),g=this.amp(t,0.003,0.9*v,len,t+len+0.1);
  n.buffer=this.noise;n.loop=true;n.playbackRate.value=0.35;lp.frequency.setValueAtTime(3000,t);lp.frequency.exponentialRampToValueAtTime(120,t+len);
  n.connect(lp);lp.connect(g);g.connect(into);n.start(t);n.stop(t+len+0.1);
  const o=this.osc('sine',70,t,t+0.8),og=this.amp(t,0.003,0.4*v,0.7,t+0.8);o.frequency.exponentialRampToValueAtTime(28,t+0.6);o.connect(og);og.connect(dest);
};
Synth.prototype.pwWarble=function(t,f,dur,v,dest,f2=f*2){   // an alarm: a pulse trilling hard as it slides
  const c=this.ctx,fx=ehFx.get(dest),into=fx&&fx.pw?fx.pw.fx:dest,end=t+dur+0.2,p=this.pwOsc(f,t,end,0.3,1.3,0.2),g=this.held(t,0.02,0.35*v,dur,0.15);
  p.saw.frequency.exponentialRampToValueAtTime(f2,t+dur);
  const tr=this.osc('square',14,t,end),tg=c.createGain();tg.gain.value=250;tr.connect(tg);tg.connect(p.saw.detune);
  p.out.connect(g);g.connect(into);
};
{
  const quiet=n=>bars(rests(n,4));
  const themeA=bars('A4:0.5 C5:0.5 E5:0.5 A5:1 G5:0.5 E5:1 | C5:0.5 D5:0.5 E5:1 D5:0.5 C5:0.5 B4:1 | A4:0.5 C5:0.5 F5:1 E5:0.5 F5:0.5 A5:1 | G5:1.5 F5:0.5 D5:1 B4:1 | '+
    'A4:0.5 C5:0.5 E5:0.5 A5:1 B5:0.5 C6:1 | B5:0.5 A5:0.5 G5:0.5 E5:0.5 A5:2 | F5:0.5 A5:0.5 C6:1 A5:0.5 F5:0.5 C5:1 | B4:1 E5:1 G#5:1 D5:1 | '+
    'A4:0.5 C5:0.5 E5:0.5 A5:1 G5:0.5 E5:1 | E5:0.5 F5:0.5 G5:1 F5:0.5 E5:0.5 D5:1 | C5:0.5 F5:0.5 A5:1 C6:1.5 A5:0.5 | B5:1 G5:1 D5:1 G5:1 | '+
    'C6:1.5 B5:0.5 A5:1 E5:1 | A5:0.25 G5:0.25 E5:0.25 C5:0.25 A5:0.25 G5:0.25 E5:0.25 C5:0.25 A4:2 | F5:1 A5:1 C6:1 F6:1 | E6:2 G#5:1 B5:1');
  const themeB=bars('C6:2 A5:1 F5:1 | G5:1 A5:1 C6:2 | D6:2 B5:1 G5:1 | A5:1 B5:1 D6:2 | E6:2 B5:1 G5:1 | F#5:1 G5:1 B5:2 | A5:1 C6:1 E6:1 A6:1 | G6:1 E6:1 C6:2 | '+
    'F6:1.5 E6:0.5 C6:1 A5:1 | C6:0.5 D6:0.5 E6:0.5 F6:0.5 A6:2 | G6:1.5 F6:0.5 D6:1 B5:1 | D6:0.5 E6:0.5 F6:0.5 G6:0.5 B6:2 | Bb6:2 F6:1 D6:1 | F6:1 D6:1 Bb5:2 | '+
    'G#5:0.5 B5:0.5 D6:0.5 E6:0.5 G#6:2 | B6:3 r:1');
  const trem=(n,k)=>Array(k).fill(n+':'+(1/8)).join(' ');
  const solo=bars(
    'A5:0.25 C6:0.25 E6:0.25 A6:0.25 E6:0.25 C6:0.25 A5:0.25 E5:0.25 A5:1 C6:1 | E6:1.5 D6:0.25 C6:0.25 B5:0.5 A5:0.5 G5:0.5 E5:0.5 | '+
    'F5:0.25 A5:0.25 C6:0.25 F6:0.25 F5:0.25 A5:0.25 C6:0.25 F6:0.25 E6:0.5 C6:0.5 A5:1 | G5:0.25 B5:0.25 D6:0.25 G6:0.25 B6:0.5 A6:0.5 G6:0.5 F6:0.5 D6:1 | '+
    'A6:2 G6:0.5 E6:0.5 C6:0.5 E6:0.5 | A6:0.25 E6:0.25 C6:0.25 A5:0.25 E6:0.25 C6:0.25 A5:0.25 E5:0.25 C6:0.25 A5:0.25 E5:0.25 C5:0.25 A5:0.25 E5:0.25 C5:0.25 A4:0.25 | '+
    'F5:0.5 C6:0.5 F6:0.5 A6:0.5 C7:2 | B6:0.25 G#6:0.25 E6:0.25 D6:0.25 B5:0.25 G#5:0.25 E5:0.25 D5:0.25 E5:2 | '+
    trem('E6',8)+' A6:1 G6:0.5 E6:0.5 C6:1 | C6:0.25 D6:0.25 E6:0.25 G6:0.25 A6:0.25 G6:0.25 E6:0.25 D6:0.25 C6:0.25 A5:0.25 G5:0.25 E5:0.25 A5:1 | '+
    'A5:0.25 C6:0.25 F6:0.25 A6:0.25 C7:1 A6:0.5 F6:0.5 C6:1 | D6:0.25 G6:0.25 B6:0.25 D7:0.25 B6:0.25 G6:0.25 D6:0.25 B5:0.25 G5:2 | '+
    'E6:0.25 A6:0.25 C7:0.5 B6:0.25 A6:0.25 E6:0.5 C7:1 A6:1 | '+trem('A6',16)+' E6:0.5 G6:0.5 A6:1 | '+
    'C7:0.25 A6:0.25 F6:0.25 C6:0.25 F6:0.25 A6:0.25 C7:0.25 A6:0.25 C7:2 | B6:0.5 G#6:0.5 E6:0.5 D6:0.5 B5:0.5 G#5:0.5 E5:1');
  const ending=bars('A5:2 C6:2 | A5:2 F5:2 | G#5:2 B5:2 | A5:4');
  const A=['Am','Am','F','G','Am','Am','F','E7'],B=['F','F','G','G','Em','Em','Am','Am','F','F','G','G','Bb','Bb','E7','E7'];
  // a little seeded randomness, so the mad arpeggios are the same every time round
  const rnd=(b,k)=>{let x=Math.sin(b*127.1+k*311.7)*43758.5453;return x-Math.floor(x);};
  TUNES.splice(TUNES.findIndex(t=>t.id==='autobahn')+1,0,{
    id:'pulsePanic',title:'Pulse Width Panic',
    meta:'Arcade space rock · A minor · 4/4 · raspy pulse-width synths, mad arpeggiators and a crushed lead',
    desc:'An attack wave from an early-80s arcade cabinet. Pulse waves that never hold their shape, crushed down to a handful of bits, with arpeggiators racing each other in 32nds and triplets. An alarm, the theme, a chase where the arpeggios go haywire under laser fire, a raspy solo, an accelerating launch and a final smart bomb.',
    bpm:150,beats:4,send:0.25,gain:0.85,
    // intro 8 | A 16 | B 16 | chase 8 | solo 16 | launch 4 | A2 16 | ending 4
    sections:[[0,'intro'],[8,'A'],[24,'B'],[40,'chase'],[48,'solo'],[64,'launch'],[68,'A2'],[84,'ending']],
    chords:[...Array(8).fill('Am'),...A,...A,...B,...Array(8).fill('Am'),...A,...A,'F','G','E7','E7',...A,...A,'Am','F','E7','Am'],
    parts:[
      {inst:'pwLead',vel:1,shift:0,notes:[...quiet(8),...themeA,...themeB,...quiet(8),...solo,...quiet(4),...themeA,...ending]},
      {inst:'pwLead',vel:0.45,shift:12,notes:[...quiet(68),...themeA,...quiet(4)]}],
    accomp(S,bus,t,b,ch,beat){
      const fx=b===0||!ehFx.get(bus)||!ehFx.get(bus).pw?pwRig(S,bus,t,this.chords.length*4*beat,beat):ehFx.get(bus);
      const sec=sectionOf(this,b),last=b===this.chords.length-1,bar=4*beat,phraseEnd=(b+1)%8===0;
      const r=ch.root,low=45+(r+3)%12,bass=hz(low-12),tones=[0,1,2].flatMap(o=>ch.tones.map(k=>low+12+o*12+k));
      // up and down three octaves of the chord, 32nds, the width flickering note by note
      const arp32=(v,side=0)=>{const run=[...tones,...tones.slice(1,-1).reverse()];
        for(let k=0;k<32;k++)S.pwArp(t+k*beat/8,hz(run[k%run.length]),beat/8*0.9,v*(k%8===0?1:0.75),bus,side,[0.5,0.25,0.12,0.25][k%4]);};
      // triplet 16ths in leaps: root, fifth, octave, third up high
      const arp24=(v,side=1)=>{const leap=[0,2,3,7,5,4];
        for(let k=0;k<24;k++)S.pwArp(t+k*beat/6,hz(tones[leap[k%6]%tones.length]+(k%12>=6?12:0)),beat/6*0.85,v*(k%6===0?1:0.7),bus,side,0.33);};
      // the haywire one: random octave leaps through the chord
      const arpMad=(v,side=0)=>{for(let k=0;k<32;k++)S.pwArp(t+k*beat/8,hz(tones[Math.floor(rnd(b,k)*tones.length)]+(rnd(b,k+99)<0.2?12:0)),beat/8*0.9,v,bus,side,0.1+rnd(b,k+7)*0.4);};
      const chord=(v,d=bar*0.97)=>S.pwChord(t,ch.tones.map(k=>hz(low+12+k)),d,v,bus);
      const bass8=v=>{for(let k=0;k<8;k++)S.pwBass(t+k*beat/2,k%4===2?bass*2:bass,beat*0.42,(k%2?0.75:1)*v,bus);};
      const K=(at,l)=>S.ehKick(t+at*beat,l,bus),SN=(at,l)=>S.ehSnare(t+at*beat,l,bus),H=(at,l,o)=>S.ehHat(t+at*beat,l,fx.kit,o);
      const beatRock=(sixteenths,v=1)=>{K(0,v);K(1.5,0.7*v);K(2,v);SN(1,v);SN(3,v);const n=sixteenths?16:8;for(let k=0;k<n;k++)H(k*4/n,(k%(n/4)===0?0.85:0.45)*v,k===n-1);};
      const fill=()=>{for(let k=0;k<8;k++)(k%2?SN(2+k*0.25,0.5+k*0.06):S.ehTom(t+(2+k*0.25)*beat,[300,260,220,180,150,125,105,90][k],0.9,S.pan(bus,-0.6+k*0.17)));};
      if(sec==='intro'){
        if(b===0)S.pwWarble(t,hz(69),bar*1.8,1,bus);
        if(b===2)S.pwWarble(t,hz(69),bar*1.8,1,bus,hz(57));
        for(let k=0;k<(b<2?8:16);k++)S.pwArp(t+k*bar/(b<2?8:16),hz(tones[k%tones.length]),beat*0.2,0.35+b*0.08,bus,k%2,[0.5,0.25,0.12][k%3]);
        if(b>=3)chord(0.4+b*0.06);
        if(b>=4){bass8(0.6+(b-4)*0.1);K(0,0.8);K(2,0.8);}
        if(b>=6){SN(1,0.7);SN(3,0.7);for(let k=0;k<8;k++)H(k*0.5,k%2?0.4:0.7);}
        if(b===7){fill();for(let k=0;k<4;k++)S.pwZap(t+(2+k*0.5)*beat,hz(76-k*3),0.8,bus);}
        return;
      }
      if(sec==='chase'){   // the arpeggiators lose their minds under laser fire
        const k=b-40;bass8(0.9);K(0,1);K(1,0.8);K(2,1);K(3,0.8);for(let i=0;i<16;i++)H(i*0.25,i%4===0?0.7:0.35);
        arpMad(0.65,0);arp24(0.55,1);if(k>=4)chord(0.7);
        for(let i=0;i<4;i++)if(rnd(b,i+50)<0.6)S.pwZap(t+(i+rnd(b,i+60)*0.5)*beat,hz(72+Math.floor(rnd(b,i+70)*12)),0.7,bus);
        if(k===3||k===7)S.pwBoom(t+beat*2,0.8,bus,1.6);
        if(k===0)S.ehCrash(t,1,fx.kit);if(k===7)fill();
        return;
      }
      if(sec==='launch'){   // every arpeggio speeds up together, the alarm climbs, the snare rolls
        const k=b-64;bass8(1);chord(0.9);K(0,1);K(2,1);
        const n=[16,24,32,48][k];for(let i=0;i<n;i++){S.pwArp(t+i*bar/n,hz(tones[i%tones.length]),bar/n*0.85,0.6,bus,0,0.25);if(k>=2)S.pwArp(t+i*bar/n,hz(tones[(tones.length-1-i%tones.length)]),bar/n*0.85,0.5,bus,1,0.12);}
        const hits=[4,8,16,16][k];for(let i=0;i<hits;i++)SN(i*4/hits,0.35+0.65*(k*16+i*16/hits)/64);
        if(k===0){S.pwWarble(t,hz(57),bar*4,0.9,bus,hz(93));S.ehCrash(t,1,fx.kit);S.ehJet(t,bar*4,0.8,bus,true);}
        return;
      }
      if(last){   // the smart bomb
        chord(1,bar*1.5);S.pwBass(t,bass,bar*1.4,1,bus);K(0,1);S.ehCrash(t,1.3,fx.kit);SN(0,1);
        S.pwBoom(t+beat*0.02,1.3,bus,3.2);for(let k=0;k<6;k++)S.pwZap(t+k*beat*0.18,hz(88-k*4),0.8,bus);
        arp32(0.6,0);
        return;
      }
      bass8(1);beatRock(sec==='B'||sec==='A2');
      if(sec==='A'){arp32(0.45,b%2);}
      else if(sec==='B'){chord(0.75);arp24(0.45,1);}
      else if(sec==='solo'){arp32(0.3,0);chord(0.4);}
      else{arp32(0.45,0);arp24(0.35,1);chord(0.55);}
      if(phraseEnd)fill();
      if(this.sections.some(x=>x[0]===b)||b%8===0)S.ehCrash(t,b%8===0?1:0.7,fx.kit);
      if(phraseEnd&&sec!=='solo')for(let k=0;k<3;k++)S.pwZap(t+(3+k/3)*beat,hz(79-k*5),0.6,bus);
      if(b===8||b===68)S.pwBoom(t,0.6,bus,1.5);
    }
  });
}

// ===================================================================== Echo Chamber
// Roots dub in the 1970s manner, played on analogue synths and mixed live on a desk: a one-drop riddim, a tape
// echo that the engineer throws sounds into and pushes until it runs away, a boingy spring, a high-pass sweep
// across the whole mix, and instruments muted and brought back.
const dubFx=new WeakMap(),dubSprings=new WeakMap();
function dubSpringIR(c){   // a spring tank: chirps that fall from treble to bass, bouncing back every 40-50 ms
  if(dubSprings.has(c))return dubSprings.get(c);
  const sr=c.sampleRate,len=Math.floor(sr*2.4),ir=c.createBuffer(2,len,sr);
  for(let ch=0;ch<2;ch++){const d=ir.getChannelData(ch),period=ch?0.051:0.043,n=Math.floor(0.03*sr);
    for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*0.12*Math.exp(-i/sr*2.6);
    for(let k=0;k*period<2.3;k++){const start=Math.floor(k*period*sr),a=Math.pow(0.82,k)*(k?1:0.5);let ph=0;
      for(let j=0;j<n&&start+j<len;j++){ph+=2*Math.PI*3500*Math.pow(150/3500,j/n)/sr;d[start+j]+=a*0.5*Math.sin(ph)*(1-j/n);}}
  }
  dubSprings.set(c,ir);return ir;
}
function dubRig(S,bus,t,length,beat){
  const c=S.ctx,nodes=[],keep=(...n)=>(nodes.push(...n),n[0]);
  // the desk: everything, echoes included, passes the high-pass the engineer sweeps
  const desk=keep(c.createGain()),hp=keep(S.filter('highpass',20,1.2));desk.connect(hp);hp.connect(bus);
  // the tape echo: a dark loop through gentle saturation with a little wow; push the feedback past 1 and it
  // runs away, held in check by the tape
  const echo=keep(c.createGain()),delay=keep(c.createDelay(3)),tone=keep(S.filter('lowpass',2300,0.7)),thin=keep(S.filter('highpass',160,0.7));
  const sat=keep(c.createWaveShaper()),fb=keep(c.createGain()),wet=keep(c.createGain()),curve=new Float32Array(1024);
  for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=0.25*Math.tanh(4*x);}   // unity gain when quiet, never past 0.25
  sat.curve=curve;delay.delayTime.value=beat*0.75;fb.gain.value=0.45;wet.gain.value=0.6;
  echo.connect(delay);delay.connect(tone);tone.connect(thin);thin.connect(sat);sat.connect(fb);fb.connect(delay);sat.connect(wet);wet.connect(desk);
  const wow=keep(c.createOscillator()),wd=keep(c.createGain());wow.frequency.value=0.5;wd.gain.value=0.0012;wow.connect(wd);wd.connect(delay.delayTime);
  wow.start(t);wow.stop(t+length+20);wow.onended=()=>nodes.forEach(n=>n.disconnect());
  const spring=keep(c.createGain()),conv=keep(c.createConvolver()),shp=keep(S.filter('highpass',260,0.7)),sg=keep(c.createGain());
  conv.buffer=dubSpringIR(c);sg.gain.value=0.7;spring.connect(conv);conv.connect(shp);shp.connect(sg);sg.connect(desk);
  // the bass filter: a resonant low-pass on the bass's upper voice that the engineer sweeps open and shut
  const bassF=keep(S.filter('lowpass',400,7));bassF.connect(desk);
  // the ostinato's own echo: a dotted sixteenth, bouncing left and right, so every repeat falls between two notes
  const ost=keep(c.createGain()),ol=keep(c.createDelay(1)),or=keep(c.createDelay(1)),ot=keep(S.filter('lowpass',3800,0.7)),ofb=keep(c.createGain()),ow=keep(c.createGain());
  ol.delayTime.value=or.delayTime.value=beat*0.375;ofb.gain.value=0.55;ow.gain.value=0.75;
  ost.connect(ol);ol.connect(ow);ow.connect(S.pan(desk,-0.65));ol.connect(or);or.connect(ot);ot.connect(S.pan(desk,0.65));ot.connect(ofb);ofb.connect(ol);
  const rig={desk,hp,echo,fb,delay,spring,bassF,ost,base:beat*0.75};dubFx.set(bus,rig);return rig;
}
// the engineer's hands: the feedback pushed into runaway and back, the echo time dragged down and up, the high-pass swept
function dubThrow(rig,t,len,peak=1.03){const g=rig.fb.gain;g.setValueAtTime(0.45,t);g.linearRampToValueAtTime(peak,t+len*0.35);g.setValueAtTime(peak,t+len*0.7);g.linearRampToValueAtTime(0.45,t+len);}
function dubSwoop(rig,t,len){const d=rig.delay.delayTime;d.setValueAtTime(rig.base,t);d.linearRampToValueAtTime(rig.base*0.3,t+len*0.5);d.linearRampToValueAtTime(rig.base,t+len);}
function dubSweep(rig,t,len,top=1500){const f=rig.hp.frequency;f.setValueAtTime(20,t);f.exponentialRampToValueAtTime(top,t+len*0.75);f.exponentialRampToValueAtTime(20,t+len);}
function dubBassSweep(rig,t,len,lo,hi,times=1){   // open and shut the bass filter, once or as a wah
  const f=rig.bassF.frequency;f.setValueAtTime(lo,t);
  for(let k=0;k<times;k++){f.exponentialRampToValueAtTime(hi,t+(k+0.5)*len/times);f.exponentialRampToValueAtTime(lo,t+(k+1)*len/times);}
}
// every voice goes to the desk, with its own sends to the echo and the spring
Synth.prototype.dubOut=function(g,dest,ech,spr){
  const rig=dubFx.get(dest);if(!rig){g.connect(dest);return;}g.connect(rig.desk);
  for(const [amt,to] of [[ech,rig.echo],[spr,rig.spring]])if(amt){const s=this.ctx.createGain();s.gain.value=amt;g.connect(s);s.connect(to);}
};
// the bass: a clean round sine underneath, and above it a saw whose own filter snaps open on each note,
// then through the desk's swept bass filter
Synth.prototype.dubBass=function(t,f,dur,v,dest){
  const rig=dubFx.get(dest),end=t+dur+0.2,g=this.held(t,0.012,0.08*v,dur,0.07);
  this.osc('sine',f,t,end).connect(g);this.dubOut(g,dest,0,0);
  const lp=this.filter('lowpass',f*2,3),s=this.held(t,0.008,0.11*v,dur,0.08);
  lp.frequency.setValueAtTime(f*1.5,t);lp.frequency.exponentialRampToValueAtTime(5000,t+0.035);lp.frequency.exponentialRampToValueAtTime(Math.max(1500,f*24),t+Math.min(0.35,dur+0.05));
  this.osc('sawtooth',f,t,end).connect(lp);lp.connect(s);s.connect(rig?rig.bassF:dest);
};
// the ostinato: m (0..1) morphs it from a dry xylophone (sine and its bright overtone, a mellow filter) to an acid
// squelch (a saw, a resonant filter that snaps wide open and rings)
Synth.prototype.dubOst=function(t,f,dur,v,dest,m=0){
  const c=this.ctx,end=t+0.6,lp=this.filter('lowpass',f*4,0.8+14*m*m),g=this.amp(t,0.002,0.24*v,0.15+0.15*m,end);
  lp.frequency.setValueAtTime(Math.min(9000,f*(5+9*m)),t);lp.frequency.exponentialRampToValueAtTime(Math.min(5000,f*(1.6+1.6*m)),t+0.05+0.13*m);
  const mallet=c.createGain(),acid=c.createGain();mallet.gain.value=1-m;acid.gain.value=1.4*m;
  this.osc('sine',f,t,end).connect(mallet);
  const bar=this.osc('sine',f*3.93,t,end),bg=this.amp(t,0.001,0.35,0.05,end);bar.connect(bg);bg.connect(mallet);
  this.osc('sawtooth',f,t,end).connect(acid);
  mallet.connect(lp);acid.connect(lp);lp.connect(g);this.dubOut(g,dest,0,0.05);
  const rig=dubFx.get(dest);if(rig){const s=c.createGain();s.gain.value=0.7;g.connect(s);s.connect(rig.ost);}
};
Synth.prototype.dubKick=function(t,v,dest){
  const end=t+0.45,o=this.osc('sine',95,t,end),g=this.amp(t,0.003,0.8*v,0.4,end);o.frequency.exponentialRampToValueAtTime(48,t+0.12);o.connect(g);this.dubOut(g,dest,0,0);
};
Synth.prototype.dubRim=function(t,v,dest,ech=0,spr=0){   // the cross-stick on three
  const c=this.ctx,n=c.createBufferSource(),bp=this.filter('bandpass',1800,3),g=this.amp(t,0.001,0.7*v,0.06,t+0.1);
  n.buffer=this.noise;n.connect(bp);bp.connect(g);n.start(t,Math.random(),0.1);
  const o=this.osc('triangle',880,t,t+0.06),og=this.amp(t,0.001,0.25*v,0.04,t+0.06);o.connect(og);og.connect(g);
  this.dubOut(g,dest,ech,spr);
};
Synth.prototype.dubSnare=function(t,v,dest,ech=0,spr=0.3){
  const c=this.ctx,n=c.createBufferSource(),bp=this.filter('bandpass',2200,0.7),g=this.amp(t,0.001,0.3*v,0.2,t+0.25);
  n.buffer=this.noise;n.connect(bp);bp.connect(g);n.start(t,Math.random(),0.25);
  const o=this.osc('triangle',210,t,t+0.12),og=this.amp(t,0.001,0.25*v,0.1,t+0.12);o.frequency.exponentialRampToValueAtTime(160,t+0.08);o.connect(og);og.connect(g);
  this.dubOut(g,dest,ech,spr);
};
Synth.prototype.dubHat=function(t,v,dest,open){
  const c=this.ctx,n=c.createBufferSource(),hp=this.filter('highpass',7500,0.7),d=open?0.25:0.04,g=this.amp(t,0.001,0.12*v,d,t+d+0.05);
  n.buffer=this.noise;n.connect(hp);hp.connect(g);n.start(t,Math.random(),d+0.05);this.dubOut(g,dest,0,0);
};
Synth.prototype.dubSkank=function(t,fs,dur,v,dest,ech=0,spr=0.3){   // the chop on two and four: a bright synth chord, choked short
  const c=this.ctx,end=t+dur+0.1,lp=this.filter('lowpass',3200,2),hp=this.filter('highpass',450,0.7),g=this.held(t,0.002,0.05*v,dur,0.04);
  lp.frequency.setValueAtTime(3600,t);lp.frequency.exponentialRampToValueAtTime(900,t+dur);
  for(const f of fs)for(const k of [0.997,1.003])this.osc('sawtooth',f*k,t,end).connect(hp);
  hp.connect(lp);lp.connect(g);this.dubOut(g,dest,ech,spr);
};
Synth.prototype.dubBubble=function(t,fs,dur,v,dest){   // the organ bubble on the off-beats
  const c=this.ctx,end=t+dur+0.1,lp=this.filter('lowpass',1600,0.8),g=this.held(t,0.006,0.035*v,dur,0.05);
  for(const f of fs){this.osc('sine',f,t,end).connect(lp);const o=this.osc('square',f*2,t,end),q=c.createGain();q.gain.value=0.25;o.connect(q);q.connect(lp);}
  lp.connect(g);this.dubOut(g,dest,0,0.1);
};
Synth.prototype.dubLead=function(t,f,dur,v,dest,ech=0.55,spr=0.15){   // a warm analogue lead, melodica-ish, always half in the echo
  const c=this.ctx,end=t+dur+0.3,lp=this.filter('lowpass',1500,4),g=this.held(t,0.035,0.08*v,dur,0.18);
  lp.frequency.setValueAtTime(700,t);lp.frequency.exponentialRampToValueAtTime(2200,t+0.08);lp.frequency.exponentialRampToValueAtTime(1100,t+0.5);
  const a=this.osc('sawtooth',f*0.998,t,end),b=this.osc('sawtooth',f*1.002,t,end),q=this.osc('square',f,t,end),qg=c.createGain();qg.gain.value=0.4;
  a.connect(lp);b.connect(lp);q.connect(qg);qg.connect(lp);this.vibrato(a,t,5,f*0.006,0.3).stop(end);
  lp.connect(g);this.dubOut(g,dest,ech,spr);
};
Synth.prototype.dubSiren=function(t,f,dur,v,dest){   // the siren box: a square swooping on a speeding triangle, straight into the echo
  const c=this.ctx,end=t+dur+0.2,o=this.osc('square',f,t,end),lp=this.filter('lowpass',2500,1),g=this.held(t,0.05,0.04*v,dur,0.15);
  const l=c.createOscillator(),lg=c.createGain();l.type='triangle';l.frequency.setValueAtTime(1.5,t);l.frequency.exponentialRampToValueAtTime(9,t+dur);
  lg.gain.value=700;l.connect(lg);lg.connect(o.detune);l.start(t);l.stop(end);o.frequency.exponentialRampToValueAtTime(f*0.6,t+dur);
  o.connect(lp);lp.connect(g);this.dubOut(g,dest,0.9,0.2);
};
Synth.prototype.dubWind=function(t,dur,v,dest){   // space wind: noise through a slowly wandering resonant band
  const c=this.ctx,n=c.createBufferSource(),bp=this.filter('bandpass',600,9),g=this.held(t,dur*0.3,0.12*v,dur*0.6,dur*0.4);
  n.buffer=this.noise;n.loop=true;bp.frequency.setValueAtTime(400,t);bp.frequency.exponentialRampToValueAtTime(2400,t+dur*0.5);bp.frequency.exponentialRampToValueAtTime(300,t+dur);
  n.connect(bp);bp.connect(g);n.start(t);n.stop(t+dur*1.05);this.dubOut(g,dest,0.4,0);
};
{
  const quiet=n=>bars(rests(n,4));
  // the riddim: Am | Bb | Fm | E - the flat second, a minor chord from a distant key and a hard major pull home,
  // so it never quite sounds of this world; the bass comes in after the one
  const RIDDIM=bars('r:0.5 A2:0.5 A2:0.25 C3:0.75 E3:0.5 r:0.5 D3:0.5 C3:0.5 | r:0.5 Bb2:0.5 Bb2:0.25 D3:0.75 F3:0.5 r:0.5 E3:0.5 D3:0.25 Bb2:0.25 | '+
    'r:0.5 F2:0.5 F2:0.25 Ab2:0.75 C3:0.5 r:0.5 Ab2:0.5 C3:0.5 | r:0.5 E2:0.5 E2:0.25 G#2:0.75 B2:0.5 r:0.5 D3:0.5 C3:0.25 B2:0.25');
  const tuneA=bars('r:1 E5:0.5 A5:1 G5:0.5 E5:1 | F5:1.5 D5:0.5 Bb4:2 | r:1 C5:0.5 F5:1 Ab5:0.5 G5:1 | G#5:3 r:1 | '+
    'r:1 A5:0.5 C6:1 B5:0.5 A5:1 | Bb5:1.5 F5:0.5 D5:2 | r:0.5 Ab4:0.5 C5:0.5 F5:0.5 Eb5:1 C5:1 | B4:1 G#4:1 E5:2');
  const tuneB=bars('A5:0.5 C6:0.5 E6:1 r:0.5 D6:0.5 C6:1 | D6:2 r:1 Bb5:0.5 A5:0.5 | Ab5:1.5 G5:0.5 F5:1 C6:1 | B5:0.5 G#5:0.5 E5:3 | '+
    'E6:2 D6:0.5 C6:0.5 A5:1 | F6:1 D6:1 Bb5:2 | C6:0.5 Bb5:0.5 Ab5:0.5 G5:0.5 F5:2 | G#5:1 B5:1 r:2');
  const frags=bars('r:4 | r:2 F5:0.5 Bb5:1.5 | r:4 | r:4 | r:4 | r:3 D6:1 | r:4 | r:1 G#5:0.5 E5:2.5');
  const space=bars('r:4 | r:2 F5:2 | r:4 | r:1 E6:3 | r:4 | r:3 D6:1 | r:4 | r:4');
  TUNES.splice(TUNES.findIndex(t=>t.id==='pulsePanic')+1,0,{
    id:'dub',title:'Echo Chamber',
    meta:'Roots dub · A minor, strangely · 74 bpm one-drop · swept analogue bass, tape echo, spring reverb and a siren',
    desc:'Seventies dub from a studio in orbit. A one-drop riddim on an off-world progression (A minor, B flat, F minor, E), a deep bassline whose resonant filter is swept open and shut, skanks and an organ bubble, mixed live: rimshots and chops thrown into a tape echo, a spring tank splashing, the whole mix swept through a high-pass, the drums and bass muted and dropped back in, the echo pushed until it runs away, and a siren wailing through it all.',
    bpm:74,beats:4,send:0.2,gain:1,
    // intro 4 | riddim 8 | dub 8 | drop 4 (no bass) | riddim 8 | space 8 | riddim 4 | out 4
    sections:[[0,'intro'],[4,'riddim'],[12,'dub'],[20,'drop'],[24,'riddim 2'],[32,'space'],[40,'riddim 3'],[44,'out']],
    chords:Array.from({length:48},(_,b)=>b===47?'Am':['Am','Bb','Fm','E'][b%4]),
    parts:[{inst:'dubLead',vel:1,shift:0,notes:[...quiet(4),...tuneA,...frags,...quiet(4),...tuneB,...space,...tuneA.slice(0,4),...quiet(4)]}],
    accomp(S,bus,t,b,ch,beat){
      const rig=b===0||!dubFx.get(bus)?dubRig(S,bus,t,this.chords.length*4*beat,beat):dubFx.get(bus);
      const sec=sectionOf(this,b),bar=4*beat,last=b===this.chords.length-1,r=ch.root,at=x=>t+x*beat,sw=x=>x%1?Math.floor(x)+0.62:x;
      const high=ch.tones.map(n=>hz(60+(r+n)%12)),low=ch.tones.map(n=>hz(52+(r+n+8)%12));
      // the bass filter's moves, section by section, each covering the bars up to the next
      if(sec==='intro'&&b===1)dubBassSweep(rig,t,bar*3,160,1000);
      else if(sec==='dub'&&b%4===0)dubBassSweep(rig,t,bar*4,110,2600);
      else if(sec==='space'&&b%2===0)dubBassSweep(rig,t,bar*2,b<36?120:150,b<36?2800:2200,b<36?1:4);
      else if(sec==='out'){if(b===44)dubBassSweep(rig,t,bar*2,180,1300);if(b===46)dubBassSweep(rig,t,bar,200,1800,2);if(last)dubBassSweep(rig,t,bar*1.4,90,2400);}
      else if(sec.startsWith('riddim')&&b%2===0)dubBassSweep(rig,t,bar*2,180,sec==='riddim 2'?1600:1100,sec==='riddim 2'&&b%4===2?2:1);
      // the ostinato never stops: sixteenths around the chord, slowly turning from xylophone to acid over the whole track
      {const n=this.chords.length,m=Math.min(1,Math.pow(b/(n-6),1.3)),base=57+(r+3)%12,T=[0,1,2].flatMap(o=>ch.tones.slice(0,3).map(k=>base+k+o*12));
        const pat=[0,2,4,3,1,5,3,2,0,4,2,5,3,1,6,4],count=last?8:16;
        for(let k=0;k<count;k++)S.dubOst(at(k/4+(k%2?0.03:0)),hz(T[pat[k]]),beat*0.22,(k%4===0?1:k%2?0.55:0.75)*(last?1-k/9:1),bus,m);}
      const drop=(v=1,e=0.12)=>{S.dubKick(at(2),v,bus);S.dubRim(at(2),v,bus,e,0.12);};
      const hats=(v=1,sparse)=>{for(let k=0;k<8;k+=sparse?2:1)S.dubHat(at(sw(k/2)),v*(k%2?0.55:1),bus,k===7&&b%4===3);};
      const skank=(v=1,e=0,s=0.3,which=[1,3])=>which.forEach(x=>S.dubSkank(at(x),high,beat*0.28,v,bus,e,s));
      const bubble=v=>[0.5,1.5,2.5,3.5].forEach(x=>S.dubBubble(at(sw(x)),low,beat*0.3,v,bus));
      const bass=(v=1)=>{for(const ev of RIDDIM[b%4])for(const m of ev.midi)S.dubBass(at(ev.at),hz(m-12),ev.beats*beat*0.92,v,bus);};
      const roll=()=>{for(let k=0;k<6;k++)S.dubSnare(at(3+k/6),0.35+k*0.11,bus,k===5?0.6:0,0.25);};
      const full=()=>{bass();drop();hats();skank();bubble(1);if(b%4===3)S.dubSkank(at(3),high,beat*0.28,1,bus,0.75,0.4);};
      if(sec==='intro'){
        if(b===0){S.dubSiren(t,hz(76),bar*1.5,1,bus);S.dubWind(t,bar*3,0.8,bus);S.dubRim(at(2),1,bus,1,0.4);S.dubKick(at(2),0.8,bus);}
        if(b>=1){bass();drop();hats(b===1?0.6:1);}
        if(b>=2)skank(0.9,0,0.3);
        if(b===3){bubble(0.8);roll();}
        return;
      }
      if(sec==='dub'){   // drum and bass; the chops only come back as echoes
        const k=b-12;bass();drop(1,0.5);hats(0.8,k%2===1);
        if(k%2===1)S.dubSkank(at(3),high,beat*0.28,1,bus,0.95,0.6);
        if(k===0)S.dubSnare(at(0),1,bus,0.4,1);
        if(k===4)dubSweep(rig,t,bar*2,1800);
        if(k===6)S.dubSiren(at(1),hz(79),bar*1.2,0.9,bus);
        if(k===7){dubThrow(rig,at(2),bar*1.2);dubSwoop(rig,at(2),bar*0.9);S.dubRim(at(2),1,bus,1,0.3);}
        return;
      }
      if(sec==='drop'){   // the bass pulled out: just the drop, the chops and the spring
        const k=b-20;drop(1,0.35);hats();skank(1,0.4,0.5);
        if(k===0)S.dubSnare(at(0),1,bus,0.5,1.2);
        if(k>=2)bubble(1);
        if(k===3)roll();
        return;
      }
      if(sec==='space'){   // the drums fall out; bass, wind, siren and the echo running away with itself
        const k=b-32;bass(k<4?1:0.9);
        if(k===0){S.dubSnare(at(0),1,bus,0.6,1.2);S.dubWind(t,bar*4,1,bus);S.dubSiren(at(1),hz(72),bar*1.5,0.9,bus);}
        if(k<4){if(k%2===1)S.dubRim(at(2),1,bus,0.95,0.3);S.dubKick(at(2),0.6,bus);}
        else{drop(1,0.3);hats(0.9,k===4);if(k%2===0)S.dubSkank(at(3),high,beat*0.28,1,bus,0.9,0.5);}
        if(k===2){dubThrow(rig,at(1),bar*1.6,1.05);dubSwoop(rig,at(1.5),bar);}
        if(k===5)dubSweep(rig,t,bar*1.5,1200);
        if(k===7)roll();
        return;
      }
      if(sec==='out'){
        const k=b-44;
        if(k<2)full();
        else if(k===2){bass();S.dubKick(at(2),1,bus);S.dubRim(at(2),1,bus,0.8,0.3);S.dubSkank(at(3),high,beat*0.28,1,bus,0.9,0.5);S.dubSiren(at(1),hz(76),bar,0.8,bus);}
        if(last){   // one last note on the bass, one rimshot thrown into the echo, and the tape left running
          S.dubBass(t,hz(33),beat*2,1,bus);S.dubKick(t,1,bus);S.dubRim(at(0),1,bus,1,0.5);S.dubSnare(at(2),0.8,bus,0.9,0.8);
          dubThrow(rig,at(0.5),bar*1.6,0.98);dubSweep(rig,at(1),bar*1.2,900);
        }
        return;
      }
      full();
      if(b===11||b===31||b===43)roll();
      if(b===24)S.dubSnare(at(0),0.9,bus,0.3,1);
      if(b===28)S.dubSiren(at(2),hz(81),bar*0.8,0.7,bus);
      if(b===40)dubSweep(rig,t,bar,1000);
    }
  });
}

// ===================================================================== Riptide Nebula
// Seventies space rock meets surf: Echo Chamber's xylophone-to-acid ostinato (its filter now sweeping open and shut
// every few bars), a twangy surf guitar soaked in the spring tank, surf slides, a Wipe Out tom break, and
// jet-flanged pads and whooshes from the Event Horizon rig. E Phrygian dominant, the Misirlou scale.
// the surf guitar, gone a little Stylophone: a thin, buzzy pulse with a nasal bite and a light vibrato, still twanging
// on each pick, tremolo-picked on long notes and dripping into the spring. The twin leads use it too, panned apart.
// drive (optional) pushes each note through a soft-clipping stage, for a grittier Stylophone.
function surfVoice(pan,drive=0){return function(t,f,dur,v,dest){
  const c=this.ctx,picks=dur>0.5?Math.max(2,Math.round(dur/0.06)):1,step=dur/picks,out=pan&&c.createStereoPanner?c.createStereoPanner():c.createGain();
  if(pan)out.pan.value=pan;this.dubOut(out,dest,0.12,0.9);
  let into=out;
  if(drive){const pre=c.createGain(),sh=c.createWaveShaper(),tame=this.filter('lowpass',5200,0.7),post=c.createGain();
    sh.curve=new Float32Array(1024).map((_,i)=>Math.tanh(drive*(i*2/1023-1))/Math.tanh(drive));sh.oversample='2x';pre.gain.value=7;post.gain.value=0.11;
    pre.connect(sh);sh.connect(tame);tame.connect(post);post.connect(out);into=pre;}
  for(let k=0;k<picks;k++){
    const s=t+k*step,len=picks>1?step*1.05:dur,end=s+len+0.3,lp=this.filter('lowpass',7000,0.9),hp=this.filter('highpass',280,0.7),nose=this.filter('peaking',1400,1.2);
    const g=this.held(s,0.002,0.1*v*(picks>1?(k%2?0.8:1):1),len,picks>1?0.03:0.2);
    nose.gain.value=7;lp.frequency.setValueAtTime(7000,s);lp.frequency.exponentialRampToValueAtTime(3200,s+Math.min(0.3,len+0.05));
    const p=this.pwOsc(f,s,end,0.18);
    p.saw.frequency.setValueAtTime(f*1.01,s);p.saw.frequency.exponentialRampToValueAtTime(f,s+0.03);   // the twang: a string pulled sharp by the pick
    const l=this.osc('sine',5.5,s,end),d=c.createGain();d.gain.value=10;l.connect(d);d.connect(p.saw.detune);
    p.out.connect(hp);hp.connect(nose);nose.connect(lp);lp.connect(g);g.connect(into);
  }
};}
Synth.prototype.surfGtr=surfVoice(0);Synth.prototype.twinHi=surfVoice(-0.7);Synth.prototype.twinLo=surfVoice(0.7);
Synth.prototype.styloDrive=surfVoice(0,3);Synth.prototype.epicHi=surfVoice(-0.7,3);Synth.prototype.epicLo=surfVoice(0.7,3);
// space-epic sounds: the Apollo radio tone (2525 Hz opens a transmission, 2475 Hz closes it), a heartbeat, a countdown beep
Synth.prototype.quindar=function(t,v,dest,close){
  const o=this.osc('sine',close?2475:2525,t,t+0.3),g=this.held(t,0.005,0.05*v,0.25,0.01);o.connect(g);this.dubOut(g,dest,0.3,0);
  this.hit(t,0.015*v,dest,2000,0.6,0.6,'bandpass');
};
Synth.prototype.heartbeat=function(t,v,dest){   // lub-dub
  for(const [d,a] of [[0,1],[0.22,0.7]]){const o=this.osc('sine',58,t+d,t+d+0.3),g=this.amp(t+d,0.01,0.35*v*a,0.25,t+d+0.3);o.frequency.exponentialRampToValueAtTime(40,t+d+0.2);o.connect(g);g.connect(dest);}
};
Synth.prototype.beep=function(t,f,v,dest){const o=this.osc('sine',f,t,t+0.2),g=this.held(t,0.003,0.07*v,0.12,0.02);o.connect(g);this.dubOut(g,dest,0.25,0.1);};
// the epic's ray gun: two buzzing saws ring-modulated for a metal edge, diving from about f*1.5 to the low hundreds
// through a resonant filter that follows them down, with a crack of noise at the front - a 70s blaster, not a chirp
Synth.prototype.epicLaser=function(t,f,v,dest){
  const c=this.ctx,len=0.45,end=t+len+0.1,a=this.osc('sawtooth',f*1.5,t,end),b=this.osc('sawtooth',f*1.5*1.012,t,end);
  for(const o of [a,b])o.frequency.exponentialRampToValueAtTime(Math.max(70,f/8),t+len);
  const ring=c.createGain(),rm=this.osc('square',73,t,end);ring.gain.value=0;rm.connect(ring.gain);a.connect(ring);b.connect(ring);
  const lp=this.filter('lowpass',4000,6),g=this.amp(t,0.003,0.32*v,len,end);lp.frequency.setValueAtTime(4000,t);lp.frequency.exponentialRampToValueAtTime(260,t+len);
  ring.connect(lp);lp.connect(g);this.dubOut(g,dest,0.35,0.15);
  this.hit(t,0.08*v,g,3000,0.7,0.03,'bandpass');
};
// a picked rock bass: saw and triangle, a gentle pluck filter with no resonance, light drive and a warm low body
Synth.prototype.epicBass=function(t,f,dur,v,dest){
  const c=this.ctx,end=t+dur+0.2,lp=this.filter('lowpass',900,0.8),body=this.filter('peaking',110,1),sh=c.createWaveShaper(),g=this.held(t,0.004,0.09*v,dur,0.09);
  lp.frequency.setValueAtTime(1500,t);lp.frequency.exponentialRampToValueAtTime(600,t+0.18);body.gain.value=4;
  sh.curve=new Float32Array(512).map((_,i)=>Math.tanh(1.5*(i*2/511-1))/Math.tanh(1.5));
  const s=this.osc('sawtooth',f,t,end),tr=this.osc('triangle',f,t,end),tg=c.createGain();tg.gain.value=0.8;s.connect(lp);tr.connect(tg);tg.connect(lp);
  lp.connect(sh);sh.connect(body);body.connect(g);g.connect(dest);
};
// a fat 70s rock snare: two low shell tones, long dark wires, plenty of room
Synth.prototype.epicSnare=function(t,v,dest){
  const c=this.ctx,n=c.createBufferSource(),hp=this.filter('highpass',1100,0.7),lp=this.filter('lowpass',5500,0.7),g=this.amp(t,0.003,0.4*v,0.32,t+0.4),room=c.createGain();
  n.buffer=this.noise;n.connect(hp);hp.connect(lp);lp.connect(g);g.connect(dest);room.gain.value=0.7;g.connect(room);room.connect(this.verb);n.start(t,Math.random(),0.4);
  for(const [f,a,d] of [[180,0.32,0.2],[330,0.14,0.12]]){const o=this.osc('sine',f,t,t+d+0.05),og=this.amp(t,0.002,a*v,d,t+d+0.05);o.frequency.exponentialRampToValueAtTime(f*0.85,t+d);o.connect(og);og.connect(dest);og.connect(room);}
};
// the space flute: a breathy sine with its octave, a puff of air at the start of each note, a slow vibrato that
// arrives late, and plenty of echo and spring
Synth.prototype.spaceFlute=function(t,f,dur,v,dest){
  const c=this.ctx,end=t+dur+0.5,g=this.held(t,0.09,0.09*v,dur,0.35),mix=c.createGain();
  const o=this.osc('sine',f,t,end),o2=this.osc('sine',f*2,t,end),g2=c.createGain();g2.gain.value=0.12;o.connect(mix);o2.connect(g2);g2.connect(mix);
  o.frequency.setValueAtTime(f*0.985,t);o.frequency.exponentialRampToValueAtTime(f,t+0.12);
  const l=this.osc('sine',4.8,t,end),d=c.createGain();d.gain.setValueAtTime(0,t);d.gain.setValueAtTime(0,t+0.35);d.gain.linearRampToValueAtTime(14,t+1);l.connect(d);d.connect(o.detune);d.connect(o2.detune);
  const n=c.createBufferSource(),bp=this.filter('bandpass',f*2,1.5),ng=c.createGain();n.buffer=this.noise;n.loop=true;
  ng.gain.setValueAtTime(0.0001,t);ng.gain.exponentialRampToValueAtTime(0.5,t+0.04);ng.gain.exponentialRampToValueAtTime(0.12,t+0.25);   // the chiff, then a steady breath
  n.connect(bp);bp.connect(ng);ng.connect(mix);n.start(t,Math.random());n.stop(end);
  mix.connect(g);this.dubOut(g,dest,0.45,0.35);
};
// the surf slide: a pick scraped down the low string, tremolo-picked all the way, into the spring
Synth.prototype.surfSlide=function(t,dur,v,dest){
  const c=this.ctx,end=t+dur+0.3,o=this.osc('sawtooth',700,t,end),lp=this.filter('lowpass',3200,2),chop=c.createGain(),env=this.held(t,0.01,0.13*v,dur,0.2);
  o.frequency.exponentialRampToValueAtTime(70,t+dur);lp.frequency.exponentialRampToValueAtTime(450,t+dur);
  const trem=this.osc('square',17,t,end),tg=c.createGain();chop.gain.value=0.5;tg.gain.value=0.5;trem.connect(tg);tg.connect(chop.gain);
  o.connect(lp);lp.connect(chop);chop.connect(env);this.dubOut(env,dest,0.2,1);
};
// the Radiophonic bass: a plucked string made from an oscillator, its filter snapping shut on every note
Synth.prototype.whoBass=function(t,f,dur,v,dest){
  const end=t+dur+0.25,lp=this.filter('lowpass',2400,4),g=this.amp(t,0.002,0.3*v,Math.max(0.12,dur),end);
  lp.frequency.setValueAtTime(2600,t);lp.frequency.exponentialRampToValueAtTime(160,t+0.12);
  this.osc('sawtooth',f,t,end).connect(lp);lp.connect(g);this.dubOut(g,dest,0.15,0);
  const s=this.osc('sine',f,t,end),sg=this.amp(t,0.002,0.3*v,0.2,end);s.connect(sg);sg.connect(dest);
};
// the Radiophonic tune: a pure oscillator gliding between pitches - points are [beat, midi], a repeated pitch holds
Synth.prototype.whoSwoop=function(t,beat,points,v,dest){
  const c=this.ctx,len=points[points.length-1][0]*beat,end=t+len+0.6,f0=hz(points[0][1]),g=c.createGain(),g2=c.createGain();
  const oscs=[this.osc('sine',f0,t,end),this.osc('triangle',f0,t,end)];g2.gain.value=0.25;
  for(const o of oscs){o.frequency.setValueAtTime(f0,t);for(const [b,m] of points.slice(1))o.frequency.exponentialRampToValueAtTime(hz(m),t+b*beat);}
  const l=this.osc('sine',5.5,t,end),d=c.createGain();d.gain.value=15;l.connect(d);oscs.forEach(o=>d.connect(o.detune));
  g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.14*v,t+0.15);g.gain.setValueAtTime(0.14*v,t+len-0.1);g.gain.exponentialRampToValueAtTime(0.0001,t+len+0.5);
  oscs[0].connect(g);oscs[1].connect(g2);g2.connect(g);this.dubOut(g,dest,0.5,0.2);
};
{
  const quiet=n=>bars(rests(n,4));
  const themeA=bars('E5:1 F5:1 G#5:1 A5:1 | B5:2 G#5:1 A5:1 | C6:2 B5:1 A5:1 | B5:3 r:1 | B5:1 C6:1 D6:1 B5:1 | C6:1 A5:1 F5:1 A5:1 | G#5:1 F5:1 E5:2 | E5:3 r:1 | '+
    'E5:0.5 F5:0.5 G#5:0.5 A5:0.5 B5:2 | E6:2 D6:1 C6:1 | C6:1.5 B5:0.5 A5:2 | F5:1 A5:1 C6:2 | D6:2 B5:1 G5:1 | A5:1 C6:1 B5:1 A5:1 | G#5:1 F5:0.5 E5:0.5 F5:1 G#5:1 | E5:4');
  const themeB=bars('A5:4 | B5:2 D6:2 | C6:3 A5:1 | B5:2 G#5:2 | E6:4 | D6:2 B5:2 | C6:2 A5:1 F5:1 | G#5:4 | '+
    'A5:1 C6:1 E6:2 | D6:1 B5:1 G5:2 | A5:1 C6:1 F6:2 | E6:2 D6:1 B5:1 | C6:4 | B5:4 | A5:4 | G#5:2 B5:2');
  const solo=bars(
    'E5:0.25 F5:0.25 G#5:0.25 A5:0.25 B5:0.25 A5:0.25 G#5:0.25 F5:0.25 E5:2 | B5:0.25 C6:0.25 B5:0.25 A5:0.25 G#5:0.25 A5:0.25 G#5:0.25 F5:0.25 E5:1 B4:1 | '+
    'F5:0.25 A5:0.25 C6:0.25 F6:0.25 E6:0.25 C6:0.25 A5:0.25 F5:0.25 A5:2 | C6:0.5 B5:0.5 A5:0.5 G#5:0.5 F5:2 | '+
    'E6:4 | E6:0.25 D6:0.25 C6:0.25 B5:0.25 C6:0.25 B5:0.25 A5:0.25 G#5:0.25 A5:0.25 G#5:0.25 F5:0.25 E5:0.25 F5:1 | '+
    'F5:0.5 A5:0.5 C6:0.5 F6:0.5 A6:2 | G#6:0.25 A6:0.25 G#6:0.25 F6:0.25 E6:0.25 F6:0.25 E6:0.25 C6:0.25 A5:2 | '+
    'B5:0.5 E6:0.5 B5:0.5 E6:0.5 G#6:2 | F6:1 E6:1 D6:1 C6:1 | C6:0.25 D6:0.25 C6:0.25 B5:0.25 A5:0.25 B5:0.25 A5:0.25 G#5:0.25 F5:2 | A5:4 | '+
    'E5:0.25 G#5:0.25 B5:0.25 E6:0.25 E5:0.25 G#5:0.25 B5:0.25 E6:0.25 G#6:2 | F6:0.25 E6:0.25 D6:0.25 C6:0.25 B5:0.25 A5:0.25 G#5:0.25 F5:0.25 E5:2 | '+
    'F5:0.25 A5:0.25 C6:0.25 F6:0.25 F5:0.25 A5:0.25 C6:0.25 F6:0.25 A6:2 | G#6:0.5 F6:0.5 E6:0.5 D6:0.5 C6:0.5 B5:0.5 A5:0.5 G#5:0.5');
  const outro=[...themeB.slice(0,4),...bars('A5:4 | G5:4 | F5:4 | E5:4')];
  const vamp=['E','E','F','F','G','F','E','E'],anda=['Am','G','F','E'];
  // the twin-lead outro, and the second guitar a third below in A minor (harmonic minor, with its G sharp, over E)
  const twinChords=['Am','F','G','E','Am','F','G','E','F','G','Am','Am','F','G','E','E'],finaleChords=['Am','F','E','E'];
  const twin=bars('E5:0.5 A5:0.5 B5:0.5 C6:0.5 B5:1 A5:1 | C6:0.5 A5:0.5 C6:0.5 F6:0.5 E6:1 C6:1 | D6:1.5 B5:0.5 G5:1 B5:1 | G#5:0.5 A5:0.5 B5:0.5 D6:0.5 E6:2 | '+
    'E6:0.5 D6:0.5 C6:0.5 B5:0.5 A5:1 E5:1 | F5:0.5 A5:0.5 C6:0.5 A5:0.5 F6:2 | G5:0.5 B5:0.5 D6:0.5 B5:0.5 G6:2 | G#5:1 B5:1 E6:2 | '+
    'A5:0.5 A5:0.25 A5:0.25 C6:0.5 C6:0.25 C6:0.25 F6:0.5 F6:0.25 F6:0.25 E6:1 | B5:0.5 B5:0.25 B5:0.25 D6:0.5 D6:0.25 D6:0.25 G6:1 F6:1 | '+
    'E6:0.5 E6:0.25 E6:0.25 C6:0.5 C6:0.25 C6:0.25 A5:2 | B5:0.5 C6:0.5 D6:0.5 E6:0.5 F6:0.5 E6:0.5 D6:0.5 C6:0.5 | '+
    'C6:3 A5:1 | B5:2 D6:2 | E6:0.25 D6:0.25 C6:0.25 B5:0.25 A5:0.25 G#5:0.25 F5:0.25 E5:0.25 G#5:2 | B5:4 | '+
    'A5:1 C6:1 E6:2 | F6:4 | G#6:4 | r:4');
  const natural=[9,11,0,2,4,5,7],harmonic=[9,11,0,2,4,5,8];
  const thirdBelow=(m,chord)=>{const sc=chord==='E'?harmonic:natural,i=sc.indexOf(m%12);return i<0?m-3:m-((m%12-sc[(i+5)%7]+12)%12);};
  const twinLow=twin.map((bar,i)=>bar.map(ev=>({...ev,midi:ev.midi.map(m=>thirdBelow(m,[...twinChords,...finaleChords][i]))})));
  TUNES.splice(TUNES.findIndex(t=>t.id==='dub')+1,0,{
    id:'riptide',title:'Riptide Nebula',
    meta:'Space surf · E Phrygian dominant · 168 bpm · surf guitar, a Radiophonic sting, a sweeping acid ostinato and a twin-lead outro',
    desc:'Surf rock caught in the pull of a nebula. The xylophone ostinato from Echo Chamber races in sixteenths, its filter swelling from woody to acid squelch and back every few bars, while a twangy guitar soaked in the spring tank tremolo-picks a Misirlou-style theme. Surf slides, a Radiophonic sting of galloping plucked bass and swooping oscillator, a pounding Wipe Out tom break under a jet, jet-flanged pads in the A-minor space section, a picked solo, and a long galloping outro of twin harmonised lead guitars that ends on a cliffhanger scream.',
    bpm:168,beats:4,send:0.2,gain:0.75,
    // intro 8 | A 16 | B 16 (space) | sting 12 (Radiophonic) | break 8 (toms) | solo 16 | A2 16 | outro 8 | twin 16 | finale 4
    sections:[[0,'intro'],[8,'A'],[24,'B'],[40,'sting'],[52,'break'],[60,'solo'],[76,'A2'],[92,'outro'],[100,'twin'],[116,'finale']],
    chords:['E','E','E','E','F','F','E','E',...vamp,...vamp,...anda,...anda,...anda,...anda,'E','E','E','E','E','E','E','E','F','F','E','E','E','E','F','F','E','E','F','F',
      ...Array(4).fill(['E','E','F','F']).flat(),...vamp,...vamp,...anda,...anda,...twinChords,...finaleChords],
    parts:[
      {inst:'surfGtr',vel:1,shift:0,notes:[...quiet(8),...themeA,...themeB,...quiet(20),...solo,...themeA,...outro,...quiet(20)]},
      {inst:'twinHi',vel:1,shift:0,notes:[...quiet(100),...twin]},
      {inst:'twinLo',vel:0.85,shift:0,notes:[...quiet(100),...twinLow]}],
    accomp(S,bus,t,b,ch,beat){
      if(b===0||!dubFx.get(bus)||!ehFx.get(bus)){const len=this.chords.length*4*beat;ehRig(S,bus,t,len,beat);dubRig(S,bus,t,len,beat);}
      const fx=ehFx.get(bus),rig=dubFx.get(bus),sec=sectionOf(this,b),bar=4*beat,last=b===this.chords.length-1,r=ch.root,at=x=>t+x*beat;
      const bass=hz(28+(r+8)%12),gtr=hz(40+(r+8)%12),pad=ch.tones.map(k=>55+(r+k+5)%12),BV=1.7,heavy=sec==='twin'||sec==='finale';
      // the ostinato, its filter swelling open and shut every four bars (every two in the break); it rests for the sting
      if(sec!=='sting'){const period=(sec==='break'?2:4)*4,base=57+(r+3)%12,T=[0,1,2].flatMap(o=>ch.tones.slice(0,3).map(k=>base+k+o*12));
        const pat=[0,2,4,3,1,5,3,2,0,4,2,5,3,1,6,4],count=last?8:16;
        for(let k=0;k<count;k++){const m=0.5-0.5*Math.cos(2*Math.PI*(b*4+k/4)/period);
          S.dubOst(at(k/4),hz(T[pat[k]]),beat*0.22,(k%4===0?1:k%2?0.55:0.75)*(last?1-k/9:1)*(b<2?0.6+b*0.2:1)*(heavy?0.6:1),bus,m);}}
      const K=(x,v)=>S.ehKick(at(x),v,bus),SN=(x,v)=>S.ehSnare(at(x),v,bus),H=(x,v,o)=>S.ehHat(at(x),v,fx.kit,o);
      const tom=(x,v,f)=>S.ehTom(at(x),f,v,bus);
      const bass8=(v=1)=>{for(let k=0;k<8;k++)S.ehBass(at(k/2),k===3||k===7?bass*2:bass,beat*0.4,(k%2?0.75:1)*v*BV,bus);};
      const gallop=(f,v,fn)=>{for(let q=0;q<4;q++)[0,0.5,0.75].forEach((x,i)=>fn(at(q+x),f,beat*(i?0.2:0.4),v*(i?0.8:1)));};   // da-da-dum
      const surfBeat=(v=1,sixteenths)=>{K(0,v);K(2,v);K(2.5,0.6*v);SN(1,v);SN(3,v);const n=sixteenths?16:8;for(let k=0;k<n;k++)H(k*4/n,(k%(n/4)===0?0.8:0.45)*v,k===n-1&&b%2);};
      const pound=(v=1)=>{for(let k=0;k<8;k++)tom(k/2,0.7*v*(k%2?0.7:1),k%4<2?95:130);K(0,v);K(2,v);};   // Wipe Out
      const fill=()=>[260,220,185,150,125,105,95,85].forEach((f,k)=>tom(2+k*0.25,0.9,f));
      const pads=(v,d=bar*0.97)=>pad.forEach(m=>S.ehPad(t,hz(m),d,v,bus));
      const crash=()=>S.ehCrash(t,1,fx.kit);
      if(sec==='intro'){
        if(b===0){S.surfSlide(t,bar*1.5,1,bus);S.ehSweep(t,hz(52),bar*4,0.8,bus,true);}
        if(b>=4){pound(0.5+0.12*(b-4));bass8(0.6+0.1*(b-4));}
        if(b===7)fill();
        return;
      }
      if(sec==='B'){   // the space section: half-time, pads through the jet, whooshes
        K(0,0.9);SN(2,0.9);for(let k=0;k<8;k++)H(k/2,k%2?0.35:0.6);
        S.ehBass(at(0),bass,beat*1.8,BV,bus);S.ehBass(at(2.5),bass,beat*0.4,0.7*BV,bus);S.ehBass(at(3),bass*2,beat*0.8,0.7*BV,bus);pads(0.8);
        if(b===24){crash();S.ehSweep(t,hz(64),bar*4,0.8,bus,false);}
        if(b===32)S.ehSweep(t,hz(45),bar*4,0.8,bus,true);
        if(b===39)fill();
        return;
      }
      if(sec==='sting'){   // a Radiophonic interlude: the band stops for the galloping plucked bass, three swooping phrases
        // each higher than the last, and the wind; the drums creep back in underneath to build into the break
        const k=b-40,root=40+(r+8)%12;
        for(let q=0;q<4;q++)[0,0.5,0.75].forEach((x,i)=>{const n=k===11&&q>=2?[[43,43,45],[47,47,52]][q-2][i]:i===0&&q%2===1?root+12:root;
          S.whoBass(at(q+x),hz(n),beat*(i?0.22:0.45),i?0.75:1,bus);});
        const phrases=[[[0,64],[1.5,76],[5,76],[6,74],[7,71],[8.5,71],[9.5,69],[10,67],[12,64],[13.5,76],[15.8,76]],
          [[0,71],[1.5,83],[4,83],[5,81],[6,79],[8,79],[9,76],[10,74],[12,71],[14,76],[15.8,76]],
          [[0,76],[1,88],[4,88],[5,86],[6,84],[8,81],[10,80],[12,76],[13.5,88],[15.8,88]]];
        if(k%4===0){S.whoSwoop(t,beat,phrases[k/4],1,bus);S.ehCrash(t,0.8,fx.kit);}
        if(k===0||k===8)S.dubWind(t,bar*4,1,bus);
        if(k===0)S.ehSweep(t,hz(40),bar*4,0.7,bus,true);
        if(k===8){S.ehSweep(t,hz(40),bar*4,0.9,bus,true);S.ehJet(t,bar*4,0.6,bus,true);}
        if(k>=4){K(0,0.5+0.04*k);for(let i=0;i<8;i++)H(i/2,(i%2?0.25:0.45)*(k>=8?1.3:1));}
        if(k>=8){SN(1,0.45);SN(3,0.45);K(2,0.6);}
        if(k===11)fill();
        return;
      }
      if(sec==='break'){   // the toms pound under a jet taking off; the ostinato sweeps twice as fast
        pound(1);bass8(0.9);
        if(b===52){S.ehJet(t,bar*8,1,bus,true);S.surfSlide(t,bar,1,bus);}
        if(b===59){fill();for(let k=0;k<4;k++)SN(2+k*0.5,0.5+k*0.15);}
        return;
      }
      if(heavy){   // the twin-lead outro: galloping bass and rhythm guitars, a driving beat, crashes on every phrase
        if(last){   // the cliffhanger: one bar of gallop, then the Radiophonic scream
          for(const [x,i] of [[0,0],[0.5,1],[0.75,2]]){S.whoBass(at(x),hz(40),beat*(i?0.22:0.45),1,bus);S.ehBass(at(x),bass,beat*0.4,BV,bus);S.ehRhythm(at(x),gtr,beat*(i?0.2:0.4),1,bus,false);}
          S.ehRhythm(at(1),gtr,bar*0.8,1,bus,true);S.ehBass(at(1),bass,bar*0.75,BV,bus);K(0,1);K(1,1);crash();S.ehCrash(at(1),1,fx.kit);
          S.whoSwoop(at(1),beat,[[0,71],[1,83],[2.5,83],[3.2,88],[4.5,88]],1.1,bus);S.dubWind(at(1),bar*1.5,0.8,bus);
          return;
        }
        gallop(bass,BV,(s,f,d,v)=>S.ehBass(s,f,d,v,bus));gallop(gtr,1,(s,f,d,v)=>S.ehRhythm(s,f,d,v,bus,false));
        for(let q=0;q<4;q++)K(q,1);SN(1,1);SN(3,1);for(let k=0;k<8;k++)H(k/2,k%2?0.45:0.8,k===7);
        pads(0.35);
        if(b%4===0)crash();
        if(b===100){S.ehSweep(t,hz(40),bar*2,0.8,bus,true);S.surfSlide(t,bar,0.8,bus);}
        if((b+1)%8===0)fill();
        return;
      }
      surfBeat(1,sec==='solo');bass8(1);
      if(sec==='A2'||sec==='outro')pads(sec==='outro'?0.8:0.45);
      if(sec==='solo')pads(0.3);
      if(this.sections.some(x=>x[0]===b)){crash();if(sec!=='outro')S.surfSlide(t,bar*0.75,0.8,bus);}
      else if(b%8===0)crash();
      if((b+1)%8===0)fill();
      if(b===76)S.ehSweep(t,hz(52),bar*2,0.7,bus,true);
    }
  });

  // ------------------------------------------------------------------- Event Horizon Surf: the five-minute epic
  // Riptide Nebula grown into a full space epic with every trope: a deep-space drone, heartbeat and Apollo radio tones,
  // a haunting flute, a countdown and launch, the surf themes on a driven Stylophone, the Radiophonic section, a
  // weightless orbit with theremin, flute and choir, a laser battle, the solo, a key change up a tone, twin leads, a
  // half-time reprise with choir, a galloping finale and a long fade into the void.
  const up=a=>a.map(bar=>bar.map(ev=>({...ev,midi:ev.midi.map(m=>m+2)}))),upChord=c=>({E:'F#',F:'G',G:'A',Am:'Bm'})[c];
  const harmonise=(barsArr,chords)=>barsArr.map((bar,i)=>bar.map(ev=>({...ev,midi:ev.midi.map(m=>thirdBelow(m,chords[i%chords.length]))})));
  const andaB=[...anda,...anda,...anda,...anda],finaleC=['Am','F','E','E','Am','F','E','Am'],orbitC=Array(3).fill(['Am','Am','F','F','G','G','E','E']).flat();
  const finale=bars('A4:1 C5:1 E5:2 | F5:4 | G#5:4 | B5:4 | A5:2 E5:2 | F5:4 | G#5:2 B5:2 | A5:4');
  const orbit=bars('A5:4 | C6:2 B5:2 | A5:4 | F5:4 | G5:2 B5:2 | D6:4 | B5:2 G#5:2 | E5:4 | '+
    'E6:4 | C6:2 A5:2 | F6:4 | C6:4 | D6:2 B5:2 | G5:4 | G#5:2 B5:2 | E6:4 | '+
    'A5:2 C6:2 | E6:4 | F6:2 E6:2 | C6:4 | B5:2 D6:2 | G6:4 | G#5:2 B5:2 | E5:4');
  // the flute: alone in deep space, answering the theremin in orbit (below it), saying goodbye in the void
  const fluteDeep=bars('r:4 | r:4 | r:4 | r:4 | B5:4 | G#5:2 A5:2 | B5:3 E6:1 | D6:4 | C6:4 | A5:2 F5:2 | G#5:4 | r:4 | E5:2 F5:2 | G#5:4 | B4:4 | r:4');
  const fluteOrbit=bars('r:4 | r:4 | r:4 | r:4 | r:4 | r:4 | r:4 | r:4 | r:2 E5:2 | A5:4 | r:2 C5:2 | F5:4 | r:2 D5:2 | B4:4 | r:2 G#4:2 | B4:4 | '+
    'r:2 E5:2 | C5:4 | r:2 A4:2 | C5:4 | r:2 B4:2 | D5:4 | r:2 G#4:2 | E5:4');
  const fluteVoid=bars('r:4 | r:4 | F#5:4 | D5:2 E5:2 | F#5:3 B5:1 | A5:4 | r:4 | r:4 | G5:4 | E5:2 D5:2 | B4:4 | r:4 | r:4 | D5:2 C#5:2 | B4:4 | r:4');
  const twin16=twin.slice(0,16),twinLow16=twinLow.slice(0,16);
  const rnd=(b,k)=>{const x=Math.sin(b*127.1+k*311.7)*43758.5453;return x-Math.floor(x);};
  TUNES.splice(TUNES.findIndex(t=>t.id==='riptide')+1,0,{
    id:'epic',title:'Event Horizon Surf',
    meta:'Five-minute space epic · E Phrygian, then up a tone · driven Stylophone, flute, theremin, choir, twin leads and the acid ostinato',
    desc:'Riptide Nebula as a full space opera. A drone, a heartbeat and Apollo radio tones in deep space, a lonely flute; a countdown, ignition and launch; the surf themes on a driven Stylophone; the Radiophonic sting; a weightless orbit of theremin, flute and choir; a laser battle; the solo and the tom break; a key change up a whole tone; twin harmonised leads; a half-time reprise with choir; a galloping finale; and a long fade back into the void with the last heartbeats and a closing radio tone.',
    bpm:168,beats:4,send:0.2,gain:0.75,
    sections:[[0,'deep space'],[16,'countdown'],[24,'launch'],[32,'A'],[48,'B'],[64,'radiophonic'],[76,'orbit'],[100,'battle'],[116,'solo'],
      [132,'break'],[140,'A2'],[156,'twin'],[172,'reprise'],[188,'finale'],[196,'void']],
    chords:[...Array(8).fill('E'),...Array(4).fill('F'),...Array(4).fill('E'),...Array(8).fill('E'),'E','E','F','F','E','E','F','F',
      ...vamp,...vamp,...andaB,...Array(8).fill('E'),'F','F','E','E',...orbitC,...Array(8).fill(['E','E','F','F']).flat(),'E','E','F','F','E','E','F','F',
      ...[...vamp,...vamp].map(upChord),...twinChords.map(upChord),...andaB.map(upChord),...finaleC.map(upChord),...Array(8).fill('Bm'),'G','G','G','G','Bm','Bm','Bm','Bm'],
    parts:[
      {inst:'styloDrive',vel:1,shift:0,notes:[...quiet(32),...themeA,...themeB,...quiet(52),...solo,...quiet(8),...up(themeA),...quiet(56)]},
      {inst:'epicHi',vel:1,shift:0,notes:[...quiet(156),...up(twin16),...up(themeB),...up(finale),...quiet(16)]},
      {inst:'epicLo',vel:0.85,shift:0,notes:[...quiet(156),...up(twinLow16),...up(harmonise(themeB,andaB)),...up(harmonise(finale,finaleC)),...quiet(16)]},
      {inst:'ehTheremin',vel:0.9,shift:0,notes:[...quiet(76),...orbit,...quiet(112)]},
      {inst:'spaceFlute',vel:1,shift:0,notes:[...fluteDeep,...quiet(60),...fluteOrbit,...quiet(96),...fluteVoid]}],
    accomp(S,bus,t,b,ch,beat){
      if(b===0||!dubFx.get(bus)||!ehFx.get(bus)){const len=this.chords.length*4*beat;ehRig(S,bus,t,len,beat);dubRig(S,bus,t,len,beat);}
      const fx=ehFx.get(bus),sec=sectionOf(this,b),k=b-this.sections.find(x=>x[1]===sec)[0],bar=4*beat,r=ch.root,at=x=>t+x*beat;
      const bass=hz(28+(r+8)%12),gtr=hz(40+(r+8)%12),pad=ch.tones.map(n=>55+(r+n+5)%12),BV=1.7,shifted=b>=140?2:0;
      // the ostinato: [loudness, bars per filter sweep, how far it opens] section by section (null rests it)
      const OST={'deep space':b>=8?[0.3+0.02*(b-8),8,0.3]:null,countdown:[0.6,4,0.6],launch:[1,2,1],radiophonic:null,orbit:[0.5,8,0.4],battle:[0.9,2,1],
        break:[1,2,1],twin:[0.6,4,1],reprise:[0.6,4,1],finale:[0.6,4,1],void:k<12?[0.5*(1-k/12),8,0.2]:null}[sec];
      const ost=OST===undefined?[1,4,1]:OST;
      if(ost){const [v,per,mx]=ost,base=57+(r+3)%12,T=[0,1,2].flatMap(o=>ch.tones.slice(0,3).map(n=>base+n+o*12)),pat=[0,2,4,3,1,5,3,2,0,4,2,5,3,1,6,4];
        for(let i=0;i<16;i++)S.dubOst(at(i/4),hz(T[pat[i]]),beat*0.22,(i%4===0?1:i%2?0.55:0.75)*v,bus,mx*(0.5-0.5*Math.cos(2*Math.PI*(b*4+i/4)/(per*4))));}
      const K=(x,v)=>S.ehKick(at(x),v,bus),SN=(x,v)=>S.epicSnare(at(x),v,bus),H=(x,v,o)=>S.ehHat(at(x),v,fx.kit,o),tom=(x,v,f)=>S.ehTom(at(x),f,v,bus);
      const bass8=(v=1)=>{for(let i=0;i<8;i++)S.epicBass(at(i/2),bass,beat*0.4,(i%2?0.75:1)*v*BV,bus);};
      const gallop=(f,v,fn)=>{for(let q=0;q<4;q++)[0,0.5,0.75].forEach((x,i)=>fn(at(q+x),f,beat*(i?0.2:0.4),v*(i?0.8:1)));};
      const surfBeat=(six)=>{K(0,1);K(2,1);K(2.5,0.6);SN(1,1);SN(3,1);const n=six?16:8;for(let i=0;i<n;i++)H(i*4/n,i%(n/4)===0?0.8:0.45,i===n-1&&b%2);};
      const pound=(v=1)=>{for(let i=0;i<8;i++)tom(i/2,0.7*v*(i%2?0.7:1),i%4<2?95:130);K(0,v);K(2,v);};
      const fill=()=>[260,220,185,150,125,105,95,85].forEach((f,i)=>tom(2+i*0.25,0.9,f));
      const pads=(v,d=bar*0.97)=>pad.forEach(m=>S.ehPad(t,hz(m),d,v,bus));
      const choir=(notes,d,v)=>notes.forEach(m=>S.choir(t,hz(m+shifted),d,v,bus));   // a held choir, A and E (B and F# after the key change)
      const crash=(v=1)=>S.ehCrash(t,v,fx.kit);
      const heavy=()=>{gallop(bass,BV,(s,f,d,v)=>S.epicBass(s,f,d,v,bus));gallop(gtr,1,(s,f,d,v)=>S.ehRhythm(s,f,d,v,bus,false));
        for(let q=0;q<4;q++)K(q,1);SN(1,1);SN(3,1);for(let i=0;i<8;i++)H(i/2,i%2?0.45:0.8,i===7);};
      switch(sec){
      case 'deep space':   // a drone, a heartbeat, radio tones, the flute and the first stars of the ostinato
        if(k===0){S.sub(t,bass,bar*16,0.45,bus);S.ehSweep(t,hz(40),bar*8,0.5,bus,true);}
        if(k%4===0)pads(0.6,bar*3.9);
        if(k===4||k===12)choir([64,71],bar*3.9,0.6);
        if(k>=2)S.heartbeat(t,0.5+0.03*k,bus);
        if(k===1||k===9)S.quindar(at(0.5),1,bus);
        if(k===3||k===11)S.quindar(at(2),1,bus,true);
        if(k===12)S.ehSweep(t,hz(52),bar*4,0.7,bus,true);
        return;
      case 'countdown':   // the heartbeat quickens, rumbles, the engines spooling up, ten beeps and a snare roll
        pads(0.7);S.heartbeat(t,0.8,bus);S.heartbeat(at(2),0.8,bus);
        if(k===0){S.ehJet(t,bar*8,0.9,bus,true);S.sub(t,bass,bar*8,1,bus);S.quindar(t,1,bus);}
        if(k===2||k===5)S.rumble(t,0.4,bus);
        if(k>=4)for(let q=0;q<4;q++)S.epicBass(at(q),bass,beat*0.5,BV*0.7,bus);
        for(let q=0;q<4;q++){const B=k*4+q;if(B>=22)S.beep(at(q),880*Math.pow(2,(B-22)/24),1,bus);}
        if(k>=6){const n=k===6?8:16;for(let i=0;i<n;i++)SN(i*4/n,0.3+0.5*((k-6)*n+i)/(2*n));}
        return;
      case 'launch':   // ignition: an explosion of noise, the toms pounding, the gallop, lasers
        if(k===0){S.pwBoom(t,0.75,bus,3);crash(1);S.surfSlide(t,bar,1,bus);S.ehSweep(t,hz(40),bar*8,1,bus,true);S.beep(t,1760,1,bus);}
        pound(1);gallop(bass,BV,(s,f,d,v)=>S.epicBass(s,f,d,v,bus));
        if(k%2===1)for(let i=0;i<3;i++)S.epicLaser(at(2+i*0.5),hz(84-i*5),0.6,bus);
        if(k===7)fill();
        return;
      case 'B': case 'reprise':   // half-time, pads through the jet and a held choir; the reprise is the huge one
        K(0,1);SN(2,1);for(let i=0;i<8;i++)H(i/2,i%2?0.35:0.6);
        S.epicBass(at(0),bass,beat*1.8,BV,bus);S.epicBass(at(2.5),bass,beat*0.4,0.7*BV,bus);S.epicBass(at(3),bass,beat*0.8,0.7*BV,bus);pads(0.8);
        if(k%4===0)choir([69,76],bar*3.9,sec==='reprise'?0.9:0.6);
        if(sec==='reprise'){S.ehRhythm(t,gtr,bar*0.9,0.8,bus,true);if(k%2===0)crash();}
        else if(k===0){crash();S.ehSweep(t,hz(64),bar*4,0.8,bus,false);}
        if(k===8)S.ehSweep(t,hz(45),bar*4,0.8,bus,true);
        if(k===15)fill();
        return;
      case 'radiophonic': {   // the band stops for the galloping plucked bass and three rising swoops; the drums creep back
        const root=40+(r+8)%12;
        for(let q=0;q<4;q++)[0,0.5,0.75].forEach((x,i)=>{const n=k===11&&q>=2?[[43,43,45],[47,47,52]][q-2][i]:i===0&&q%2===1?root+12:root;
          S.whoBass(at(q+x),hz(n),beat*(i?0.22:0.45),i?0.75:1,bus);});
        const phrases=[[[0,64],[1.5,76],[5,76],[6,74],[7,71],[8.5,71],[9.5,69],[10,67],[12,64],[13.5,76],[15.8,76]],
          [[0,71],[1.5,83],[4,83],[5,81],[6,79],[8,79],[9,76],[10,74],[12,71],[14,76],[15.8,76]],
          [[0,76],[1,88],[4,88],[5,86],[6,84],[8,81],[10,80],[12,76],[13.5,88],[15.8,88]]];
        if(k%4===0){S.whoSwoop(t,beat,phrases[k/4],1,bus);crash(0.8);}
        if(k===0||k===8)S.dubWind(t,bar*4,1,bus);
        if(k===8){S.ehSweep(t,hz(40),bar*4,0.9,bus,true);S.ehJet(t,bar*4,0.6,bus,true);}
        if(k>=4){K(0,0.5+0.04*k);for(let i=0;i<8;i++)H(i/2,(i%2?0.25:0.45)*(k>=8?1.3:1));}
        if(k>=8){SN(1,0.45);SN(3,0.45);K(2,0.6);}
        if(k===11)fill();
        return;
      }
      case 'orbit':   // weightless: no drums but a soft ride, a slow bass, choir, a gentle sequencer, radio tones
        pads(0.7);for(let q=0;q<4;q++)H(q,0.25);
        if(k%2===0){S.epicBass(t,bass,bar*1.9,BV*0.6,bus);ch.tones.forEach(n=>S.choir(t,hz(57+(r+n+3)%12),bar*1.95,0.5,bus));}
        for(let i=0;i<8;i++)S.ehSeq(at(i/2),hz(48+r+[0,7,12,7,ch.tones[1]+12,7,12,19][i]),beat*0.3,0.35,fx.pad,900+600*Math.sin(b/4));
        if(k===0||k===12)S.quindar(t,1,bus);
        if(k===2||k===14)S.quindar(at(1),1,bus,true);
        if(k===16)S.ehSweep(t,hz(40),bar*8,0.8,bus,true);
        if(k>=20)K(0,0.4+0.1*(k-20));
        if(k>=22){const n=k===22?8:16;for(let i=0;i<n;i++)SN(i*4/n,0.3+0.4*i/n+(k-22)*0.3);}
        return;
      case 'battle':   // a laser battle: the gallop, chugging guitars, a racing sequencer, lasers and explosions
        gallop(bass,BV,(s,f,d,v)=>S.epicBass(s,f,d,v,bus));gallop(gtr,0.9,(s,f,d,v)=>S.ehRhythm(s,f,d,v,bus,false));
        for(let q=0;q<4;q++)K(q,1);SN(1,1);SN(3,1);for(let i=0;i<16;i++)H(i/4,i%4===0?0.7:0.35,i===15);
        for(let i=0;i<16;i++)S.ehSeq(at(i/4),hz(60+r+[0,12,7,12][i%4]+(i>=8?ch.tones[1]:0)),beat*0.2,0.5,fx.pad,2000+1500*Math.sin(b));
        for(let q=0;q<4;q++)if(rnd(b,q)<0.55)S.epicLaser(at(q+rnd(b,q+9)*0.5),hz(76+Math.floor(rnd(b,q+20)*12)),0.6,bus);
        if(k===7||k===15)S.pwBoom(at(2),0.8,bus,1.5);
        if(k===0)S.ehJet(t,bar*4,0.6,bus,false);
        if(k%4===0)crash();
        if(k%4===3)fill();
        return;
      case 'break':   // the toms pound under a jet taking off
        pound(1);bass8(0.9);
        if(k===0){S.ehJet(t,bar*8,1,bus,true);S.surfSlide(t,bar,1,bus);}
        if(k===7){fill();for(let i=0;i<4;i++)SN(2+i*0.5,0.5+i*0.15);}
        return;
      case 'twin': case 'finale':   // the twin leads over a galloping band; the finale adds the choir and crashes every other bar
        heavy();pads(0.35);
        if(k===0){S.ehSweep(t,hz(42),bar*2,0.8,bus,true);S.surfSlide(t,bar,0.8,bus);}
        if(sec==='finale'){if(k===0)choir([69,76],bar*7.9,0.9);if(k%2===0)crash();}
        else if(k%4===0)crash();
        if((b+1)%8===0)fill();
        return;
      case 'void':   // the last chord, then everything drifts away: drone, choir, the heartbeat slowing, radio tones, the flute
        if(k===0){S.ehRhythm(t,gtr,bar*3,1,bus,true);S.epicBass(t,bass,bar*2.5,BV,bus);K(0,1);crash(1.3);SN(0,1);
          S.sub(t,bass,bar*16,0.35,bus);S.ehSweep(t,hz(83),bar*8,0.8,bus,false);S.ehJet(t+bar,bar*6,0.7,bus,false);}
        if(k%4===0)pads(0.7*(1-k/16),bar*3.9);
        if(k===0||k===8)choir([69,76],bar*7.9,0.7*(1-k/16));
        if(k>=2&&k<14&&k%2===0)S.heartbeat(t,0.6*(1-k/16),bus);
        if(k===4)S.quindar(t,1,bus);
        if(k===6)S.quindar(at(1),1,bus,true);
        if(k===8)S.whoSwoop(t,beat,[[0,71],[4,83],[8,83],[12,71],[16,59]],0.5,bus);
        if(k===14)S.quindar(at(2),0.8,bus,true);
        return;
      }
      // A, the solo and A2 (the key change): the surf beat
      surfBeat(sec==='solo');bass8(1);
      if(sec==='A2')pads(0.5);
      if(sec==='solo')pads(0.3);
      if(k===0){crash();S.surfSlide(t,bar*0.75,0.8,bus);}
      else if(b%8===0)crash();
      if((b+1)%8===0)fill();
      if(sec==='A2'&&k===0){S.pwBoom(t,0.7,bus,1.5);S.ehSweep(t,hz(54),bar*2,0.8,bus,true);}
    }
  });
}

// ===================================================================== Red Planet Requiem
// Ray-gun rock battle music, written as one piece rather than a medley. A single idea - a five-beat hammer in the
// manner of Mars, the Bringer of War - never stops; everything that joins it hammers the same rhythm. One theme is
// stated over it, answered, developed as the harmony finally leaves the low C pedal, raised to a climax over a
// chromatically falling bass (the Day of Wrath weight comes from the choir and the big drum hammering with the band),
// sinks back to a whisper, and builds again to a second climax and a hammered end. The acid ostinato's filter opens
// slowly across the whole piece, shuts in the collapse and opens again. No orchestra: driven Stylophone and twin leads,
// muted twin guitars, bass, timpani, drums, a synth choir, the ostinato and the spring.
Synth.prototype.timpani=function(t,f,v,dest,len=1.6){   // a tuned kettle drum: settling pitch, a fifth-ish overtone, a felt mallet, a hall
  const c=this.ctx,end=t+len+0.1,o=this.osc('sine',f*1.04,t,end),g=this.amp(t,0.004,0.32*v,len,end),o2=this.osc('sine',f*1.5,t,end),g2=this.amp(t,0.004,0.1*v,len*0.5,end),room=c.createGain();
  o.frequency.exponentialRampToValueAtTime(f,t+0.08);o.connect(g);o2.connect(g2);g.connect(dest);g2.connect(dest);
  room.gain.value=0.4;g.connect(room);room.connect(this.verb);this.hit(t,0.12*v,dest,500,0.8,0.05,'lowpass');
};
Synth.prototype.timpRoll=function(t,f,dur,v0,v1,dest){const n=Math.floor(dur/0.065);for(let i=0;i<n;i++)this.timpani(t+i*0.065,f,(v0+(v1-v0)*i/n)*(0.8+0.2*Math.random()),dest,0.5);};
// a muted clavinet: a nasal pulse (the string heard through its pickup), a body thump and a key click, cut dead by the
// felt mute within a few hundredths of a second. m (0..1) sweeps its filter from a dark thunk to a resonant quack.
Synth.prototype.clavMute=function(t,f,dur,v,dest,m=0){
  const c=this.ctx,end=t+0.16,p=this.pwOsc(f,t,end,0.28),lp=this.filter('lowpass',f*2,0.9+9*m*m),g=c.createGain();
  g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.24*v,t+0.002);g.gain.setValueAtTime(0.24*v,t+0.025);g.gain.exponentialRampToValueAtTime(0.0001,t+0.085);
  lp.frequency.setValueAtTime(Math.min(10000,f*(2.5+12*m)),t);lp.frequency.exponentialRampToValueAtTime(Math.min(6000,f*(1.2+3*m)),t+0.07);
  p.out.connect(lp);lp.connect(g);
  const body=this.osc('sine',f,t,end),bg=this.amp(t,0.002,0.12*v,0.06,end);body.connect(bg);bg.connect(g);
  this.hit(t,0.05*v,g,4000,0.8,0.008,'highpass');
  this.dubOut(g,dest,0.1,0.15);
};
Synth.prototype.granCassa=function(t,v,dest){   // the huge bass drum, struck as in a Requiem
  const c=this.ctx,end=t+1.2,o=this.osc('sine',62,t,end),g=this.amp(t,0.003,0.38*v,0.9,end),n=c.createBufferSource(),lp=this.filter('lowpass',300,0.7),ng=this.amp(t,0.002,0.25*v,0.4,t+0.5),room=c.createGain();
  o.frequency.exponentialRampToValueAtTime(38,t+0.5);o.connect(g);g.connect(dest);n.buffer=this.noise;n.connect(lp);lp.connect(ng);ng.connect(dest);n.start(t,Math.random(),0.5);
  room.gain.value=0.6;g.connect(room);ng.connect(room);room.connect(this.verb);
};
Synth.prototype.choirShout=function(t,f,dur,v,dest){   // a choir hammering out a word: a fast attack on "ah", gone quickly
  const c=this.ctx,end=t+dur+0.5,g=this.held(t,0.03,0.25*v,dur,0.35),mix=c.createGain(),room=c.createGain();
  [0.994,1,1.006].forEach(k=>{const o=this.osc('sawtooth',f*k,t,end);this.vibrato(o,t,5+Math.random(),f*0.006,0.15).stop(end);o.connect(mix);});
  [[750,1],[1200,0.6],[2700,0.25]].forEach(([ff,a])=>{const b=this.filter('bandpass',ff,6),ga=c.createGain();ga.gain.value=a;mix.connect(b);b.connect(ga);ga.connect(g);});
  g.connect(dest);room.gain.value=0.5;g.connect(room);room.connect(this.verb);
};
{
  const quiet=n=>bars(rests(n,5)),shift=(bs,n)=>bs.map(bar=>bar.map(ev=>({...ev,midi:ev.midi.map(m=>m+n)}))),soft=(bs,v)=>bs.map(bar=>bar.map(ev=>({...ev,vel:v})));
  const themeC=['Cm','Cm','Db','Db','Cm','Cm','Bdim','Bdim'];
  const devC=['Ab','Ab','Bb','Bb','Cm','Cm','Db','Db','Ab','Ab','Bb','Bb','G','G','G','G'];
  const climaxC=['Cm','G','Bb','Adim','Ab','Ab','G','G'],climaxBass=[36,35,34,33,32,32,31,31];   // C, B, B flat, A, A flat ... G: the bass falls by semitones
  // the theme, and what grows out of it
  const theme=bars('C5:3 Eb5:2 | D5:2 C5:1 G4:2 | Ab4:3 Db5:2 | C5:2 Bb4:1 Ab4:2 | G4:2 C5:1 Eb5:2 | G5:3 F5:2 | F5:2 Eb5:1 D5:2 | B4:5');
  const develop=bars('C5:3 Eb5:2 | F5:2 Eb5:1 C5:2 | D5:3 F5:2 | Bb5:2 Ab5:1 F5:2 | G5:3 Eb5:2 | C6:2 Bb5:1 G5:2 | Ab5:3 F5:2 | Db6:5 | '+
    'C6:3 Ab5:2 | Eb6:2 C6:1 Ab5:2 | D6:3 Bb5:2 | F6:2 D6:1 Bb5:2 | B5:3 D6:2 | F6:2 D6:1 B5:2 | G5:5 | G5:2 B5:1 D6:2');
  const climax=bars('C6:3 G5:2 | B5:3 D6:2 | Bb5:3 F5:2 | A5:3 C6:2 | Ab5:3 C6:2 | Eb6:5 | D6:3 B5:2 | G5:5 | '+
    'C6:2 Eb6:3 | D6:2 B5:3 | D6:2 F6:3 | Eb6:2 C6:3 | C6:2 Eb6:3 | Ab6:5 | G6:3 F6:2 | D6:2 B5:3');
  // the second guitar a third below: C minor, Phrygian over D flat, harmonic minor over G and the diminished chords
  const scaleFor=c=>c==='Db'?[0,1,3,5,7,8,10]:c==='G'||c.endsWith('dim')?[0,2,3,5,7,8,11]:[0,2,3,5,7,8,10];
  const third=(m,c)=>{const sc=scaleFor(c),i=sc.indexOf(m%12);return i<0?m-3:m-((m%12-sc[(i+5)%7]+12)%12);};
  // on a chord tone the second guitar takes the next chord tone down, so the pair always sounds the chord; on a passing
  // note it takes the scale third
  const chordTones=c=>{const {root,tones}=chordOf(c);return tones.map(x=>(root+x)%12);};
  const under=(m,c)=>{const ct=chordTones(c);if(ct.includes(m%12))for(let d=3;d<=9;d++)if(ct.includes((m-d+120)%12))return m-d;return third(m,c);};
  const lower=(bs,cs)=>bs.map((bar,i)=>bar.map(ev=>({...ev,midi:ev.midi.map(m=>under(m,cs[i%cs.length]))})));
  const HAMMER=[[0,1/3],[1/3,1/3],[2/3,1/3],[1,1],[2,1],[3,0.5],[3.5,0.5],[4,1]];   // da-da-da DUM DUM da-da DUM
  const chords=[...Array(8).fill('Cm'),...themeC,...themeC,...themeC,...devC,...climaxC,...climaxC,...themeC,...themeC,...climaxC,'G','G','G','G','Cm','Cm','Cm','Cm'];
  TUNES.splice(TUNES.findIndex(t=>t.id==='epic')+1,0,{
    id:'requiem',title:'Red Planet Requiem',
    meta:'Ray-gun rock battle music · C minor · 5/4 · one hammering ostinato, muted clavinet, driven Stylophone, twin leads, timpani and choir',
    desc:'A five-beat hammer that never stops, in the manner of Mars, the Bringer of War. It starts on the timpani alone; guitars, bass and drums join it; a war theme is stated over it and developed as the harmony leaves the low C, to a climax over a bass falling by semitones where the choir and the big drum hammer with the band. It sinks back to a whisper, builds again, and ends hammered out by everything at once.',
    bpm:160,beats:5,send:0.22,gain:0.66,
    sections:[[0,'rise'],[16,'theme'],[32,'development'],[48,'climax'],[64,'collapse'],[72,'return'],[80,'climax 2'],[88,'hammer'],[92,'coda']],
    chords,
    parts:[
      {inst:'styloDrive',vel:1,shift:0,notes:[...quiet(8),...soft(theme,0.6),...theme,...theme,...develop,...quiet(16),...soft(shift(theme,-12),0.55),...theme,...quiet(16)]},
      {inst:'epicHi',vel:1,shift:0,notes:[...quiet(48),...climax,...quiet(8),...shift(theme,12),...climax.slice(8),...bars('G5:5 | Ab5:5 | G5:5 | B5:5 | C6:5 | r:5 | r:5 | r:5')]},
      {inst:'epicLo',vel:0.85,shift:0,notes:[...quiet(48),...lower(climax,climaxC),...quiet(8),...lower(shift(theme,12),themeC),...lower(climax.slice(8),climaxC),...bars('D5:5 | F5:5 | D5:5 | F5:5 | G5:5 | r:5 | r:5 | r:5')]}],
    accomp(S,bus,t,b,ch,beat){
      if(b===0||!dubFx.get(bus)||!ehFx.get(bus)){const len=this.chords.length*5*beat;ehRig(S,bus,t,len,beat);dubRig(S,bus,t,len,beat);}
      const fx=ehFx.get(bus),sec=sectionOf(this,b),k=b-this.sections.find(x=>x[1]===sec)[0],bar=5*beat,last=b===this.chords.length-1,r=ch.root,at=x=>t+x*beat;
      const climaxing=sec==='climax'||sec==='climax 2',pedal=['rise','theme','collapse','return'].includes(sec);
      const bassMidi=pedal||sec==='coda'?36:climaxing?climaxBass[k%8]:sec==='hammer'?31:24+(r+12-(r>6?12:0))%24,bass=hz(bassMidi),gtr=hz(bassMidi+12);
      const tones=ch.tones.map(n=>48+(r+n)%12);
      // the ostinato on a muted clavinet: its filter opens slowly over the whole first half, shuts for the collapse, opens again
      const open=b<64?Math.min(1,b/56):b<72?0.08:Math.min(1,0.1+(b-72)/14);
      const ostV=sec==='rise'?0.3+0.03*b:sec==='collapse'?0.5:sec==='coda'?0.7*(1-k/4):0.75;
      {const base=60+r%12-(r>6?12:0),T=[0,1,2].flatMap(o=>ch.tones.slice(0,3).map(n=>base+n+o*12)),pat=[0,2,4,3,1,5,3,2,0,4,2,5,3,1,6,4];
        for(let i=0;i<(last?8:20);i++){const m=Math.max(0,Math.min(1,open+0.12*Math.sin(2*Math.PI*(b*5+i/4)/20)));
          S.clavMute(at(i/4),hz(T[pat[i%16]]),beat*0.22,(i%4===0?1:i%2?0.55:0.75)*ostV,bus,m);}}
      const K=(x,v)=>S.ehKick(at(x),v,bus),SN=(x,v)=>S.epicSnare(at(x),v,bus),H=(x,v,o)=>S.ehHat(at(x),v,fx.kit,o),tom=(x,v,f)=>S.ehTom(at(x),f,v,bus);
      const crash=(x=0,v=1)=>S.ehCrash(at(x),v,fx.kit),fill=()=>[260,220,185,150,125,105,95,85].forEach((f,i)=>tom(3+i*0.25,0.9,f));
      const pads=(v,d=bar*0.97)=>tones.forEach(m=>S.ehPad(t,hz(m+7),d,v,bus));
      const choir=(v,d)=>tones.forEach(m=>S.choir(t,hz(m+12),d,v,bus));
      // the hammer, played by whoever is in: each layer's loudness, 0 for out
      const hammer=({timp=0,gtrs=0,bassV=0,kick=0,snare=0,hats=0,gran=0,shout=0})=>{
        HAMMER.forEach(([x,d])=>{const long=d>=1,acc=long?1:0.72;
          if(timp)S.timpani(at(x),bass,timp*acc,bus,long?1:0.4);
          if(gtrs)S.ehRhythm(at(x),gtr,d*beat*0.85,gtrs*acc,bus,false);
          if(bassV)S.epicBass(at(x),bass,d*beat*0.85,1.3*bassV*acc,bus);
          if(kick&&long)K(x,kick);
          if(gran&&long)S.granCassa(at(x),gran,bus);
          if(shout&&(long||x===0))tones.forEach(m=>S.choirShout(at(x),hz(m+12),d*beat*0.9,shout*acc,bus));
        });
        if(snare){SN(3,snare);SN(3.5,snare*0.7);}
        if(hats)for(let i=0;i<10;i++)H(i/2,hats*(i%2?0.5:0.85),i===9&&b%2===1);
      };
      switch(sec){
      case 'rise':   // the timpani alone, then guitars, bass, kick and hats join one by one; the theme enters quietly
        hammer({timp:0.45+0.03*b,gtrs:b>=4?0.4+0.05*(b-4):0,bassV:b>=6?0.6+0.04*(b-6):0,kick:b>=8?0.7:0,hats:b>=12?0.7:0,snare:b>=14?0.6:0});
        if(b>=8)pads(0.3);
        if(b===15){fill();S.timpRoll(at(3),bass,beat*2,0.3,0.9,bus);}
        return;
      case 'theme': case 'return':   // the full hammer under the theme; the second time round the choir holds the chords
        hammer({timp:0.8,gtrs:1,bassV:1,kick:1,snare:sec==='return'&&k<4?0:0.85,hats:sec==='return'&&k<2?0:1});
        pads(0.4);
        if(sec==='theme'&&k>=8&&k%2===0)choir(0.55,bar*1.95);
        if(sec==='return'&&k%2===0)choir(0.6,bar*1.95);
        if(k===0||k===8)crash(0,sec==='return'&&k===0?0.7:1);
        if(k%8===7)fill();
        return;
      case 'development':   // the harmony leaves the pedal; the big drum marks every other bar; rolls at the phrase ends
        hammer({timp:0.85,gtrs:1,bassV:1,kick:1,snare:0.9,hats:1,gran:k%2===0?0.6:0});
        pads(0.5);if(k%2===0)choir(0.65,bar*1.95);
        if(k%4===0)crash();
        if(k===7||k===15)S.timpRoll(at(3),bass,beat*2,0.3,1,bus);
        if(k===15)fill();
        return;
      case 'climax': case 'climax 2':   // the bass falls by semitones; choir and big drum hammer with the band
        hammer({timp:1,gtrs:1,bassV:1.1,kick:1,snare:1,hats:1,gran:0.8,shout:0.8});
        pads(0.55);
        if(k%2===0)crash(0,1.1);
        if(sec==='climax'&&k===15)S.timpRoll(t,bass,bar,1,0.2,bus);   // and sinks into the collapse
        if(sec==='climax 2'&&k===7)fill();
        return;
      case 'collapse':   // a whisper: the timpani keep the hammer alone, the choir hums, the theme low and far away
        hammer({timp:0.5,bassV:k>=4?0.5:0});
        if(k%2===0)choir(0.45,bar*1.95);
        if(k===6)S.timpRoll(t,bass,bar*2,0.2,0.9,bus);
        if(k===7)fill();
        return;
      case 'hammer':   // on the dominant: every stroke hammered by everything at once
        hammer({timp:1,gtrs:1,bassV:1.1,kick:1,snare:1,hats:1,gran:1,shout:1});
        crash(0,1.1);
        return;
      case 'coda':   // the last bar of hammer on C, then the chord held over a dying timpani roll
        if(k===0){hammer({timp:1,gtrs:1,bassV:1.1,kick:1,snare:1,gran:1,shout:1});crash(0,1.2);crash(4,1.3);return;}
        if(k===1){choir(0.7,bar*3);pads(0.6,bar*3);S.timpRoll(t,bass,bar*3,0.8,0.05,bus);S.ehRhythm(t,gtr,bar*2,0.8,bus,true);S.epicBass(t,bass,bar*2,1.2,bus);}
        return;
      }
    }
  });
}

// ===================================================================== First Contact (the alien voice)
// A singing alien language, synthesised: a buzzy throat (with a growl an octave down) shaped by vowel formants set
// a little beyond human range, with consonants made of shaped noise - plosives, hisses, nasal hums, a rolled r and a
// tongue click. Syllables are written "ka", "shi", "zhe", "'o", "rai"; vowels may glide ("ai", "ou").
const ALIEN_VOWELS={a:[800,1150,2900],e:[480,2000,2700],i:[300,2300,3000],o:[520,850,2500],u:[330,800,2300],y:[300,1750,2300]};
const ALIEN_CONS={k:0.045,t:0.035,p:0.04,b:0.04,d:0.035,g:0.045,s:0.11,sh:0.11,z:0.09,zh:0.1,m:0.08,n:0.07,r:0.09,l:0.05,"'":0.025};
function alienSyllable(s){const m=/^(sh|zh|[ktpbdgszmnrl']?)([aeiouy]+)$/.exec(s)||[s,'','a'];return {cons:m[1],vowels:m[2].split('').map(v=>ALIEN_VOWELS[v])};}
// one sung syllable. o: {scale: formant shift (1 = human), glide: start pitch to slide from, pan}
Synth.prototype.alienSing=function(t,f,dur,v,dest,syl,o={}){
  const c=this.ctx,{cons,vowels}=alienSyllable(syl),sc=o.scale||1.15,cd=cons?ALIEN_CONS[cons]:0,vt=t+cd,end=t+dur+0.4;
  const out=o.pan&&c.createStereoPanner?c.createStereoPanner():c.createGain();if(o.pan)out.pan.value=o.pan;this.dubOut(out,dest,o.echo??0.25,0.3);
  // the throat: a buzzy saw, a growl an octave down, vibrato that arrives late, a slide from the last note
  const src=c.createGain(),saw=this.osc('sawtooth',f,t,end),sub=this.osc('square',f/2,t,end),sg=c.createGain();sg.gain.value=0.12;
  saw.connect(src);sub.connect(sg);sg.connect(src);
  if(o.glide){for(const x of [saw,sub]){const k=x===sub?0.5:1;x.frequency.setValueAtTime(o.glide*k,vt);x.frequency.exponentialRampToValueAtTime(f*k,vt+Math.min(0.12,dur*0.3));}}
  const vb=o.sung?[0.22,0.07,0.3,34]:[0.35,0.25,0.6,30];   // o.sung: the vibrato comes in early, so even a short note at a fast tempo is sung
  if(dur>vb[0]){const l=this.osc('sine',o.sung?5.8:5.4,t,end),d=c.createGain();d.gain.setValueAtTime(0,t);d.gain.setValueAtTime(0,t+vb[1]);d.gain.linearRampToValueAtTime(vb[3],t+vb[2]);l.connect(d);d.connect(saw.detune);d.connect(sub.detune);}
  // the mouth: three formants, gliding through the vowels of the syllable, over the chest - the throat's own low warmth
  const voice=this.held(vt,0.035,0.13*v,Math.max(0.05,dur-cd),0.18),chest=this.filter('lowpass',Math.min(1400,f*2.2),0.7),cg=c.createGain();
  cg.gain.value=0.35;src.connect(chest);chest.connect(cg);cg.connect(voice);
  [[1,7],[0.5,9],[0.25,11]].forEach(([a,q],n)=>{
    const b=this.filter('bandpass',vowels[0][n]*sc,q),ga=c.createGain();ga.gain.value=a*2;
    vowels.forEach((vw,i)=>{if(i)b.frequency.exponentialRampToValueAtTime(vw[n]*sc,vt+(dur-cd)*i/vowels.length);});
    if(cons==='l'){b.frequency.setValueAtTime(ALIEN_VOWELS.i[n]*sc,t);b.frequency.exponentialRampToValueAtTime(vowels[0][n]*sc,vt+0.04);}
    src.connect(b);b.connect(ga);ga.connect(voice);
  });
  if(cons==='r'){const trill=c.createGain(),lfo=this.osc('square',28,t,vt+0.02),lg=c.createGain();trill.gain.value=0.5;lg.gain.value=0.5;lfo.connect(lg);lg.connect(trill.gain);voice.connect(trill);trill.connect(out);}
  else voice.connect(out);
  this.alienCons(t,cons,v,out,src,sc,cd);
};
// a consonant, laid over a voice: plosive bursts, hisses, nasal and voiced hums from the throat (src), a click
Synth.prototype.alienCons=function(t,cons,v,out,src,sc,cd){
  const c=this.ctx;
  const noise=(type,ff,q,len,a,at=t)=>{const n=c.createBufferSource(),fl=this.filter(type,ff,q),g=this.held(at,0.004,a*v,len,0.02);n.buffer=this.noise;n.connect(fl);fl.connect(g);g.connect(out);n.start(at,Math.random(),len+0.05);};
  if(cons==='k')noise('bandpass',1800*sc,2,0.02,0.25,t+0.02);
  if(cons==='t')noise('highpass',4200,0.8,0.015,0.25,t+0.015);
  if(cons==='p')noise('bandpass',700,1.5,0.02,0.3,t+0.015);
  // the voiced plosives: the same bursts, softer, over a short hum from the throat
  if(cons==='b'||cons==='d'||cons==='g'){const [type,ff]=cons==='b'?['bandpass',650]:cons==='d'?['highpass',3500]:['bandpass',1600*sc];noise(type,ff,1.5,0.018,0.18,t+0.02);
    const hm=this.filter('lowpass',350,1),hg=this.held(t,0.008,0.07*v,cd*0.8,0.02);src.connect(hm);hm.connect(hg);hg.connect(out);}
  if(cons==='s')noise('highpass',6000,0.8,cd,0.12);
  if(cons==='sh')noise('bandpass',2600,1.5,cd,0.14);
  if(cons==='z'||cons==='zh'){noise(cons==='z'?'highpass':'bandpass',cons==='z'?5500:2400,1.2,cd,0.08);const hum=this.filter('lowpass',400,1),hg=this.held(t,0.01,0.05*v,cd,0.02);src.connect(hum);hum.connect(hg);hg.connect(out);}
  if(cons==='m'||cons==='n'){const hum=this.filter('lowpass',cons==='m'?300:420,1.5),hg=this.held(t,0.015,0.12*v,cd,0.03);src.connect(hum);hum.connect(hg);hg.connect(out);}
  if(cons==="'")noise('bandpass',3000,18,0.008,0.25);
};
// A whole sung phrase as one continuous voice, the way a singer sings it: the pitch glides from note to note with no
// new attack, one vowel can carry many notes, consonants fall only where a new word starts, and there are grace notes,
// scoops, slides, falls, turns and trills, a vibrato that blooms on held notes, and the phrase swelling and fading.
// notes: [{at, dur (seconds from t), f, midi, syl (a new word, or none), flags {scoop, slide, tr, turn, fall}, grace [f], gain}]
// upper(midi) gives the trill/turn neighbour above; o: {scale, pan, echo}.
Synth.prototype.alienPhrase=function(t,notes,v,dest,upper,o={}){
  const c=this.ctx,sc=o.scale||1.5,first=notes[0],lastN=notes[notes.length-1],T1=t+lastN.at+lastN.dur,end=T1+0.8;
  const out=o.pan&&c.createStereoPanner?c.createStereoPanner():c.createGain();if(o.pan)out.pan.value=o.pan;this.dubOut(out,dest,o.echo??0.25,0.35);
  const src=c.createGain(),saw=this.osc('sawtooth',first.f,t-0.3,end),sub=this.osc('square',first.f/2,t-0.3,end),sg=c.createGain();sg.gain.value=0.12;
  saw.connect(src);sub.connect(sg);sg.connect(src);
  const P=[saw.frequency,sub.frequency],setF=(f,at)=>P.forEach((p,i)=>p.setValueAtTime(i?f/2:f,at)),toF=(f,at)=>P.forEach((p,i)=>p.exponentialRampToValueAtTime(i?f/2:f,at));
  const lfo=this.osc('sine',5.3,t-0.3,end),vib=c.createGain();vib.gain.setValueAtTime(0,t);lfo.connect(vib);vib.connect(saw.detune);vib.connect(sub.detune);
  const amp=c.createGain(),chest=this.filter('lowpass',Math.min(1400,first.f*2.2),0.7),cg=c.createGain();
  // silent from the moment the oscillators start (a gain is at full volume until its first scheduled change)
  amp.gain.value=0.0001;amp.gain.setValueAtTime(0.0001,t-0.3);amp.gain.setValueAtTime(0.0001,t-0.02);cg.gain.value=0.35;src.connect(chest);chest.connect(cg);cg.connect(amp);amp.connect(out);
  let vow=ALIEN_VOWELS.a;
  const bands=[[1,7],[0.5,9],[0.25,11]].map(([a,q],n)=>{const b=this.filter('bandpass',vow[n]*sc,q),ga=c.createGain();ga.gain.value=a*2;src.connect(b);b.connect(ga);ga.connect(amp);return b;});
  // a breath before the phrase
  {const n=c.createBufferSource(),bp=this.filter('bandpass',1600,1),g=this.held(t-0.2,0.06,0.025*v,0.1,0.05);n.buffer=this.noise;n.connect(bp);bp.connect(g);g.connect(out);n.start(t-0.2,Math.random(),0.3);}
  const peak=0.13*v,GRACE=0.07;let prevF=first.f;
  notes.forEach((n,i)=>{
    const s=t+n.at,e=s+n.dur,next=notes[i+1],stop=e-(next&&next.grace?next.grace.length*GRACE:0),fl=n.flags;
    // the pitch: grace notes steal their time from the note before; then a scoop, a slow slide or an ordinary legato join
    let arrive=s+0.06;
    if(n.grace){let gt=s-GRACE*n.grace.length;setF(prevF,gt);for(const gf of n.grace){toF(gf,gt+0.02);gt+=GRACE;setF(gf,gt);}toF(n.f,s+0.03);arrive=s+0.03;}
    else if(i===0&&!fl.scoop)setF(n.f,s);
    else if(fl.scoop){setF(i?prevF:n.f*0.93,s);if(i)toF(n.f*0.93,s+0.04);toF(n.f,s+0.16);arrive=s+0.16;}
    else if(fl.slide){setF(prevF,s);arrive=s+Math.min(0.4,n.dur*0.5);toF(n.f,arrive);}
    else{setF(prevF,s);toF(n.f,arrive);}
    const up=hz(upper(n.midi)),down=hz(n.midi-1);
    if(fl.turn){[up,n.f,down,n.f].forEach((x,k)=>toF(x,arrive+0.07*(k+1)));arrive+=0.28;}
    if(fl.tr){let a=arrive+0.12,k=0;while(a+0.065<stop-0.12){toF(k%2?n.f:up,a+0.065);a+=0.065;k++;}toF(n.f,a+0.04);}
    if(fl.fall){setF(n.f,Math.max(arrive,e-0.22));toF(n.f*0.82,e);}
    prevF=fl.fall?n.f*0.82:n.f;
    // vibrato: almost straight at the start of a note, blooming as it is held; none under a trill
    vib.gain.setValueAtTime(fl.tr?0:3,s);
    if(n.dur>0.45&&!fl.tr){vib.gain.linearRampToValueAtTime(3,s+0.25);vib.gain.linearRampToValueAtTime(34,s+n.dur*0.8);vib.gain.linearRampToValueAtTime(10,stop-0.01);}
    // loudness: a small dip where a new word starts, held notes swelling, the phrase fading out at the end
    const pk=peak*(n.gain||1);
    if(i===0)amp.gain.exponentialRampToValueAtTime(pk*0.75,s+0.1);
    else if(n.syl){amp.gain.linearRampToValueAtTime(pk*0.5,s+0.02);amp.gain.linearRampToValueAtTime(pk*0.78,s+0.08);}
    else amp.gain.linearRampToValueAtTime(pk*0.8,s+0.05);
    if(n.dur>0.45)amp.gain.linearRampToValueAtTime(pk,s+n.dur*0.6);
    amp.gain.linearRampToValueAtTime(pk*(next?0.8:0.6),stop-0.01);
    if(!next)amp.gain.exponentialRampToValueAtTime(0.0001,e+(fl.fall?0.02:0.3));
    // the mouth: a new word changes the vowel (and lays its consonant over the voice); a held vowel carries on
    if(n.syl){const {cons,vowels}=alienSyllable(n.syl),cd=cons?ALIEN_CONS[cons]:0;
      bands.forEach((b,k)=>{b.frequency.setValueAtTime(vow[k]*sc,s);b.frequency.exponentialRampToValueAtTime(vowels[0][k]*sc,s+cd+0.05);
        vowels.slice(1).forEach((vw,j)=>b.frequency.exponentialRampToValueAtTime(vw[k]*sc,s+cd+n.dur*(j+1)/vowels.length));});
      vow=vowels[vowels.length-1];if(cons)this.alienCons(s,cons,v,out,src,sc,cd);}
  });
};
// chatter: a quick burst of the language at speaking pitch, from small creatures (formants pushed high)
const ALIEN_WORDS=['ka','shi','mo','ru','ta','li','ny','ra','o','ka','ru','zhe',''+"'"+'a','lu','sai','tou','mi','zy','ke',''+"'"+'i'];
Synth.prototype.alienChatter=function(t,dur,v,dest,seed=1,pitch=260,scale=1.45){
  const rnd=k=>{const x=Math.sin(seed*97.1+k*13.7)*43758.5453;return x-Math.floor(x);};
  let at=t,k=0,last=null;const pan=rnd(99)*1.2-0.6;
  while(at<t+dur){const len=0.09+rnd(k)*0.1,f=pitch*(1+0.35*Math.sin(k*0.9+seed)+0.15*rnd(k+50));
    this.alienSing(at,f,len,v*(0.7+0.3*rnd(k+20)),dest,ALIEN_WORDS[Math.floor(rnd(k+40)*ALIEN_WORDS.length)],{scale,pan,glide:last});
    last=f;at+=len+(rnd(k+60)<0.15?0.12:0.02);k++;}
};
{
  // a sung line: "E5:1:ka A5:1.5:shi r:1" - note, beats, syllable
  const sung=str=>str.split('|').map(bar=>{let at=0;const ev=[];for(const tok of bar.trim().split(/\s+/)){const [n,d,syl]=tok.split(':');if(n!=='r')ev.push({at,beats:+d,midi:midiOf(n),syl});at+=+d;}return ev;});
  const empty=n=>Array.from({length:n},()=>[]);
  // new words for the same tune: every syllable swapped for another from the language
  const swap={ka:'zhe',shi:'lu',mo:'ta',ru:'ny',o:'sai',ny:'ka',ra:'mi',ta:'ke',li:'ru',zhe:'o',u:'mo',ruu:'raa',ouu:'lou',lii:'shii',sai:'ka',lu:'shi',"'a":'tou'};
  const relyric=bs=>bs.map(bar=>bar.map(e=>({...e,syl:swap[e.syl]||e.syl})));
  const verse8=sung('E5:0.5:ka E5:0.5:shi A5:1:mo r:0.5 G#5:0.5:ru A5:1:o | Bb5:1:ny A5:0.5:ra F5:0.5:ta D5:2:lii | C5:0.5:zhe E5:0.5:u A5:1:ka C6:1:shi A5:1:ru | B5:1.5:mo G#5:0.5:ra E5:2:ouu | '+
    'E5:0.5:ta E5:0.5:li A5:1:ka r:0.5 B5:0.5:shi C6:1:mo | D6:1:ru C6:0.5:o Bb5:0.5:ka A5:2:ru | A5:0.5:ny C6:0.5:ra E6:1:sai C6:1:lu A5:1:mo | G#5:1:ka B5:1:shi E5:2:ruu');
  const chorus=sung('A5:1:ka F5:1:shi A5:1:mo D6:1:ru | D6:1.5:o C6:0.5:ka A5:2:ruu | E5:1:ta A5:1:li C6:1:ny E6:1:ra | E6:2:o C6:2:shii | '+
    'D6:1:ka Bb5:1:shi D6:1:mo F6:1:ru | F6:1.5:o E6:0.5:ka D6:2:ruu | B5:1:zhe G#5:1:ny B5:1:'+"'"+'a E6:1:sai | E6:4:mou');
  const calls=sung('A5:2:o D6:2:shii | r:4 | F6:2:ka E6:2:ru | r:4 | C6:2:mo A5:2:ny | r:4 | B5:2:'+"'"+'a G#5:2:sai | r:4');
  const outroSong=sung('r:4 | r:4 | r:4 | r:4 | E6:2:o C6:2:shi | D6:4:raa | B5:2:ka G#5:2:ru | A5:4:mouu');
  const verse=[...verse8,...verse8],verse2=relyric(verse);
  // the aria, written as a singer's part: NOTE:BEATS[:WORD][:ORNAMENTS] - no word means the vowel carries on (a melisma);
  // g:NOTE is a grace note before the next note; r:BEATS is a breath, which ends a phrase. Ornaments (joined with +):
  // scoop (up into the note), slide (a slow slur from the last note), turn, tr (trill), fall (dropping off the end).
  const ARIA='E4:1.5:o:scoop A4:0.5 C5:2 | B4:0.5 A4:0.5 G#4:1 A4:2 | g:C5 Bb4:2:ka D5:1 F5:1:-:slide | E5:1:-:turn D5:1 Bb4:1.5:-:fall r:0.5 | '+
    'A4:1:shi C5:1 E5:2:-:slide | g:F5 E5:1 D5:0.5 C5:0.5 B4:1 C5:1 | G#4:3:lou:tr B4:1 | E4:3.5:-:fall r:0.5 | '+
    'D5:2:mo:scoop F5:1 E5:1 | g:E5 D5:1 C5:0.5 Bb4:0.5 A4:2 | F5:1:sai:slide Bb5:3:-:tr | A5:1:-:turn F5:1 D5:1.5:-:fall r:0.5 | '+
    'E5:2:ru:scoop g:F5 E5:1 C5:1 | B4:0.5 C5:0.5 B4:0.5 A4:0.5 C5:2 | g:A4 G#4:2:ou:tr B4:1 D5:1 | E5:3.5:-:fall r:0.5';
  const ariaPhrases=beat=>{const out=[];let pos=0,cur=null,grace=[],count=0;
    for(const tok of ARIA.replace(/\|/g,' ').trim().split(/\s+/)){const [n,d,w,fl]=tok.split(':');
      if(n==='g'){grace.push(hz(midiOf(d)));continue;}
      if(n==='r'){cur=null;pos+=+d;continue;}
      if(!cur){cur={start:pos,notes:[]};out.push(cur);}
      const flags={};(fl||'').split('+').forEach(x=>{if(x)flags[x]=true;});
      cur.notes.push({at:(pos-cur.start)*beat,dur:+d*beat,f:hz(midiOf(n)),midi:midiOf(n),syl:w&&w!=='-'?w:null,flags,grace:grace.length?grace:null,gain:Math.pow(10,ARIA_TRIM[count++]/20)});
      grace=[];pos+=+d;}
    return out;};
  // the neighbour above a note in the song's scale (A, B flat, C, D, E, F, G sharp), for trills and turns
  const ariaScale=[9,10,0,2,4,5,8],upper=m=>m+(ariaScale.includes((m+1)%12)?1:2);
  const ariaC=['Am','Am','Bb','Bb','Am','Am','E','E','Dm','Dm','Bb','Bb','Am','Am','E','E'];
  // per-note trims in dB, in the order the aria's notes are sung: A4, B4 and C5 on the "i" and "u" vowels land on a
  // resonance and jump out of the line, so those notes are turned down to sit with the rest
  const ARIA_TRIM=[0,0,0,0,0,0,0,0,0,0,0,0,0,-5.7,-1.8,0,0,0,0,-4.1,-1.8,0,-7.3,0,0,-2.3,0,0,0,0,0,-1.4,0,0,0,0,0,0,-5.7,-6.1,-4.4,-6.1,0,-5.6,0,-7.4,-1.2,0];
  const lead=[...empty(16),...verse,...chorus,...empty(8),...verse2,...chorus,...empty(8),...calls,...empty(16),...chorus,...chorus,...outroSong];
  // the Stylophone hook, its solo in the bridge
  const hook=bars('A5:0.5 E5:0.5 A5:0.5 C6:0.5 E6:1 C6:1 | D6:0.5 Bb5:0.5 F5:0.5 Bb5:0.5 D6:2 | C6:0.5 A5:0.5 E5:0.5 A5:0.5 C6:1 E6:1 | D6:0.5 B5:0.5 G#5:0.5 E5:0.5 B5:2');
  const solo=bars('D5:0.25 F5:0.25 A5:0.25 D6:0.25 A5:0.5 F5:0.5 D6:2 | E6:0.5 F6:0.5 E6:0.5 D6:0.5 A5:2 | Bb5:0.25 D6:0.25 F6:0.25 Bb6:0.25 F6:1 D6:1 Bb5:1 | C6:0.5 D6:0.5 F6:1 D6:2 | '+
    'C6:0.25 A5:0.25 F5:0.25 A5:0.25 C6:1 F6:2 | E6:1 C6:1 A5:2 | G#5:0.5 B5:0.5 E6:0.5 G#6:0.5 B6:2 | G#6:0.5 F6:0.5 E6:0.5 D6:0.5 B5:2');
  const quiet=n=>bars(rests(n,4));
  const V=['Am','Bb','Am','E'],C=['Dm','Dm','Am','Am','Bb','Bb','E','E'],BR=['Dm','Dm','Bb','Bb','F','F','E','E'];
  const rep=(a,n)=>Array(n).fill(a).flat();
  TUNES.splice(TUNES.findIndex(t=>t.id==='requiem')+1,0,{
    id:'contact',title:'First Contact',
    meta:'Ray-gun rock song · A minor with a flat second · 126 bpm · an alien singer and chorus, Stylophone, twin guitars, muted clavinet and creature chatter',
    desc:'They come in singing. A driving space-rock song in an alien language - real words that come back, "ka-shi mo-ru, o-ka-ru!" - sung in a voice just past the edge of human, with a low alien chorus holding the chords. A riffing bass, the muted clavinet ostinato sweeping open and shut, half-time verses and heavy choruses with twin guitars, a Stylophone hook and solo, and small creatures chattering back in the bridge. Then the band falls away and she sings an aria - one long ornamented line, slurred, trilled and melismatic - before the last choruses crash in.',
    bpm:126,beats:4,send:0.25,gain:0.52,
    // intro 8 | hook 8 | verse 16 | chorus 8 | hook 8 | verse 16 | chorus 8 | bridge 16 | aria 16 | chorus 16 | outro 8
    sections:[[0,'intro'],[8,'hook'],[16,'verse'],[32,'chorus'],[40,'hook 2'],[48,'verse 2'],[64,'chorus 2'],[72,'bridge'],[88,'aria'],[104,'chorus 3'],[120,'outro']],
    chords:[...rep(V,2),...rep(V,2),...rep(V,4),...C,...rep(V,2),...rep(V,4),...C,...rep(BR,2),...ariaC,...C,...C,...rep(V,2)],
    parts:[{inst:'surfGtr',vel:0.9,shift:0,notes:[...quiet(8),...hook,...hook,...quiet(24),...hook,...hook,...quiet(24),...solo,...quiet(40),...hook,...hook]}],
    accomp(S,bus,t,b,ch,beat){
      if(b===0||!dubFx.get(bus)||!ehFx.get(bus)){const len=this.chords.length*4*beat;ehRig(S,bus,t,len,beat);dubRig(S,bus,t,len,beat);}
      const fx=ehFx.get(bus),sec=sectionOf(this,b),k=b-this.sections.find(x=>x[1]===sec)[0],bar=4*beat,last=b===this.chords.length-1,r=ch.root,at=x=>t+x*beat;
      const bass=hz(33+(r+3)%12),tones=ch.tones.map(n=>57+(r+n+3)%12),singing=sec.startsWith('chorus')||sec==='aria';
      const K=(x,v)=>S.ehKick(at(x),v,bus),SN=(x,v)=>S.epicSnare(at(x),v,bus),H=(x,v,o)=>S.ehHat(at(x),v,fx.kit,o),tom=(x,v,f)=>S.ehTom(at(x),f,v,bus);
      const groove=(v=1,heavy)=>{if(heavy){K(0,v);K(1.5,0.7*v);K(2,v);SN(1,v);SN(3,v);}else{K(0,v);K(2.5,0.7*v);SN(2,v);}for(let i=0;i<8;i++)H(i/2,(i%2?0.4:0.7)*v,i===7&&b%2);};   // half-time, or the full rock beat
      const bounce=(v=1)=>[0,0,0,7,0,0,10,12].forEach((s,i)=>S.epicBass(at(i/2),bass*Math.pow(2,s/12),beat*0.42,(i%2?0.75:1)*v*1.3,bus));   // driving eighths on the root, a lift at the end of the bar
      const voiced=(lead[b]||[]).length>0;
      const clav=(v=1)=>{const T=(voiced?[0,1]:[0,1,2]).flatMap(o=>ch.tones.slice(0,3).map(n=>(voiced?48:60)+(r+n+3)%12+o*12)),pat=[0,2,4,3,1,5,3,2,0,4,2,5,3,1,6,4];   // the ostinato, its filter breathing over eight bars:
        for(let i=0;i<16;i+=voiced?2:1)S.clavMute(at(i/4),hz(T[pat[i]%T.length]),beat*0.2,(i%4===0?1:i%2?0.55:0.75)*v*(voiced?0.6:1),bus,0.15+0.7*(0.5-0.5*Math.cos(b/8*Math.PI*2)));};   // sixteenths in the instrumental bars, eighths in the octaves below her while she sings
      const fill=()=>[260,220,185,150,125,105,95,85].forEach((f,i)=>tom(2+i*0.25,0.9,f));
      const ritual=v=>[[0,1],[1.5,0.6],[2,0.8],[3.5,0.5]].forEach(([x,a])=>tom(x,a*v,x===0?78:95));
      // the singer, in the creatures' own voice: an octave down, near speaking pitch, with their small high mouths (formants
      // half again above human), sliding from note to note within a bar; the low chorus holds the chords behind her
      let prev=null;
      for(const e of lead[b]||[]){const f=hz(e.midi-12);S.alienSing(at(e.at),f,e.beats*beat*1.02,1.6,bus,e.syl,{glide:prev,echo:0.18,scale:1.5});prev=f;
      }
      // (in the aria the chorus holds bare vowels: its consonants made a loud blurt at the start of every second bar)
      if(singing&&b%2===0)tones.forEach((n,i)=>S.alienSing(t,hz(n-12),bar*1.9,sec==='aria'?0.4:0.35,bus,(sec==='aria'?['u','o','ou']:['mu','o','lou'])[i%3],{scale:0.95,pan:(i-1)*0.5}));
      if(last){S.epicBass(t,bass,bar,1.3,bus);K(0,1);S.ehCrash(t,1,fx.kit);tones.forEach(n=>S.ehPad(t,hz(n),bar*1.5,0.7,bus));S.alienChatter(at(2),beat*2.5,0.45,bus,b,300,1.5);return;}
      switch(sec){
      case 'intro':   // the ritual drum and the creatures first, then the bass and the clavinet, then the beat
        ritual(0.5+0.07*k);if(k<4)tones.forEach(n=>S.ehPad(t,hz(n),bar*0.97,0.4,bus));
        if(k===0||k===2)S.alienChatter(at(0.5),beat*2.5,0.5,bus,k+1);
        if(k>=4){bounce(0.6+0.1*(k-4));clav(0.6);}
        if(k>=6)K(0,0.8),K(2,0.8);
        if(k===7)fill();
        return;
      case 'aria':   // the band falls away to a drone, the low chorus and a soft ritual drum, and she sings
        ritual(0.4);tones.forEach(n=>S.ehPad(t,hz(n),bar*0.97,0.3,bus));S.epicBass(t,bass,bar*0.9,0.55,bus);
        if(k===0)for(const p of ariaPhrases(beat))S.alienPhrase(at(p.start),p.notes,2,bus,upper,{scale:1.5,echo:0.3});
        if(k===15){fill();for(let i=0;i<8;i++)SN(2+i*0.25,0.3+i*0.08);}
        return;
      case 'bridge':   // the minor turn: the Stylophone solo, then the singer calls and the creatures answer
        groove(0.9,true);bounce(0.9);clav(0.7);
        if(k>=8&&k%2===1)S.alienChatter(at(0.3),beat*3,0.55,bus,b,300+((k*37)%5)*20,1.5);
        if(k===15)fill();
        return;
      }
      // the hook and verses in half-time; the choruses heavy, with the twin guitars hitting power chords and pads behind
      const big=sec.startsWith('chorus')||sec==='outro';
      groove(1,big);bounce(1);clav(big?0.7:0.85);
      if(big){tones.forEach(n=>S.ehPad(t,hz(n),bar*0.97,voiced?0.25:0.45,bus));for(const x of [0,2,3.5])S.ehRhythm(at(x),hz(40+(r+8)%12),beat*(x===3.5?0.4:1.4),x===3.5?0.8:1,bus,true);}
      if(k===0){S.ehCrash(t,1,fx.kit);if(sec!=='outro')S.surfSlide(t,bar*0.6,0.6,bus);}
      else if(b%8===0)S.ehCrash(t,0.7,fx.kit);
      if((b+1)%8===0&&b+1<this.chords.length)fill();
      if(sec==='verse'&&k===15||sec==='verse 2'&&k===15)S.alienChatter(at(2.5),beat*1.3,0.4,bus,b);
    }
  });
  // First Contact (Overdrive): the same song and every creature voice - the singer, the low chorus, the chatter, the aria -
  // over a much harder band: distorted twin guitars chugging and ringing, the screaming lead on the hook and solo, a full
  // rock kit, and the aria over doomy half-time power chords instead of a bare drone. The voices go through a vocal
  // compressor so they ride on top without spiking.
  const hardVox=new WeakMap();
  TUNES.splice(TUNES.findIndex(t=>t.id==='contact')+1,0,{
    id:'contactHard',title:'First Contact (Overdrive)',
    meta:'Ray-gun rock song, the heavy version · A minor with a flat second · 132 bpm · the alien singer, chorus and chatter over distorted twin guitars and a screaming lead',
    desc:'First Contact with the amps turned up. The same alien singer, the same words, the same low chorus and chattering creatures - and the same ornamented aria - but now over distorted twin guitars chugging in the verses and ringing out in the choruses, a screaming lead guitar on the hook and the solo, a full rock kit with double-kick in the choruses, and the aria sung over slow, doomy power chords.',
    bpm:132,beats:4,send:0.2,gain:0.62,
    sections:[[0,'intro'],[8,'hook'],[16,'verse'],[32,'chorus'],[40,'hook 2'],[48,'verse 2'],[64,'chorus 2'],[72,'bridge'],[88,'aria'],[104,'chorus 3'],[120,'outro']],
    chords:[...rep(V,2),...rep(V,2),...rep(V,4),...C,...rep(V,2),...rep(V,4),...C,...rep(BR,2),...ariaC,...C,...C,...rep(V,2)],
    parts:[{inst:'ehLead',vel:0.85,shift:-12,notes:[...quiet(8),...hook,...hook,...quiet(24),...hook,...hook,...quiet(24),...solo,...quiet(40),...hook,...hook]}],
    accomp(S,bus,t,b,ch,beat){
      if(b===0||!dubFx.get(bus)||!ehFx.get(bus)){const len=this.chords.length*4*beat;ehRig(S,bus,t,len,beat);dubRig(S,bus,t,len,beat);}
      if(b===0||!hardVox.has(bus)){const c=S.ctx,comp=c.createDynamicsCompressor(),make=c.createGain();comp.threshold.value=-24;comp.knee.value=6;comp.ratio.value=5;comp.attack.value=0.002;comp.release.value=0.12;make.gain.value=1;comp.connect(make);make.connect(bus);hardVox.set(bus,comp);}
      const vox=hardVox.get(bus);dubFx.set(vox,{...dubFx.get(bus),desk:vox});   // the voices' own compressor, still feeding the echo and spring
      const fx=ehFx.get(bus),sec=sectionOf(this,b),k=b-this.sections.find(x=>x[1]===sec)[0],bar=4*beat,last=b===this.chords.length-1,r=ch.root,at=x=>t+x*beat;
      const bass=hz(33+(r+3)%12),pc=hz(40+(r+8)%12),tones=ch.tones.map(n=>57+(r+n+3)%12),singing=sec.startsWith('chorus')||sec==='aria';
      const K=(x,v)=>S.ehKick(at(x),v,bus),SN=(x,v)=>S.epicSnare(at(x),v,bus),H=(x,v,o)=>S.ehHat(at(x),v,fx.kit,o),tom=(x,v,f)=>S.ehTom(at(x),f,v,bus),crash=(v=1)=>S.ehCrash(t,v,fx.kit);
      const chug=(v=1)=>{for(let i=0;i<8;i++)S.ehRhythm(at(i/2),pc,beat*0.32,(i%2?0.75:0.95)*v,bus,false);};   // palm-muted eighths
      const ring=(hits,v=1)=>hits.forEach(([x,d])=>S.ehRhythm(at(x),pc,beat*d,v,bus,true));   // open power chords
      const gallop=(v=1)=>{for(let q=0;q<4;q++)[0,0.5,0.75].forEach((x,i)=>{S.ehRhythm(at(q+x),pc,beat*(i?0.2:0.4),(i?0.8:1)*v,bus,false);S.epicBass(at(q+x),bass,beat*(i?0.2:0.4),(i?0.8:1)*1.5*v,bus);});};
      const bass8=(v=1)=>{for(let i=0;i<8;i++)S.epicBass(at(i/2),bass,beat*0.42,(i%2?0.8:1)*1.5*v,bus);};
      const rock=(v=1,dbl)=>{K(0,v);K(2,v);if(dbl){K(0.5,0.7*v);K(2.5,0.7*v);K(3.5,0.6*v);}else K(2.5,0.6*v);SN(1,1.1*v);SN(3,1.1*v);for(let i=0;i<8;i++)H(i/2,(i%2?0.45:0.8)*v,i===7);};
      const half=(v=1)=>{K(0,v);K(2.5,0.7*v);SN(2,1.1*v);for(let i=0;i<8;i++)H(i/2,(i%2?0.4:0.7)*v);};
      const fill=()=>{for(let i=0;i<8;i++)(i%2?SN(2+i*0.25,0.6+i*0.05):tom(2+i*0.25,1,[260,220,185,150,125,105,95,85][i]));};
      const ritual=v=>[[0,1],[1.5,0.6],[2,0.8],[3.5,0.5]].forEach(([x,a])=>tom(x,a*v,x===0?78:95));
      // the creatures, exactly as in First Contact
      let prev=null;
      for(const e of lead[b]||[]){const f=hz(e.midi-12);S.alienSing(at(e.at),f,e.beats*beat*1.02,1.6,vox,e.syl,{glide:prev,echo:0.18,scale:1.5});prev=f;}
      if(singing&&b%2===0)tones.forEach((n,i)=>S.alienSing(t,hz(n-12),bar*1.9,sec==='aria'?0.4:0.35,vox,(sec==='aria'?['u','o','ou']:['mu','o','lou'])[i%3],{scale:0.95,pan:(i-1)*0.5}));
      if(last){ring([[0,3.5]],1);S.epicBass(t,bass,bar,1.5,bus);K(0,1);crash(1.2);S.alienChatter(at(2),beat*2.5,0.45,vox,b,300,1.5);return;}
      switch(sec){
      case 'intro':   // the ritual drum and the creatures, then a feedback swell, then the guitars come in chugging
        if(k<4){ritual(0.5+0.1*k);if(k===0||k===2)S.alienChatter(at(0.5),beat*2.5,0.5,vox,k+1);if(k===2)S.ehSweep(t,hz(40),bar*2,0.8,bus,true);return;}
        chug(0.6+0.1*(k-4));bass8(0.7+0.1*(k-4));if(k>=6)half(0.9);
        if(k===4)crash();if(k===7)fill();
        return;
      case 'aria':   // doom: one ringing power chord a bar, the bass held, a slow half-time beat; she sings over it
        ring([[0,3.8]],0.7);S.epicBass(t,bass,bar*0.95,1.2,bus);K(0,0.8);SN(2,0.8);H(0,0.5);H(1,0.4);H(2,0.5);H(3,0.4);
        if(k===0){crash(0.8);for(const p of ariaPhrases(beat))S.alienPhrase(at(p.start),p.notes,2,vox,upper,{scale:1.5,echo:0.3});}
        if(k===15){fill();for(let i=0;i<8;i++)SN(2+i*0.25,0.4+i*0.08);}
        return;
      case 'bridge':   // the gallop under the solo, then the calls and the creatures answering
        gallop(1);rock(1);
        if(k>=8&&k%2===1)S.alienChatter(at(0.3),beat*3,0.55,vox,b,300+((k*37)%5)*20,1.5);
        if(k%8===0)crash();if(k===15)fill();
        return;
      }
      // the hooks ring out over the full beat; the verses chug in half-time; the choruses hit hard with double kick
      const big=sec.startsWith('chorus')||sec==='outro';
      if(sec.startsWith('hook')){ring([[0,1.4],[1.5,0.4],[2,1.4],[3.5,0.4]]);rock(1);}
      else if(sec.startsWith('verse')){chug(0.85);half(1);}
      else{ring([[0,1.4],[1.5,0.4],[2,1.4],[3.5,0.4]],1);rock(1,true);if(b%2===0)crash(0.8);}
      bass8(1);
      if(k===0)crash(1.1);
      if((b+1)%8===0&&b+1<this.chords.length)fill();
      if(sec==='verse'&&k===15||sec==='verse 2'&&k===15)S.alienChatter(at(2.5),beat*1.3,0.4,vox,b);
    }
  });
}

// ===================================================================== A Fistful of Stardust
// A spaghetti western on the ray-gun rock band, after Morricone: a lonely whistle and a jaw harp in the wind, a twangy
// baritone guitar over a galloping rhythm, whip cracks, bells and timpani, a harmonica and a ticking music box for the
// showdown, a mariachi trumpet at the climax - and the aliens: the creature soprano from First Contact singing a
// wordless vocalise in the aria voice, and an alien chorus chanting a gliding call and grunting on the downbeats.
Synth.prototype.whistle=function(t,f,dur,v,dest){   // a whistled note: almost a pure tone, a breathy edge, a scoop and a late vibrato
  const c=this.ctx,end=t+dur+0.3,o=this.osc('sine',f,t,end),h=this.osc('sine',f*2,t,end),hg=c.createGain(),g=this.held(t,0.04,0.09*v,dur,0.12);
  o.frequency.setValueAtTime(f*0.96,t);o.frequency.exponentialRampToValueAtTime(f,t+0.08);hg.gain.value=0.04;h.connect(hg);hg.connect(g);o.connect(g);
  if(dur>0.4){const l=this.osc('sine',5.6,t,end),d=c.createGain();d.gain.setValueAtTime(0,t);d.gain.setValueAtTime(0,t+0.3);d.gain.linearRampToValueAtTime(18,t+0.8);l.connect(d);d.connect(o.detune);}
  const n=c.createBufferSource(),bp=this.filter('bandpass',f,6),ng=c.createGain();ng.gain.value=0.25;n.buffer=this.noise;n.loop=true;n.connect(bp);bp.connect(ng);ng.connect(g);n.start(t,Math.random());n.stop(end);
  this.dubOut(g,dest,0.35,0.4);
};
Synth.prototype.jawHarp=function(t,f,v,dest){   // boing: a twanged reed, the mouth sweeping its resonance up and back
  const c=this.ctx,end=t+0.7,o=this.osc('sawtooth',f,t,end),bp=this.filter('bandpass',500,8),g=this.amp(t,0.003,0.5*v,0.6,end);
  bp.frequency.setValueAtTime(450,t);bp.frequency.exponentialRampToValueAtTime(1700,t+0.15);bp.frequency.exponentialRampToValueAtTime(600,t+0.55);
  o.connect(bp);bp.connect(g);this.dubOut(g,dest,0.2,0.3);
};
Synth.prototype.whipCrack=function(t,v,dest){   // the crack, and its echo off the canyon
  this.hit(t,0.5*v,dest,3500,0.9,0.015,'highpass');this.hit(t+0.004,0.3*v,dest,1400,2,0.03);
  const r=this.ctx.createGain();r.gain.value=0.6;r.connect(this.verb);this.hit(t,0.4*v,r,3000,0.8,0.02,'highpass');
};
Synth.prototype.bell=function(t,f,v,dest){   // a tubular bell: inharmonic partials, a long ring
  [[1,1,4],[2.0,0.5,3],[2.76,0.35,2.4],[4.07,0.2,1.6],[5.2,0.12,1.1]].forEach(([k,a,d])=>{const o=this.osc('sine',f*k,t,t+d+0.1),g=this.amp(t,0.002,0.09*a*v,d,t+d+0.1);o.connect(g);g.connect(dest);const r=this.ctx.createGain();r.gain.value=0.5;g.connect(r);r.connect(this.verb);});
};
Synth.prototype.harmonica=function(t,f,dur,v,dest){   // a reedy harmonica: a narrow pulse in a nasal band, breath, a hand wah on held notes, a bend up into the note
  const c=this.ctx,end=t+dur+0.2,p=this.pwOsc(f,t,end,0.3),bp=this.filter('bandpass',1300,1.6),lp=this.filter('lowpass',3500,0.7),g=this.held(t,0.03,0.12*v,dur,0.1),wah=c.createGain();
  p.saw.frequency.setValueAtTime(f*0.94,t);p.saw.frequency.exponentialRampToValueAtTime(f,t+0.12);
  if(dur>0.5){const l=this.osc('sine',4.5,t,end),d=c.createGain();d.gain.setValueAtTime(0,t);d.gain.setValueAtTime(0,t+0.3);d.gain.linearRampToValueAtTime(0.35,t+0.7);wah.gain.value=0.75;l.connect(d);d.connect(wah.gain);}
  p.out.connect(bp);bp.connect(lp);lp.connect(wah);wah.connect(g);this.dubOut(g,dest,0.25,0.3);
};
Synth.prototype.gunshot=function(t,v,dest){   // a shot, and the bullet whining off a rock
  const c=this.ctx,n=c.createBufferSource(),lp=this.filter('lowpass',2500,0.7),g=this.amp(t,0.001,0.6*v,0.25,t+0.4),r=c.createGain();
  n.buffer=this.noise;n.connect(lp);lp.connect(g);g.connect(dest);r.gain.value=1.2;g.connect(r);r.connect(this.verb);n.start(t,Math.random(),0.4);
  const s=t+0.12,o=this.osc('sine',2800,s,s+0.7),og=this.amp(s,0.01,0.05*v,0.6,s+0.7),w=this.osc('sine',23,s,s+0.7),wg=c.createGain();
  o.frequency.exponentialRampToValueAtTime(900,s+0.6);wg.gain.value=60;w.connect(wg);wg.connect(o.detune);o.connect(og);this.dubOut(og,dest,0.4,0.2);
};
{
  // the vocalise, written as a singer's part like the aria in First Contact: NOTE:BEATS[:VOWEL][:ORNAMENTS], g:NOTE a grace
  // note, r:BEATS a breath
  const VOCALISE='E4:4:a:scoop | F4:2 E4:1 D4:1 | E4:2 G4:2:-:slide | D4:3:-:turn r:1 | '+
    'A4:3:o:scoop G4:1 | F4:2 A4:2:-:slide | G#4:4:-:tr | E4:3.5:-:fall r:0.5 | '+
    'D4:2:a A4:2:-:slide | C5:3 B4:1 | B4:2 G#4:2 | A4:3.5:-:fall r:0.5 | '+
    'g:G4 F4:2:o A4:2 | G4:2 D5:2:-:slide | C5:2:-:turn B4:1 G#4:1 | A4:4:-:fall';
  const phrasesOf=(str,beat,shift=0)=>{const out=[];let pos=0,cur=null,grace=[];
    for(const tok of str.replace(/\|/g,' ').trim().split(/\s+/)){const [n,d,w,fl]=tok.split(':');
      if(n==='g'){grace.push(hz(midiOf(d)+shift));continue;}
      if(n==='r'){cur=null;pos+=+d;continue;}
      if(!cur){cur={start:pos,notes:[]};out.push(cur);}
      const flags={};(fl||'').split('+').forEach(x=>{if(x)flags[x]=true;});
      cur.notes.push({at:(pos-cur.start)*beat,dur:+d*beat,f:hz(midiOf(n)+shift),midi:midiOf(n)+shift,syl:w&&w!=='-'?w:null,flags,grace:grace.length?grace:null});
      grace=[];pos+=+d;}
    return out;};
  const upper=m=>m+([9,11,0,2,4,5,8].includes((m+1)%12)?1:2);   // the next note up in A harmonic minor, for trills and turns
  // the alien chorus's call: a slide up a minor sixth and down a fifth, then a low grunt - three singers of different sizes
  const callNotes=(beat,base)=>[{at:0,dur:beat*0.6,f:hz(base),midi:base,syl:'a',flags:{}},{at:beat*0.6,dur:beat*1.2,f:hz(base+8),midi:base+8,syl:null,flags:{slide:true}},
    {at:beat*1.8,dur:beat*0.9,f:hz(base+3),midi:base+3,syl:'ua',flags:{fall:true}}];
  const theme=bars('A4:3 E4:1 | A4:1 C5:1 B4:1 A4:1 | G4:3 E4:1 | G4:1 C5:1 E5:2 | D5:3 B4:1 | D5:1 G5:1 F5:1 D5:1 | E5:4 | E5:2 r:1 E4:1 | '+
    'F4:3 A4:1 | C5:2 A4:1 F4:1 | G4:3 B4:1 | D5:2 B4:1 G4:1 | E4:1 G#4:1 B4:1 D5:1 | E5:3 D5:1 | C5:1 B4:1 A4:2 | A4:4');
  const harmonicaTune=bars('A4:4 | C5:2 B4:2 | A4:4 | E4:4 | A4:2 C5:2 | E5:4 | D5:2 C5:2 | B4:4');
  const whistleIntro=bars('r:4 | A5:3 E5:1 | A5:4 | r:4 | r:4 | G5:3 E5:1 | E5:4 | r:4');
  const quiet=n=>bars(rests(n,4));
  const TC=['Am','Am','C','C','G','G','Am','Am','F','F','G','G','E','E','Am','Am'],VC=['Am','F','C','G','Am','F','E','E','Dm','Am','E','Am','F','G','Am','Am'];
  const westVox=new WeakMap();
  TUNES.splice(TUNES.findIndex(t=>t.id==='contactHard')+1,0,{
    id:'western',title:'A Fistful of Stardust',
    meta:'Ray-gun rock spaghetti western · A minor · 96 bpm · whistle, jaw harp, twang guitar, gallop, bells, the creature soprano and an alien chorus',
    desc:'High noon on a dead planet. A lonely whistle and a jaw harp in the wind, an alien chorus calling across the canyon, then the gallop: a twanging baritone guitar, whip cracks, bells and timpani. The creature soprano from First Contact sings a soaring wordless vocalise; a harmonica and a ticking music box stretch out the showdown; a mariachi trumpet leads the climax with the chorus grunting on the downbeats; and the whistle comes back as the dust settles, until the last shot.',
    bpm:96,beats:4,send:0.3,gain:0.75,
    // intro 8 | theme 16 | vocalise 16 | showdown 8 | climax 16 | outro 8
    sections:[[0,'intro'],[8,'theme'],[24,'vocalise'],[40,'showdown'],[48,'climax'],[64,'outro']],
    chords:[...Array(8).fill('Am'),...TC,...VC,...Array(8).fill('Am'),...TC,'Am','Am','C','C','Am','Am','E','Am'],
    parts:[
      {inst:'whistle',vel:1,shift:0,notes:[...whistleIntro,...quiet(56),...bars('A5:3 E5:1 | A5:1 C6:1 B5:1 A5:1 | G5:3 E5:1 | G5:1 C6:1 E6:2 | A5:4 | r:4 | r:4 | r:4')]},
      {inst:'surfGtr',vel:0.9,shift:-12,notes:[...quiet(8),...theme,...quiet(24),...theme,...quiet(8)]},
      {inst:'trumpet',vel:1.8,shift:0,notes:[...quiet(48),...theme,...quiet(8)]},
      {inst:'harmonica',vel:1,shift:0,notes:[...quiet(40),...harmonicaTune,...quiet(24)]}],
    accomp(S,bus,t,b,ch,beat){
      if(b===0||!dubFx.get(bus)||!ehFx.get(bus)){const len=this.chords.length*4*beat;ehRig(S,bus,t,len,beat);dubRig(S,bus,t,len,beat);}
      if(b===0||!westVox.has(bus)){const c=S.ctx,comp=c.createDynamicsCompressor(),make=c.createGain();comp.threshold.value=-24;comp.knee.value=6;comp.ratio.value=6;comp.attack.value=0.002;comp.release.value=0.15;make.gain.value=0.9;comp.connect(make);make.connect(bus);westVox.set(bus,comp);}
      const vox=westVox.get(bus);   // the alien voices go through their own vocal compressor
      dubFx.set(vox,{...dubFx.get(bus),desk:vox});   // ... and still reach the echo and the spring
      const fx=ehFx.get(bus),sec=sectionOf(this,b),k=b-this.sections.find(x=>x[1]===sec)[0],bar=4*beat,last=b===this.chords.length-1,r=ch.root,at=x=>t+x*beat;
      const root=33+(r+3)%12,tones=ch.tones.map(n=>57+(r+n+3)%12);
      const K=(x,v)=>S.ehKick(at(x),v,bus),tom=(x,v,f)=>S.ehTom(at(x),f,v,bus);
      const gallop=(v=1)=>{for(let q=0;q<4;q++){tom(q,0.45*v,150);tom(q+0.25,0.45*v,150);tom(q+0.5,0.75*v,110);S.surfGtr(at(q+0.5),hz(root+12),beat*0.2,0.5*v,bus);}K(0,0.8*v);K(2,0.7*v);};   // ta-ta-TUM, every beat
      const call=(x,v=1)=>[[57,1.15,-0.5],[57,1.35,0.5],[45,1.25,0]].forEach(([base,sc,pan],i)=>S.alienPhrase(at(x)+i*0.015,callNotes(beat,base),v*(i===2?1.35:1.05),vox,upper,{scale:sc,pan,echo:0.55}));
      const rr=(r+3)%12,grunt=(x,v=1)=>[[57,1.2,-0.4],[57,1.4,0.4],[45,1.3,0]].forEach(([base,sc,pan])=>S.alienSing(at(x),hz(base+rr-(rr>6?12:0)),beat*0.5,0.5*v,vox,'ua',{scale:sc,pan}));
      if(!last)S.epicBass(t,hz(root),bar*0.9,0.8,bus);
      switch(sec){
      case 'intro':   // wind, a bell, the jaw harp, the call across the canyon; the gallop creeps in at the end
        if(k===0){S.dubWind(t,bar*8,1,bus);S.bell(t,hz(57),1,bus);}
        S.jawHarp(t,hz(45),0.8,bus);S.jawHarp(at(2),hz(45),0.6,bus);
        if(k===2||k===5)call(0.5);
        if(k>=6){for(let q=0;q<4;q++){tom(q+0.5,0.35+0.1*(k-6)+q*0.05,110);tom(q,0.25,150);tom(q+0.25,0.25,150);}}
        if(k===7)S.whipCrack(at(3.5),1,bus);
        return;
      case 'theme': case 'climax': {   // the gallop under the theme; the climax adds timpani, bells, the chorus grunting and the soprano on high
        const big=sec==='climax';gallop(big?1.15:1);
        tones.forEach(m=>S.ehPad(t,hz(m),bar*0.97,big?0.45:0.3,bus));
        if(k%4===0){S.whipCrack(t,1,bus);if(big)S.bell(t,hz(57+(r+3)%12),0.9,bus);}
        if(big){S.timpani(t,hz(root),0.8,bus,1);S.timpani(at(2),hz(root),0.6,bus,1);grunt(0,0.9);if(k%2===1)grunt(2,0.7);}
        if(big&&k===0)for(const p of phrasesOf('A4:8:a:scoop | E5:8:-:slide | D5:4:-:turn C5:4 | B4:7.5:-:fall r:0.5',beat))S.alienPhrase(at(p.start),p.notes,1.6,vox,upper,{scale:1.5,echo:0.35});
        if(big&&k===8)for(const p of phrasesOf('C5:8:o:scoop | B4:4 D5:4:-:slide | E5:6:-:tr D5:2 | C5:2 B4:2 A4:4:-:fall',beat))S.alienPhrase(at(p.start),p.notes,1.6,vox,upper,{scale:1.5,echo:0.35});
        if(k===15)[260,220,185,150,125,105,95,85].forEach((f,i)=>tom(2+i*0.25,0.9,f));
        return;
      }
      case 'vocalise':   // the gallop eases to a heartbeat; bells and a tremolo guitar; she sings
        tones.forEach(m=>S.ehPad(t,hz(m),bar*0.97,0.45,bus));K(0,0.6);K(2.5,0.4);
        for(let i=0;i<16;i++)S.surfGtr(at(i/4),hz(tones[i%3]+12),beat*0.2,0.25,bus);
        if(k%4===0)S.bell(t,hz(69),0.6,bus);
        if(k===0)for(const p of phrasesOf(VOCALISE,beat))S.alienPhrase(at(p.start),p.notes,2,vox,upper,{scale:1.5,echo:0.3});
        if(k===15)S.whipCrack(at(3.5),1,bus);
        return;
      case 'showdown': {   // a pocket watch playing its little tune, the harmonica, the timpani like a heartbeat getting louder
        const box=[81,76,84,76,83,76,81,76];box.forEach((m,i)=>S.xylo(at(i*0.5),hz(m),beat*0.4,0.35,bus));
        S.timpani(t,hz(33),0.3+k*0.08,bus,1.2);S.timpani(at(2),hz(33),0.2+k*0.06,bus,1);
        if(k===4)call(1,0.6);
        if(k===7){S.timpRoll(at(2),hz(33),beat*2,0.3,1,bus);S.whipCrack(at(3.75),1.2,bus);}
        return;
      }
      case 'outro':   // the dust settles: wind, the whistle, the call one last time, a bell - and the last shot
        if(k===0){S.dubWind(t,bar*8,0.9,bus);S.bell(t,hz(57),0.8,bus);}
        if(k<6)S.jawHarp(t,hz(45),0.5,bus);
        if(k===5)call(0.5,0.8);
        if(last){S.gunshot(at(1),1,bus);S.bell(at(2.5),hz(45),0.6,bus);}
        return;
      }
    }
  });
}

// ===================================================================== God Rest Ye Merry Starmen
// A Christmas carol on the heavy ray-gun rock band: "God Rest Ye Merry Gentlemen" (traditional) sung by the creature
// singer from First Contact in her own language, over the band from First Contact (Overdrive) - distorted twin guitars,
// raspy strings playing the refrain in harmony, double kick - with sleigh bells shaking through everything, tubular bells
// pealing, a breakdown where she sings the first line legato, and a key change up a tone for the last verse.
Synth.prototype.sleighBells=function(t,v,dest,shake){   // a strap of little jingles: baked once into a few shakes, played back at slightly different speeds
  const c=this.ctx;
  if(!this.sleigh){const sr=c.sampleRate;let s=7;const rnd=()=>(s=s*16807%2147483647)/2147483647;
    const make=(n,spread)=>{const len=Math.floor(sr*(spread+0.3)),buf=c.createBuffer(1,len,sr),d=buf.getChannelData(0);let peak=0;
      for(let j=0;j<n;j++){const o=Math.floor(sr*spread*Math.pow(rnd(),1.4)),a=0.4+0.6*rnd(),f=2600+rnd()*4800,tau=0.02+0.045*rnd(),
          parts=[[f,1],[f*(1.45+0.12*rnd()),0.6],[f*(2.2+0.3*rnd()),0.35]],m=Math.min(len-o,Math.floor(sr*tau*6));
        for(let i=0;i<m;i++){const x=i/sr;let y=0;for(const [pf,pa] of parts)y+=pa*Math.sin(2*Math.PI*pf*x);d[o+i]+=a*(y*Math.exp(-x/tau)+(rnd()*2-1)*0.6*Math.exp(-x/0.003));}}   // the ring, and the ball's rattle
      for(let i=0;i<len;i++)peak=Math.max(peak,Math.abs(d[i]));for(let i=0;i<len;i++)d[i]/=peak;return buf;};
    this.sleigh={tap:[0,1,2].map(()=>make(6,0.016)),shake:[0,1].map(()=>make(24,0.1))};}
  const set=this.sleigh[shake?'shake':'tap'],src=c.createBufferSource(),hp=this.filter('highpass',2200,0.7),g=c.createGain(),r=c.createGain();
  src.buffer=set[Math.floor(Math.random()*set.length)];src.playbackRate.value=0.95+Math.random()*0.1;g.gain.value=0.15*v;r.gain.value=0.35;
  src.connect(hp);hp.connect(g);g.connect(this.pan(dest,0.35));g.connect(r);r.connect(this.verb);src.start(t);
};
// tape strings, played by aliens: a Mellotron-style string section - strings recorded on tape, so a soft, late attack,
// a dusty top, wow and flutter and a little tape saturation - but bowed strangely: every note slides from the section's
// last note (or scoops up from below after a breath), the five players spread a quarter-tone wide and arriving a hair
// apart, and a glassy ponticello edge rasping over the top. id keeps each section's last note, for its slides
Synth.prototype.tapeStrings=function(t,f,dur,v,dest,pan,id){
  const c=this.ctx,end=t+dur+0.7,mem=this.tapeLast||(this.tapeLast={}),last=mem[id];mem[id]={f,end:t+dur};
  const slide=last&&t-last.end<0.08&&last.f!==f,from=slide?last.f:f*0.944,glide=slide?0.1:0.08;
  const mix=c.createGain(),sat=c.createWaveShaper(),hp=this.filter('highpass',Math.max(65,f*0.6),0.7),lo=this.filter('peaking',520,1),mid=this.filter('peaking',1500,1.5),dust=this.filter('lowpass',4800,0.7);
  const g=this.held(t,slide?0.04:0.12,0.12*v,dur,0.35),r=c.createGain();
  mix.gain.value=0.2;sat.curve=ehDrive;lo.gain.value=3;mid.gain.value=4;
  const wow=this.osc('sine',0.55+Math.random()*0.2,t,end),wd=c.createGain(),flut=this.osc('sine',7.8+Math.random(),t,end),fd=c.createGain();
  wd.gain.value=7;fd.gain.value=2.5;wow.connect(wd);flut.connect(fd);
  [-24,-11,0,12,23].forEach((cents,i)=>{const o=this.osc('sawtooth',f,t,end),l=this.osc('sine',4.6+i*0.31,t,end),d=c.createGain();o.detune.value=cents;
    o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(f,t+glide+i*0.012);
    d.gain.setValueAtTime(0,t);d.gain.setValueAtTime(0,t+0.2);d.gain.linearRampToValueAtTime(dur>0.5?12:4,t+Math.min(0.5,dur+0.1));
    l.connect(d);d.connect(o.detune);wd.connect(o.detune);fd.connect(o.detune);o.connect(mix);});
  // ponticello: the glassy scrape near the bridge, trembling with the bow
  const pont=this.filter('bandpass',Math.min(7000,f*5),2.5),pg=c.createGain(),trem=this.osc('sine',11+Math.random()*3,t,end),td=c.createGain();
  pg.gain.value=0.35;td.gain.value=0.15;trem.connect(td);td.connect(pg.gain);
  mix.connect(sat);sat.connect(hp);hp.connect(lo);lo.connect(mid);mid.connect(dust);dust.connect(g);sat.connect(pont);pont.connect(pg);pg.connect(g);
  if(!slide){const n=c.createBufferSource(),bp=this.filter('bandpass',3200,1),ng=this.held(t,0.01,0.25,Math.min(dur,0.07),0.1);
    n.buffer=this.noise;n.connect(bp);bp.connect(ng);ng.connect(hp);n.start(t,Math.random(),0.3);}   // rosin, as the bow first digs in
  g.connect(this.pan(dest,pan));r.gain.value=0.45;g.connect(r);r.connect(this.verb);
};
Synth.prototype.violins1=function(t,f,dur,v,dest){this.tapeStrings(t,f,dur,v,dest,-0.4,'v1');};
Synth.prototype.violins2=function(t,f,dur,v,dest){this.tapeStrings(t,f,dur,v,dest,0.4,'v2');};
Synth.prototype.violas=function(t,f,dur,v,dest){this.tapeStrings(t,f,dur,v,dest,0.15,'va');};
Synth.prototype.celli=function(t,f,dur,v,dest){this.tapeStrings(t,f,dur,v,dest,-0.1,'vc');};
{
  // a sung line: "E5:1:ka B5:1:shi r:1" - note, beats, syllable
  const sung=str=>str.split('|').map(bar=>{let at=0;const ev=[];for(const tok of bar.trim().split(/\s+/)){const [n,d,syl]=tok.split(':');if(n!=='r')ev.push({at,beats:+d,midi:midiOf(n),syl});at+=+d;}return ev;});
  const empty=n=>Array.from({length:n},()=>[]),up=(bs,k)=>bs.map(bar=>bar.map(e=>({...e,midi:e.midi+k}))),rep=(a,n)=>Array(n).fill(a).flat();
  // the carol in E minor, a bar at a time; the pick-up is sung at the end of the bar before each verse. The refrain's
  // "ko-mo-ra-zhoi" stays the same every time
  const pick=sung('r:3 E5:1:go')[0],pick2=sung('r:3 E5:1:do')[0];
  const verse=sung('E5:1:ra B5:1:zhe B5:1:me A5:1:ri | G5:1:ka F#5:1:shi E5:1:mo D5:1:lu | E5:1:no F#5:1:ta G5:1:yu A5:1:di | B5:3:sai E5:1:ru | '+
    'E5:1:me B5:1:ba B5:1:ka A5:1:ri | G5:1:shi F#5:1:ta E5:1:o D5:1:sa | E5:1:bi F#5:1:o G5:1:ka A5:1:ru | B5:3:nou B5:1:to | '+
    'C6:1:sei A5:1:u B5:1:sa C6:1:lo | D6:1:shi E6:1:ta B5:1:nei A5:1:pa | G5:1:u E5:1:ki F#5:1:go G5:1:na | A5:2:rai G5:1:o A5:1:ti | '+
    'B5:2:du C6:1:ki B5:1:ro | B5:1:ko A5:1:yo G5:1:mo F#5:1:ra | E5:2:zhoi G5:0.5:ko F#5:0.5:mo E5:1:ra | A5:2:zhoi G5:1:zho A5:1:ti | '+
    'B5:1:du C6:1:ki D6:1:shi E6:1:ro | B5:1:ko A5:1:yo G5:1:mo F#5:1:ra | E5:3:zhooi r:1 | r:4');
  const swap={ra:'ta',zhe:'lu',me:'ka',ri:'ny',ka:'mo',shi:'ru',mo:'sai',lu:'zhe',no:'ba',ta:'li',yu:'o',di:'ma',sai:'lou',ru:'ka',ba:'shi',o:'ki',sa:'ra',
    bi:'du',nou:'shou',to:'ga',sei:'mi',u:'lo',lo:'na',nei:'ko',pa:'ru',ki:'ta',go:'zhi',na:'mo',rai:'sei',ti:'o'};
  const verse2=[...verse.slice(0,12).map(bar=>bar.map(e=>({...e,syl:swap[e.syl]||e.syl}))),...verse.slice(12)];
  const tag=up(verse.slice(16,20),2);   // "comfort and joy", in the new key
  const lead=[...empty(3),pick,...verse,...empty(7),pick2,...verse2,...empty(23),...up([pick],2),...up(verse,2),...tag.slice(0,3),[],...up(sung('r:2 G5:1:o A5:1:ti'),2),...tag.slice(0,2),...sung('F#5:4:zhooi')];   // the tag: comfort and joy, a breath, O tidings of comfort and joy
  // the strings' riff, in four parts: the refrain on top (first violins); the second violins holding and stepping beneath
  // it; the violas filling in the chord; the celli on a falling lament bass that moves against the tune. The leading
  // notes rise, the sevenths fall, and the violas hang on into the last chord before they resolve
  const riff=bars('B5:2 C6:1 B5:1 | B5:1 A5:1 G5:1 F#5:1 | E5:2 G5:0.5 F#5:0.5 E5:1 | A5:2 G5:1 A5:1 | B5:1 C6:1 D6:1 E6:1 | B5:1 A5:1 G5:1 F#5:1 | E5:3 r:1 | r:4');
  const vln2=bars('G5:4 | F#5:2 D#5:2 | B4:4 | A4:4 | C5:4 | B4:2 D#5:2 | E5:4 | B4:3 r:1');
  const vla=bars('C5:4 | B4:4 | G4:4 | F#4:2 D4:2 | E4:4 | D#4:4 | G4:4 | G4:3 r:1');
  const vc=bars('E3:2 C3:2 | B2:2 A2:2 | G2:2 E2:2 | D2:2 F#2:2 | E2:2 C2:2 | B2:2 F#2:2 | E3:2 G2:2 | E2:3 r:1');
  const solo=bars('E5:0.25 G5:0.25 B5:0.25 E6:0.25 B5:0.5 G5:0.5 E6:2 | F#6:0.5 G6:0.5 F#6:0.5 E6:0.5 D6:2 | C6:0.25 E6:0.25 G6:0.25 C7:0.25 G6:1 E6:1 C6:1 | B5:0.5 D#6:0.5 F#6:0.5 A6:0.5 B6:2 | '+
    'E6:1 B5:1 B5:1 A5:1 | G5:1 F#5:1 E5:1 D5:1 | E5:0.5 F#5:0.5 G5:0.5 A5:0.5 B5:0.5 C6:0.5 D6:0.5 E6:0.5 | F#6:4 | '+
    'G6:0.25 F#6:0.25 E6:0.25 B5:0.25 G6:0.25 F#6:0.25 E6:0.25 B5:0.25 G6:0.25 F#6:0.25 E6:0.25 B5:0.25 E6:1 | F#6:0.25 E6:0.25 D6:0.25 A5:0.25 F#6:0.25 E6:0.25 D6:0.25 A5:0.25 F#6:0.25 E6:0.25 D6:0.25 A5:0.25 D6:1 | '+
    'E6:0.25 D6:0.25 C6:0.25 G5:0.25 E6:0.25 D6:0.25 C6:0.25 G5:0.25 C6:0.5 E6:0.5 G6:0.5 C7:0.5 | B6:2 A6:0.5 F#6:0.5 D#6:0.5 B5:0.5 | '+
    'E6:1.5 B5:0.5 E6:1 G6:1 | F#6:1.5 D6:0.5 A6:2 | G6:0.5 E6:0.5 C6:0.5 E6:0.5 G6:0.5 C7:0.5 E7:1 | D#7:0.5 F#7:3 r:0.5');   // up to a held high F sharp over the B7: left hanging, to lead into the breakdown
  // the breakdown: the first line again, an octave up and legato, written as a singer's part like the aria in First
  // Contact: NOTE:BEATS[:WORD][:ORNAMENTS], g:NOTE a grace note, r:BEATS a breath
  const BREAK='E5:1:o:scoop B5:2:-:slide A5:1 | G5:1 F#5:1 E5:1 D5:1 | g:D5 E5:1:shi F#5:1 G5:1 A5:1:-:slide | B5:3.5:-:tr r:0.5 | '+
    'E5:1:mo:scoop B5:2:-:slide A5:1 | G5:1:-:turn F#5:1 E5:1 D5:1 | E5:1 F#5:1 G5:1 A5:1 | G#5:2.5:-:fall r:1.5';
  const phrasesOf=(str,beat)=>{const out=[];let pos=0,cur=null,grace=[];
    for(const tok of str.replace(/\|/g,' ').trim().split(/\s+/)){const [n,d,w,fl]=tok.split(':');
      if(n==='g'){grace.push(hz(midiOf(d)));continue;}
      if(n==='r'){cur=null;pos+=+d;continue;}
      if(!cur){cur={start:pos,notes:[]};out.push(cur);}
      const flags={};(fl||'').split('+').forEach(x=>{if(x)flags[x]=true;});
      cur.notes.push({at:(pos-cur.start)*beat,dur:+d*beat,f:hz(midiOf(n)),midi:midiOf(n),syl:w&&w!=='-'?w:null,flags,grace:grace.length?grace:null});
      grace=[];pos+=+d;}
    return out;};
  const upper=m=>m+([4,6,7,9,11,0,2].includes((m+1)%12)?1:2);   // the next note up in E minor, for trills and turns
  const quiet=n=>bars(rests(n,4));
  const V=['Em','D','C','B7','Em','D','C','B7','Am','G','Em','B7','C','B7','Em','D','C','B7','Em','Em'],R=V.slice(12),UP={Em:'F#m',D:'E',C:'D',B7:'C#7',Am:'Bm',G:'A'};
  const xmasVox=new WeakMap(),xmasHarm=new WeakMap();
  // the creatures' harmonies for the "tidings of comfort and joy", a note for each of hers ('-' sits one out): a descant
  // above her and a line below, by the bar of the verse; in the last verse and the tag they go up a tone with her
  const DESCANT={11:'- B5 B5',12:'E6 G6 E6',13:'F#6 F#6 B5 A5',14:'G5 B5 A5 G5',15:'F#6 E6 F#6',16:'D6 E6 G6 G6',17:'D#6 C6 B5 A5',18:'E6',19:'E6',20:'E6',21:'B5 D6'};
  const BELOW={11:'- D#5 D#5',12:'G5 E5 G5',13:'F#5 F#5 D#5 D#5',14:'B4 E5 D#5 B4',15:'F#5 E5 F#5',16:'E5 E5 G5 G5',17:'F#5 F#5 D#5 D#5',18:'G4',19:'G4',20:'G4',21:'D5 F#5'};
  // the low chorus (and the glockenspiel): each chord voiced in three parts as close as it can be to the one before -
  // shared notes held, the rest moving by the smallest steps; a seventh chord keeps its root, third and seventh
  const voiceChords=names=>{let prev=null;return names.map(nm=>{const ch=chordOf(nm),pcs=(ch.tones.length===4?[0,1,3]:[0,1,2]).map(i=>(ch.root+ch.tones[i])%12);
    const opts=pcs.map(pc=>[54,66].map(lo=>lo+((pc-lo)%12+12)%12).filter(m=>m<=69));let best=null,cost=1e9;
    for(const a of opts[0])for(const b of opts[1])for(const c of opts[2]){const v=[a,b,c].sort((x,y)=>x-y);if(v[2]-v[0]>12)continue;
      const k=prev?v.reduce((n,m,i)=>n+Math.abs(m-prev[i]),0):Math.abs(v[1]-60);if(k<cost){cost=k;best=v;}}
    return prev=best;});};
  TUNES.splice(TUNES.findIndex(t=>t.id==='western')+1,0,{
    id:'xmas',title:'God Rest Ye Merry Starmen',
    meta:'Ray-gun rock Christmas carol · E minor, then F sharp minor · 132 bpm · the creature singer and chorus, sleigh bells, tubular bells, distorted twin guitars and raspy strings',
    desc:'"God Rest Ye Merry Gentlemen", sung by the creatures. The singer from First Contact leads the old carol in her own language - the refrain comes round as "ko-mo-ra-zhoi" - over the heavy band from First Contact (Overdrive): distorted twin guitars, raspy strings playing the refrain in harmony, double kick, and sleigh bells shaking through all of it. Tubular bells peal, the low chorus holds the chords, a galloping guitar solo, a breakdown where she sings the first line slurred and trilled over a glockenspiel, then a key change up a tone and the whole alien choir in for the last verse.',
    bpm:132,beats:4,send:0.2,gain:0.6,
    // intro 4 | verse 20 | riff 8 | verse 20 | solo 16 | breakdown 8 | verse (up a tone) 20 | outro 8
    sections:[[0,'intro'],[4,'verse'],[24,'riff'],[32,'verse 2'],[52,'solo'],[68,'breakdown'],[76,'verse 3'],[96,'outro']],
    chords:['Em','Em','Em','B7',...V,...R,...V,...rep(['Em','D','C','B7'],4),'Em','D','C','B7','Em','D','C','C#7',...V.map(c=>UP[c]),...['C','B7','Em','Em','D','C','B7','Em'].map(c=>UP[c])],
    parts:[{inst:'ehLead',vel:0.85,shift:-12,notes:[...quiet(52),...solo,...quiet(36)]},
      {inst:'violins1',vel:1,shift:0,notes:[...quiet(24),...riff,...quiet(72)]},
      {inst:'violins2',vel:0.75,shift:0,notes:[...quiet(24),...vln2,...quiet(72)]},
      {inst:'violas',vel:0.75,shift:0,notes:[...quiet(24),...vla,...quiet(72)]},
      {inst:'celli',vel:0.95,shift:0,notes:[...quiet(24),...vc,...quiet(72)]}],
    accomp(S,bus,t,b,ch,beat){
      if(b===0||!dubFx.get(bus)||!ehFx.get(bus)){const len=this.chords.length*4*beat;ehRig(S,bus,t,len,beat);dubRig(S,bus,t,len,beat);}
      if(b===0||!xmasVox.has(bus)){const c=S.ctx,comp=c.createDynamicsCompressor(),make=c.createGain();comp.threshold.value=-24;comp.knee.value=6;comp.ratio.value=5;comp.attack.value=0.002;comp.release.value=0.12;make.gain.value=1;comp.connect(make);make.connect(bus);xmasVox.set(bus,comp);}
      if(b===0||!xmasHarm.has(bus)){const c=S.ctx,comp=c.createDynamicsCompressor(),make=c.createGain();comp.threshold.value=-24;comp.knee.value=6;comp.ratio.value=5;comp.attack.value=0.002;comp.release.value=0.12;make.gain.value=1;comp.connect(make);make.connect(bus);xmasHarm.set(bus,comp);}
      const vox=xmasVox.get(bus),harm=xmasHarm.get(bus);dubFx.set(vox,{...dubFx.get(bus),desk:vox});dubFx.set(harm,{...dubFx.get(bus),desk:harm});   // the voices' own compressor, still feeding the echo and spring
      const fx=ehFx.get(bus),sec=sectionOf(this,b),k=b-this.sections.find(x=>x[1]===sec)[0],bar=4*beat,last=b===this.chords.length-1,r=ch.root,at=x=>t+x*beat;
      const bass=hz(33+(r+3)%12),pc=hz(40+(r+8)%12),tones=(this.voiced||(this.voiced=voiceChords(this.chords)))[b];
      const K=(x,v)=>S.ehKick(at(x),v,bus),SN=(x,v)=>S.epicSnare(at(x),v,bus),H=(x,v,o)=>S.ehHat(at(x),v,fx.kit,o),tom=(x,v,f)=>S.ehTom(at(x),f,v,bus),crash=(v=1)=>S.ehCrash(t,v,fx.kit);
      const chug=(v=1)=>{for(let i=0;i<8;i++)S.ehRhythm(at(i/2),pc,beat*0.32,(i%2?0.75:0.95)*v,bus,false);};   // palm-muted eighths
      const ring=(hits,v=1)=>hits.forEach(([x,d])=>S.ehRhythm(at(x),pc,beat*d,v,bus,true));   // open power chords
      const pushes=v=>ring([[0,1.4],[1.5,0.4],[2,1.4],[3.5,0.4]],v);
      const gallop=(v=1)=>{for(let q=0;q<4;q++)[0,0.5,0.75].forEach((x,i)=>{S.ehRhythm(at(q+x),pc,beat*(i?0.2:0.4),(i?0.8:1)*v,bus,false);S.epicBass(at(q+x),bass,beat*(i?0.2:0.4),(i?0.8:1)*1.5*v,bus);});};
      const bass8=(v=1)=>{for(let i=0;i<8;i++)S.epicBass(at(i/2),bass,beat*0.42,(i%2?0.8:1)*1.5*v,bus);};
      const rock=(v=1,dbl)=>{K(0,v);K(2,v);if(dbl){K(0.5,0.7*v);K(2.5,0.7*v);K(3.5,0.6*v);}else K(2.5,0.6*v);SN(1,1.1*v);SN(3,1.1*v);for(let i=0;i<8;i++)H(i/2,(i%2?0.45:0.8)*v,i===7);};
      const half=(v=1)=>{K(0,v);K(2.5,0.7*v);SN(2,1.1*v);for(let i=0;i<8;i++)H(i/2,(i%2?0.4:0.7)*v);};
      const fill=()=>{for(let i=0;i<8;i++)(i%2?SN(2+i*0.25,0.6+i*0.05):tom(2+i*0.25,1,[260,220,185,150,125,105,95,85][i]));};
      // the sleigh bells, all the way through: sixteenths, shaken hard on the backbeat
      const sleigh=()=>{const v=1,step=0.25;for(let x=0;x<4;x+=step){if(x===1||x===3)S.sleighBells(at(x),1.1*v,bus,true);else S.sleighBells(at(x),(x%1===0?0.85:x%0.5===0?0.6:0.45)*v,bus);}};
      const peal=v=>[76,71,67,64].forEach((m,i)=>S.bell(at(i),hz(m),v,bus));   // E B G E, rung down
      const choir=(v=0.35)=>tones.forEach((n,i)=>S.alienSing(t,hz(n-12),bar*0.97,v,vox,(this.glitch?['mu','o','lou']:['u','o','ou'])[i%3],{scale:0.95,pan:(i-1)*0.5}));
      // the singer, as in First Contact; for the last refrain and the tag two more creatures sing with her
      const crowd=(sec==='verse 3'&&k>=12)||sec==='outro',lift=sec==='outro'||k>=12||(sec==='verse 3'&&k>=8)?1.95:1.6;   // up a little where the band is biggest
      // the "tidings of comfort and joy": two more creatures harmonise with her, the lines written out above
      const hk=sec==='outro'?[16,17,18,19,21,16,17,20][k]:sec.startsWith('verse')&&k>=11?k:0,hs=sec==='verse 3'||sec==='outro'?2:0;
      const hd=hk&&DESCANT[hk].split(' '),hl=hk&&BELOW[hk].split(' ');
      let prev=null;const hp=[null,null];
      ((this.lead||lead)[b]||[]).forEach((e,n)=>{const f=hz(e.midi-12);S.alienSing(at(e.at),f,e.beats*beat*1.02,lift*(e.stress?1.2:1),vox,e.syl,{glide:prev,echo:0.18,scale:1.5});prev=f;
        const hn=e.n??n;   // a note split into chatter keeps its place in the harmony, which sings only its first syllable
        if(hd&&!e.part&&hd[hn]&&hd[hn]!=='-')[[hd[hn],1.35,-0.55,0.9,0.006],[hl[hn],1.65,0.55,1.0,0.011]].forEach(([nt,sc,pan,v,late],i)=>{
          const hf=hz(midiOf(nt)+hs-12);S.alienSing(at(e.at)+late,hf,e.beats*beat*1.02,v,harm,e.syl,{glide:hp[i],echo:0.18,scale:sc,pan});hp[i]=hf;});
        if(crowd){S.alienSing(at(e.at)+0.014,hz(e.midi-24),e.beats*beat,0.7,vox,e.syl,{scale:1.25,pan:-0.45});S.alienSing(at(e.at)+0.008,f,e.beats*beat,0.45,vox,e.syl,{scale:1.75,pan:0.45});}});
      // the end: the whole choir with her, a chord under every note of the last line and the tag (two voices below her
      // and the root beneath), and on the very last note every chord tone for two octaves down
      if(sec==='outro'||(sec==='verse 3'&&k>=16)){const pcs=ch.tones.map(x=>(r+x)%12),isTone=m=>pcs.includes(m%12);
        ((this.lead||lead)[b]||[]).forEach(e=>{if(e.part)return;const top=e.midi,ps=[];
          if(last){for(let m=top-3;m>=top-24;m--)if(isTone(m))ps.push(m);}
          else{let m=top-3;while(!isTone(m))m--;ps.push(m);m--;while(!isTone(m)||m%12===ps[0]%12)m--;ps.push(m);let lo=top-12;while(lo%12!==r)lo--;ps.push(lo);}
          ps.forEach((m,i)=>S.alienSing(at(e.at)+0.004*(i+1),hz(m-12),e.beats*beat*1.02,last?0.42:0.55,harm,e.syl,{echo:0.18,scale:[1.2,1.05,0.9,1.1,0.95,0.85][i%6],pan:[-0.7,0.7,0,-0.35,0.35,-0.6][i%6]}));});}
      // a bell with each note of the last climb ("O tidings of")
      if(sec==='outro'&&k===5)((this.lead||lead)[b]||[]).forEach(e=>{if(!e.part)S.bell(at(e.at),hz(e.midi),0.75,bus);});
      if(last){[78,73,69,66].forEach((m,i)=>S.bell(at(1.5+i),hz(m),0.85,bus));   // the intro's peal again, in the new key, as the last chord dies away
        [78,76,74,73,71,69,68,66].forEach((m,i)=>S.bell(at(5.5+i),hz(m),0.8-i*0.045,bus));S.bell(at(13.5),hz(54),0.7,bus);   // then rounds down the scale, ringing on for two bars after the song
        ring([[0,3.8]],1);S.epicBass(t,bass,bar,1.5,bus);K(0,1);crash(1.3);S.bell(t,hz(54),1,bus);S.bell(at(0.02),hz(66),0.7,bus);S.sleighBells(t,1.3,bus,true);S.sleighBells(at(0.5),1,bus,true);choir(0.45);S.alienChatter(at(2.5),beat*1.5,0.4,vox,b,320,1.5);return;}
      switch(sec){
      case 'intro':   // sleigh bells and the bells pealing, the creatures chattering, a swell - and straight into the first verse
        sleigh();peal(0.5+0.1*k);
        if(k===1||k===3)S.alienChatter(at(0.5),beat*2.5,0.4,vox,k+1);if(k===2)S.ehSweep(t,hz(40),bar*2,0.8,bus,true);
        return;
      case 'riff':   // the strings play the refrain over the full band
        pushes(1);rock(1);bass8(1);sleigh();
        if(this.glitch&&k%2===1)S.alienChatter(at(2),beat*1.6,0.45,vox,b,300+((k*37)%5)*20,1.5);
        if(k===0){crash(1.1);S.bell(t,hz(64),0.9,bus);}
        if(k===7)fill();
        return;
      case 'solo':   // the gallop under the solo; the creatures answer it in the second half
        // its last bar is one hit on the B7, left ringing under the held high note while the sleigh bells shake up
        // to the breakdown: a lead-in, not an ending
        if(k===15){ring([[0,3.8]],1.1);S.epicBass(t,bass,bar*.95,1.5,bus);K(0,1.1);crash(1.2);for(let i=1;i<16;i++)S.sleighBells(at(i*0.25),0.25+i*0.045,bus,i===15);return;}
        gallop(1);rock(1);sleigh();
        if(k>=8&&k%2===1)S.alienChatter(at(0.3),beat*3,0.55,vox,b,300+((k*37)%5)*20,1.5);
        if(k%8===0){crash();S.bell(t,hz(64),0.8,bus);}
        return;
      case 'breakdown':   // the band falls away: soft sleigh bells, a glockenspiel, the low choir; she sings the first line legato; then the build to the key change
        choir(0.38);sleigh();S.epicBass(t,bass,bar*0.95,0.9,bus);
        for(let i=0;i<8;i++)S.xylo(at(i/2),hz(tones[[0,1,2,1][i%4]]+24),beat*0.4,0.3,bus);
        if(k%4===0)S.bell(t,hz(64),0.7,bus);
        if(k>=4)ring([[0,3.8]],0.45);
        if(k>=2&&k<6){K(0,0.55);K(2,0.4);}
        if(k===0)for(const p of phrasesOf(BREAK,beat))S.alienPhrase(at(p.start),p.notes,2,vox,upper,{scale:1.5,echo:0.3});
        if(k===6){K(0,0.7);K(2,0.7);for(let i=0;i<8;i++)SN(i*0.5,0.3+i*0.04);}
        if(k===7){S.ehSweep(t,hz(49),bar,0.8,bus,true);for(let i=0;i<16;i++)SN(i*0.25,0.5+i*0.04);K(0,0.8);K(2,0.8);}
        return;
      }
      // the verses: chugging under the first two lines, the guitars opening up for the third, everything in for the refrain
      const big=sec==='outro'||k>=12||(sec==='verse 3'&&k>=8);
      if(big){pushes(1);rock(1,true);sleigh();if(k%2===0)crash(0.8);choir();}
      else if(k>=8){pushes(0.9);rock(1);sleigh();}
      else{chug(0.85);if(sec==='verse')half(1);else rock(1,sec==='verse 3');sleigh();}
      bass8(1);
      if(k===0){crash(1.1);S.bell(t,hz(sec==='verse 3'?54:52),1,bus);}   // F sharp for the key change
      if(k===12)S.bell(t,hz(sec==='verse 3'?66:64),0.9,bus);
      if(sec==='outro'?k===3:(k===7||k===11||k===19))fill();
      if(sec==='verse'&&k===19)S.alienChatter(at(3),beat,0.4,vox,b);   // (none before the solo)
    }
  });
  // In her own words: the same carol and the same voice, the verses translated into the creatures' language. Words come
  // back where the English does - "ya" (you), "kai" (Christ), "sa-lo" (save), "ko-mo-ra-zhoi" (comfort and joy) - and
  // the lines rhyme where the carol's do: dismay, day, astray end on -ai; born, morn, scorn on -ou. *word is stressed (a
  // little louder); a~b~c splits a note, the first word taking half and the rest chattered quickly through the other half.
  // To keep it as glitchy as First Contact, every verse bar has a split, there are few bare vowels (a vowel alone has no
  // bark), the low chorus sings First Contact's "mu-o-lou" and small creatures chatter over the string riff (glitch)
  const words=(bs,str)=>{const W=str.split('|').map(x=>x.trim().split(/\s+/));
    return bs.map((bar,i)=>bar.flatMap((e,j)=>{const ps=W[i][j].split('~').map(w=>({syl:w.replace('*',''),stress:w.startsWith('*')}));
      if(ps.length===1)return [{...e,...ps[0],n:j}];
      const head=e.beats/2,rest=(e.beats-head)/(ps.length-1);
      return ps.map((p,k)=>({...e,...p,n:j,part:k,at:e.at+(k?head+(k-1)*rest:0),beats:k?rest:head}));}));};
  const REFRAIN='*du ki ro | *ko yo mo ra | *zhoi ko mo ra | *zhoi zho ti | *du ki shi ro | *ko yo mo ra | *zhooi | -';
  const verseW=words(verse,'*she ya~ra ki *sha | zho *ma~shi ni ru | *no ra~zi ya ka | *bai~sha~ru~mi ro | me *shi~ra kai sha | *sa lo~ri ra nu | *bo ru~zhe *kai sha | *dai~ki~la~ni ze | '+
    '*sa lo~shi ri tu | za *ga~ru bo ke | mi zhu~ra *ta ne | *rai~ga~rai zho ti | '+REFRAIN);
  const verse2W=words(verse,'*be ta~ri ki *lo | sha *mi~zo ra nu | *to la~shi ya ke | *bou~ka~shi~ru zu | *she ze~ra kai sha | *mo ga~ri li she | *sa lo~ri *kai sha | *mou~ri~ta~ni ze | '+
    '*na ki~ru ra tu | ma *ri~sha bo ke | nu zhu~ra *ta re | *sou~ga~sou zho ti | '+REFRAIN);
  const pickW=words([pick],"*'o")[0],pick2W=words([pick2],'*ri')[0],tagW=up(verseW.slice(16,20),2);
  const X=TUNES.find(x=>x.id==='xmas');
  TUNES.splice(TUNES.indexOf(X)+1,0,{...X,id:'xmasWords',title:'God Rest Ye Merry Starmen (In Her Own Words)',glitch:true,
    parts:X.parts.map(p=>{const st={violins1:'stylo1',violins2:'stylo2',violas:'stylo3',celli:'styloLow'}[p.inst];return st?{...p,inst:st,vel:p.vel*0.5}:p;}),   // four Stylophones for the strings (they buzz louder, so softer)
    lead:[...empty(3),pickW,...verseW,...empty(7),pick2W,...verse2W,...empty(23),...up([pickW],2),...up(verseW,2),...tagW.slice(0,3),[],...up(words(sung('r:2 G5:1:x A5:1:x'),'zho ti'),2),...tagW.slice(0,2),...words(sung('F#5:4:x'),'*zhooi')],
    meta:'Ray-gun rock Christmas carol · E minor, then F sharp minor · 132 bpm · the creature singer in words of her own language, sleigh bells, four Stylophones and the heavy band',
    desc:'The same carol and the same voice, but now she sings it in words. The verses are translated into the creatures\' own language, and the words come back where the English does - "ya" for you, "kai" for Christ, "sa-lo" to save, "ko-mo-ra-zhoi" for comfort and joy - with the lines rhyming where the carol\'s do, the strong syllables leaning, and quick chattered syllables rattling through her long notes. Same band, sleigh bells and harmonies, and four Stylophones playing the riff in place of the strings.'});
}

// ===================================================================== the Stylophone, and the ray-gun carols' kit
// the Stylophone itself, for parts written for it: a stylus on a metal keyboard - a buzzy, nasal pulse that starts and
// stops dead (no pick, no twang), the vibrato switch on, a little overdrive, dripping into the spring. w is the pulse width
function styloVoice(pan,w=0.3){return function(t,f,dur,v,dest){
  const c=this.ctx,end=t+dur+0.1,out=pan&&c.createStereoPanner?c.createStereoPanner():c.createGain();if(pan)out.pan.value=pan;this.dubOut(out,dest,0.15,0.6);
  const p=this.pwOsc(f,t,end,w),hp=this.filter('highpass',180,0.7),nose=this.filter('peaking',1500,1.3),lp=this.filter('lowpass',5200,0.7),g=this.held(t,0.003,0.1*v,dur,0.02);
  const pre=c.createGain(),sh=c.createWaveShaper(),post=c.createGain();nose.gain.value=6;pre.gain.value=4;sh.curve=ehDrive;post.gain.value=0.3;
  const l=this.osc('sine',6.2,t,end),d=c.createGain();d.gain.value=14;l.connect(d);d.connect(p.saw.detune);
  p.out.connect(hp);hp.connect(nose);nose.connect(lp);lp.connect(g);g.connect(pre);pre.connect(sh);sh.connect(post);post.connect(out);
};}
Synth.prototype.stylo1=styloVoice(-0.45);Synth.prototype.stylo2=styloVoice(0.45);Synth.prototype.stylo3=styloVoice(0.15);Synth.prototype.styloLow=styloVoice(-0.1,0.45);
// What the ray-gun carols share: the band (drums, bass, guitars, sleigh bells), the creatures' two compressed voice
// busses (the singer, and the crowd), chords voiced to move by the smallest steps, and a sung-line notation with words
const carolBusses=new WeakMap();
function carolKit(S,bus,t,b,ch,beat,tune){
  if(b===0||!dubFx.get(bus)||!ehFx.get(bus)){const len=tune.chords.length*4*beat;ehRig(S,bus,t,len,beat);dubRig(S,bus,t,len,beat);}
  if(b===0||!carolBusses.has(bus)){const mk=()=>{const c=S.ctx,comp=c.createDynamicsCompressor(),make=c.createGain();comp.threshold.value=-24;comp.knee.value=6;comp.ratio.value=5;comp.attack.value=0.002;comp.release.value=0.12;make.gain.value=1;comp.connect(make);make.connect(bus);return comp;};
    carolBusses.set(bus,{vox:mk(),crowd:mk()});}
  const {vox,crowd}=carolBusses.get(bus);dubFx.set(vox,{...dubFx.get(bus),desk:vox});dubFx.set(crowd,{...dubFx.get(bus),desk:crowd});   // the voices still reach the echo and spring
  const fx=ehFx.get(bus),bar=4*beat,r=ch.root,at=x=>t+x*beat,bass=hz(33+(r+3)%12),pc=hz(40+(r+8)%12);
  const K=(x,v)=>S.ehKick(at(x),v,bus),SN=(x,v)=>S.epicSnare(at(x),v,bus),H=(x,v,o)=>S.ehHat(at(x),v,fx.kit,o),tom=(x,v,f)=>S.ehTom(at(x),f,v,bus);
  const ring=(hits,v=1)=>hits.forEach(([x,d])=>S.ehRhythm(at(x),pc,beat*d,v,bus,true));
  return {vox,crowd,fx,bar,at,bass,pc,K,SN,H,tom,ring,
    crash:(v=1,x=0)=>S.ehCrash(at(x),v,fx.kit),
    chug:(v=1)=>{for(let i=0;i<8;i++)S.ehRhythm(at(i/2),pc,beat*0.32,(i%2?0.75:0.95)*v,bus,false);},   // palm-muted eighths
    pushes:(v=1)=>ring([[0,1.4],[1.5,0.4],[2,1.4],[3.5,0.4]],v),
    gallop:(v=1)=>{for(let q=0;q<4;q++)[0,0.5,0.75].forEach((x,i)=>{S.ehRhythm(at(q+x),pc,beat*(i?0.2:0.4),(i?0.8:1)*v,bus,false);S.epicBass(at(q+x),bass,beat*(i?0.2:0.4),(i?0.8:1)*1.5*v,bus);});},
    bass8:(v=1)=>{for(let i=0;i<8;i++)S.epicBass(at(i/2),bass,beat*0.42,(i%2?0.8:1)*1.5*v,bus);},
    rock:(v=1,dbl)=>{K(0,v);K(2,v);if(dbl){K(0.5,0.7*v);K(2.5,0.7*v);K(3.5,0.6*v);}else K(2.5,0.6*v);SN(1,1.1*v);SN(3,1.1*v);for(let i=0;i<8;i++)H(i/2,(i%2?0.45:0.8)*v,i===7);},
    half:(v=1)=>{K(0,v);K(2.5,0.7*v);SN(2,1.1*v);for(let i=0;i<8;i++)H(i/2,(i%2?0.4:0.7)*v);},
    fill:()=>{for(let i=0;i<8;i++)(i%2?SN(2+i*0.25,0.6+i*0.05):tom(2+i*0.25,1,[260,220,185,150,125,105,95,85][i]));},
    // the surf kit: a driving beat on the ride, and the Wipe Out tom break
    surfBeat:(v=1)=>{K(0,v);K(1.5,0.6*v);K(2,0.9*v);SN(1,v);SN(3,v);for(let i=0;i<8;i++)H(i/2,(i%2?0.5:0.85)*v,i===7);},
    wipeOut:(v=1)=>{for(let i=0;i<16;i++)tom(i/4,(i%4===0?1:i%2?0.55:0.75)*v,[175,175,140,140][i%4]);K(0,v);K(2,v);},
    surfBass:(v=1)=>[0,0,7,7,12,12,7,7].forEach((d,i)=>S.epicBass(at(i/2),bass*Math.pow(2,d/12),beat*0.42,(i%2?0.8:1)*1.4*v,bus)),
    stabs:(tones,v=1)=>{for(const x of [0.5,1.5,2.5,3.5])tones.forEach(m=>S.surfGtr(at(x),hz(m),beat*0.22,0.4*v,bus));},   // the surf guitar's off-beat chops
    sleigh:()=>{for(let x=0;x<4;x+=0.25){if(x===1||x===3)S.sleighBells(at(x),1.1,bus,true);else S.sleighBells(at(x),x%1===0?0.85:x%0.5===0?0.6:0.45,bus);}},
    choir:(tones,v=0.35)=>tones.forEach((n,i)=>S.alienSing(t,hz(n-12),bar*0.97,v,vox,['mu','o','lou'][i%3],{scale:0.95,pan:(i-1)*0.5}))};
}
// each chord voiced in three parts as close as it can be to the one before; a seventh chord keeps its root, third and seventh
function carolVoicing(names){let prev=null;return names.map(nm=>{const ch=chordOf(nm),pcs=(ch.tones.length===4?[0,1,3]:[0,1,2]).map(i=>(ch.root+ch.tones[i])%12);
  const opts=pcs.map(pc=>[54,66].map(lo=>lo+((pc-lo)%12+12)%12).filter(m=>m<=69));let best=null,cost=1e9;
  for(const a of opts[0])for(const b of opts[1])for(const c of opts[2]){const v=[a,b,c].sort((x,y)=>x-y);if(v[2]-v[0]>12)continue;
    const k=prev?v.reduce((n,m,i)=>n+Math.abs(m-prev[i]),0):Math.abs(v[1]-60);if(k<cost){cost=k;best=v;}}
  return prev=best;});}
// a tune a bar at a time ("A5:1.5 G5:0.5 | ..."), and words put to it: *word is stressed (a little louder); a~b~c splits a
// note, the first word taking half and the rest chattered quickly through the other half
const carolTune=str=>str.split('|').map(bar=>{let at=0;const ev=[];for(const tok of bar.trim().split(/\s+/)){const [n,d]=tok.split(':');if(n!=='r')ev.push({at,beats:+d,midi:midiOf(n)});at+=+d;}return ev;});
const carolWords=(bs,str)=>{const W=str.split('|').map(x=>x.trim().split(/\s+/));
  return bs.map((bar,i)=>{if(!W[i]||W[i].length!==bar.length)throw new Error('carol words: bar '+i+' has '+bar.length+' notes');
    return bar.flatMap((e,j)=>{const ps=W[i][j].split('~').map(x=>({syl:x.replace('*',''),stress:x.startsWith('*')}));
      if(ps.length===1)return [{...e,...ps[0],n:j}];
      const head=e.beats/2,rest=(e.beats-head)/(ps.length-1);
      return ps.map((p,k)=>({...e,...p,n:j,part:k,at:e.at+(k?head+(k-1)*rest:0),beats:k?rest:head}));});});};
const carolUp=(bs,k)=>bs.map(bar=>bar&&bar.map(e=>({...e,midi:e.midi+k})));
const carolPart=bs=>bs.map(bar=>bar.map(e=>({at:e.at,beats:e.beats,midi:[e.midi]})));
const carolNone=n=>Array.from({length:n},()=>null);
// a creature sings a bar of words (sung an octave down from the written notes, like the First Contact singer)
function carolSing(S,t,beat,evs,dest,v,shift=-12,o={}){let prev=null;
  for(const e of evs||[]){const f=hz(e.midi+shift);S.alienSing(t+e.at*beat,f,e.beats*beat*1.02,v*(e.stress?1.2:1)*(o.sung&&e.beats>=2?1.1:1),dest,e.syl,{glide:prev,echo:o.sung?0.24:0.18,scale:o.scale||1.5,pan:o.pan,sung:o.sung});prev=f;}}
// the crowd: two creatures on the tune, one an octave down, and one on the harmony line (sung to the tune's words)
function carolCrowd(S,t,beat,m,h,dest,v=1){if(!m)return;
  carolSing(S,t+0.01,beat,m,dest,0.8*v,-12,{scale:1.35,pan:-0.5});carolSing(S,t+0.004,beat,m,dest,0.6*v,-12,{scale:1.75,pan:0.5});
  carolSing(S,t+0.014,beat,m,dest,0.7*v,-24,{scale:1.25});
  if(h)carolSing(S,t+0.008,beat,h.map((e,i)=>({...e,syl:m[i].syl,stress:m[i].stress})),dest,0.8*v,-12,{scale:1.55,pan:0.25});}

// ===================================================================== Deck the Hulls
// "Deck the Halls" (traditional Welsh) as dark ray-gun surf, bent into D harmonic minor the Misirlou way: the singer
// sings the words of each line and the crowd of creatures answers with the fa-la-las as an eerie chant, in written
// harmony over the low "mu-o-lou" chorus. Distorted twin guitars chugging and ringing, pounding floor toms under the
// verses, the twanging surf twin lead tremolo-picking the tune between verses, alien chords (B flat, C) in the verses,
// a surf solo, a stop-time breakdown with the crowd alone, and the last verse up a tone.
{
  const T=carolTune;
  const L1=T('A5:1.5 G5:0.5 F5:1 E5:1 | D5:1 E5:1 F5:1 D5:1 | E5:0.5 F5:0.5 G5:0.5 E5:0.5 F5:1.5 E5:0.5 | D5:1 C#5:1 D5:2');
  const L3=T('E5:1.5 F5:0.5 G5:1 E5:1 | F5:1.5 G5:0.5 A5:1 E5:1 | F5:0.5 G#5:0.5 A5:1 Bb5:0.5 C#6:0.5 D6:1 | C#6:1 Bb5:1 A5:2');
  const L4=[L1[0],L1[1],...T('Bb5:0.5 Bb5:0.5 Bb5:0.5 Bb5:0.5 A5:1.5 G5:0.5 | F5:1 E5:1 D5:2')];
  const tune=[...L1,...L1,...L3,...L4];
  // the crowd's line under each fa-la-la: held notes and small steps against the tune, not parallel thirds
  const H=T('C#5:0.5 C#5:0.5 C#5:0.5 C#5:0.5 D5:1.5 C#5:0.5 | A4:1 A4:1 A4:2 | D5:0.5 D5:0.5 E5:1 E5:0.5 G#5:0.5 A5:1 | E5:1 E5:1 C#5:2 | G5:0.5 G5:0.5 F5:0.5 F5:0.5 E5:1.5 E5:0.5 | D5:1 C#5:1 A4:2');
  const harmV=[null,null,H[0],H[1],null,null,H[0],H[1],null,null,H[2],H[3],null,null,H[4],H[5]];
  const FALA='sha la ra la ra la | ra la *laa',verseOf=(a,b,c,d)=>carolWords(tune,[a,FALA,b,FALA,c,FALA,d,FALA].join(' | '));
  const V1=verseOf('ze *ka ru mo | *bo shi *ra li','ti *sa zhe ru | ta *bi zho li','do *na ru ga | *rai ka *pa re','to *ra ki *u | lu *ta ka re');
  const V2=verseOf('shi *za ba zi | *ru le *bo ru','su *ta ka pa | *zho i *ko ru','ro *li mo ri | *me ri *me zha','zai *te lo *u | lu *ta te zha');
  const V3=carolUp(verseOf('sha *sa ru *o | *ra ye *pa sa','ka *ru nu ye | *la zi *la sa','si *ga zhoi ou | *ta lo *ge da','ki *de lo *ra | *ru na *re da'),2);
  const words=v=>v.map((bar,k)=>k%4<2?bar:null),falas=v=>v.map((bar,k)=>k%4>=2?bar:null);
  const brk=carolWords([L1[2],L1[3],L4[2],L4[3],L1[2],L1[3],L4[2],L4[3]],[FALA,FALA,FALA,FALA].join(' | ')),brkH=[H[0],H[1],H[4],H[5],H[0],H[1],H[4],H[5]];
  const tag=carolUp(carolWords([L4[2],L4[3],L4[2],L4[3],...T('D5:4')],[FALA,FALA,'*laa'].join(' | ')),2),tagH=carolUp([H[4],H[5],H[4],H[5],...T('A4:4')],2);
  // intro 8 | verse 16 | riff 8 | verse 16 | solo 16 | breakdown 8 | verse (up a tone) 16 | outro 6
  const singer=[...carolNone(8),...words(V1),...carolNone(8),...words(V2),...carolNone(24),...V3,...tag,null];
  const crowd=[...carolNone(8),...falas(V1),...carolNone(8),...falas(V2),...carolNone(16),...brk,...falas(V3),...tag,null];
  const harm=[...carolNone(8),...harmV,...carolNone(8),...harmV,...carolNone(16),...brkH,...carolUp(harmV,2),...tagH,null];
  // the twin lead's second voice for the riff: pedal notes and small steps under the tune
  const RH=T('C5:1.5 D5:0.5 E5:1 C5:1 | C5:1.5 C5:0.5 C5:1 C5:1 | D5:0.5 D5:0.5 E5:1 E5:0.5 G#5:0.5 A5:1 | E5:1 E5:1 C#5:2 | D5:1.5 D5:0.5 D5:1 C#5:1 | Bb4:1 Bb4:1 D5:1 Bb4:1 | G5:0.5 G5:0.5 F5:0.5 F5:0.5 E5:1.5 E5:0.5 | D5:1 C#5:1 A4:2');
  const solo=bars('D5:0.5 F5:0.5 A5:0.5 D6:0.5 A5:1 F5:1 | F5:0.5 Bb5:0.5 D6:0.5 F6:0.5 D6:2 | E6:0.5 D6:0.5 C6:0.5 G5:0.5 E5:1 G5:1 | C#6:2 E6:1 G6:1 | '+
    'A5:0.25 Bb5:0.25 A5:0.25 F5:0.25 A5:0.25 Bb5:0.25 A5:0.25 F5:0.25 D6:2 | D6:0.25 C6:0.25 Bb5:0.25 F5:0.25 D6:0.25 C6:0.25 Bb5:0.25 F5:0.25 Bb5:2 | C6:0.5 E6:0.5 G6:0.5 E6:0.5 C6:0.5 G5:0.5 E5:0.5 G5:0.5 | A5:1 C#6:1 E6:2 | '+
    'E5:0.5 F5:0.5 G5:0.5 E5:0.5 F5:1.5 E5:0.5 | F5:1 D5:1 F5:2 | G5:0.5 E5:0.5 C5:0.5 E5:0.5 G5:1 C6:1 | C#6:3 r:1 | '+
    'D6:1 C#6:1 A5:2 | D6:0.5 F6:0.5 D6:0.5 Bb5:0.5 F5:2 | E5:0.5 G5:0.5 C6:0.5 E6:0.5 G6:2 | G6:1 E6:1 C#6:1 A5:1');
  const Q=n=>bars(rests(n,4));
  const VC=['Dm','Bb','A7','Dm','Dm','Bb','A7','Dm','C','F','E7','A','Dm','Bb','Gm','Dm'],UP={Dm:'Em',Bb:'C',A7:'B7',C:'D',F:'G',E7:'F#7',A:'B',Gm:'Am'};
  TUNES.splice(TUNES.findIndex(t=>t.id==='xmasWords')+1,0,{
    id:'deckHulls',title:'Deck the Hulls',
    meta:'Ray-gun surf carol · D harmonic minor, then E minor · 138 bpm · the creature singer and a chanting crowd, distorted twin guitars, surf twin lead, floor toms, sleigh bells',
    desc:'"Deck the Halls" bent into D harmonic minor, the Misirlou way. The singer from First Contact sings each line in her own language and a crowd of creatures answers with the fa-la-las as an eerie chant - "sha la ra la ra la, ra la laa" - in written harmony over the low "mu-o-lou" chorus. Distorted twin guitars and pounding floor toms, alien chords in the verses, a twanging surf twin lead tremolo-picking the tune between verses, a surf solo, a stop-time breakdown where the crowd sings alone, the last verse up a tone, and sleigh bells all the way.',
    bpm:138,beats:4,send:0.25,gain:0.6,
    sections:[[0,'intro'],[8,'verse'],[24,'riff'],[32,'verse 2'],[48,'solo'],[64,'breakdown'],[72,'verse 3'],[88,'outro']],
    chords:['Dm','Dm','Dm','Dm','A7','Dm','Gm','Dm',...VC,'C','F','E7','A','Dm','Bb','Gm','Dm',...VC,...Array(4).fill(['Dm','Bb','C','A7']).flat(),
      'A7','Dm','Gm','Dm','A7','Dm','Gm','Dm',...VC.map(c=>UP[c]),'Am','Em','Am','Em','Em','Em'],
    parts:[{inst:'twinHi',vel:0.9,shift:-12,notes:[...Q(4),...carolPart([L1[2],L1[3],L4[2],L4[3]]),...Q(16),...carolPart([...L3,...L4]),...Q(62)]},
      {inst:'twinLo',vel:0.75,shift:-12,notes:[...Q(4),...carolPart([H[0],H[1],H[4],H[5]]),...Q(16),...carolPart(RH),...Q(62)]},
      {inst:'surfGtr',vel:0.95,shift:-12,notes:[...Q(48),...solo,...Q(30)]}],
    accomp(S,bus,t,b,ch,beat){
      const X=carolKit(S,bus,t,b,ch,beat,this),sec=sectionOf(this,b),k=b-this.sections.find(x=>x[1]===sec)[0],last=b===this.chords.length-1;
      const tones=(this.voiced||(this.voiced=carolVoicing(this.chords)))[b],hi=sec==='verse 3'||sec==='outro'?2:0;
      // the floor toms, pounding eighths under a half-time backbeat
      const toms=(v=1)=>{for(let i=0;i<8;i++)X.tom(i/2,(i%2?0.5:0.8)*v,i%4===0?110:95);X.K(0,v);X.K(2.5,0.6*v);X.SN(2,v);for(let i=0;i<4;i++)X.H(i,0.45*v);};
      carolSing(S,t,beat,singer[b],X.vox,1.9);
      carolCrowd(S,t,beat,crowd[b],harm[b],X.crowd,1.15);
      X.sleigh();
      if(last){X.ring([[0,3.8]],1);X.K(0,1);X.crash(1.3);S.bell(t,hz(52),1,bus);S.epicBass(t,X.bass,X.bar,1.5,bus);X.choir(tones,0.45);
        S.sleighBells(t,1.3,bus,true);S.surfSlide(X.at(2.5),beat*1.5,0.7,bus);S.alienChatter(X.at(2),beat*1.5,0.4,X.vox,b,320,1.5);return;}
      switch(sec){
      case 'intro':   // the floor toms and sleigh bells, the creatures chattering, a surf slide; then the guitars and the twin lead
        if(k<4){toms(0.5+0.12*k);if(k===1||k===3)S.alienChatter(X.at(0.5),beat*2.5,0.45,X.vox,k+1);if(k===3)S.surfSlide(X.at(2),beat*2,0.9,bus);return;}
        X.chug(0.75+0.05*(k-4));X.bass8(0.9);toms(1);if(k===4)X.crash(1.1);if(k===7)X.fill();
        return;
      case 'riff':   // the surf twin lead over the full band
        X.pushes(1);X.rock(1);X.bass8(1);if(k===0){X.crash(1.1);S.bell(t,hz(50),0.9,bus);}if(k===7)X.fill();
        return;
      case 'solo':   // the surf solo over D minor, B flat, C, A; a Wipe Out tom break every four bars; the creatures chatter back
        X.gallop(0.9);if(k%4===3)X.wipeOut(0.8);else X.rock(1);
        if(k>=8&&k%2===1)S.alienChatter(X.at(2.3),beat*1.5,0.5,X.vox,b,300+((k*37)%5)*20,1.5);
        if(k%8===0)X.crash();if(k===15)S.surfSlide(X.at(2),beat*2,0.9,bus);
        return;
      case 'breakdown':   // stop-time: the band hits every other bar, the low chorus holds, the crowd chants alone; toms build
        X.choir(tones,0.4);
        if(k%2===0&&k<6){X.K(0,1);X.crash(0.8);X.ring([[0,1.5]],0.9);S.epicBass(t,X.bass,beat*1.5,1.4,bus);}
        if(k===6)X.wipeOut(0.6);if(k===7){X.wipeOut(0.9);S.surfSlide(X.at(2),beat*2,1,bus);}
        return;
      }
      // the verses: chugging over the floor toms while she sings; the fa-la-las ring out over a full backbeat and the low
      // chorus; the last verse and the outro hit hardest
      const fala=k%4>=2||sec==='outro';
      if(fala){X.pushes(1);X.rock(1,!!hi);X.choir(tones);if(k%4===2)X.crash(0.8);}
      else{X.chug(0.85);toms(1);}
      X.bass8(1);
      if(k===0){X.crash(1.1);S.bell(t,hz(50+hi),1,bus);}
      if(sec==='outro'?k===3:k===15)X.fill();
    }
  });
}

// ===================================================================== Jingle Bells (Through the Void)
// "Jingle Bells" (James Lord Pierpont, 1857) on the heavy ray-gun rock band, in G: the verses turned into an alien
// G minor (with a flat-second chord, and a flat ninth on the way into the chorus), chugging in half-time; then the
// chorus lifts into G major as heavy rock - power chords through E minor, an alien A flat and the F-to-G rise - with the
// crowd of creatures singing "zhi-ga-BE!" over a written harmony line and the low chorus. A Stylophone, gritty and low
// in the band, plays a minor jingle in the intro; the crowd joins her held notes in the verses; the screaming lead plays
// the chorus between verses; a solo over G minor, E flat, F, D; double kick saved for the last chorus; sleigh bells all the way.
{
  const T=carolTune;
  const VT=T('D5:1 Bb5:1 A5:1 G5:1 | D5:3 D5:0.5 D5:0.5 | D5:1 Bb5:1 A5:1 G5:1 | Eb5:4 | Eb5:1 C6:1 Bb5:1 A5:1 | F#5:4 | D6:1 D6:1 C6:1 A5:1 | Bb5:4 | '+
    'D5:1 Bb5:1 A5:1 G5:1 | D5:4 | D5:1 Bb5:1 A5:1 G5:1 | Eb5:3 Eb5:1 | Eb5:1 C6:1 Bb5:1 A5:1 | D6:1 D6:1 D6:1 D6:1 | Eb6:1 D6:1 C6:1 A5:1 | G5:2 D6:2');
  const CT=T('B5:1 B5:1 B5:2 | B5:1 B5:1 B5:2 | B5:1 D6:1 G5:1.5 A5:0.5 | B5:4 | C6:1 C6:1 C6:1.5 C6:0.5 | C6:1 B5:1 B5:1 B5:0.5 B5:0.5 | B5:1 A5:1 A5:1 B5:1 | A5:2 D6:2 | '+
    'B5:1 B5:1 B5:2 | B5:1 B5:1 B5:2 | B5:1 D6:1 G5:1.5 A5:0.5 | B5:4 | C6:1 C6:1 C6:1.5 C6:0.5 | C6:1 B5:1 B5:1 B5:0.5 B5:0.5 | D6:1 D6:1 C6:1 A5:1 | G5:4');
  // the crowd's line in the chorus: moving while the tune repeats a note, holding while it moves
  const CH=T('D5:1 D5:1 D5:2 | D5:1 E5:1 G5:2 | G5:1 G5:1 E5:1.5 F#5:0.5 | G5:4 | Ab5:1 Ab5:1 Eb5:1.5 Eb5:0.5 | Eb5:1 D5:1 D5:1 D5:0.5 D5:0.5 | E5:1 E5:1 E5:1 G5:1 | F5:2 F5:2 | '+
    'D5:1 D5:1 D5:2 | D5:1 E5:1 G5:2 | G5:1 G5:1 E5:1.5 F#5:0.5 | G5:4 | Ab5:1 Ab5:1 Eb5:1.5 Eb5:0.5 | Eb5:1 D5:1 D5:1 D5:0.5 D5:0.5 | F5:1 F5:1 A5:1 F5:1 | D5:4');
  const JB='zhi ga *be | zhi ga *be | zhi ga *o la | *rei | o ko *shu ri | zi tu *rai ri na | *bo ra *o pe | *sai *kei';
  const C=carolWords(CT,JB+' | '+JB.split(' | ').slice(0,6).join(' | ')+' | *bo ra *o pe | *sai');
  const held=w=>w.replace(/~\S+/g,'');   // her long notes are held and sung, not chattered
  const V1=carolWords(VT,held('da *shi zu ru | *so ri ra | ba *o se *pe | *sai~ka~shi~ru | o *ra ki zu | *go~ra~ki~zo | la *shi lo ra | *rai~zhu~ra~ni | '+
    'be *lo bo ta | *ri~ka~ri~ka | ma *ki shi ri | *bai ko | *shu ri zi tu | *rai ra *zi ra | *sai ri *so tu | *nai o'));
  const V2=carolWords(VT,held('a *de o *tu | *go ra ri | *to ta *ta ka | *rai~sha~ru~mi | a *su mi *sha | *bai~ki~la~ni | za *se ta *bai | *sai~ga~sai~ra | '+
    'zo *o sa *li | *la~ri~la~ri | mi *shu zhu *mo | *lo ki | *go ri tu ra | *du ri *ta ba | *shi bo *go ta | *so ro'));
  const tag=carolUp(carolWords([CT[2],...T('B5:4')],'zhi ga *o la | *rei'),2),tagH=carolUp([CH[2],...T('G5:4')],2);
  const hookMin=T('Bb5:1 Bb5:1 Bb5:2 | Bb5:1 Bb5:1 Bb5:2 | Bb5:1 D6:1 G5:1.5 A5:0.5 | Bb5:4');   // the jingle, in the minor
  // the crowd joins her on the long notes of the verse, and for its last four bars
  const join=V=>V.map((x,i)=>[3,7,11,12,13,14,15].includes(i)?x:null);
  // intro 8 | verse 16 | chorus 16 | riff 8 | verse 16 | chorus 16 | solo 16 | chorus (up a tone) 16 | outro 4
  const singer=[...carolNone(8),...V1,...C,...carolNone(8),...V2,...C,...carolNone(16),...carolUp(C,2),...tag,null,null];
  const crowd=[...carolNone(8),...join(V1),...C,...carolNone(8),...join(V2),...C,...carolNone(16),...carolUp(C,2),...tag,null,null];
  const harm=[...carolNone(24),...CH,...carolNone(24),...CH,...carolNone(16),...carolUp(CH,2),...tagH,null,null];
  const solo=bars('G5:0.25 Bb5:0.25 D6:0.25 G6:0.25 D6:0.5 Bb5:0.5 G6:2 | G6:0.5 F6:0.5 Eb6:0.5 D6:0.5 Bb5:2 | A5:0.25 C6:0.25 F6:0.25 A6:0.25 F6:1 C6:1 A5:1 | F#6:0.5 G6:0.5 A6:0.5 F#6:0.5 D6:2 | '+
    'D6:1 Bb5:1 A5:1 G5:1 | G5:3 Bb5:1 | C6:0.5 D6:0.5 Eb6:0.5 F6:0.5 G6:0.5 F6:0.5 Eb6:0.5 C6:0.5 | D6:4 | '+
    'G6:0.25 F6:0.25 D6:0.25 Bb5:0.25 G6:0.25 F6:0.25 D6:0.25 Bb5:0.25 G6:0.25 F6:0.25 D6:0.25 Bb5:0.25 G5:1 | G6:0.25 Eb6:0.25 Bb5:0.25 G5:0.25 G6:0.25 Eb6:0.25 Bb5:0.25 G5:0.25 Bb5:2 | '+
    'A6:0.5 F6:0.5 C6:0.5 A5:0.5 C6:0.5 F6:0.5 A6:0.5 C7:0.5 | D7:2 C7:0.5 A6:0.5 F#6:0.5 D6:0.5 | Bb6:1.5 A6:0.5 G6:1 D6:1 | Eb6:1.5 D6:0.5 Bb5:2 | C6:0.5 D6:0.5 Eb6:0.5 F6:0.5 G6:1 A6:1 | F#6:2 A6:2');
  const Q=n=>bars(rests(n,4));
  const VC=['Gm','Gm','Gm','Cm','Cm','D','D7','Gm','Gm','Ab','Gm','Cm','Cm','D','D7','Gm'],CC=['G','G','Em','G','Ab','G','Em','F','G','G','Em','G','Ab','G','F','G'];
  const UP={G:'A',Em:'F#m',Ab:'Bb',F:'G'};
  TUNES.splice(TUNES.findIndex(t=>t.id==='deckHulls')+1,0,{
    id:'jingleVoid',title:'Jingle Bells (Through the Void)',
    meta:'Ray-gun rock carol · alien G minor verses, heavy G major choruses, then A · 152 bpm · the creature singer and crowd, distorted twin guitars, the screaming lead, a Stylophone, sleigh bells',
    desc:'"Jingle Bells" on the heavy ray-gun rock band. The verses are turned into an alien G minor - chugging guitars in half-time, a flat-second chord, the singer from First Contact dashing through the void in her own language - and then the chorus lifts into G major as heavy rock, power chords through E minor, an alien A flat and the F-to-G rise, with the crowd of creatures singing "zhi-ga-BE!" over their own harmony line and the low chorus. A gritty Stylophone plays a minor jingle in the intro, the crowd joins her held notes in the verses, the screaming lead plays the chorus between verses, a solo, double kick saved for the last chorus up a tone, and sleigh bells all the way.',
    bpm:152,beats:4,send:0.2,gain:0.6,
    sections:[[0,'intro'],[8,'verse'],[24,'chorus'],[40,'riff'],[48,'verse 2'],[64,'chorus 2'],[80,'solo'],[96,'chorus 3'],[112,'outro']],
    chords:['Gm','Gm','Gm','Gm','Gm','Ab','Gm','D7',...VC,...CC,...CC.slice(0,8),...VC,...CC,...Array(4).fill(['Gm','Eb','F','D']).flat(),...CC.map(c=>UP[c]),'A','A','A','A'],
    parts:[{inst:'stylo1',vel:0.7,shift:-24,notes:[...Q(4),...carolPart(hookMin),...Q(108)]},
      {inst:'ehLead',vel:0.85,shift:-12,notes:[...Q(40),...carolPart(CT.slice(0,8)),...Q(32),...solo,...Q(20)]}],
    accomp(S,bus,t,b,ch,beat){
      const X=carolKit(S,bus,t,b,ch,beat,this),sec=sectionOf(this,b),k=b-this.sections.find(x=>x[1]===sec)[0],last=b===this.chords.length-1;
      const tones=(this.voiced||(this.voiced=carolVoicing(this.chords)))[b];
      carolSing(S,t,beat,singer[b],X.vox,1.9,-12,{sung:true});
      carolCrowd(S,t,beat,crowd[b],harm[b],X.crowd,sec.startsWith('verse')?0.85:1);
      X.sleigh();
      if(last){X.ring([[0,3.8]],1);S.epicBass(t,X.bass,X.bar,1.5,bus);X.K(0,1);X.crash(1.3);S.bell(t,hz(57),1,bus);S.sleighBells(t,1.3,bus,true);S.sleighBells(X.at(0.5),1,bus,true);
        X.choir(tones,0.45);S.alienChatter(X.at(2.5),beat*1.5,0.4,X.vox,b,320,1.5);return;}
      switch(sec){
      case 'intro':   // a storm of sleigh bells and the creatures chattering, a swell, then the guitars and the Stylophone's minor jingle
        if(k<4){for(let x=0;x<4;x+=0.5)S.sleighBells(X.at(x),0.8,bus,true);if(k===1||k===3)S.alienChatter(X.at(0.5),beat*2.5,0.45,X.vox,k+1);if(k===2)S.ehSweep(t,hz(43),X.bar*2,0.8,bus,true);return;}
        X.chug(0.7+0.1*(k-4));X.bass8(0.8+0.05*(k-4));X.half(0.9);if(k===4)X.crash(1.1);if(k===7)X.fill();
        return;
      case 'riff':   // the screaming lead plays the chorus over the band
        X.pushes(1);X.rock(1);X.bass8(1);if(k===0){X.crash(1.1);S.bell(t,hz(55),0.9,bus);}if(k===7)X.fill();
        return;
      case 'solo':   // the gallop under the solo; the creatures answer in the second half
        X.gallop(1);X.rock(1);
        if(k>=8&&k%2===1)S.alienChatter(X.at(0.3),beat*3,0.55,X.vox,b,300+((k*37)%5)*20,1.5);
        if(k%8===0)X.crash();if(k===15)X.fill();
        return;
      case 'outro':   // "jingle all the way", held, and the last hit
        X.pushes(1);X.rock(1,true);X.bass8(1);X.choir(tones,0.4);if(k===0)X.crash(1.1);
        return;
      }
      if(sec.startsWith('chorus')){   // the lift: ringing power chords and the low chorus; double kick saved for the last chorus
        X.pushes(1);X.rock(1,sec==='chorus 3');X.bass8(1);X.choir(tones);if(k%4===0)X.crash(0.8);
        if(k===0){X.crash(1.2);S.bell(t,hz(sec==='chorus 3'?57:55),1,bus);}
        if(k===15)X.fill();
        return;
      }
      // the verses, in the alien minor: chugging half-time, the guitars opening up (still half-time) for the second half
      if(k<8)X.chug(0.85);else X.pushes(0.9);
      X.half(1);X.bass8(1);if(k===0)X.crash(1.1);if(k===7)X.fill();
      if(k===15){X.fill();S.ehSweep(t,hz(50),X.bar,0.6,bus,true);}
    }
  });
}

// ===================================================================== Stampede Across the Stars
// The Vector Space teaser music: techno space rock at 136 bpm. Four on the floor and a rolling off-beat bass under the
// heavy band, an acid sequencer, and one synth hook that travels: a twelve-bar stop on each world, four bars of local
// colour as the drone arrives and then the hook on that world's own instrument. England (a church bell, chugging
// guitars), Australia (didgeridoo, clapsticks, a jaw harp), Egypt (Phrygian dominant, darbuka, a driven Stylophone),
// India (elephants: a stomping beat, timpani, trumpeting calls, brass blaring the hook), then up a tone for Kenya (marimba against three-against-four drums), Peru
// (charango and pan flute) and the USA (the stampede gallop, whips, harmonica, twang guitar). Antarctica drops the
// drums for a theremin and choir and builds back; the lift-off plays the hook in octaves and the band falls away into
// the dark.
Synth.prototype.didg=function(t,f,dur,v,dest,rate=4.53){   // a didgeridoo: a buzzing drone, the mouth-shape swinging in rhythm, breath under it
  const c=this.ctx,end=t+dur+0.3,lp=this.filter('lowpass',650,1),bp=this.filter('bandpass',420,4),g=this.held(t,0.06,0.42*v,dur,0.25),bg=c.createGain();
  [1,1.004].forEach(k=>this.osc('sawtooth',f*k,t,end).connect(lp));
  const l=this.osc('sine',rate,t,end),lg=c.createGain();lg.gain.value=280;l.connect(lg);lg.connect(bp.frequency);
  bg.gain.value=1.4;lp.connect(bp);bp.connect(bg);bg.connect(g);lp.connect(g);g.connect(dest);
  const n=c.createBufferSource(),nf=this.filter('bandpass',1100,1.2),ng=this.held(t,0.1,0.035*v,dur,0.2);
  n.buffer=this.noise;n.loop=true;n.connect(nf);nf.connect(ng);ng.connect(dest);n.start(t);n.stop(end);
};
Synth.prototype.sitar=function(t,f,dur,v,dest){   // a bright string through a buzzing bridge, sliding into the note, with the sympathetic strings ringing
  const c=this.ctx,end=t+dur+0.7,o=this.osc('sawtooth',f,t,end),sh=c.createWaveShaper(),curve=new Float32Array(1024),pk=this.filter('peaking',2600,3),lp=this.filter('lowpass',5000,1.5),g=this.amp(t,0.002,0.3*v,dur+0.55,end);
  for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=Math.sign(x)*Math.pow(Math.abs(x),0.6);}
  sh.curve=curve;pk.gain.value=9;
  o.frequency.setValueAtTime(f*0.94,t);o.frequency.exponentialRampToValueAtTime(f,t+0.05);
  lp.frequency.setValueAtTime(5200,t);lp.frequency.exponentialRampToValueAtTime(1300,t+dur+0.45);
  o.connect(sh);sh.connect(pk);pk.connect(lp);lp.connect(g);g.connect(dest);
  // the sympathetic strings: their envelope starts with the note (a gain left at its default of 1 until a later start clicks out at full volume)
  [2,3].forEach(k=>{const s=this.osc('triangle',f*k,t,end),sg=this.amp(t,0.03,0.02*v,dur+0.5,end);s.connect(sg);sg.connect(dest);});
};
Synth.prototype.tabla=function(t,f,v,dest){   // a hand drum: a bent tone and a slap (low f for the bayan or doum, high for the tek)
  const o=this.osc('sine',f*1.5,t,t+0.5),g=this.amp(t,0.002,0.5*v,0.3,t+0.5);o.frequency.exponentialRampToValueAtTime(f,t+0.05);o.connect(g);g.connect(dest);
  this.hit(t,0.16*v,dest,f>200?3200:1800,1.5,0.012);
};
// a concert marimba for Kenya: the bar's note rings on through its tube resonator (two sines a hair apart give the
// slow shimmer of a real resonator), an octave and the bright upper partials die quickly, a felt mallet's knock,
// and a little of the room
// A long note is rolled (tremolo): two mallets alternating fast, a little uneven, the strikes swelling and easing.
Synth.prototype.bigMarimba=function(t,f,dur,v,dest){
  const room=this.ctx.createGain();room.gain.value=0.22;room.connect(this.verb);
  const strike=(t0,vv,ring)=>{const end=t0+ring+0.6;
    for(const [ratio,level,decay] of [[1,0.46,ring],[1.004,0.22,ring*1.25],[2,0.03,0.3],[4,0.075,0.12],[10,0.012,0.05]]){
      const g=this.amp(t0,0.002,level*vv,decay,end);this.osc('sine',f*ratio,t0,end).connect(g);g.connect(dest);if(ratio<2)g.connect(room);}
    this.hit(t0,0.1*vv,dest,Math.min(2400,f*3),1.2,0.02,'lowpass');};
  if(dur<0.5){strike(t,v,1.0);return;}
  const n=Math.max(2,Math.floor(dur*13));
  for(let i=0;i<n;i++){const x=i/n,swell=0.62+0.3*Math.sin(Math.PI*Math.min(1,x*1.4));
    strike(t+i/13+(i%2?0.006:0),v*(i?swell*(i%2?0.88:1):1),i===n-1?1.0:0.28);}
};
// a fingered bass in the Steve Harris manner: bright roundwound strings played hard, all mids and clank, a snap off
// the fingers and the string slapping the frets, light drive, with a round sine underneath so it keeps its bottom
Synth.prototype.harrisBass=function(t,f,dur,v,dest){
  const c=this.ctx,end=t+dur+0.15,s=this.osc('sawtooth',f,t,end),p=this.osc('square',f*1.003,t,end),pg=c.createGain();pg.gain.value=0.45;
  const hp=this.filter('highpass',45,0.7),lp=this.filter('lowpass',5200,0.9),mid=this.filter('peaking',900,1),clank=this.filter('peaking',2500,1.6),sh=c.createWaveShaper(),g=this.held(t,0.002,0.12*v,dur,0.06);
  mid.gain.value=5;clank.gain.value=9;
  lp.frequency.setValueAtTime(5200,t);lp.frequency.exponentialRampToValueAtTime(1600,t+0.22);
  sh.curve=new Float32Array(512).map((_,i)=>Math.tanh(2.2*(i*2/511-1))/Math.tanh(2.2));
  s.connect(hp);p.connect(pg);pg.connect(hp);hp.connect(lp);lp.connect(sh);sh.connect(mid);mid.connect(clank);clank.connect(g);g.connect(dest);
  this.hit(t,0.05*v,dest,3200,1.2,0.012);
  const o=this.osc('sine',f,t,end),og=this.held(t,0.003,0.05*v,dur,0.06);o.connect(og);og.connect(dest);
};
// a big brass blare for the elephants: three detuned saws scooping up into the note over a square an octave down, a
// growling flutter, the bell's filter flaring open
Synth.prototype.elephantHorn=function(t,f,dur,v,dest){
  const c=this.ctx,end=t+dur+0.4,mix=c.createGain(),lp=this.filter('lowpass',900,1.4),pk=this.filter('peaking',1400,1.2),g=this.held(t,0.025,0.075*v,dur,0.18);
  pk.gain.value=5;
  [0.996,1,1.005].forEach(k=>{const o=this.osc('sawtooth',f*k,t,end);o.frequency.setValueAtTime(f*k*0.84,t);o.frequency.exponentialRampToValueAtTime(f*k,t+0.07);o.connect(mix);});
  const sub=this.osc('square',f/2,t,end),sg=c.createGain();sg.gain.value=0.25;sub.connect(sg);sg.connect(mix);
  const fl=this.osc('sine',28,t,end),fg=c.createGain();fg.gain.value=0.18;mix.gain.value=0.82;fl.connect(fg);fg.connect(mix.gain);
  lp.frequency.setValueAtTime(700,t);lp.frequency.exponentialRampToValueAtTime(3800,t+0.09);lp.frequency.exponentialRampToValueAtTime(2200,t+Math.max(0.12,dur));
  mix.connect(lp);lp.connect(pk);pk.connect(g);this.dubOut(g,dest,0.18,0.3);
};
// an elephant trumpeting: a harsh reedy blast swooping up, wavering, and sagging away
Synth.prototype.elephantCall=function(t,f,v,dest){
  const c=this.ctx,dur=0.95,end=t+dur+0.3,mix=c.createGain(),bp=this.filter('bandpass',1700,1.6),sh=c.createWaveShaper(),g=this.held(t,0.04,0.1*v,dur-0.2,0.25);
  sh.curve=new Float32Array(512).map((_,i)=>Math.tanh(3*(i*2/511-1))/Math.tanh(3));
  [['sawtooth',1],['square',1.006]].forEach(([ty,k])=>{const o=this.osc(ty,f*k,t,end);o.frequency.setValueAtTime(f*k*0.7,t);o.frequency.exponentialRampToValueAtTime(f*k*1.25,t+0.22);
    o.frequency.exponentialRampToValueAtTime(f*k*1.12,t+0.6);o.frequency.exponentialRampToValueAtTime(f*k*0.8,t+dur);
    const l=this.osc('sine',9,t,end),lg=c.createGain();lg.gain.value=35;l.connect(lg);lg.connect(o.detune);o.connect(mix);});
  mix.connect(sh);sh.connect(bp);bp.connect(g);this.dubOut(g,dest,0.25,0.3);
  this.hit(t,0.08*v,g,900,0.8,0.25,'bandpass');
};
{
  const Q=n=>bars(rests(n,4)),up=(bs,k)=>bs.map(bar=>bar.map(e=>({...e,midi:e.midi.map(m=>m+k)})));
  const HOOK='E5:0.5 E5:0.5 G5:0.5 E5:0.5 B5:1 A5:0.5 G5:0.5 | F#5:1 E5:0.5 D5:0.5 E5:2 | E5:0.5 E5:0.5 G5:0.5 E5:0.5 B5:1 D6:0.5 B5:0.5 | A5:1 G5:0.5 F#5:0.5 G5:1 A5:1 | '+
    'B5:0.5 B5:0.5 D6:0.5 B5:0.5 E6:1 D6:0.5 B5:0.5 | C6:1 B5:0.5 A5:0.5 G5:1 E5:1 | F#5:0.5 G5:0.5 A5:0.5 B5:0.5 C6:1 A5:1 | B5:3 r:1';
  const hook=bars(HOOK),hookUp=up(hook,2),hookEgypt=bars(HOOK.replace(/G5/g,'G#5').replace(/F#5/g,'F5'));
  // the hook's first four bars at half speed, for the theremin on the ice
  const slow=hook.slice(0,4).flatMap(bar=>[0,1].map(h=>bar.filter(e=>e.at*2>=h*4&&e.at*2<h*4+4).map(e=>({...e,at:e.at*2-h*4,beats:Math.min(e.beats*2,4)}))));
  const HC=['Em','D','Em','C','Em','Am','D','B'],UP={Em:'F#m',D:'E',C:'D',Am:'Bm',B:'C#'};
  const W=(arrive,hk)=>[...arrive,...hk];
  // intro 8 | England 12 | Australia 12 | Egypt 12 | India 12 | Kenya 12 | Peru 12 | USA 12 | Antarctica 8 | lift-off 8
  const sections=[[0,'intro'],[8,'england'],[20,'australia'],[32,'egypt'],[44,'india'],[56,'kenya'],[68,'peru'],[80,'usa'],[92,'antarctica'],[100,'lift-off']];
  const chords=['Em','Em','Em','Em','Em','Em','Em','Em',
    ...W(['Em','Em','C','D'],HC),...W(['Em','Em','Em','Em'],HC),...W(['E','F','E','F'],['E','F','E','Dm','E','Am','Dm','E']),...W(['Em','Em','Em','Em'],HC),
    ...W(['D','E','F#m','F#m'],HC.map(c=>UP[c])),...W(['F#m','D','E','F#m'],HC.map(c=>UP[c])),...W(['F#m','F#m','D','E'],HC.map(c=>UP[c])),
    'Em','Em','D','D','Em','Em','C','B','C','D','Em','D','Em','C','Em','Em'];
  TUNES.splice(TUNES.findIndex(t=>t.id==='jingleVoid')+1,0,{
    id:'stampede',title:'Stampede Across the Stars',
    meta:'Techno space rock · E minor, then F sharp minor · 136 bpm · four on the floor, acid sequencer, heavy band, and a hook that visits eight worlds',
    desc:'The Vector Space teaser. Four on the floor and a galloping Steve Harris bass under the heavy band, the alien voice chopped into a riff that rises and falls through the mix, the band spread wide in stereo, and an acid sequencer, and one synth hook that travels from world to world: a church bell and chugging guitars in England, a didgeridoo in Australia, a Phrygian Stylophone over darbuka in Egypt, trumpeting elephants and blaring brass over timpani in India, then up a tone for a ringing marimba in Kenya, pan flute in Peru and a stampede with whips and harmonica in the USA. On the ice of Antarctica the drums drop away for a theremin and a choir, the drone lifts off with the hook in octaves, and the band falls away into the stars.',
    bpm:136,beats:4,send:0.25,gain:0.52,sections,chords,
    parts:[
      {inst:'ehSynLead',vel:0.95,shift:0,notes:[...Q(8),...Q(4),...hook,...Q(4),...hook,...Q(12),...Q(12),...Q(12),...Q(12),...Q(12),...Q(8),...Q(2),...hook.slice(0,4),...Q(2)]},
      {inst:'ehSynHigh',vel:0.5,shift:12,notes:[...Q(102),...hook.slice(0,4),...Q(2)]},
      {inst:'styloDrive',vel:0.8,shift:-12,notes:[...Q(36),...hookEgypt,...Q(64)]},
      {inst:'elephantHorn',vel:1.1,shift:-12,notes:[...Q(48),...hook,...Q(52)]},
      {inst:'bigMarimba',vel:0.85,shift:0,notes:[...Q(60),...hookUp,...Q(40)]},
      {inst:'spaceFlute',vel:0.9,shift:0,notes:[...Q(72),...hookUp,...Q(28)]},
      {inst:'surfGtr',vel:0.85,shift:-12,notes:[...Q(84),...hookUp,...Q(16)]},
      {inst:'ehTheremin',vel:0.9,shift:0,notes:[...Q(92),...slow,...Q(8)]}],
    accomp(S,bus,t,b,ch,beat){
      const X=carolKit(S,bus,t,b,ch,beat,this),sec=sectionOf(this,b),k=b-this.sections.find(x=>x[1]===sec)[0],r=ch.root,third=ch.tones[1];
      const tones=(this.voiced||(this.voiced=carolVoicing(this.chords)))[b],at=X.at;
      const four=(v=1,clap=true)=>{for(let x=0;x<4;x++){X.K(x,v);X.H(x,0.35*v);X.H(x+0.5,0.75*v,true);}if(clap){X.SN(1,1.2*v);X.SN(3,1.2*v);}};
      const roll=(v=1)=>{for(let i=0;i<16;i++)if(i%4)S.harrisBass(at(i/4),X.bass,beat*0.2,(i%4===2?1:0.7)*1.3*v,bus);};
      const acid=(cut,v=0.55)=>{const ns=[0,12,7,12,third+12,12,7,12,0,12,7,19,third+12,12,7,24];
        for(let i=0;i<16;i++)S.ehSeq(at(i/4),hz(48+r+ns[i]),beat*0.2,1.5*v*(i%4===0?1:0.7),S.pan(X.fx.pad,i%2?0.45:-0.45),cut*(1+0.35*Math.sin(i/8*Math.PI)));};
      const pad=(v=0.5,d=X.bar*0.97)=>tones.forEach((m,i)=>S.ehPad(t,hz(m),d,v,S.pan(bus,[-0.55,0,0.55][i%3])));
      const world=sec!=='intro'&&sec!=='antarctica'&&sec!=='lift-off',hookBars=world&&k>=4;
      // The gallop: the bass in "DUM da-da" (an eighth and two sixteenths) on every beat, low toms
      // doubling the "da-da", and in the hook bars the guitars chugging the same figure.
      // The bass gallops like Steve Harris: three beats of DUM da-da on the root, and the fourth either a run up the
      // chord into the next one or the gallop jumped up an octave.
      const bm=33+(r+3)%12,nx=this.chords[b+1]?chordOf(this.chords[b+1]).root:r,nbm=33+(nx+3)%12;
      const hb=(x,m,d,v)=>S.harrisBass(at(x),hz(m),beat*d,v,bus);
      const gallopBass=(v=1)=>{for(let q=0;q<3;q++)[0,.5,.75].forEach((x,i)=>hb(q+x,bm,i?0.18:0.38,(i?0.75:1)*1.4*v));
        if(nbm!==bm)[bm,bm+third,bm+7,bm+(third===3?10:11)].forEach((m,i)=>hb(3+i/4,m,0.2,(i?0.85:1)*1.4*v));
        else[0,.5,.75].forEach((x,i)=>hb(3+x,bm+(b%2?12:0),i?0.18:0.38,(i?0.75:1)*1.4*v));};
      // The alien voice from the Christmas video, never singing or speaking: clipped syllables chopped into a riff.
      const RIFF=[[[0,'ka',0],[0.75,'shi',0],[1.5,'ka',7],[2,'ru',0],[2.75,'ka',0],[3.5,'mo',12]],
        [[0,'ka',0],[0.5,'ka',0],[1,'shi',7],[1.75,'ru',12],[2.5,'ka',0],[3,'mo',7],[3.25,'ka',0]]];
      // The riff goes through a low-pass filter, so it leaves the 2-4 kHz presence band to the melody: muffled under the
      // tune (1.7 kHz), opening brighter as the camera arrives at a herd (3.2 kHz). Darker vowels (scale 1.2) too.
      const chop=(v=1,cut=1700)=>{if(v<=0)return;const lp=S.filter('lowpass',cut,0.8),lp2=S.filter('lowpass',cut*1.15,0.6);lp.connect(lp2);lp2.connect(bus);
        RIFF[b%2].forEach(([x,syl,d],i)=>S.alienSing(at(x),hz(64+r-4+d),beat*0.2,v,lp,syl,{scale:1.2,pan:i%2?0.55:-0.55}));};
      // how loud the riff is, bar by bar: out in front as the camera arrives at a herd, tucked under the hook after,
      // and riding high through the stampede and the build at the end
      const RIFF_LEVEL={england:[0.8,0.06],australia:[0.5,0.05],egypt:[0.7,0.05],india:[0.5,0.05],kenya:[0.35,0.05],peru:[0.7,0.06],usa:[1,0.08]};   // [arriving, under the hook]
      // the stereo band: everything played twice, hard left and hard right, the right a hair late
      const dbl=fn=>{fn(S.pan(bus,-0.6),0);fn(S.pan(bus,0.6),0.012);};
      const chugW=(v=1)=>{for(let i=0;i<8;i++)dbl((d,dt)=>S.ehRhythm(at(i/2)+dt,X.pc,beat*0.32,(i%2?0.75:0.95)*v*0.8,d,false));};
      const pushesW=(v=1)=>[[0,1.4],[1.5,0.4],[2,1.4],[3.5,0.4]].forEach(([x,du])=>dbl((d,dt)=>S.ehRhythm(at(x)+dt,X.pc,beat*du,v*0.8,d,true)));
      // India's stomp: a heavy rock beat for the elephants instead of four on the floor
      const stomp=(v=1)=>{X.K(0,1.1*v);X.K(1.5,0.6*v);X.K(2,v);X.K(2.75,0.6*v);X.SN(1,1.4*v);X.SN(3,1.4*v);for(let i=0;i<8;i++)X.H(i/2,(i%2?0.4:0.75)*v,i===7);};
      const gallopToms=(v=1)=>{for(let q=0;q<4;q++){S.ehTom(at(q+.5),96,.42*v,S.pan(bus,-0.45));S.ehTom(at(q+.75),112,.52*v,S.pan(bus,0.45));}};
      const gallopGtr=(v=1)=>{for(let q=0;q<4;q++)[0,.5,.75].forEach((x,i)=>dbl((d,dt)=>S.ehRhythm(at(q+x)+dt,X.pc,beat*(i?0.18:0.36),(i?0.7:0.95)*v*0.8,d,false)));};
      if(world){   // the groove every world shares: four on the floor and the gallop
        if(sec==='india')stomp(1);else four(1);gallopBass(1);if(sec!=='usa'&&sec!=='india'){gallopToms(k<4?0.8:1);if(hookBars&&sec!=='egypt')gallopGtr(0.6);}acid(hookBars?1600+400*Math.sin(k/6*Math.PI):2600,hookBars?0.4:0.55);pad(hookBars?0.35:0.5);
        if(k===0){X.crash(1.15);S.ehSweep(t,hz(52),X.bar,0.6,bus,false);}
        const RL=RIFF_LEVEL[sec];if(RL)chop(sec==='usa'&&k>=9?0.12:RL[k<4?0:1],k<4?3200:1700);
        if(k===4)X.crash(1);if(k===11)X.fill();
      }
      switch(sec){
      case 'intro':   // the sequencer alone, opening up; a sweep and a jet; the kick arrives
        pad(0.6);acid(300*Math.pow(8,k/7),0.5+k*0.04);
        if(k===0)S.ehSweep(t,hz(52),X.bar*3,1,bus,true);
        if(k===2)S.ehJet(t,X.bar*2,1,bus,true);
        if(k===3)S.ehZap(at(2),hz(76),0.8,bus);
        if(k>=4){for(let x=0;x<4;x++){X.K(x,0.6+0.1*(k-4));X.H(x+0.5,0.5,true);}chop(0.55+0.08*(k-4),3200);}
        if(k>=6)roll(0.5+0.25*(k-6));
        if(k===7)X.fill();
        return;
      case 'england':   // a church bell over chugging guitars, then the hook with power chords
        if(k===0)S.bell(t,hz(52),1,bus);
        if(k<4)chugW(0.85);else pushesW(0.9);
        return;
      case 'australia':   // the didgeridoo under it all, clapsticks on the eighths, a jaw harp's boing
        S.didg(t,hz(40),X.bar*0.98,0.36,bus);
        for(let x=0;x<4;x+=0.5)S.hit(at(x),x%1?0.22:0.32,bus,2300,7,0.03);
        if(k%4===1)S.jawHarp(at(3.5),hz(52),0.8,bus);
        if(k>=4)pushesW(0.6);
        return;
      case 'egypt':   // the darbuka's maqsum (doum tek - tek doum - tek -), the guitars chugging in the strange scale
        [[0,90],[0.5,320],[1.5,320],[2,90],[3,320]].forEach(([x,f])=>S.tabla(at(x),f,f<200?1:0.7,bus));
        chugW(k<4?0.8:0.65);
        if(k===0)S.ehZap(at(3),hz(76),0.6,bus);
        return;
      case 'india':   // the elephants: timpani on the stomp, the herd trumpeting and brass chords as they arrive, then the brass blares the hook
        S.timpani(at(0),hz(bm),0.9,bus);S.timpani(at(2),hz(bm),0.7,bus);
        if(k<4){if(k%2===0)S.elephantCall(at(k===0?0.5:2.5),hz(bm+31),0.9,bus);else tones.forEach(m=>S.brass(at(0),hz(m),beat*1.2,0.5,bus));}
        else pushesW(0.6);
        if(k===3)S.timpRoll(at(2),hz(bm),beat*2,0.3,0.9,bus);
        return;
      case 'kenya':   // the marimba's ostinato and drums in three against four
        for(let x=0;x<4;x+=4/3)X.tom(x,0.8,[180,150,120][Math.round(x*3/4)%3]);
        if(k<4)for(let i=0;i<8;i++)S.bigMarimba(at(i/2),hz(64+r-4+[0,7,12,7,third+12,7,12,19][i]),beat*0.4,0.6,S.pan(bus,i%2?0.35:-0.35));
        else pushesW(0.7);
        return;
      case 'peru':   // charango strums and the bombo drum
        S.ehTom(at(0),70,1,bus);S.ehTom(at(2.5),70,0.8,bus);
        if(k<4)for(let i=0;i<16;i++)if(i%3!==2)tones.forEach((m,j)=>S.surfGtr(at(i/4),hz(m+12),beat*0.14,0.22,S.pan(bus,[-0.5,0,0.5][j%3])));
        else pushesW(0.6);
        return;
      case 'usa':   // the stampede: the band's gallop, whips cracking, a harmonica wail
        gallopGtr(0.9);
        if(k%4===0)S.whipCrack(at(0),1,bus);if(k%4===2)S.whipCrack(at(2.5),0.8,bus);
        if(k<4)S.harmonica(at(0.5),hz(64+r-4+12),beat*1.4,0.8,bus);
        if(k===2)S.jawHarp(at(3),hz(54),0.8,bus);
        return;
      case 'antarctica':   // the drums fall away for the theremin and the choir; then the beat builds back
        pad(0.75);X.choir(tones,0.3);acid(500+120*k,0.35);
        for(let x=0;x<4;x+=0.5)X.H(x,0.25);
        if(k===0)S.ehSweep(t,hz(64),X.bar*2,0.8,bus,false);
        if(k===2||k===3)chop(0.06);if(k>=6)chop(0.1+0.04*(k-6));   // softly: the theremin has the tune
        if(k>=4)X.K(0,0.7);if(k>=5)X.K(2,0.7);
        if(k>=6){four(0.8,false);roll(0.6);}
        if(k===6)S.ehJet(t,X.bar*2,1,bus,true);
        if(k===7){for(let i=0;i<16;i++)S.epicSnare(at(i/4),0.3+i*0.04,bus);S.ehSweep(t,hz(40),X.bar,1,bus,true);}
        return;
      case 'lift-off':   // the hook in octaves; then the band stops and the drone drifts out into the stars
        if(k<6){four(1);roll(1);pushesW(1);chop(k<2?(k%2?0.95:0.6):(k%2?0.12:0.08),k<2?3200:1700);acid(3200,0.5);pad(0.5);if(k===0||k===2)X.crash(1.2);if(k===0)S.ehSweep(t,hz(40),X.bar*2,1.1,bus,true);if(k===5)X.fill();}
        else{pad(0.7-0.25*(k-6),X.bar*(k===7?2.4:0.97));acid(2400*Math.pow(0.35,k-5),0.45-0.15*(k-6));
          if(k===6)chop(0.4);
          if(k===6){X.K(0,1);X.crash(1.3);S.epicBass(t,X.bass,X.bar,1.4,bus);S.bell(t,hz(52),0.8,bus);S.ehSweep(t,hz(76),X.bar*2.5,0.8,bus,false);S.ehJet(t,X.bar*2.5,0.7,bus,false);}}
        return;
      }
    }
  });
}

// ===================================================================== playing
// On the organ every instrument becomes an organ stop: bass parts on the pedals, chords on soft flutes,
// tunes on the reedy solo stop; the drums are left out.
const ORGAN = { tuba: "organPedal", pizz: "organPedal", strings: "organ", harpsichord: "organ", piano: "organ",
  marimba: "organLead", trumpet: "organLead", brass: "organLead", sax: "organLead", bassoon: "organLead", violin: "organLead", reed: "organLead", xylo: "organLead" };
function organised(S, tune = {}, bus = null) {
  const o = Object.create(S);
  let input = null;
  if (tune.drivenOrgan && bus) {
    // One shared amp per arrangement: chords and pedal interact in the same saturation stage.
    input = S.ctx.createGain(); input.gain.value = 5;
    const hp = S.filter("highpass", 65, 0.7), drive = S.ctx.createWaveShaper();
    const curve = new Float32Array(4096);
    for (let i=0;i<curve.length;i++) { const x=i*2/(curve.length-1)-1; curve[i]=Math.tanh(2.8*x)/Math.tanh(2.8); }
    drive.curve=curve; drive.oversample="4x";
    const cabinet=S.filter("lowpass",3300,0.8), body=S.filter("peaking",850,0.8); body.gain.value=2;
    const level=S.ctx.createGain(); level.gain.value=0.52;
    const rotor=S.ctx.createStereoPanner(), trem=S.ctx.createGain(); trem.gain.value=0.94;
    const lfo=S.ctx.createOscillator(), spread=S.ctx.createGain(), flutter=S.ctx.createGain();
    lfo.frequency.value=0.82; spread.gain.value=0.24; flutter.gain.value=0.06;
    lfo.connect(spread); spread.connect(rotor.pan); lfo.connect(flutter); flutter.connect(trem.gain);
    input.connect(hp); hp.connect(drive); drive.connect(body); body.connect(cabinet); cabinet.connect(level); level.connect(rotor); rotor.connect(trem); trem.connect(bus);
    lfo.start();
    o.release = () => { lfo.stop(); lfo.disconnect(); input.disconnect(); };
  }
  for (const [k, v] of Object.entries(ORGAN)) o[k] = (t,f,d,vel,dest) => S[v](t,f,d,vel,input || dest);
  o.hit = () => {};
  return o;
}

// Records a tune once through (with its last notes left to ring out), exactly as it plays live, and returns it as a
// 16-bit stereo WAV in base64. tools/render-music.js uses this to make the game's MP3s (music/<id>.mp3).
async function renderOnce(id, onOrgan, rate = 44100) {
  const tune = TUNES.find(t => t.id === id), beat = 60 / tune.bpm, n = tune.chords.length;
  const secs = 0.3 + n * tune.beats * beat + 6;
  const off = new OfflineAudioContext(2, Math.ceil(rate * secs), rate), s = new Synth(off);
  const bus = s.bus(tune.send || 1); bus.gain.value = (tune.gain || 1) * (onOrgan ? tune.organGain || 1 : 1);
  const P = onOrgan ? organised(s, tune, bus) : s;
  let at = 0.3;
  for (let b = 0; b < n; b++) {
    tune.accomp(P, bus, at, b, chordOf(tune.chords[b]), beat, chordOf(tune.chords[(b + 1) % n]));
    for (const p of tune.parts) {
      if (onOrgan && (tune.organSkip || []).includes(p.inst)) continue;
      for (const ev of p.notes[b] || []) {
        let pos = ev.at;
        if (tune.swing && Math.abs(pos % 1 - 0.5) < 0.01) pos = Math.floor(pos) + tune.swing;
        const up = onOrgan && (p.inst === "sax" || p.inst === "bassoon") ? 12 : 0;
        for (const m of ev.midi) P[p.inst](at + pos * beat, hz(m + p.shift + up), ev.beats * beat * 0.95, ev.vel ?? p.vel, bus);
      }
    }
    at += tune.beats * beat;
  }
  const buf = await off.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1);
  // trim the silence after the last ring, keeping a short tail
  let end = L.length - 1;
  while (end > 0 && Math.abs(L[end]) < 2e-4 && Math.abs(R[end]) < 2e-4) end--;
  end = Math.min(L.length, end + Math.round(rate * 0.25));
  const bytes = new DataView(new ArrayBuffer(44 + end * 4));
  const str = (o, t) => { for (let i = 0; i < t.length; i++) bytes.setUint8(o + i, t.charCodeAt(i)); };
  str(0, "RIFF"); bytes.setUint32(4, 36 + end * 4, true); str(8, "WAVEfmt "); bytes.setUint32(16, 16, true);
  bytes.setUint16(20, 1, true); bytes.setUint16(22, 2, true); bytes.setUint32(24, rate, true); bytes.setUint32(28, rate * 4, true);
  bytes.setUint16(32, 4, true); bytes.setUint16(34, 16, true); str(36, "data"); bytes.setUint32(40, end * 4, true);
  for (let i = 0; i < end; i++) {
    bytes.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    bytes.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  const u8 = new Uint8Array(bytes.buffer); let bin = "";
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { seconds: +(end / rate).toFixed(1), wav: btoa(bin) };
}

window.OHMusicLib = { A4, NAMES, midiOf, hz, CHORD, chordOf, Synth, parseBar, bars, rests, sectionOf, TUNES, ORGAN, organised, chipped, renderOnce };
})();

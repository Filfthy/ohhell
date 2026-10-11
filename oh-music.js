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

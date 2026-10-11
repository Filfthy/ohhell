// oh-music-player.js - the game's music: recordings of its tunes (music/<id>.mp3), streamed one at a time, so even a
// phone does almost no work. The notes and instruments live in oh-music.js (played live by jukebox.html);
// tools/render-music.js records these files from them, so change a tune there and re-run it.
//
// Plays the set once through each, in shuffled order (never the same tune twice running), with a short rest between;
// or a tune picked from the sound panel, then carries on shuffling. Like Drakeharbour: the Sound switch silences
// everything, the music has its own volume (0 = off). Browsers keep sound off until the first click, which wakes it;
// it pauses while the tab is hidden.

// The game's tunes: all orchestral except The Hollow Benediction, which is on its organ. (tools/render-music.js reads
// this list too.)
window.OH_MUSIC_SET = [
  { id: "black", name: "Waltz in Black", organ: false },
  { id: "parlour", name: "The Devil's Parlour", organ: false },
  { id: "bell13", name: "The Thirteenth Bell", organ: false },
  { id: "carousel", name: "The Last Carousel", organ: false },
  { id: "veil", name: "Behind the Velvet Door", organ: false },
  { id: "hymn", name: "The Hollow Benediction", organ: true },
  { id: "ironCourt", name: "The Court of Iron", organ: false },
  { id: "thirdKnock", name: "The Third Knock", organ: false }
];

window.OHMusic = (function () {
  const SET = window.OH_MUSIC_SET;
  const FILES_V = 1;                  // bump when the recordings are re-made, so browsers fetch the new ones
  const MAXVOL = 0.8, REST = 2.5;     // loudest the music goes; seconds between tunes
  let sound = true, volume = 0.45, picked = null, woken = false, order = [], last = null, wait = null, fader = null;
  if (/[?&]demo\b/.test(location.search)) picked = "black";   // index.html?demo (for recording videos): Waltz in Black first
  try {
    const v = localStorage.getItem("oh_musicVol"); if (v != null) volume = +v;
    sound = localStorage.getItem("oh_soundMuted") !== "1";
  } catch (e) { /* ignore */ }
  const audio = new Audio();
  audio.preload = "auto";
  const level = () => MAXVOL * Math.pow(volume, 1.75);   // shaped so the lower half of the slider is properly quiet
  const wanted = () => woken && sound && volume > 0;
  const nameOf = id => (SET.find(t => t.id === id) || {}).name || null;
  const changed = () => document.dispatchEvent(new Event("musicchange"));
  let current = null;   // the tune loaded and not yet finished

  function fadeTo(target, secs, then) {
    clearInterval(fader);
    const from = audio.volume, steps = Math.max(1, Math.round(secs * 20)); let i = 0;
    fader = setInterval(() => {
      i++; audio.volume = Math.max(0, Math.min(1, from + (target - from) * i / steps));
      if (i >= steps) { clearInterval(fader); fader = null; if (then) then(); }
    }, 50);
  }
  function next() {
    clearTimeout(wait); wait = null;
    if (!wanted()) return;
    let id;
    if (picked) { id = picked; picked = null; order = order.filter(t => t.id !== id); }
    else {
      if (!order.length) { order = SET.slice().sort(() => Math.random() - 0.5); if (order[0].id === last && order.length > 1) order.push(order.shift()); }
      id = order.shift().id;
    }
    last = current = id;
    clearInterval(fader); audio.volume = level();
    audio.src = `music/${id}.mp3?v=${FILES_V}`;
    const p = audio.play(); if (p && p.catch) p.catch(() => {});
    changed();
  }
  audio.addEventListener("ended", () => { current = null; changed(); wait = setTimeout(next, REST * 1000); });
  // start, pause or carry on, to match the switch, the volume and whether the page has been clicked yet
  function refresh() {
    if (!wanted()) {
      clearTimeout(wait); wait = null;
      if (!audio.paused) fadeTo(0, 0.4, () => audio.pause());
      changed(); return;
    }
    if (!current) { if (!wait) next(); return; }
    if (audio.paused) { audio.volume = 0; const p = audio.play(); if (p && p.catch) p.catch(() => {}); }
    fadeTo(level(), 0.3);
    changed();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) audio.pause();
    else if (wanted() && current) { const p = audio.play(); if (p && p.catch) p.catch(() => {}); }
  });
  // the first click anywhere wakes the sound (it must start inside the click for the browser to allow it)
  document.addEventListener("pointerdown", () => { if (!woken) { woken = true; refresh(); } }, true);
  return {
    TUNES: SET.map(t => ({ id: t.id, name: t.name })),
    get sound() { return sound; }, get volume() { return volume; },
    get tune() { return current ? nameOf(current) : null; },
    get queued() { return picked ? nameOf(picked) : null; },
    setSound(on) { sound = !!on; refresh(); },
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); try { localStorage.setItem("oh_musicVol", String(volume)); } catch (e) { /* ignore */ } refresh(); },
    // play this tune now (then carry on shuffling)
    choose(id) {
      picked = id;
      if (wanted()) { if (current && !audio.paused) fadeTo(0, 0.4, next); else next(); }
      changed();
    },
    wake() { if (!woken) { woken = true; refresh(); } },
    get _audio() { return audio; }   // for testing
  };
})();

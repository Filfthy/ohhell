// Records the game's tunes from their notes (oh-music.js) into music/<id>.mp3.
//   node tools/render-music.js            all the tunes in the game's set (OH_MUSIC_SET in oh-music-player.js)
//   node tools/render-music.js hymn black only these
// Needs Microsoft Edge (or set EDGE to a Chrome/Edge exe) and ffmpeg on the PATH. After re-making the files, bump
// FILES_V in oh-music-player.js so players' browsers fetch the new ones.
// Each tune is played once through, exactly as it sounds live, in a hidden browser (offline, faster than real
// time), saved as a WAV, levelled to the same loudness as the others, and turned into a 96 kbps stereo MP3.
const { spawn, execFileSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");

const ROOT = path.resolve(__dirname, "..");
const EDGE = process.env.EDGE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9341;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // the game's set, read from the player
  const playerSrc = fs.readFileSync(path.join(ROOT, "oh-music-player.js"), "utf8");
  const setSrc = playerSrc.slice(playerSrc.indexOf("window.OH_MUSIC_SET"), playerSrc.indexOf("];") + 2);
  const window = {}; eval(setSrc);
  let set = window.OH_MUSIC_SET;
  const only = process.argv.slice(2);
  if (only.length) set = set.filter(t => only.includes(t.id));
  if (!set.length) { console.log("no tunes match"); return; }

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "ohmusic-"));
  const edge = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, "--mute-audio", "about:blank"], { stdio: "ignore" });
  let list = null;
  for (let i = 0; i < 50 && !list; i++) { await sleep(200); try { list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch (e) { /* not up yet */ } }
  const page = list.find(p => p.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  await new Promise(r => (ws.onopen = r));
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => {
    const r = await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "page error");
    return r.result.result.value;
  };
  await send("Page.enable");
  await send("Page.navigate", { url: "file:///" + path.join(ROOT, "jukebox.html").replace(/\\/g, "/") });
  for (let i = 0; i < 50; i++) { await sleep(200); if (await ev("!!(window.OHMusicLib && OHMusicLib.renderOnce)").catch(() => false)) break; }

  fs.mkdirSync(path.join(ROOT, "music"), { recursive: true });
  for (const t of set) {
    const t0 = Date.now();
    const r = await ev(`OHMusicLib.renderOnce(${JSON.stringify(t.id)}, ${t.organ})`);
    const wav = path.join(prof, t.id + ".wav"), mp3 = path.join(ROOT, "music", t.id + ".mp3");
    fs.writeFileSync(wav, Buffer.from(r.wav, "base64"));
    // every tune levelled to the same loudness, so the shuffle never needs the volume touching
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-af", "loudnorm=I=-21:TP=-2:LRA=14", "-ar", "44100", "-codec:a", "libmp3lame", "-b:a", "96k", mp3]);
    fs.unlinkSync(wav);
    console.log(`${t.name.padEnd(26)} ${String(r.seconds).padStart(6)} s  ${(fs.statSync(mp3).size / 1048576).toFixed(2)} MB  (${((Date.now() - t0) / 1000).toFixed(0)} s to make)`);
  }
  ws.close(); edge.kill();
  setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* Edge may still hold it */ } }, 1500);
})().catch(e => { console.error(e); process.exit(1); });

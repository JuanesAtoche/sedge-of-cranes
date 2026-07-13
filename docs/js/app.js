/**
 * app.js — state machine + story engine + lazy AR loader.
 *
 * Phase 4 additions:
 *  - AR libraries lazy-load on Start (landing page stays ~50 KB)
 *  - pre-flight check that targets.mind is deployed
 *  - per-browser instructions on the permission-denied screen
 *  - in-app-browser detection (WhatsApp/Instagram/Facebook webviews
 *    often block the camera) with a gentle warning on the landing page
 *  - screen wake lock while in AR (phones must not sleep mid-story)
 *  - unsupported/error state shows a pre-rendered GIF of the experience
 */

const APP_VERSION = "0.5.2";   // bump with every deploy (also bump ?v= in index.html)

// Pinned CDN libraries (verified against the published npm packages)
const LIBS = [
  "https://cdn.jsdelivr.net/npm/aframe@1.5.0/dist/aframe-v1.5.0.min.js",
  "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js",
  "js/flock.js?v=" + APP_VERSION,
];

// Beats: VTT cue number (1-based) → beat name in flock.js (v0.5.0 event API)
const BEAT_CUES = { 4: "wobble", 7: "loop", 10: "finale" };

const $ = (id) => document.getElementById(id);

// ---- screens ---------------------------------------------------------------

const SECTIONS = ["landing", "denied", "unsupported"];

function showSection(name) {
  SECTIONS.forEach((s) => { $("state-" + s).hidden = s !== name; });
  $("ar-container").hidden = name !== null;
  document.body.classList.toggle("in-ar", name === null);
}

function showDenied() {
  // friendly, per-browser retry instructions (spec 5.3, state 2)
  const ua = navigator.userAgent;
  $("denied-body").textContent =
    /iPhone|iPad/.test(ua) ? STRINGS.deniedBodyIos :
    /Android/.test(ua)     ? STRINGS.deniedBodyAndroid :
                             STRINGS.deniedBody;
  showSection("denied");
}

function showUnsupported(kind) {
  // one screen, two flavors: old browser vs. failed asset/library load
  $("unsupported-title").textContent =
    kind === "load" ? STRINGS.errorTitle : STRINGS.unsupportedTitle;
  $("unsupported-body").textContent =
    kind === "load" ? STRINGS.errorBody : STRINGS.unsupportedBody;
  showSection("unsupported");
}

function applyStrings() {
  document.querySelectorAll("[data-str]").forEach((el) => {
    el.textContent = STRINGS[el.dataset.str] || "⚠ missing string";
  });
  document.title = STRINGS.appTitle;
}

// ---- story engine ----------------------------------------------------------

let audio = null;
let audioBroken = false;
let cues = [];
let storyState = "idle";     // idle | playing | ended
let firedBeats = new Set();
let subsOn = true;           // spec: subtitles on by default
let tracked = false;

function parseVTT(txt) {
  const re = /(\d{2}):(\d{2}):(\d{2}\.\d{3}) --> (\d{2}):(\d{2}):(\d{2}\.\d{3})\s*\n(.+)/g;
  const out = []; let m;
  while ((m = re.exec(txt))) {
    out.push({
      start: +m[1] * 3600 + +m[2] * 60 + +m[3],
      end:   +m[4] * 3600 + +m[5] * 60 + +m[6],
      text:  m[7].trim(),
    });
  }
  return out;
}

async function loadStory() {
  if (audio) return;
  audio = new Audio("assets/narration.mp3");
  audio.preload = "auto";
  audio.addEventListener("timeupdate", onTimeUpdate);
  audio.addEventListener("ended", onStoryEnded);
  audio.addEventListener("error", () => { audioBroken = true; });
  try {
    const txt = await (await fetch("assets/narration.vtt")).text();
    cues = parseVTT(txt);
  } catch (e) { console.warn("Subtitles unavailable:", e); }
}

function flock() {
  // v0.5.0: the component is named sedge-flock and is driven by EVENTS
  // (emit), not method calls — see the API comment at the top of flock.js.
  return document.querySelector("[sedge-flock]");
}

function onTimeUpdate() {
  const t = audio.currentTime;
  const cue = cues.find((c) => t >= c.start && t < c.end);
  const bar = $("subtitle-bar");
  bar.textContent = cue ? cue.text : "";
  bar.hidden = !(subsOn && tracked && storyState === "playing" && cue);

  for (const [num, name] of Object.entries(BEAT_CUES)) {
    const c = cues[num - 1];
    if (c && t >= c.start && !firedBeats.has(num)) {
      firedBeats.add(num);
      const fl = flock();
      if (fl) fl.emit("flock-beat", { name });
    }
  }
}

function startStory() {
  $("btn-story").hidden = true;
  if (audioBroken) { flashSubtitle(STRINGS.audioFailed); return; }
  storyState = "playing";
  if (audio.ended || audio.currentTime > 0) {   // replay
    audio.currentTime = 0;
    firedBeats.clear();
  }
  audio.play().catch((e) => {
    console.warn("Audio play failed:", e);
    flashSubtitle(STRINGS.audioFailed);
    storyState = "idle";
  });
}

function flashSubtitle(text) {
  const bar = $("subtitle-bar");
  bar.textContent = text;
  bar.hidden = false;
  setTimeout(() => { if (bar.textContent === text) bar.hidden = true; }, 4000);
}

function onStoryEnded() {
  storyState = "ended";
  $("subtitle-bar").hidden = true;
  const b = $("btn-story");
  b.textContent = STRINGS.playAgain;
  b.hidden = false;                     // flock keeps idle orbiting (spec)
}

function resetStory() {
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
  storyState = "idle";
  firedBeats.clear();
  $("subtitle-bar").hidden = true;
  $("btn-story").hidden = true;
}

// ---- lazy AR loading -------------------------------------------------------

let arReady = false;
let arSystem = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}

async function ensureARLoaded() {
  if (arReady) return;

  // pre-flight: is the compiled image target actually deployed?
  const head = await fetch("assets/targets.mind", { method: "HEAD" });
  if (!head.ok) throw new Error("targets.mind missing (compile & upload it — see README)");

  await loadScript(LIBS[0]);                                  // A-Frame first
  await Promise.all([loadScript(LIBS[1]), loadScript(LIBS[2])]); // MindAR + flock

  // inject the scene now that its custom elements are defined
  const tpl = $("ar-scene-template");
  $("ar-container").appendChild(tpl.content.cloneNode(true));
  wireARScene();
  arReady = true;
}

function wireARScene() {
  const scene = $("ar-scene");

  if (new URLSearchParams(location.search).has("debug")) {
    scene.setAttribute("stats", "");        // FPS meter (acceptance: ≥ 24)
  }

  scene.addEventListener("arError", () => { stopAR(); showDenied(); });

  const anchor = $("mat-anchor");
  anchor.addEventListener("targetFound", () => {
    tracked = true;
    $("overlay-scanning").hidden = true;
    if (storyState === "idle" || storyState === "ended") {
      const b = $("btn-story");
      b.textContent = storyState === "idle" ? STRINGS.startStory : STRINGS.playAgain;
      b.hidden = false;
    } else if (storyState === "playing") {
      audio.play().catch(() => {});         // resume where it paused
    }
  });
  anchor.addEventListener("targetLost", () => {
    tracked = false;
    $("scanning-text").textContent = STRINGS.scanningBack;   // "point back…"
    $("overlay-scanning").hidden = false;
    $("subtitle-bar").hidden = true;
    $("btn-story").hidden = true;
    if (storyState === "playing" && audio) audio.pause();    // ≤ 300 ms (spec)
  });
}

// ---- wake lock (screen must not sleep during a 90 s story) ------------------

let wakeLock = null;
async function acquireWakeLock() {
  try {
    if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
  } catch (_) { /* not critical */ }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !$("ar-container").hidden) acquireWakeLock();
});

// ---- AR lifecycle ----------------------------------------------------------

async function startAR() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showUnsupported("old");
    return;
  }
  loadStory();                              // buffer audio + subtitles
  showSection(null);
  $("scanning-text").textContent = STRINGS.loadingAR;   // libs are loading
  $("overlay-scanning").hidden = false;

  try {
    await ensureARLoaded();
  } catch (e) {
    console.warn(e);
    stopAR();
    showUnsupported("load");                // CDN/asset failure ≠ old phone
    return;
  }

  const scene = $("ar-scene");
  if (!scene.hasLoaded) {
    await new Promise((r) => scene.addEventListener("loaded", r, { once: true }));
  }
  arSystem = scene.systems["mindar-image-system"];
  try {
    await arSystem.start();                 // camera permission prompt
    $("scanning-text").textContent = STRINGS.scanningHint;
    acquireWakeLock();
  } catch (err) {
    console.warn("AR start failed:", err);
    stopAR();
    showDenied();
  }
}

function stopAR() {
  resetStory();
  try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (_) {}
  try { if (arSystem) arSystem.stop(); } catch (_) {}
  document.querySelectorAll("#ar-container video").forEach((v) => {
    if (v.srcObject) v.srcObject.getTracks().forEach((t) => t.stop());
  });
  showSection("landing");
}

// ---- boot -------------------------------------------------------------------

window.addEventListener("DOMContentLoaded", () => {
  applyStrings();
  console.log("Sedge of Cranes v" + APP_VERSION);
  $("version-stamp").textContent = "v" + APP_VERSION;

  // WhatsApp/Instagram/Facebook in-app browsers often block the camera
  if (/FBAN|FBAV|Instagram|Line\/|; wv\)/.test(navigator.userAgent)) {
    $("inapp-warning").hidden = false;
  }

  $("btn-mute").textContent = "🔊";
  $("btn-mute").setAttribute("aria-label", STRINGS.ariaMute);
  $("btn-subs").textContent = "💬";
  $("btn-subs").setAttribute("aria-label", STRINGS.ariaSubs);

  $("btn-start").addEventListener("click", startAR);
  $("btn-retry").addEventListener("click", startAR);
  $("btn-exit").addEventListener("click", stopAR);
  $("btn-story").addEventListener("click", startStory);

  $("btn-mute").addEventListener("click", () => {
    if (!audio) return;
    audio.muted = !audio.muted;
    $("btn-mute").textContent = audio.muted ? "🔇" : "🔊";
    $("btn-mute").setAttribute("aria-label",
      audio.muted ? STRINGS.ariaUnmute : STRINGS.ariaMute);
  });

  $("btn-subs").addEventListener("click", () => {
    subsOn = !subsOn;
    $("btn-subs").style.opacity = subsOn ? 1 : 0.45;
    if (!subsOn) $("subtitle-bar").hidden = true;
  });

  showSection("landing");
});

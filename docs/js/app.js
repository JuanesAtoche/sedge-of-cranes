/**
 * app.js — state machine + story engine.
 *
 * Screens: landing → AR (scanning ⇄ experience) | denied | unsupported
 * Story:   idle → (mat found: show ▶ button) → playing → ended → replay
 *
 * Spec behaviors implemented here:
 *  - audio starts only from a user tap (mobile autoplay rules)
 *  - tracking lost  → audio pauses (flock freezes in flock.js)
 *  - tracking found → audio resumes where it stopped
 *  - subtitles from narration.vtt, on by default, toggleable
 *  - 3 animation beats fired when specific subtitle CUES begin, so
 *    re-recording the audio (with a re-timed VTT) keeps beats in sync
 */

// Beats: VTT cue number (1-based) → effect name in flock.js
const BEAT_CUES = { 4: "wobble", 7: "loop", 10: "circle" };

// ---- screens ---------------------------------------------------------------

const SECTIONS = ["landing", "denied", "unsupported"];

function showSection(name) {
  SECTIONS.forEach((s) => {
    document.getElementById("state-" + s).hidden = s !== name;
  });
  document.getElementById("ar-container").hidden = name !== null;
  document.body.classList.toggle("in-ar", name === null);
}

function applyStrings() {
  document.querySelectorAll("[data-str]").forEach((el) => {
    el.textContent = STRINGS[el.dataset.str] || "⚠ missing string";
  });
  document.title = STRINGS.appTitle;
}

const $ = (id) => document.getElementById(id);

// ---- story engine ----------------------------------------------------------

let audio = null;
let cues = [];               // [{start, end, text}]
let storyState = "idle";     // idle | playing | ended
let firedBeats = new Set();
let subsOn = true;           // spec: subtitles on by default
let tracked = false;

function parseVTT(txt) {
  const re = /(\d{2}):(\d{2}):(\d{2}\.\d{3}) --> (\d{2}):(\d{2}):(\d{2}\.\d{3})\s*\n(.+)/g;
  const out = [];
  let m;
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
  try {
    const txt = await (await fetch("assets/narration.vtt")).text();
    cues = parseVTT(txt);
  } catch (e) {
    console.warn("Subtitles unavailable:", e);
  }
}

function flock() {
  const el = document.querySelector("[flock]");
  return el && el.components.flock;
}

function onTimeUpdate() {
  const t = audio.currentTime;

  // subtitle: the cue whose window contains t (windows don't overlap)
  const cue = cues.find((c) => t >= c.start && t < c.end);
  const bar = $("subtitle-bar");
  bar.textContent = cue ? cue.text : "";
  bar.hidden = !(subsOn && tracked && storyState === "playing" && cue);

  // beats: fire once when their cue begins
  for (const [num, name] of Object.entries(BEAT_CUES)) {
    const c = cues[num - 1];
    if (c && t >= c.start && !firedBeats.has(num)) {
      firedBeats.add(num);
      const fl = flock();
      if (fl) fl.beat(name);
    }
  }
}

function startStory() {
  $("btn-story").hidden = true;
  storyState = "playing";
  if (audio.ended || audio.currentTime > 0) {   // replay
    audio.currentTime = 0;
    firedBeats.clear();
  }
  audio.play();
}

function onStoryEnded() {
  storyState = "ended";
  $("subtitle-bar").hidden = true;
  const b = $("btn-story");
  b.textContent = STRINGS.playAgain;
  b.hidden = false;                              // flock keeps idle orbiting
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

// ---- AR lifecycle ----------------------------------------------------------

let arSystem = null;

function sceneReady(scene) {
  return new Promise((resolve) => {
    if (scene.hasLoaded) resolve();
    else scene.addEventListener("loaded", resolve, { once: true });
  });
}

async function startAR() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showSection("unsupported");
    return;
  }
  loadStory();                       // start buffering audio + subtitles now
  const scene = $("ar-scene");
  showSection(null);
  $("overlay-scanning").hidden = false;

  await sceneReady(scene);
  arSystem = scene.systems["mindar-image-system"];
  try {
    await arSystem.start();          // camera permission prompt on first run
  } catch (err) {
    console.warn("AR start failed:", err);
    stopAR();
    showSection("denied");
  }
}

function stopAR() {
  resetStory();
  try { if (arSystem) arSystem.stop(); } catch (_) {}
  document.querySelectorAll("#ar-container video").forEach((v) => {
    if (v.srcObject) v.srcObject.getTracks().forEach((t) => t.stop());
  });
  showSection("landing");
}

// ---- events ----------------------------------------------------------------

window.addEventListener("DOMContentLoaded", () => {
  applyStrings();

  // control icons + accessible names (icons aren't translatable text)
  $("btn-mute").textContent = "🔊";
  $("btn-mute").setAttribute("aria-label", STRINGS.ariaMute);
  $("btn-subs").textContent = "💬";
  $("btn-subs").setAttribute("aria-label", STRINGS.ariaSubs);

  $("btn-start").addEventListener("click", startAR);
  $("btn-retry").addEventListener("click", startAR);
  $("btn-exit").addEventListener("click", stopAR);
  $("btn-story").addEventListener("click", startStory);

  $("btn-mute").addEventListener("click", () => {
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

  const scene = $("ar-scene");

  // ?debug → FPS meter (acceptance: ≥ 24 fps)
  if (new URLSearchParams(location.search).has("debug")) {
    scene.setAttribute("stats", "");
  }

  scene.addEventListener("arError", () => {
    stopAR();
    showSection("denied");
  });

  const anchor = $("mat-anchor");
  anchor.addEventListener("targetFound", () => {
    tracked = true;
    $("overlay-scanning").hidden = true;
    if (storyState === "idle" || storyState === "ended") {
      const b = $("btn-story");
      b.textContent = storyState === "idle" ? STRINGS.startStory : STRINGS.playAgain;
      b.hidden = false;
    } else if (storyState === "playing") {
      audio.play();                  // resume where it paused (spec 5.1)
    }
  });
  anchor.addEventListener("targetLost", () => {
    tracked = false;
    $("overlay-scanning").hidden = false;   // "point back at the mat" hint
    $("subtitle-bar").hidden = true;
    $("btn-story").hidden = true;
    if (storyState === "playing" && audio) audio.pause();  // ≤ 300 ms (spec)
  });

  showSection("landing");
});

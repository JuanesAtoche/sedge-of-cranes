/**
 * app.js — the app's state machine.
 *
 * Phase 1 scope:
 *   landing → (Start) → scanning → mat found → red cube anchored to mat
 *   plus: denied and unsupported states, exit back to landing.
 *
 * The AR view is #ar-container (camera + 3D scene + overlays). The three
 * simple screens are <section> elements. MindAR drives targetFound /
 * targetLost events; we only toggle overlays and (later) audio.
 */

// ---- screens -------------------------------------------------------------

const SECTIONS = ["landing", "denied", "unsupported"];

function showSection(name) {
  SECTIONS.forEach((s) => {
    document.getElementById("state-" + s).hidden = s !== name;
  });
  document.getElementById("ar-container").hidden = name !== null;
  document.body.classList.toggle("in-ar", name === null);
}

// ---- strings (never hard-coded in markup) ---------------------------------

function applyStrings() {
  document.querySelectorAll("[data-str]").forEach((el) => {
    el.textContent = STRINGS[el.dataset.str] || "⚠ missing string";
  });
  document.title = STRINGS.appTitle;
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
  const scene = document.getElementById("ar-scene");
  showSection(null); // hide sections, show #ar-container
  document.getElementById("overlay-scanning").hidden = false;
  document.getElementById("overlay-found").hidden = true;

  await sceneReady(scene);
  arSystem = scene.systems["mindar-image-system"];
  try {
    await arSystem.start(); // asks for camera permission on first run
  } catch (err) {
    console.warn("AR start failed:", err);
    stopAR();
    showSection("denied");
  }
}

function stopAR() {
  try { if (arSystem) arSystem.stop(); } catch (_) {}
  // Belt & braces: make sure the camera is truly released (privacy).
  document.querySelectorAll("#ar-container video").forEach((v) => {
    if (v.srcObject) v.srcObject.getTracks().forEach((t) => t.stop());
  });
  showSection("landing");
}

// ---- events ----------------------------------------------------------------

window.addEventListener("DOMContentLoaded", () => {
  applyStrings();

  document.getElementById("btn-start").addEventListener("click", startAR);
  document.getElementById("btn-retry").addEventListener("click", startAR);
  document.getElementById("btn-exit").addEventListener("click", stopAR);

  const scene = document.getElementById("ar-scene");

  // Camera permission refused or camera unavailable → denied screen.
  scene.addEventListener("arError", () => {
    stopAR();
    showSection("denied");
  });

  // Mat tracking events (fired by MindAR on the anchor entity).
  const anchor = document.getElementById("mat-anchor");
  anchor.addEventListener("targetFound", () => {
    document.getElementById("overlay-scanning").hidden = true;
    document.getElementById("overlay-found").hidden = false;
  });
  anchor.addEventListener("targetLost", () => {
    document.getElementById("overlay-scanning").hidden = false;
    document.getElementById("overlay-found").hidden = true;
  });

  showSection("landing");
});

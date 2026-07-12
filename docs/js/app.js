/**
 * app.js — the app's state machine.
 *
 * Phase 0 scope: landing → camera-test → (ok | denied | unsupported).
 * In Phase 1 the "camera-test" state is replaced by the real AR
 * scanning state, but the landing / denied / unsupported states stay.
 *
 * States are just <section> elements in index.html; showState() hides
 * all of them and shows one. No frameworks — this is a static site.
 */

// ---- tiny state machine -------------------------------------------------

const states = ["landing", "camera-test", "denied", "unsupported"];

function showState(name) {
  states.forEach((s) => {
    document.getElementById("state-" + s).hidden = s !== name;
  });
}

// ---- fill in all text from strings.js (never hard-coded in HTML) --------

function applyStrings() {
  // Every element with a data-str attribute gets its text from STRINGS.
  document.querySelectorAll("[data-str]").forEach((el) => {
    el.textContent = STRINGS[el.dataset.str] || "⚠ missing string";
  });
  document.title = STRINGS.appTitle;
}

// ---- Phase 0: camera permission test ------------------------------------

let cameraStream = null;

async function startCameraTest() {
  // Unsupported browser? (very old phones, or non-HTTPS pages)
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showState("unsupported");
    return;
  }
  try {
    // "environment" = rear camera, the one we'll use for AR.
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    const video = document.getElementById("camera-preview");
    video.srcObject = cameraStream;
    showState("camera-test");
  } catch (err) {
    // NotAllowedError = user (or browser policy) denied permission.
    console.warn("Camera error:", err.name);
    showState("denied");
  }
}

function stopCameraTest() {
  // Always release the camera when leaving the state (privacy + battery).
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  showState("landing");
}

// ---- wire up buttons -----------------------------------------------------

window.addEventListener("DOMContentLoaded", () => {
  applyStrings();
  document.getElementById("btn-start").addEventListener("click", startCameraTest);
  document.getElementById("btn-stop").addEventListener("click", stopCameraTest);
  document.getElementById("btn-retry").addEventListener("click", startCameraTest);
  showState("landing");
});

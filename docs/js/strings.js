/**
 * strings.js — ALL user-facing text lives in this one object.
 * Rule from the spec: never hard-code strings in HTML/JS markup.
 * To translate to Spanish later, copy this object, translate the
 * values, and swap it in. Nothing else needs to change.
 */
const STRINGS = {
  appTitle: "Sedge of Cranes",
  tagline: "Place your paper crane on the story mat and watch a whole flock come to life.",

  // Landing screen
  startButton: "Start",
  cameraExplainer:
    "We use your camera only to find the story mat. Nothing is recorded and nothing leaves your phone.",
  matLinkLabel: "Print the story mat (PDF)",

  // Phase 0 camera test (temporary — becomes the scanning state in Phase 1)
  cameraTestTitle: "Camera check",
  cameraTestOk: "Your camera works! Phase 0 complete. ✅",
  cameraTestStop: "Done",

  // Permission denied state
  deniedTitle: "We can't see the mat yet",
  deniedBody:
    "Your browser blocked the camera. To try again: open your browser settings, allow camera access for this site, then reload the page.",
  retryButton: "Try again",

  // Unsupported device state
  unsupportedTitle: "This phone can't run the magic",
  unsupportedBody:
    "Your browser doesn't support camera access. Try a newer phone with Safari (iPhone) or Chrome (Android).",
};

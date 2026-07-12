/**
 * strings.js — ALL user-facing text lives in this one object.
 * To translate to Spanish later, translate the values here. Nothing
 * else in the codebase contains visible text.
 */
const STRINGS = {
  appTitle: "Sedge of Cranes",
  tagline: "Place your paper crane on the story mat and watch a whole flock come to life.",

  // Landing
  startButton: "Start",
  cameraExplainer:
    "We use your camera only to find the story mat. Nothing is recorded and nothing leaves your phone.",
  matLinkLabel: "Print the story mat (PDF)",

  // Scanning / tracking
  scanningHint: "Point your camera at the story mat",
  trackingOk: "Here comes the flock! 🕊️",
  exitButton: "✕",

  // Permission denied
  deniedTitle: "We can't see the mat yet",
  deniedBody:
    "Your browser blocked the camera. To try again: allow camera access for this site in your browser settings, then reload the page.",
  retryButton: "Try again",

  // Unsupported
  unsupportedTitle: "This phone can't run the magic",
  unsupportedBody:
    "Your browser doesn't support camera access. Try a newer phone with Safari (iPhone) or Chrome (Android).",
};

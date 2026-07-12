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
  loadingAR: "Getting the magic ready…",
  scanningHint: "Point your camera at the story mat",
  scanningBack: "Point back at the mat to continue",
  exitButton: "✕",

  // Story
  startStory: "▶  Start the story",
  playAgain: "▶  Play again",
  ariaMute: "Mute the story",
  ariaUnmute: "Unmute the story",
  ariaSubs: "Subtitles on or off",

  // Permission denied (per-browser flavors, spec 5.3 state 2)
  deniedTitle: "We can't see the mat yet",
  deniedBody:
    "Your browser blocked the camera. Allow camera access for this site in your browser settings, then reload the page.",
  deniedBodyIos:
    "The camera is blocked. On your iPhone: tap the ᴀA (or 🔒) icon in Safari's address bar → Website Settings → Camera → Allow. Then tap Try again.",
  deniedBodyAndroid:
    "The camera is blocked. In Chrome: tap the 🔒 icon in the address bar → Permissions → Camera → Allow. Then tap Try again.",
  retryButton: "Try again",

  // Unsupported device / load failure (both show the GIF fallback)
  unsupportedTitle: "This phone can't run the magic",
  unsupportedBody:
    "Your browser doesn't support camera access. Try a newer phone with Safari (iPhone) or Chrome (Android).",
  errorTitle: "Something didn't load",
  errorBody:
    "The experience couldn't load. Check your internet connection and try again in a moment.",
  fallbackCaption: "Here's what the experience looks like:",

  // Warnings & errors
  inAppWarning:
    "It looks like this page is inside another app. If the camera won't start, open this link in Safari or Chrome instead.",
  audioFailed: "The story audio couldn't load — but the flock still flies!",
};

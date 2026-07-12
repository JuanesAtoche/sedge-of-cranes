# Sedge of Cranes 🕊️

A browser-based augmented reality experience for children. Place a real paper
origami crane on a printed story mat, point a phone at it, and seven animated
cranes fly around it while a warm voice tells a growth-mindset story.

**No app to install. No data collected. 100% free and open source.**

- AR tracking: [MindAR](https://github.com/hiukim/mind-ar-js) 1.2.5 (MIT)
- 3D rendering: [A-Frame](https://aframe.io) 1.5.0 (MIT)
- Hosting: GitHub Pages (free, HTTPS)

> **Build status: Phase 3 — Story & audio.** The flock now tells its
> story: narration with subtitles, pause/resume tied to tracking, and three
> animation beats synced to the tale. ⚠️ The shipped voice is a ROBOTIC
> PLACEHOLDER — replace it with a warm human recording (see below) before
> showing this to children.

---

## Deploying (browser only — nothing to install)

You only need a free GitHub account and this folder.

### 1. Create the repository

1. Go to **github.com** → click **+** (top right) → **New repository**.
2. Name it `sedge-of-cranes` (any name works). Set it to **Public**.
3. Click **Create repository**.

### 2. Upload the files

1. On the new repo page, click **uploading an existing file**.
2. Drag the **entire contents of this folder** (the `docs` folder, `README.md`,
   `LICENSE`) into the upload area. GitHub keeps the folder structure.
3. Click **Commit changes**.

### 3. Turn on GitHub Pages

1. In the repo, go to **Settings → Pages** (left sidebar).
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Branch: **main**, folder: **/docs**. Click **Save**.
4. Wait 1–2 minutes. Refresh the page; a box appears with your live URL:
   `https://YOUR-USERNAME.github.io/sedge-of-cranes/`

### 4. Phase 0 test — on your phone

Open the URL on a real phone (iOS Safari **and** Android Chrome if you have both):

| Step | What you should see |
|---|---|
| Open the URL | Landing screen: red crane, title, **Start** button |
| Tap **Start** | The browser asks for camera permission |
| Tap **Allow** | Live rear-camera video + "Your camera works! Phase 0 complete. ✅" |
| Tap **Done** | Back to the landing screen (camera light turns off) |
| Deny permission instead | Friendly "We can't see the mat yet" screen with retry instructions |

**Phase 0 passes when all five rows work on at least one iPhone and one Android.**

### Troubleshooting

- **No permission prompt / camera error on iPhone:** make sure you opened the
  `https://` URL (Pages does this automatically) and you're in Safari, not an
  in-app browser (Instagram/WhatsApp browsers often block the camera).
- **Page not found:** Pages can take a couple of minutes on first deploy.
  Check Settings → Pages shows a green "Your site is live" banner.
- **Permission permanently blocked:** iPhone: Settings → Apps -> Safari → Camera →
  Allow. Android Chrome: tap the 🔒 icon in the address bar → Permissions →
  Camera → Allow, then reload.

---

## Editing without installing anything

Open the repo on github.com and press the **`.`** (period) key — a full
VS Code editor opens in the browser (github.dev). Commit from there. For a
live-preview workflow, use **Codespaces**: green **Code** button →
**Codespaces** → **Create codespace**, then run `python3 -m http.server 8080 -d docs`
in its terminal and open the forwarded HTTPS URL on your phone.

---

## Phase 1: compile the image target (one-time, browser only)

The mat artwork lives at `docs/assets/mat.png`. MindAR needs it compiled
into a `targets.mind` file. You do this once in the browser:

1. Open the **MindAR image target compiler**:
   `https://hiukim.github.io/mind-ar-js-doc/tools/compile/`
2. Drag **`mat.png`** (download it from your repo first) into the drop zone.
   ⚠️ Use the PNG, **not** the PDF.
3. Click **Start**. Compilation takes ~30–60 s. You'll see the detected
   feature points drawn over the mat — they should cover the whole artwork
   except the center circle.
4. Click **Download compiled** → you get a file named `targets.mind`.
5. In your GitHub repo, open the `docs/assets` folder → **Add file →
   Upload files** → drop `targets.mind` → **Commit changes**.
6. Wait ~1 minute for Pages to redeploy.

### Print the mat

Download `docs/assets/mat.pdf` and print it (color or grayscale both work —
the artwork was verified for grayscale contrast). **Actual size / 100%
scale**, not "fit to page", if your printer asks. No printer today? For
testing only, you can open `mat.png` full-screen on a laptop monitor and
point the phone at the screen.

### Phase 1 test — on your phone

| Step | What you should see |
|---|---|
| Open the URL, tap **Start** | Camera view + pulsing hint card "Point your camera at the story mat" |
| Point at the mat (30–40 cm away) | Within ~1 s: a red cube standing on the center circle + "Found it!" badge |
| Move the phone slowly around | Cube stays glued to the mat — no drifting or heavy jitter |
| Move: 20 cm close, 60 cm far, tilt up to ~45° | Tracking holds at all of these |
| Cover the mat / point away | Hint card returns within a moment |
| Point back at the mat | Cube reappears in ≤ 2 s |
| Tap **✕** | Back to the landing screen, camera light off |

**Phase 1 passes when every row works in normal indoor lighting.** If
tracking is weak, check: print quality (sharp, not faded), lighting (no
strong glare on the paper), and that you compiled from `mat.png`.

### Regenerating the mat

The mat is generated by `tools/generate_mat.py`. To put your real URL on
it: edit the `URL_TEXT` line, then in a Codespace run
`pip install pillow img2pdf opencv-python-headless && python3 tools/generate_mat.py`,
copy the outputs into `docs/assets/`, and **recompile the target** (step
above) — any pixel change invalidates the old `targets.mind`.


---

## Phase 2 notes

**No downloaded 3D model.** The crane is built procedurally from ~30
triangles in `docs/js/flock.js` (`paper-crane` component). Zero download
weight, no third-party license, and the wings are separate meshes so they
flap for real. Colors, sizes, orbit speed, flap rate, and bob height are
all plain numbers at the top of `flock.js` — tune freely.

**Jitter tuning.** The scene uses MindAR's smoothing filter
(`filterMinCF: 0.0001; filterBeta: 0.001` on the `<a-scene>` tag) to calm
the Phase 1 cube jitter. Trade-off: more smoothing = steadier hover but
slightly "floatier" response when you move the phone fast. If the flock
lags too much, raise `filterBeta` (try `0.01`, then `0.1`).

### Phase 2 test — on your phone

| Step | What you should see |
|---|---|
| Point at the mat | 7 cranes **fade in over ~1.5 s** above the circle |
| Watch for ~20 s | The V formation completes one slow lap around your paper crane |
| Look closely | Lead crane: bigger, red, at the apex; each crane flaps at its own rhythm; gentle up-down bobbing |
| Look away / cover the mat | Flock **freezes instantly**; hint card returns |
| Point back | Flock resumes mid-motion |
| Open the URL with `?debug` at the end | FPS meter appears — should stay **≥ 24 fps** |

If FPS is low on an older phone, tell the developer/AI — the throttle plan
is: disable antialiasing first, then reduce crane count.


---

## Phase 3: the story

### Narration script (60–90 s, growth mindset)

1. High above a quiet pond, seven paper cranes fly together.
2. Do you see the little red one, right at the front?
3. Her name is Mika. But she wasn't always the leader.
4. Mika's very first fold was crooked. Her wings pointed the wrong way, and she wobbled when she flew. *(→ the lead crane wobbles)*
5. "I can't do it," Mika sighed.
6. "Not yet," said Grandmother Crane. "Every fold teaches your wings something new."
7. So Mika practiced. One fold. Then another. Each one a little braver than the last. *(→ the lead crane loops upward)*
8. Her wobbles turned into swoops. Her swoops turned into loops!
9. And the other cranes said: "Mika, you fly so well — will you show us the way?"
10. Now the whole flock flies together, higher than any crane could fly alone. *(→ the flock forms a circle)*
11. Your crane is part of the flock now.
12. What will you fold next?

### Replacing the placeholder voice (please do!)

The shipped `narration.mp3` uses espeak-ng, an open-source synthesizer —
it proves the pipeline but sounds robotic. To replace it:

1. Record the 12 lines above (a parent's voice is perfect; any phone
   recorder works). Save each line as `line01.wav` … `line12.wav`.
   You may also generate them once with any TTS tool — that's allowed
   because it happens offline; the app itself never calls a TTS service.
2. In a Codespace: put the files in a folder and run
   `python3 tools/build_narration.py that-folder/` from `docs/assets/`.
   It concatenates them, writes `narration.mp3`, and regenerates
   `narration.vtt` with exact timings measured from YOUR recording.
3. Commit both files. **Beats stay in sync automatically** — they're tied
   to subtitle cue numbers (4, 7, 10), not to seconds.

### Phase 3 test — on your phone

| Step | What you should see / hear |
|---|---|
| Point at the mat | Flock fades in, then a big **▶ Start the story** button |
| Tap it | Narration plays; subtitles appear at the bottom |
| At "…she wobbled when she flew" (~15 s) | The red crane wobbles crookedly |
| At "So Mika practiced…" (~32 s) | The red crane does a full upward loop |
| At "Now the whole flock flies together…" (~52 s) | The V melts into a circle for ~3 s, then re-forms |
| Cover the mat mid-story | Audio stops immediately; hint card returns |
| Point back | Audio resumes exactly where it paused |
| Story ends | **▶ Play again** button; flock keeps orbiting |
| 🔇 / 💬 buttons (top-left) | Mute and subtitle toggles work |


## Roadmap

- [x] **Phase 0 — Skeleton:** Pages live, camera permission verified
- [x] **Phase 1 — Tracking proof:** story mat + a cube anchored to it
- [x] **Phase 2 — The flock:** 7 cranes, V formation, orbit, wing flaps
- [x] **Phase 3 — Story & audio:** narration, subtitles, 3 synced beats
- [ ] **Phase 4 — UX polish:** all five UI states, fallbacks
- [ ] **Phase 5 — Field test:** real mat, real crane, 2+ phones

## License

MIT — see [LICENSE](LICENSE).

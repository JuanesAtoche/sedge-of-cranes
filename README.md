# Sedge of Cranes 🕊️

A browser-based augmented reality experience for children. Place a real paper
origami crane on a printed story mat, point a phone at it, and seven animated
cranes fly around it while a warm voice tells a growth-mindset story.

**No app to install. No data collected. 100% free and open source.**

- AR tracking: [MindAR](https://github.com/hiukim/mind-ar-js) 1.2.5 (MIT)
- 3D rendering: [A-Frame](https://aframe.io) 1.5.0 (MIT)
- Hosting: GitHub Pages (free, HTTPS)

> **Build status: Phase 1 — Tracking proof.** The app now recognizes the
> story mat and anchors a red test cube to it. The crane flock arrives in
> Phase 2.

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


## Roadmap

- [x] **Phase 0 — Skeleton:** Pages live, camera permission verified
- [x] **Phase 1 — Tracking proof:** story mat + a cube anchored to it
- [ ] **Phase 2 — The flock:** 7 cranes, V formation, orbit, wing flaps
- [ ] **Phase 3 — Story & audio:** narration, subtitles, 3 synced beats
- [ ] **Phase 4 — UX polish:** all five UI states, fallbacks
- [ ] **Phase 5 — Field test:** real mat, real crane, 2+ phones

## License

MIT — see [LICENSE](LICENSE).

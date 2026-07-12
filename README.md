# Sedge of Cranes 🕊️

A browser-based augmented reality experience for children. Place a real paper
origami crane on a printed story mat, point a phone at it, and seven animated
cranes fly around it while a warm voice tells a growth-mindset story.

**No app to install. No data collected. 100% free and open source.**

- AR tracking: [MindAR](https://github.com/hiukim/mind-ar-js) 1.2.5 (MIT)
- 3D rendering: [A-Frame](https://aframe.io) 1.5.0 (MIT)
- Hosting: GitHub Pages (free, HTTPS)

> **Build status: Phase 0 — Skeleton.** The live page currently shows the
> landing screen and a camera-permission test. AR arrives in Phase 1.

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

## Roadmap

- [x] **Phase 0 — Skeleton:** Pages live, camera permission verified
- [ ] **Phase 1 — Tracking proof:** story mat + a cube anchored to it
- [ ] **Phase 2 — The flock:** 7 cranes, V formation, orbit, wing flaps
- [ ] **Phase 3 — Story & audio:** narration, subtitles, 3 synced beats
- [ ] **Phase 4 — UX polish:** all five UI states, fallbacks
- [ ] **Phase 5 — Field test:** real mat, real crane, 2+ phones

## License

MIT — see [LICENSE](LICENSE).

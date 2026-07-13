#!/usr/bin/env python3
"""
generate_papers.py — Sedge of Cranes, Phase 6
=============================================
Generates the washi-style paper textures worn by the 7 virtual cranes.

Why procedural?  (a) zero license risk — we own every pixel;
(b) tiny files — each PNG is a 256px tile with a small palette (~3-8 KB);
(c) fully reproducible — anyone can re-run this in Codespaces.

Patterns implemented (all classic Japanese textile/washi motifs):
  * seigaiha — overlapping "blue sea wave" arcs
  * asanoha  — "hemp leaf" star lattice
  * dots     — offset polka grid (mame shibori style)
  * stripes  — fine diagonal pinstripes

How it works: we draw each pattern at 2x size (512px) with PIL, then
downscale to 256px. Drawing big and shrinking is a classic poor-man's
anti-aliasing trick — PIL's line/arc drawing has no smoothing, but the
downscale averages the jaggies away.

Finally we add faint per-pixel noise ("paper grain") and quantize to a
small palette so the PNG compresses to a few KB.

Run it (in Codespaces, from the repo root):
    python3 tools/generate_papers.py
Outputs land in docs/assets/papers/ plus a contact_sheet.png for review.
"""

import math
import os
import random

from PIL import Image, ImageDraw

SIZE = 512          # working resolution (2x)
OUT = 256           # final texture resolution
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "docs", "assets", "papers")

# ---------------------------------------------------------------------------
# Color schemes: (filename, pattern, background, ink)
# The lead crane is red — Mika, the story's protagonist. Followers are
# distinct pastels so kids can tell "their" crane apart.
# ---------------------------------------------------------------------------
SCHEMES = [
    ("paper_lead_red_seigaiha.png",   "seigaiha", "#b33a2e", "#e8cfa8"),
    ("paper_blue_asanoha.png",        "asanoha",  "#cfe3ee", "#38607f"),
    ("paper_pink_dots.png",           "dots",     "#f6dfe2", "#a94b64"),
    ("paper_green_stripes.png",       "stripes",  "#dcead9", "#4f7a4e"),
    ("paper_lavender_seigaiha.png",   "seigaiha", "#e2ddee", "#5d5290"),
    ("paper_peach_asanoha.png",       "asanoha",  "#f7e3d3", "#a5602f"),
    ("paper_yellow_dots.png",         "dots",     "#f6ecc9", "#96762a"),
]


def draw_seigaiha(d: ImageDraw.ImageDraw, ink: str):
    """Overlapping fans of concentric arcs. Drawn bottom-up, row by row,
    so each new 'wave' partially covers the one behind it."""
    r = SIZE // 4                     # fan radius (v0.5.2: 2x bigger, kids' feedback)
    step_x, step_y = r * 2, r         # rows overlap by half → scale pattern
    rings = 4
    for row in range(-1, SIZE // step_y + 2):
        y = row * step_y
        offset = r if row % 2 else 0  # brick-lay every other row
        for col in range(-1, SIZE // step_x + 2):
            x = col * step_x + offset
            # opaque disc erases the arcs behind, leaving the "scale" look
            d.ellipse([x - r, y - r, x + r, y + r], fill=None)
            for k in range(rings):
                rr = r - k * (r // rings)
                width = 12 if k == 0 else 8
                d.arc([x - rr, y - rr, x + rr, y + rr], 180, 360, fill=ink, width=width)


def draw_asanoha(d: ImageDraw.ImageDraw, ink: str):
    """Hemp-leaf lattice: an equilateral-triangle grid where every triangle
    gets three spokes from its corners to its centroid — that's the whole
    trick behind this famous pattern."""
    s = SIZE // 3                     # triangle edge length (v0.5.2: 2x bigger)
    h = s * math.sqrt(3) / 2          # triangle height
    w = 10
    rows = int(SIZE / h) + 2
    cols = int(SIZE / s) + 2
    for row in range(-1, rows):
        y0, y1 = row * h, (row + 1) * h
        for col in range(-1, cols):
            x = col * s + (s / 2 if row % 2 else 0)
            up = [(x, y1), (x + s, y1), (x + s / 2, y0)]        # apex-up
            dn = [(x + s / 2, y0), (x + 3 * s / 2, y0), (x + s, y1)]  # apex-down
            for tri in (up, dn):
                cx = sum(p[0] for p in tri) / 3
                cy = sum(p[1] for p in tri) / 3
                for a, b in ((0, 1), (1, 2), (2, 0)):
                    d.line([tri[a], tri[b]], fill=ink, width=w)   # edges
                for p in tri:
                    d.line([p, (cx, cy)], fill=ink, width=w)      # spokes


def draw_dots(d: ImageDraw.ImageDraw, ink: str):
    """Offset polka-dot grid, like mame-shibori tenugui cloth."""
    step = SIZE // 5   # v0.5.2: bigger dots
    r = step // 4
    for row in range(-1, SIZE // step + 2):
        y = row * step
        offset = step // 2 if row % 2 else 0
        for col in range(-1, SIZE // step + 2):
            x = col * step + offset
            d.ellipse([x - r, y - r, x + r, y + r], fill=ink)


def draw_stripes(d: ImageDraw.ImageDraw, ink: str):
    """Fine 45-degree pinstripes."""
    step = SIZE // 8   # v0.5.2: wider stripes
    for i in range(-SIZE // step, 2 * SIZE // step + 1):
        x = i * step
        d.line([(x, 0), (x + SIZE, SIZE)], fill=ink, width=11)


PATTERNS = {
    "seigaiha": draw_seigaiha,
    "asanoha": draw_asanoha,
    "dots": draw_dots,
    "stripes": draw_stripes,
}


def add_grain(img: Image.Image, amount: int = 2) -> Image.Image:
    """Faint per-pixel brightness noise ≈ paper fiber. 'amount' is the max
    +/- change per channel — keep it subtle or it reads as dirt."""
    rnd = random.Random(42)  # fixed seed → reproducible builds
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            n = rnd.randint(-amount, amount)
            r, g, b = px[x, y]
            px[x, y] = (max(0, min(255, r + n)),
                        max(0, min(255, g + n)),
                        max(0, min(255, b + n)))
    return img


def make_texture(name: str, pattern: str, bg: str, ink: str):
    img = Image.new("RGB", (SIZE, SIZE), bg)
    d = ImageDraw.Draw(img)
    PATTERNS[pattern](d, ink)
    img = img.resize((OUT, OUT), Image.LANCZOS)   # downscale = anti-alias
    # Grain is now added in 3D (per-face jitter in flock.js) — baking noise
    # into the PNG defeated compression (278 KB → 40 KB total without it).
    # img = add_grain(img)
    # Quantize to a small palette: pattern + grain survive fine at 48 colors
    # and the PNG shrinks dramatically.
    img = img.quantize(colors=24, method=Image.MEDIANCUT)
    path = os.path.join(OUT_DIR, name)
    img.save(path, optimize=True)
    kb = os.path.getsize(path) / 1024
    print(f"  {name:34s} {pattern:9s} {kb:5.1f} KB")
    return path


def contact_sheet(paths):
    """One image with all papers side by side — handy for review/README."""
    tiles = [Image.open(p).convert("RGB") for p in paths]
    cols = 4
    rows = math.ceil(len(tiles) / cols)
    pad = 12
    sheet = Image.new("RGB", (cols * (OUT + pad) + pad, rows * (OUT + pad) + pad), "#ffffff")
    for i, t in enumerate(tiles):
        x = pad + (i % cols) * (OUT + pad)
        y = pad + (i // cols) * (OUT + pad)
        sheet.paste(t, (x, y))
    out = os.path.join(OUT_DIR, "contact_sheet.png")
    sheet.save(out, optimize=True)
    print(f"  contact_sheet.png written")


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    print("Generating washi papers →", os.path.abspath(OUT_DIR))
    paths = [make_texture(*scheme) for scheme in SCHEMES]
    contact_sheet(paths)
    total = sum(os.path.getsize(p) for p in paths) / 1024
    print(f"Total texture weight: {total:.1f} KB (budget: keep under ~60 KB)")

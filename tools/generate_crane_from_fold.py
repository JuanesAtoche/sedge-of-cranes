#!/usr/bin/env python3
# =============================================================================
# generate_crane_from_fold.py  ·  Sedge of Cranes · Phase 6 "authentic tsuru"
# =============================================================================
# Turns a computational-origami .fold file (Amanda Ghassaei's Origami Simulator
# export of a real, physically-relaxed folded crane) into a compact JavaScript
# geometry module the flock renders directly.
#
# WHY A TOOL AND NOT RUNTIME PARSING: the .fold is 27 KB of JSON describing an
# UNORIENTED, off-centre, arbitrarily-scaled mesh. Reorienting, centring,
# scaling and computing per-vertex flap weights is fiddly geometry we want to
# do ONCE, offline, verify with our own eyes (the contact sheet this script
# renders), and then ship as a few KB of plain numbers. The phone just reads
# the numbers. Same philosophy as generate_papers.py / generate_mat.py.
#
# RUN IT (browser-only, no local install):
#   Google Colab / Kaggle → new notebook →
#     !pip -q install numpy matplotlib
#     upload this file + tools/traditionalCrane_88.fold, then
#     !python generate_crane_from_fold.py
#   Download the two outputs it prints and commit them.
#
# OUTPUTS:
#   docs/js/crane_fold_geometry.js   the baked geometry (positions, uv, flap
#                                    weights, hinge constants) as one JS object
#   tools/out/crane_fold_check.png   a validation contact sheet: segmentation
#                                    colours + a flap sequence. LOOK AT THIS
#                                    before deploying — if a wing tears or the
#                                    bird faces backwards, the numbers below are
#                                    what you tune.
# =============================================================================
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
FOLD = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "traditionalCrane_88.fold")
OUT_JS = os.path.join(HERE, "..", "docs", "js", "crane_fold_geometry.js")
OUT_PNG = os.path.join(HERE, "out", "crane_fold_check.png")

# ---- TUNABLES ---------------------------------------------------------------
# These four numbers are the whole calibration. If the validation image looks
# wrong, this is where you fix it (and re-run — nothing else changes).
SYM_PLANE_X   = 0.08   # the model's mirror plane sits a little off its centroid
WINGSPAN_UNITS = 1.10  # rescale so tip-to-tip span == this (matches flock.js:
                       #   scale = wingspan_meters / 1.1). DON'T change lightly.
HINGE_X       = 0.13   # |x| where each wing starts to rotate (the wing root)
HINGE_SPAN    = 0.45   # over how many units the flap weight ramps 0→1 outboard
HINGE_Y       = 0.02   # height of the hinge axis (world units)
UV_SCALE      = 1.40   # top-down texture projection (matches flock.js uvTopDown)
HEAD_VERTS    = [47, 49, 50, 51, 52]  # the reverse-folded head cluster (defines
                                      # "forward"); found by inspecting the mesh.

def load():
    d = json.load(open(FOLD))
    V = np.array(d["vertices_coords"], float)
    F = d["faces_vertices"]
    return V, F, d

def reorient(V):
    """Centre on the symmetry plane, point the head toward +Z, Y stays up,
    wings spread along ±X, then scale to a known wingspan."""
    V = V.copy()
    V[:, 0] -= SYM_PLANE_X                       # sym plane -> x = 0
    V[:, 1] -= V[:, 1].mean()
    V[:, 2] -= V[:, 2].mean()
    head = V[HEAD_VERTS].mean(0)                 # where the head points
    fwd = np.array([head[0], 0.0, head[2]]); fwd /= np.linalg.norm(fwd)
    a = np.arctan2(fwd[0], fwd[2])               # rotate that onto +Z
    c, s = np.cos(-a), np.sin(-a)
    V = V @ np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]).T
    span = V[:, 0].max() - V[:, 0].min()
    V *= WINGSPAN_UNITS / span
    V[:, 1] -= V[:, 1].min() + (V[:, 1].max() - V[:, 1].min()) * 0.5  # recentre Y
    return V

def flap_weight(V):
    """Per-vertex 0→1: how much this vertex follows the wing flap. Zero on the
    body/neck/tail, ramping to 1 at the wingtips via a smoothstep. Vertices ON
    the hinge stay at 0, so rotating the wing never opens a gap at the root."""
    dxo = np.abs(V[:, 0]) - HINGE_X
    w = np.clip(dxo / HINGE_SPAN, 0, 1)
    return w * w * (3 - 2 * w)                   # smoothstep

def bake(V, F):
    """Non-indexed triangles (each face owns its 3 verts) so flat shading gives
    every facet its own hard normal — the same trick flock.js already uses."""
    w = flap_weight(V)
    pos, uv, wt, sgn = [], [], [], []
    for f in F:
        for vi in f:
            p = V[vi]
            pos += [p[0], p[1], p[2]]
            uv += [p[0] * UV_SCALE + 0.5, p[2] * UV_SCALE + 0.5]
            wt.append(w[vi])
            sgn.append(1.0 if p[0] >= 0 else -1.0)
    return pos, uv, wt, sgn

def write_js(pos, uv, wt, sgn):
    def arr(a, prec=4):
        return "[" + ",".join(f"{x:.{prec}f}".rstrip("0").rstrip(".") or "0"
                               for x in a) + "]"
    n = len(wt)
    js = f"""/* crane_fold_geometry.js  — GENERATED by tools/generate_crane_from_fold.py
 * Authentic tsuru baked from Origami Simulator's traditionalCrane (88% folded).
 * Do not hand-edit: re-run the generator. {n} vertices / {n//3} triangles.
 * Frame: +Y up, +Z forward (head), wings along ±X, wingspan ≈ {WINGSPAN_UNITS} units.
 * Consumed by flock.js when the entity has geom:'fold'. */
(function (root) {{
  var CRANE_FOLD = {{
    hingeX: {HINGE_X}, hingeY: {HINGE_Y},   // wing-root pivot (see generator)
    position: new Float32Array({arr(pos)}),
    uv:       new Float32Array({arr(uv)}),
    flapW:    new Float32Array({arr(wt, 3)}), // 0 body … 1 wingtip
    side:     new Float32Array({arr(sgn, 0)})  // +1 right wing, -1 left wing
  }};
  if (typeof module !== 'undefined' && module.exports) module.exports = CRANE_FOLD;
  else root.CRANE_FOLD = CRANE_FOLD;
}})(typeof window !== 'undefined' ? window : this);
"""
    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
    open(OUT_JS, "w").write(js)
    return len(js)

def render_check(V, F):
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    w = flap_weight(V)

    def flap(deg):
        Vo = V.copy(); th = np.radians(deg)
        for i in range(len(Vo)):
            if w[i] <= 0: continue
            sgn = 1.0 if Vo[i, 0] >= 0 else -1.0
            px = sgn * HINGE_X
            x, y = Vo[i, 0] - px, Vo[i, 1] - HINGE_Y
            a = th * w[i] * sgn
            Vo[i, 0] = x * np.cos(a) - y * np.sin(a) + px
            Vo[i, 1] = x * np.sin(a) + y * np.cos(a) + HINGE_Y
        return Vo

    fig = plt.figure(figsize=(16, 4.2))
    # panel 0: segmentation (weight as colour)
    ax = fig.add_subplot(1, 4, 1, projection="3d")
    for f in F:
        wf = w[list(f)].mean()
        ax.add_collection3d(Poly3DCollection(
            [V[f]], facecolor=plt.cm.viridis(wf), edgecolor="#333",
            linewidths=0.2, alpha=0.95))
    ax.set_title("flap weight (0=body → 1=tip)", fontsize=9)
    for ax_ in [ax]:
        r = 0.62; ax_.set_xlim(-r, r); ax_.set_ylim(-r, r); ax_.set_zlim(-r, r)
        ax_.view_init(18, -72); ax_.set_axis_off()
    # panels 1-3: flap sequence
    for k, deg in enumerate([-30, 5, 40]):
        Vf = flap(deg)
        ax = fig.add_subplot(1, 4, k + 2, projection="3d")
        ax.add_collection3d(Poly3DCollection(
            [Vf[f] for f in F], facecolor="#d9d2f2", edgecolor="#5a4fa0",
            linewidths=0.25, alpha=0.92))
        r = 0.62; ax.set_xlim(-r, r); ax.set_ylim(-r, r); ax.set_zlim(-r, r)
        ax.view_init(18, -72); ax.set_axis_off()
        ax.set_title(f"flap {deg:+d}°", fontsize=10)
    plt.tight_layout()
    os.makedirs(os.path.dirname(OUT_PNG), exist_ok=True)
    plt.savefig(OUT_PNG, dpi=95)

def main():
    V, F, d = load()
    print(f"loaded {d.get('frame_title','?')} — {len(V)} verts, {len(F)} tris")
    V = reorient(V)
    pos, uv, wt, sgn = bake(V, F)
    size = write_js(pos, uv, wt, sgn)
    print(f"wrote {OUT_JS}  ({size/1024:.1f} KB, {len(wt)//3} triangles)")
    try:
        render_check(V, F)
        print(f"wrote {OUT_PNG}  (LOOK AT THIS before deploying)")
    except Exception as e:
        print("skipped validation render:", e)

if __name__ == "__main__":
    main()

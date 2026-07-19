#!/usr/bin/env python3
# =============================================================================
# generate_cardinal_from_fold.py
# -----------------------------------------------------------------------------
# Bakes the Robert Lang origami CARDINAL (.fold, an Origami Simulator export)
# into a tiny JS module the browser can render directly, the same way
# generate_crane_from_fold.py does for the crane. Runs in Colab/Kaggle or any
# browser Python — no local install required.
#
# WHAT IT PRODUCES (docs/js/cardinal_fold_geometry.js -> window.CARDINAL_FOLD):
#   position  Float32Array  non-indexed triangles (x,y,z per vertex)
#   uv        Float32Array  top-down planar UVs (paper grain / pattern)
#   color     Float32Array  per-vertex RGB  (red body, dark face mask, orange beak)
#   legW      Float32Array  0..1 how much each vertex follows its leg's swing
#   legSide   Float32Array  +1 left leg, -1 right leg, 0 = body (never swings)
#   hipL/hipR [x,y,z]        pivot each leg swings about (fore-aft walk)
#
# ORIENTATION after baking:  +X = forward (beak) · +Y = up (crest) · feet at y=0
#   The raw Lang model already has Y up and the head at +X; we only recentre in
#   X/Z, drop the feet onto y=0 so the bird stands on the ground, and normalise
#   the size so the component can scale it with one number.
# =============================================================================
import json, numpy as np, os

SRC = os.path.join(os.path.dirname(__file__), 'langCardinal_100.fold')
OUT = os.path.join(os.path.dirname(__file__), '..', 'docs', 'js',
                   'cardinal_fold_geometry.js')

# ---- TUNABLES ---------------------------------------------------------------
BODY_LEN   = 1.00   # baked units for tail->beak length; component scales this
UV_SCALE   = 1.30   # paper-pattern tiles per baked unit
HIP_FRAC   = 0.62   # leg pivot height as a fraction of leg height (0=foot,1=body)
LEG_RADIUS = 0.22   # xz radius (baked units) around a foot that counts as its leg
# Region boxes for cardinal colouring, in GROUNDED+SCALED space (tuned below by
# reading the printout the first run gives you). Format: (xmin,xmax,ymin,ymax).
# -----------------------------------------------------------------------------

RED    = (0.70, 0.13, 0.11)   # cardinal body red
CREST  = (0.60, 0.09, 0.09)   # crest: a touch deeper
MASK   = (0.12, 0.09, 0.10)   # black face mask
BEAK   = (0.85, 0.45, 0.12)   # orange beak

def smoothstep(t):
    t = np.clip(t, 0, 1); return t*t*(3-2*t)

def main():
    d = json.load(open(SRC))
    V = np.array(d['vertices_coords'], float)
    F = [f for f in d['faces_vertices'] if len(f) == 3]

    # --- reorient / ground / scale ------------------------------------------
    # centre X and Z on the mean; drop lowest vertex (a foot) to y=0.
    V[:, 0] -= V[:, 0].mean()
    V[:, 2] -= V[:, 2].mean()
    V[:, 1] -= V[:, 1].min()
    scale = BODY_LEN / (V[:, 0].max() - V[:, 0].min())
    V *= scale
    # after grounding, y.min == 0 (feet on the floor)

    # --- identify the two feet (lowest verts, split by z = left/right) -------
    order = V[:, 1].argsort()
    foot_a = order[0]                      # absolute lowest
    # the other foot = next lowest that is well separated in z
    foot_b = next(i for i in order[1:]
                  if abs(V[i, 2] - V[foot_a, 2]) > 0.10)
    L, R = (foot_a, foot_b) if V[foot_a, 2] > V[foot_b, 2] else (foot_b, foot_a)
    footL, footR = V[L].copy(), V[R].copy()
    print(f"  left foot  v{L} {footL.round(3)}")
    print(f"  right foot v{R} {footR.round(3)}")

    # hip pivot for each leg: above the foot, at HIP_FRAC of the leg height.
    # leg height ~ the tallest low vertex near that foot.
    def hip(foot):
        near = [i for i in range(len(V))
                if np.hypot(V[i,0]-foot[0], V[i,2]-foot[2]) < LEG_RADIUS
                and V[i,1] < 0.5]
        top = max(V[i,1] for i in near) if near else 0.3
        return np.array([foot[0], top*HIP_FRAC, foot[2]])
    hipL, hipR = hip(footL), hip(footR)

    # --- per-vertex leg weight + side ---------------------------------------
    legW  = np.zeros(len(V)); legSide = np.zeros(len(V))
    for i in range(len(V)):
        dL = np.hypot(V[i,0]-footL[0], V[i,2]-footL[2])
        dR = np.hypot(V[i,0]-footR[0], V[i,2]-footR[2])
        near, hipv, side = (dL, hipL, +1) if dL < dR else (dR, hipR, -1)
        if near < LEG_RADIUS and V[i,1] < hipv[1]:
            # 0 at hip height, 1 at the foot
            w = smoothstep((hipv[1] - V[i,1]) / max(hipv[1], 1e-4))
            # taper by xz distance so the swing fades into the body
            w *= smoothstep((LEG_RADIUS - near) / LEG_RADIUS)
            legW[i] = w; legSide[i] = side

    # --- per-vertex cardinal colour -----------------------------------------
    xmin, xmax = V[:,0].min(), V[:,0].max()
    ymax = V[:,1].max()
    col = np.tile(np.array(RED), (len(V),1))
    for i in range(len(V)):
        x,y,z = V[i]
        if y > 0.85*ymax:                                  # crest, up top
            col[i] = CREST
        if x > 0.68*xmax and 0.66*ymax < y <= 0.85*ymax:   # black face mask
            col[i] = MASK
        if x > 0.90*xmax and 0.52*ymax < y <= 0.68*ymax:   # orange beak, forward-most
            col[i] = BEAK
    print(f"  colour: {(np.all(col==MASK,1)).sum()} mask, "
          f"{(np.all(col==BEAK,1)).sum()} beak, "
          f"{(np.all(col==CREST,1)).sum()} crest verts")

    # --- bake non-indexed triangles -----------------------------------------
    pos, uv, colr, lw, ls = [], [], [], [], []
    for f in F:
        for vi in f:
            p = V[vi]
            pos += [p[0], p[1], p[2]]
            uv  += [p[0]*UV_SCALE + 0.5, p[2]*UV_SCALE + 0.5]
            colr+= list(col[vi])
            lw  += [legW[vi]]
            ls  += [legSide[vi]]

    def arr(name, data, prec=5):
        return (f'  {name}: new Float32Array([' +
                ','.join(f'{v:.{prec}g}' for v in data) + ']),\n')

    js  = ('/* cardinal_fold_geometry.js  — GENERATED by '
           'tools/generate_cardinal_from_fold.py — do not edit by hand.\n'
           '   The Robert Lang origami cardinal, baked for the browser.\n'
           '   +X forward (beak) · +Y up (crest) · feet on y=0. */\n')
    js += 'window.CARDINAL_FOLD = {\n'
    js += f'  triCount: {len(F)},\n'
    js += f'  hipL: [{hipL[0]:.5g},{hipL[1]:.5g},{hipL[2]:.5g}],\n'
    js += f'  hipR: [{hipR[0]:.5g},{hipR[1]:.5g},{hipR[2]:.5g}],\n'
    js += arr('position', pos)
    js += arr('uv', uv)
    js += arr('color', colr)
    js += arr('legW', lw)
    js += arr('legSide', ls)
    js += '};\n'
    open(OUT, 'w').write(js)
    print(f"  wrote {OUT}  ({len(js)/1024:.1f} KB, {len(F)} tris)")

    # --- validation contact sheet -------------------------------------------
    try:
        import matplotlib; matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        from mpl_toolkits.mplot3d.art3d import Poly3DCollection
        tris = [[V[i] for i in f] for f in F]
        fig = plt.figure(figsize=(15,5))
        def draw(ax, facecol, title):
            ax.add_collection3d(Poly3DCollection(tris, facecolor=facecol,
                edgecolor='#00000022', linewidth=0.2))
            c=(V.min(0)+V.max(0))/2; r=(V.max(0)-V.min(0)).max()/2*1.05
            ax.set_xlim(c[0]-r,c[0]+r); ax.set_ylim(c[1]-r,c[1]+r); ax.set_zlim(0,2*r)
            ax.view_init(15,-70); ax.set_title(title,fontsize=10)
            ax.set_box_aspect((1,1,1))
        # 1: cardinal colour
        fc=[col[f[0]] for f in F]; draw(fig.add_subplot(131,projection='3d'),fc,'cardinal colour')
        # 2: leg weight (red=1)
        fw=[(legW[f].mean(),0,1-legW[f].mean()) for f in [np.array(f) for f in F]]
        draw(fig.add_subplot(132,projection='3d'),fw,'leg weight (red=swings)')
        # 3: leg side (L green / R blue)
        fs=[]
        for f in F:
            s=legSide[np.array(f)].mean()
            fs.append((0.6,0.9,0.4) if s>0.1 else (0.4,0.6,0.95) if s<-0.1 else (0.8,0.8,0.8))
        draw(fig.add_subplot(133,projection='3d'),fs,'leg side (green L / blue R)')
        plt.tight_layout(); plt.savefig(os.path.join(os.path.dirname(__file__),
            'out','cardinal_check.png'), dpi=95); print("  wrote tools/out/cardinal_check.png")
    except Exception as e:
        print("  (skipped contact sheet:", e, ")")

if __name__ == '__main__':
    main()

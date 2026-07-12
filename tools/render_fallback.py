"""Pre-renders fallback.gif — the flock orbiting the mat — for the
unsupported-device state. Mirrors the live app's geometry & motion."""
import math, numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from PIL import Image

# ---- crane triangles (same shape as flock.js paper-crane) ----
def crane_tris(flap_deg):
    nose=[0,.5,0]; tail=[0,-.5,.06]; L=[-.07,0,.02]; R=[.07,0,.02]; keel=[0,-.02,-.10]
    T=[[nose,R,tail],[nose,tail,L],[nose,keel,R],[nose,L,keel],[tail,R,keel],[tail,keel,L],
       [[-.018,.48,.02],[.018,.48,.02],[0,.80,.24]],
       [[-.018,-.48,.06],[.018,-.48,.06],[0,-.78,.26]]]
    for side in (-1,1):
        a=math.radians(flap_deg)*(1 if side<0 else -1); c,s=math.cos(a),math.sin(a)
        w=[]
        for x,y,z in [[0,.22,0],[0,-.12,0],[side*.95,-.08,.03]]:
            w.append([x*c+z*s+side*.06, y+.05, -x*s+z*c+.02])
        T.append(w)
    return np.array([np.array(t) for t in T])

V = [ (0,0,0,1.25,'#d34a3e'), (-.09,-.13,-.02,1,'#f7f3ea'), (.09,-.13,-.02,1,'#dbe9f2'),
      (-.16,-.26,-.04,.95,'#f6dbd8'), (.16,-.26,-.04,.95,'#fbf0d4'),
      (-.22,-.39,-.06,.9,'#dcead9'), (.22,-.39,-.06,.9,'#f7f3ea') ]

# ---- mat as textured surface ----
mat = np.asarray(Image.open('mat_work/mat_compile.png').resize((90,64)))/255.0
ny,nx = mat.shape[0], mat.shape[1]
X,Y = np.meshgrid(np.linspace(-.5,.5,nx+1), np.linspace(.354,-.354,ny+1))
Z = np.zeros_like(X)

def Rz(a): c,s=math.cos(a),math.sin(a); return np.array([[c,-s,0],[s,c,0],[0,0,1]])

frames=[]
N=48
for f in range(N):
    u = f/N
    th = 2*math.pi*u                    # one full orbit → seamless loop
    fig = plt.figure(figsize=(4.4,3.4), dpi=100)
    ax = fig.add_subplot(111, projection='3d')
    ax.plot_surface(X,Y,Z, facecolors=mat, rstride=1, cstride=1, shade=False, linewidth=0)
    polys=[]; cols=[]
    # the child's real crane, resting in the circle
    for t in crane_tris(8)*0.16 + np.array([0,-.03,.03]):
        polys.append(t); cols.append('#eeeeee')
    for i,(px,py,pz,size,color) in enumerate(V):
        flap = 38*math.sin(2*math.pi*(12*u) + i*1.7)          # 12 integer cycles
        bob  = .067*math.sin(2*math.pi*(2*u)  + i*1.3)        # 2 integer cycles
        tris = crane_tris(flap)*(0.14*size)
        pos  = Rz(th) @ np.array([0.28+px, py, 0]) + np.array([0,0,.30+pz+bob])
        R    = Rz(th)
        for t in tris:
            polys.append((R@t.T).T + pos); cols.append(color)
    pc = Poly3DCollection(polys, facecolors=cols, edgecolors='#24435c', linewidths=.4)
    ax.add_collection3d(pc)
    ax.set_xlim(-.62,.62); ax.set_ylim(-.5,.5); ax.set_zlim(0,.62)
    ax.set_box_aspect((1.24,1,.62)); ax.view_init(elev=32, azim=-78)
    ax.axis('off'); fig.subplots_adjust(0,0,1,1)
    fig.patch.set_facecolor('#fdf9f0')
    fig.canvas.draw()
    img = np.asarray(fig.canvas.buffer_rgba())[:,:,:3]
    frames.append(Image.fromarray(img))
    plt.close(fig)

pal = [f.quantize(colors=128, method=Image.MEDIANCUT) for f in frames]
pal[0].save('/home/claude/fallback.gif', save_all=True, append_images=pal[1:],
            duration=100, loop=0, optimize=True)
import os; print("fallback.gif:", os.path.getsize('/home/claude/fallback.gif')//1024, "KB,", N, "frames")

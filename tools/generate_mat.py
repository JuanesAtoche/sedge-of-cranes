#!/usr/bin/env python3
"""
generate_mat.py — draws the "Sedge of Cranes" story mat.

Design goals (from the build spec, section 4):
- Feature-DENSE, ASYMMETRIC, HIGH-CONTRAST artwork (MindAR tracks corners
  and edges, so everything gets a dark ink outline).
- No large uniform areas except the intentional center circle.
- Works in grayscale (contrast comes from luminance, not hue).
- 1 cm+ safe margin. A4 landscape @ 300 dpi.

Edit URL_TEXT below and re-run (e.g. in GitHub Codespaces:
  pip install pillow img2pdf && python3 tools/generate_mat.py)
Outputs: mat.png (full res), mat_compile.png (for the MindAR compiler),
mat_thumb.png (UI thumbnail), mat.pdf (printable).
"""
import math, random
from PIL import Image, ImageDraw, ImageFont

random.seed(7)  # fixed seed → same mat every run (target stays valid)

# ---------- page setup ----------
W, H = 3508, 2480            # A4 landscape @ 300 dpi
CM = 118                      # ~1 cm in px
PAPER = (253, 246, 232)
INK = (36, 51, 66)
RED = (211, 74, 62)
SKY = (176, 216, 235)
SUN = (242, 182, 70)
GREEN = (72, 118, 88)
BROWN = (138, 90, 51)
BLUE = (79, 132, 168)

URL_TEXT = "Your story link: ____________________________"  # ← edit me

img = Image.new("RGB", (W, H), PAPER)
d = ImageDraw.Draw(img)

def font(size, bold=True):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    return ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/{name}", size)

# ---------- helpers ----------
def blob(cx, cy, r, squash=0.62, lobes=3, wob=0.16, rot=0.0, fill=(255,255,255), w=9):
    """Bumpy closed shape (cloud/pad) with a clean ink outline."""
    pts = []
    for i in range(72):
        t = i / 72 * 2 * math.pi
        rr = r * (1 + wob * math.sin(lobes * t + rot) + 0.07 * math.sin(7 * t + rot * 2))
        pts.append((cx + rr * math.cos(t), cy + rr * math.sin(t) * squash))
    d.polygon(pts, fill=fill, outline=INK, width=w)

def sun(cx, cy, r):
    for i in range(14):                       # irregular triangular rays
        a = i / 14 * 2 * math.pi + 0.2
        L = r * (1.55 if i % 2 == 0 else 1.32) * random.uniform(0.94, 1.06)
        a1, a2 = a - 0.10, a + 0.10
        d.polygon([(cx + r*1.04*math.cos(a1), cy + r*1.04*math.sin(a1)),
                   (cx + r*1.04*math.cos(a2), cy + r*1.04*math.sin(a2)),
                   (cx + L*math.cos(a),       cy + L*math.sin(a))],
                  fill=SUN, outline=INK, width=7)
    d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=SUN, outline=INK, width=10)
    d.arc([cx-r*0.55, cy-r*0.35, cx-r*0.05, cy+r*0.15], 200, 340, fill=INK, width=8)  # closed eye L
    d.arc([cx+r*0.05, cy-r*0.35, cx+r*0.55, cy+r*0.15], 200, 340, fill=INK, width=8)  # closed eye R
    d.arc([cx-r*0.35, cy-r*0.05, cx+r*0.35, cy+r*0.55], 20, 160, fill=INK, width=9)   # smile

def bird(cx, cy, s, flip=False):
    """Tiny 'm' bird."""
    f = -1 if flip else 1
    d.arc([cx-s, cy-s*0.7, cx, cy+s*0.7], 180, 340, fill=INK, width=8)
    d.arc([cx, cy-s*0.7*f, cx+s, cy+s*0.7], 200, 360, fill=INK, width=8)

def star(cx, cy, s):
    d.polygon([(cx,cy-s),(cx+s*0.28,cy-s*0.28),(cx+s,cy),(cx+s*0.28,cy+s*0.28),
               (cx,cy+s),(cx-s*0.28,cy+s*0.28),(cx-s,cy),(cx-s*0.28,cy-s*0.28)],
              fill=SUN, outline=INK, width=5)

def reed(x, base_y, h, lean, head=True):
    top = (x + lean, base_y - h)
    d.line([ (x, base_y), (x + lean*0.4, base_y - h*0.55), top ], fill=GREEN, width=16, joint="curve")
    if head:
        hw, hh = 34, 120
        d.rounded_rectangle([top[0]-hw, top[1]-hh, top[0]+hw, top[1]+hh], radius=hw,
                            fill=BROWN, outline=INK, width=8)
        d.line([top[0], top[1]-hh, top[0]+10, top[1]-hh-70], fill=GREEN, width=10)
    # a leaf
    ly = base_y - h * random.uniform(0.3, 0.5)
    d.line([(x + lean*0.25, ly), (x + lean*0.25 + random.choice([-1,1])*70, ly-90)],
           fill=GREEN, width=12)

def ripples(cx, cy, n=3, r0=90, step=70):
    for i in range(n):
        r = r0 + i*step
        a0 = random.randint(150, 200); a1 = a0 + random.randint(120, 170)
        d.arc([cx-r, cy-r*0.35, cx+r, cy+r*0.35], a0, a1, fill=BLUE, width=11)

def lilypad(cx, cy, r, flower=False):
    blob(cx, cy, r, squash=0.55, lobes=2, wob=0.08, fill=(150, 190, 150), w=9)
    d.polygon([(cx, cy), (cx + r*1.1, cy - r*0.28), (cx + r*1.1, cy + r*0.28)], fill=PAPER, outline=INK, width=8)
    if flower:
        for k in range(6):
            a = k/6*2*math.pi
            d.ellipse([cx-90+70*math.cos(a)-38, cy-95+70*math.sin(a)*0.7-30,
                       cx-90+70*math.cos(a)+38, cy-95+70*math.sin(a)*0.7+30],
                      fill=(244, 200, 205), outline=INK, width=6)
        d.ellipse([cx-120, cy-120, cx-60, cy-70], fill=SUN, outline=INK, width=6)

def mini_crane(cx, cy, s, color):
    """Folded-crane glyph: body diamond + raised wing + neck/head. Bold & clean."""
    P = lambda pts: d.polygon([(cx+p[0]*s, cy+p[1]*s) for p in pts], fill=color, outline=INK, width=8)
    P([(-1.05,0.15),(-0.35,-0.05),(-0.3,0.45)])            # tail
    P([(-0.35,-0.05),(0.5,0.05),(0.15,0.6),(-0.3,0.45)])   # body
    P([(-0.2,0.0),(0.25,-0.95),(0.5,0.05)])                # raised wing
    P([(0.5,0.05),(0.95,-0.5),(0.8,0.12)])                 # neck
    P([(0.95,-0.5),(1.18,-0.42),(0.99,-0.28)])             # head/beak
def pebbles(cx, cy):
    for _ in range(6):
        x = cx + random.randint(-160, 160); y = cy + random.randint(-40, 60)
        r = random.randint(26, 52)
        d.ellipse([x-r, y-r*0.7, x+r, y+r*0.7], fill=(205, 198, 182), outline=INK, width=6)

def grass(cx, cy, n=7):
    for i in range(n):
        x = cx + i*26 + random.randint(-6, 6)
        h = random.randint(90, 170); lean = random.randint(-40, 40)
        d.line([(x, cy), (x + lean, cy - h)], fill=GREEN, width=10)

# ---------- compose the scene (deliberately asymmetric) ----------
# sky wash, top ~40% — irregular lower edge so it's not a straight line
sky_pts = [(0,0),(W,0),(W,980)]
sky_pts += [(x, 980 - 90*math.sin(x/W*5.1) - 50*math.sin(x/W*13+2)) for x in range(W, -1, -80)]
d.polygon(sky_pts, fill=SKY)

sun(560, 470, 190)

# clouds — all different sizes/rotations, scattered off-grid
for (cx, cy, r, rot) in [(1450,300,150,0.4),(2350,430,190,1.7),(3050,260,130,2.6),
                         (1950,180,100,0.9),(2850,640,105,3.4),(1080,640,90,5.1)]:
    blob(cx, cy, r, lobes=3, wob=0.2, rot=rot)

for (x, y, s, f) in [(1700,560,60,0),(1840,500,45,1),(2600,300,55,0),
                     (1250,420,40,1),(2150,620,50,0),(3180,520,42,1)]:
    bird(x, y, s, f)

for (x, y, s) in [(900,220,46),(2050,760,40),(3250,150,52),(1550,150,36)]:
    star(x, y, s)

mini_crane(430, 950, 150, (247, 247, 247))   # white paper crane, left
mini_crane(2980, 900, 120, RED)              # small red crane, right

# right-side reed cluster (7 stems, varied)
for (x, h, lean, head) in [(3060,900,60,True),(3160,1150,20,True),(3260,780,-40,True),
                           (3340,1010,-70,False),(2980,650,110,False),(3200,1300,50,True),(3110,560,10,False)]:
    reed(x, 2320, h, lean, head)

# pond bottom-left: ripples, pads, pebbles, grass
ripples(600, 1950); ripples(1150, 2200, n=4); ripples(350, 2280, n=2, r0=70)
lilypad(950, 1900, 170, flower=True)
lilypad(1450, 2130, 130)
lilypad(560, 2200, 110)
pebbles(2050, 2140)
grass(1720, 2180); grass(2520, 2160, n=9); grass(300, 1750, n=5)
ripples(2700, 2150, n=3)

# extra features around the center circle (MindAR needs detail everywhere)
ripples(1030, 1650, n=3); ripples(1250, 1350, n=2, r0=60)
lilypad(1180, 1520, 120)
pebbles(2470, 1700)
for (x, y, s, f) in [(2320,1150,44,0),(2620,1010,38,1),(1350,1050,40,0)]:
    bird(x, y, s, f)
for (x, y, s) in [(2880,1450,34),(1500,1780,30)]:
    star(x, y, s)
for (fx, fy) in [(2250,1850),(2330,1900),(2180,1910)]:   # tiny flowers
    for k in range(5):
        a = k/5*2*3.14159
        d.ellipse([fx+26*math.cos(a)-16, fy+26*math.sin(a)-16, fx+26*math.cos(a)+16, fy+26*math.sin(a)+16],
                  fill=(244,200,205), outline=INK, width=4)
    d.ellipse([fx-13, fy-13, fx+13, fy+13], fill=SUN, outline=INK, width=4)

# fill the weak left-edge zone found by feature analysis
ripples(330, 1500, n=3, r0=60)
pebbles(430, 1620)
star(300, 1320, 34)
bird(560, 1420, 38, 1)

# dragonfly near the sun
dx, dy = 1150, 900
d.line([(dx-8, dy-60),(dx+4, dy+70)], fill=INK, width=10)
for a in (-1, 1):
    d.ellipse([dx-150, dy-30*a-38, dx-10, dy-30*a+18], outline=INK, width=7, fill=(224,238,245))
    d.ellipse([dx+10, dy-30*a-38, dx+150, dy-30*a+18], outline=INK, width=7, fill=(224,238,245))
d.ellipse([dx-16, dy-78, dx+16, dy-46], fill=INK)

# ---------- center circle (plain interior on purpose) ----------
CX, CY, R = W//2, H//2 + 60, 470
d.ellipse([CX-R-14, CY-R-14, CX+R+14, CY+R+14], fill=PAPER)   # clear space
for i in range(48):                                            # dashed red ring
    a0 = i * 7.5
    if i % 2 == 0:
        d.arc([CX-R, CY-R, CX+R, CY+R], a0, a0+6, fill=RED, width=16)
label = "Place your crane here"
f1 = font(64)
tw = d.textlength(label, font=f1)
d.text((CX - tw/2, CY + R + 40), label, font=f1, fill=RED)

# ---------- title & instructions ----------
f_title = font(92); f_small = font(46, bold=False); f_tiny = font(40, bold=False)
d.text((CM+20, CM), "Sedge of Cranes", font=f_title, fill=INK)
d.text((CM+24, CM+110), "story mat", font=f_small, fill=INK)

steps = "1. Place your crane in the circle.   2. Open the link.   3. Point your camera at this page."
tw = d.textlength(steps, font=f_small)
d.text((W/2 - tw/2, H - CM - 110), steps, font=f_small, fill=INK)
tw = d.textlength(URL_TEXT, font=f_tiny)
d.text((W/2 - tw/2, H - CM - 40), URL_TEXT, font=f_tiny, fill=INK)

# ---------- exports ----------
img.save("/home/claude/mat_work/mat.png")
img.resize((1556, 1100), Image.LANCZOS).save("/home/claude/mat_work/mat_compile.png")
img.resize((424, 300), Image.LANCZOS).save("/home/claude/mat_work/mat_thumb.png")
img.save("/home/claude/mat_work/mat.pdf", resolution=300)
print("done")

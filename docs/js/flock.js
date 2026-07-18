/* ==========================================================================
 * flock.js — Sedge of Cranes · Phase 6 "The Beautiful Flock" · v0.5.0-dev
 * ==========================================================================
 * A single A-Frame component <a-entity sedge-flock> that builds and animates
 * seven procedural paper cranes. 100% self-generated: no downloaded models,
 * no downloaded textures (textures come from tools/generate_papers.py).
 *
 * PUBLIC API (events on the flock entity) — same contract as MVP 1:
 *   emit('flock-show')                    fade the flock in over ~1.5 s
 *   emit('flock-hide')                    hide instantly
 *   emit('flock-freeze')                  freeze all motion (target lost)
 *   emit('flock-resume')                  resume from the frozen pose
 *   emit('flock-beat', {name:'wobble'})   story beat 1 — lead crane wobbles
 *   emit('flock-beat', {name:'loop'})     story beat 2 — lead loops upward
 *   emit('flock-beat', {name:'finale'})   story beat 3 — flock forms a circle
 *
 * If autoTarget:true (default) the component also listens for MindAR's
 * 'targetFound' / 'targetLost' on itself and its parent, so mat mode keeps
 * working with zero app.js changes: found → show+resume, lost → freeze.
 *
 * PERFORMANCE NOTES (the "why" behind the structure):
 *   - Each crane is ~6 draw calls: 1 body mesh (body+neck+head+tail merged),
 *     4 wing panels (separate ONLY because they pivot), 1 blob-shadow plane.
 *     Measured 0.6.0: 31 draw calls / 373 triangles for the whole flock.
 *   - No shadow maps. The "shadows" are radial-gradient planes (~free).
 *   - flatShading:true lights each facet uniformly — folded paper in one
 *     boolean.
 *
 * ==========================================================================
 * v0.7.0 — "THE AUTHENTIC TSURU" (Phase 6, opt-in geometry upgrade)
 * ==========================================================================
 * Adds a second geometry source, selected by geom:'fold' (default stays
 * 'proc', so nothing changes unless you ask for it — mat mode is untouched).
 *
 *   'fold' renders the EXACT folded crane exported from Amanda Ghassaei's
 *   Origami Simulator (a real, physically-relaxed 88%-folded tsuru), baked to
 *   a few KB of numbers by tools/generate_crane_from_fold.py and loaded from
 *   crane_fold_geometry.js. You get an authentic silhouette and creases that
 *   are REAL fold angles, not hand-guessed panels — which is exactly the
 *   aesthetic 0.6.0 was chasing, now sourced from ground truth.
 *
 *   The mesh is flat-folded and can't be split into the 4-panel wing rig, so
 *   its wings flap by SOFT SKINNING: each vertex carries a weight (0 on the
 *   body, ramping to 1 at the tips) and the wing region rotates about the root
 *   hinge. Vertices on the hinge sit on the axis and don't move, so the root
 *   never gaps. Verified tear-free in the generator's contact sheet.
 *
 *   A/B it with ?geom=fold in the preview and on a phone. When the kids pick a
 *   winner, flip the schema default. Everything else below is unchanged.
 *
 * ==========================================================================
 * v0.6.0 — "LET THE LIGHT DO THE WORK" (Phase 6, steps A + A+)
 * ==========================================================================
 * Field-test verdict from the kids on v0.5.2: "it doesn't seem like a real
 * folded origami paper." They were right, and they were describing three
 * specific things this version removes.
 *
 * THE DIAGNOSIS. A real paper crane (see docs/refs/real_crane.jpg) is ONE
 * FLAT COLOUR, yet you can count six distinct brightness values across it.
 * Paper reads as paper because each flat panel catches a measurably
 * different amount of light, and the boundary between two panels is a
 * dead-straight, razor-sharp discontinuity. Everything else is decoration.
 *
 * v0.5.2 destroyed all three of those properties:
 *
 *   1. FACET JITTER (jit = 0.008) displaced every interior vertex along the
 *      face normal, so one flat wing panel became ~12 facets pointing ~12
 *      directions. That is crumpled foil, not folded paper. → jitter now 0.
 *
 *   2. PER-FACE BRIGHTNESS GRAIN (0.93 + rand*0.07) sprinkled random
 *      lightness on top of that, adding noise the eye reads as texture
 *      mottling. → grain now 0 by default.
 *
 *   3. PAINTED CREASES — a dark LineSegments overlay plus a darkened
 *      texture column on the wing fold. But look at a real crane: there are
 *      NO dark lines. What you read as a crease is a highlight meeting a
 *      shadow. A painted line is a printed line, and it stays wrong as the
 *      crane rotates. → removed; the geometry makes its own creases.
 *
 * And the lighting could never have shown any of it anyway: the old rig ran
 * ambient 0.9 + directional 0.7 — MORE ambient than key. Ambient has no
 * direction, so ~57% of every facet's brightness carried zero shape
 * information. That is the mathematical definition of "flat".
 *
 * WHAT REPLACES IT (measured 59.94 fps on the field-test iPhone with camera
 * + MindAR tracking + audio all running, so we had ~2.5x headroom to spend):
 *   - MeshStandardMaterial (PBR), metalness 0.0 — paper is a DIELECTRIC.
 *     (If anyone ever tells you to raise metalness for "foil", say no: a
 *     metal has no diffuse component at all and your cranes go chrome.)
 *   - A procedural environment map, generated in-browser at runtime, costing
 *     ZERO download bytes. This is not optional: PBR without an environment
 *     map looks WORSE than Lambert — flat grey with a hot spot. The env map
 *     is what gives a single flat colour its six tonal values.
 *   - Key/rim directional lights at a ~4:1 ratio against fill.
 *   - ACES tone mapping (set on <a-scene renderer>) so the key doesn't clip.
 *
 * EVERY CHANGE HERE COSTS 0 DOWNLOAD BYTES. The page-weight budget never
 * had anything to do with how the cranes looked.
 *
 * TUNING: see the TUNABLES block below. Set pbr:false for a one-flag revert
 * to the old Lambert path if an Android device struggles (untested there
 * as of 0.6.0 — the 59.94 fps reading is from an iPhone).
 * ========================================================================== */

/* global AFRAME, THREE */
(function () {
  'use strict';
  if (typeof AFRAME === 'undefined') {
    throw new Error('flock.js: A-Frame must be loaded first');
  }

  var VERSION = '0.7.0-dev';   // 0.7.0: geom:'fold' authentic tsuru (opt-in)
                               // 0.6.0: flat panels + PBR + real lighting

  /* ----- deterministic per-crane randomness --------------------------------
   * mulberry32 is a tiny seeded random generator. Seeding by crane index
   * means crane #3 gets the same "personality" (flap speed, flutter phase)
   * on every load — useful when comparing before/after on two phones. */
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Cheap smooth pseudo-noise: two incommensurate sines. Used for flutter. */
  function noise(t, s) {
    return Math.sin(t * 1.7 + s) * 0.6 + Math.sin(t * 2.93 + s * 1.31) * 0.4;
  }

  /* ==========================================================================
   * GEOMETRY BUILDER
   * All coordinates are in "crane units": total wingspan ≈ 1.1 units,
   * +Z = forward (head), +Y = up. The whole crane is scaled to real-world
   * size (schema.wingspan, in meters) at build time.
   * ========================================================================== */

  /* GB collects raw triangles (non-indexed = each face owns its vertices,
   * which is exactly what flat shading needs: every facet gets its own
   * normal, so two panels at different angles produce a hard, geometric
   * crease with no painted line involved).
   *
   *   grain — random per-face brightness. v0.5.2 used 0.07 and it read as
   *           mottling. 0 = every facet on a flat panel is exactly one tone,
   *           which is what the reference photo shows.
   *   ao    — how much of the hand-baked panel shading (the 0.88/0.86
   *           multipliers below) to keep. Those numbers were painted in when
   *           the lighting was flat and couldn't shade anything. Now that a
   *           real key light exists, baked shading FIGHTS it, so we lerp it
   *           mostly out (0.35) rather than deleting it — a little bit of it
   *           still helps separate the upper and lower shells. */
  function GB(rand, grain, ao) {
    this.pos = []; this.col = []; this.uv = [];
    this.rand = rand;
    this.grain = (grain === undefined) ? 0 : grain;
    this.ao = (ao === undefined) ? 1 : ao;
  }
  GB.prototype.tri = function (a, b, c, shade, uvOf) {
    // lerp the baked shading toward white by (1 - ao)
    var s = 1 + (shade - 1) * this.ao;
    // rand() is consumed even when grain is 0 so that per-crane "personality"
    // (flap phase etc.) stays identical across grain settings — that makes
    // before/after screenshots comparable.
    var r = this.rand();
    var j = s * (1 - this.grain + r * this.grain);
    var pts = [a, b, c];
    for (var i = 0; i < 3; i++) {
      var p = pts[i];
      this.pos.push(p[0], p[1], p[2]);
      this.col.push(j, j, j);
      var t = uvOf(p);
      this.uv.push(t[0], t[1]);
    }
  };
  /* Subdivide a triangle once (4 children). With jitter = 0 (the default
   * since 0.6.0) the children stay coplanar, so the panel remains dead flat
   * and reads as a single crisp facet — the whole point. Jitter is kept as a
   * tunable because a "crumpled kraft paper" look is a legitimate different
   * aesthetic (see docs/refs/kraft_flock.jpg), just not the one we want. */
  GB.prototype.triSub = function (a, b, c, shade, uvOf, jitter) {
    var A = new THREE.Vector3().fromArray(a), B = new THREE.Vector3().fromArray(b),
        C = new THREE.Vector3().fromArray(c);
    var n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A)).normalize();
    var self = this;
    function mid(p, q) {
      var k = (self.rand() - 0.5) * 2 * jitter;
      return [(p[0] + q[0]) / 2 + n.x * k, (p[1] + q[1]) / 2 + n.y * k, (p[2] + q[2]) / 2 + n.z * k];
    }
    var ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    this.tri(a, ab, ca, shade, uvOf); this.tri(ab, b, bc, shade, uvOf);
    this.tri(ca, bc, c, shade, uvOf); this.tri(ab, bc, ca, shade, uvOf);
  };
  /* Bilinear grid over a quad (corners q00,q10,q11,q01), interior points
   * jittered along the quad normal. colShade lets a column be darkened —
   * that's how the wing-fold crease is "drawn" without extra draw calls. */
  GB.prototype.quadGrid = function (q00, q10, q11, q01, nx, ny, shade, uvOf, jitter, colShade) {
    var A = new THREE.Vector3().fromArray(q00), B = new THREE.Vector3().fromArray(q10),
        D = new THREE.Vector3().fromArray(q01);
    var n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(D, A)).normalize();
    var grid = [], i, j;
    for (j = 0; j <= ny; j++) {
      grid.push([]);
      for (i = 0; i <= nx; i++) {
        var u = i / nx, v = j / ny;
        var x = (1 - u) * (1 - v) * q00[0] + u * (1 - v) * q10[0] + u * v * q11[0] + (1 - u) * v * q01[0];
        var y = (1 - u) * (1 - v) * q00[1] + u * (1 - v) * q10[1] + u * v * q11[1] + (1 - u) * v * q01[1];
        var z = (1 - u) * (1 - v) * q00[2] + u * (1 - v) * q10[2] + u * v * q11[2] + (1 - u) * v * q01[2];
        if (i > 0 && i < nx && j > 0 && j < ny) { // interior only
          var k = (this.rand() - 0.5) * 2 * jitter;
          x += n.x * k; y += n.y * k; z += n.z * k;
        }
        grid[j].push([x, y, z]);
      }
    }
    for (j = 0; j < ny; j++) {
      for (i = 0; i < nx; i++) {
        var s = shade * (colShade ? colShade(i, nx) : 1);
        this.tri(grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], s, uvOf);
        this.tri(grid[j][i], grid[j + 1][i + 1], grid[j + 1][i], s, uvOf);
      }
    }
  };
  GB.prototype.build = function () {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return g;
  };

  /* --- UV projections: which "shadow" of the shape samples the texture --- */
  function uvTopDown(p) { return [p[0] * 1.4 + 0.5, p[2] * 1.4 + 0.5]; }  // body, wings
  function uvSide(p)    { return [p[2] * 1.2 + 0.5, p[1] * 1.2 + 0.5]; }  // neck/tail blades

  /* Key vertices of the classic tsuru (see ASCII sketch in PHASE6-NOTES.md) */
  var F = [0, 0.03, 0.28];    // front point of body (neck base)
  var Bk = [0, 0.03, -0.26];  // back point (tail base)
  var T = [0, 0.10, 0.01];    // top ridge peak (the raised center crease)
  var L = [-0.07, 0.01, 0.01], R = [0.07, 0.01, 0.01]; // side points
  var K = [0, -0.05, 0.01];   // keel (bottom point)

  var WING_ROOT_X = 0.045, WING_ROOT_Y = 0.085; // wing pivot (at the ridge side)
  var WING_INNER_LEN = 0.20;                    // root → fold line
  var WING_OUTER_LEN = 0.30;                    // fold line → tip

  function buildBodyGeometry(rand, jit, grain, ao) {
    var gb = new GB(rand, grain, ao);
    // upper shell (4 faces meeting at the ridge peak T)
    gb.triSub(F, L, T, 1.0, uvTopDown, jit);
    gb.triSub(F, T, R, 1.0, uvTopDown, jit);
    gb.triSub(Bk, T, L, 0.97, uvTopDown, jit);
    gb.triSub(Bk, R, T, 0.97, uvTopDown, jit);
    // lower shell (4 faces meeting at the keel K) — slightly darker: less light
    gb.triSub(F, K, L, 0.88, uvTopDown, jit);
    gb.triSub(F, R, K, 0.88, uvTopDown, jit);
    gb.triSub(Bk, L, K, 0.86, uvTopDown, jit);
    gb.triSub(Bk, K, R, 0.86, uvTopDown, jit);

    // NECK: a flattened vertical blade rising forward — origami-authentic
    // (the real fold is paper pressed flat, so near-zero thickness is right).
    var n0 = [0, 0.02, 0.26], n1 = [0, 0.09, 0.235];          // fold at body
    var n2 = [0, 0.30, 0.50], n3 = [0, 0.24, 0.505];          // top of neck
    gb.quadGrid(n0, n2, n3, n1 /* winding ok: DoubleSide */, 2, 1, 0.96, uvSide, jit * 0.5);
    // HEAD: fold-back triangle from the neck top, pointing forward-down
    var h = [0, 0.255, 0.585];
    gb.tri(n2, h, n3, 0.92, uvSide);
    gb.tri([0, 0.30, 0.50], [0, 0.283, 0.545], h, 0.92, uvSide);

    // TAIL: mirrored blade rising backward, tapering to a point
    var t0 = [0, 0.02, -0.24], t1 = [0, 0.09, -0.215];
    var tip = [0, 0.30, -0.52];
    gb.quadGrid(t0, tip, tip, t1, 2, 1, 0.95, uvSide, jit * 0.5);

    return gb.build();
  }

  function buildInnerWing(rand, jit, grain, ao) {
    // Local frame: origin AT the root pivot, wing extends +X, forward +Z.
    var gb = new GB(rand, grain, ao);
    gb.quadGrid(
      [0, 0, 0.14],                    [WING_INNER_LEN, -0.015, 0.10],
      [WING_INNER_LEN, -0.015, -0.12], [0, 0, -0.16],
      3, 2, 1.0, uvTopDown, jit);
    return gb.build();
  }

  function buildOuterWing(rand, jit, grain, ao) {
    // Local frame: origin AT the fold-line pivot.
    //
    // v0.5.2 darkened the first column of this panel to fake the wing-fold
    // crease. Removed in 0.6.0: this panel PIVOTS relative to the inner one,
    // so the two surfaces genuinely sit at an angle to each other and the
    // key light draws that crease for free — correctly, and from every
    // viewing angle, which a painted stripe never managed.
    var gb = new GB(rand, grain, ao);
    var midX = WING_OUTER_LEN * 0.55;
    gb.quadGrid(
      [0, 0, 0.10],           [midX, 0, 0.055],
      [midX, 0, -0.085],      [0, 0, -0.12],
      2, 2, 0.98, uvTopDown, jit);
    // taper to the swept-back tip
    var tip = [WING_OUTER_LEN, 0, -0.05];
    gb.tri([midX, 0, 0.055], tip, [midX, 0, -0.085], 0.98, uvTopDown);
    return gb.build();
  }

  /* --------------------------------------------------------------------------
   * FOLD GEOMETRY (geom:'fold') — the authentic tsuru
   * --------------------------------------------------------------------------
   * Reads the baked module (window.CRANE_FOLD from crane_fold_geometry.js) and
   * returns a per-crane BufferGeometry PLUS the arrays tick() needs to flap it.
   *
   * WHY A COPY PER CRANE: each crane flaps on its own phase, so each needs its
   * own position buffer to write into. uv/flapW/side are shared read-only.
   *
   * WHY NO CPU NORMALS PER FRAME: the paper material uses flatShading, which
   * derives each facet's normal from screen-space derivatives of position in
   * the shader. So when we move vertices, the hard creases re-light themselves
   * for free — we never recompute normals on the CPU. (~5 lines, as promised.)
   */
  function buildFoldGeometry() {
    var C = window.CRANE_FOLD;
    if (!C) return null;
    var g = new THREE.BufferGeometry();
    var posAttr = new THREE.BufferAttribute(new Float32Array(C.position), 3);
    g.setAttribute('position', posAttr);
    g.setAttribute('uv',       new THREE.BufferAttribute(C.uv, 2));
    // vertexColors:true is on in the material; give every vertex white so it
    // multiplies to 1 (the baked crane carries no per-face shading — the real
    // fold angles + key light do all the shading now).
    var col = new Float32Array(C.position.length); col.fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();                          // once; flatShading wins
    return { geo: g, posAttr: posAttr, pos: posAttr.array,
             rest: new Float32Array(C.position),
             flapW: C.flapW, side: C.side,
             hingeX: C.hingeX, hingeY: C.hingeY };
  }

  /* Deform one fold-crane's vertices for a given wing angle (radians). Both
   * wings rise/fall together; `side` (+1/-1) mirrors the rotation so it reads
   * as a symmetric flap. Vertices with flapW 0 (body/neck/tail) never move, and
   * vertices on the hinge line sit on the rotation axis, so the root never
   * gaps. Called once per crane per frame — ~300 cheap rotations, negligible. */
  function deformFoldWings(F, angle) {
    var pos = F.pos, rest = F.rest, w = F.flapW, sd = F.side,
        hx = F.hingeX, hy = F.hingeY, n = w.length, i, j;
    for (i = 0; i < n; i++) {
      j = i * 3;
      var wi = w[i];
      if (wi <= 0) {                                     // body: straight copy
        pos[j] = rest[j]; pos[j + 1] = rest[j + 1]; pos[j + 2] = rest[j + 2];
        continue;
      }
      var s = sd[i], px = s * hx;
      var x = rest[j] - px, y = rest[j + 1] - hy;
      var a = angle * wi * s, ca = Math.cos(a), sa = Math.sin(a);
      pos[j]     = x * ca - y * sa + px;
      pos[j + 1] = x * sa + y * ca + hy;
      pos[j + 2] = rest[j + 2];
    }
    F.posAttr.needsUpdate = true;
  }

  /* ==========================================================================
   * THE ENVIRONMENT MAP  — the single most important object in this file
   * ==========================================================================
   * CONCEPT (5 lines, as promised): an "environment map" is a tiny picture of
   * the world surrounding the object. PBR materials look up that picture to
   * answer "what light arrives at this facet from the direction it faces?"
   * Without one, every facet not hit by a lamp gets NOTHING and renders black
   * or flat grey. WITH one, a facet tilted up catches sky, a facet tilted
   * down catches warm bounce off the table — which is exactly why the real
   * blue crane in our reference photo shows six tones from one flat colour.
   *
   * We draw ours by hand: a 128x64 equirectangular gradient (sky above,
   * horizon band, warm floor bounce below). PMREMGenerator then pre-blurs it
   * into the format three.js wants for roughness lookups. Total download
   * cost: ZERO bytes — it is generated on the phone in about 2 ms.
   *
   * PHASE 6 STEP E PREVIEW: because this is generated in code rather than
   * loaded from a file, we can later re-tint it from the live camera feed
   * (sample a 16x16 downscale of the video for average brightness/colour) and
   * the cranes will be lit by the child's ACTUAL room. That is the free-tier
   * version of what ARKit light estimation does. Not in this commit. */
  var envRT = null;
  function buildEnvironment(renderer, opts) {
    if (envRT) return envRT.texture;
    if (!renderer || !THREE.PMREMGenerator) return null;

    var W = 128, H = 64;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    // equirectangular: y=0 is straight up, y=H is straight down
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0.00, opts.skyTop);      // zenith
    g.addColorStop(0.45, opts.skyHorizon);  // horizon, just above
    g.addColorStop(0.55, opts.groundNear);  // horizon, just below
    g.addColorStop(1.00, opts.groundFar);   // straight down: table bounce
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // A soft bright patch = a window/lamp. This is what puts a travelling
    // highlight on a banking wing, and it is most of the "alive" feeling.
    var s = ctx.createRadialGradient(W * 0.30, H * 0.22, 1, W * 0.30, H * 0.22, H * 0.5);
    s.addColorStop(0, opts.sun);
    s.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = s; ctx.fillRect(0, 0, W, H);

    var tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;

    var pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    envRT = pmrem.fromEquirectangular(tex);
    pmrem.dispose();
    tex.dispose();
    return envRT.texture;
  }

  /* Blob shadow: a radial gradient drawn once on a shared canvas texture. */
  var shadowTexture = null;
  function getShadowTexture() {
    if (shadowTexture) return shadowTexture;
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var ctx = c.getContext('2d');
    var grd = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    grd.addColorStop(0, 'rgba(30,22,15,0.45)');
    grd.addColorStop(1, 'rgba(30,22,15,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 128, 128);
    shadowTexture = new THREE.CanvasTexture(c);
    return shadowTexture;
  }

  /* Paper material.
   *
   * WHY PBR (MeshStandardMaterial) AND NOT LAMBERT: MeshLambertMaterial has
   * no specular term AT ALL. It physically cannot produce a sheen. But look
   * at the reference photo — the brightest wing is catching a soft highlight.
   * Paper is not matte; it is a rough dielectric. Lambert can never show that.
   *
   * metalness: 0.0 — NON-NEGOTIABLE. Paper is a dielectric. Metals have no
   *   diffuse component, so raising this turns the cranes into dark chrome.
   *   Even gold-foil origami paper should stay near 0 here.
   * roughness: 0.62 — washi is rough but not chalk. Lower = glossier/plastic.
   *
   * The back-face trick: paper's reverse side is always a bit dimmer, and it
   * makes DoubleSide geometry read as a sheet with two sides rather than a
   * hollow shell. One line of shader injection. */
  function makePaperMaterial(texture, opts) {
    var m;
    if (opts.pbr) {
      m = new THREE.MeshStandardMaterial({
        map: texture, vertexColors: true, flatShading: true,
        side: THREE.DoubleSide, transparent: true, opacity: 0,
        metalness: 0.0,
        roughness: opts.roughness,
        envMapIntensity: opts.envIntensity
      });
    } else {
      // Kill switch. If a mid-range Android can't hold 24 fps with PBR, set
      // pbr:false on the entity and you are back on the 0.5.x lighting model
      // (but keep jitter 0 and grain 0 — those cost nothing and were the
      // bigger half of the problem anyway).
      m = new THREE.MeshLambertMaterial({
        map: texture, vertexColors: true, flatShading: true,
        side: THREE.DoubleSide, transparent: true, opacity: 0
      });
    }
    m.onBeforeCompile = function (shader) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  if (!gl_FrontFacing) diffuseColor.rgb *= 0.80;'
      );
    };
    return m;
  }

  /* ==========================================================================
   * THE COMPONENT
   * ========================================================================== */
  AFRAME.registerComponent('sedge-flock', {
    schema: {
      count:        { default: 7 },
      size:         { default: 2.0 },   // whole-flock scale multiplier.
                                        // Kids' verdict: 1.0 was too small.
                                        // Scales wingspan, spacing, orbit
                                        // radius and altitude TOGETHER so
                                        // the formation never overlaps.
      wingspan:     { default: 0.11 },  // meters (real-world ≈ 11 cm at size 1)
      patternRepeat:{ default: 2.5 },   // texture tiles per crane.
                                        // 0.5.2 used 1.0 after the kids said
                                        // "we can't see the patterns" — but
                                        // that made each motif ~30 texels of
                                        // a 256px tile stretched over ~200
                                        // screen pixels, i.e. BLURRY. The
                                        // complaint may have been sharpness,
                                        // not size. 2.5 gives ~3x the texel
                                        // density AND real-washi motif scale.
                                        // A/B this one with the kids.
      orbitRadius:  { default: 0.13 },  // meters from mat/crane center
      altitude:     { default: 0.12 },  // meters above the anchor plane
      orbitSeconds: { default: 20 },    // one full orbit (spec: ≈ 20 s)
      papersPath:   { default: 'assets/papers/' },
      autoTarget:   { default: true },  // react to MindAR targetFound/Lost
      autoShow:     { default: false }, // fade in immediately (preview page)

      /* GEOMETRY SOURCE (Phase 6 "authentic tsuru"):
       *   'proc' (default) — the hand-built stylised crane with the 4-panel
       *          articulated wing rig. Beloved, clean, ships today.
       *   'fold'  — the EXACT folded mesh baked from Origami Simulator by
       *          tools/generate_crane_from_fold.py (crane_fold_geometry.js
       *          must be loaded before this file). Authentic silhouette and
       *          real fold-angle creases; wings flap via soft per-vertex
       *          skinning instead of the pivot rig. A/B with ?geom=fold until
       *          the kids vote — then flip this default. Mat mode is untouched
       *          either way (golden rule). Auto-falls back to 'proc' if the
       *          baked module isn't present. */
      geom:         { default: 'proc' },

      /* ----------------------- TUNABLES (v0.6.0) -------------------------
       * Everything that decides whether these read as PAPER lives here.
       * Change one at a time and take a screenshot from the same angle. */
      pbr:          { default: true },  // false → old Lambert path (kill switch)
      jitter:       { default: 0.0 },   // facet displacement, crane units.
                                        // 0     = crisp folded paper (target)
                                        // 0.008 = the 0.5.2 crumpled-foil look
      grain:        { default: 0.0 },   // random per-face brightness (0.5.2: 0.07)
      bakedAO:      { default: 0.35 },  // how much hand-painted panel shading
                                        // to keep now that real light exists
      roughness:    { default: 0.62 },  // paper sheen. <0.4 starts to look plastic
      envIntensity: { default: 1.0 },   // strength of the environment lighting
      anisotropy:   { default: 8 },     // sharpens textures at grazing angles —
                                        // banking wings hit those constantly
      // Environment map colours. These ARE your lighting: warm room by default.
      envSkyTop:    { default: '#dceaf6' },
      envSkyHorizon:{ default: '#f2ecdf' },
      envGroundNear:{ default: '#e8dcc6' },
      envGroundFar: { default: '#c9b79a' },
      envSun:       { default: 'rgba(255,247,230,0.95)' }
    },

    /* The seven papers, lead first (must match tools/generate_papers.py). */
    PAPERS: [
      'paper_lead_red_seigaiha.png', 'paper_blue_asanoha.png',
      'paper_pink_dots.png', 'paper_green_stripes.png',
      'paper_lavender_seigaiha.png', 'paper_peach_asanoha.png',
      'paper_yellow_dots.png'
    ],

    /* Fallback solid colors if a texture fails to load (e.g. a missing PNG
     * on the server). A crane in plain paper beats a black silhouette. */
    FALLBACK_COLORS: [0xb33a2e, 0xa8c8dc, 0xecc8cf, 0xc3d8bf,
                      0xcfc8e4, 0xecd0ba, 0xece0b0],

    /* V-formation offsets (formation local, +Z forward, lead at apex). */
    V_OFFSETS: [
      [0.00,  0.000,  0.10],
      [-0.09, -0.010,  0.02], [0.09, -0.010,  0.02],
      [-0.17, -0.020, -0.06], [0.17, -0.020, -0.06],
      [-0.25, -0.028, -0.14], [0.25, -0.028, -0.14]
    ],

    init: function () {
      var d = this.data;
      this.clock = 0;             // our own time; freezing = not advancing it
      this.frozen = true;         // start frozen until shown
      this.shown = false;
      this.fadeT = -1;            // >=0 while fading in
      this.beat = null;           // active story beat {name, t0}
      this.cranes = [];

      /* Scene graph:
       * el.object3D → orbitGroup (rotates about Y)
       *                 → formationGroup (at orbit radius, facing tangent)
       *                     → unit[i] (V offset + bob)  ── shadow plane
       *                         → roll[i] (bank+flutter) → crane meshes  */
      this.orbitGroup = new THREE.Group();
      this.orbitGroup.scale.setScalar(d.size);  // ×2 by default (see schema)
      this.formation = new THREE.Group();
      this.formation.position.set(d.orbitRadius, d.altitude, 0);
      this.formation.rotation.y = Math.PI; // face direction of travel
      this.orbitGroup.add(this.formation);
      this.el.object3D.add(this.orbitGroup);

      this.shadowTex = getShadowTexture();

      /* Environment map. The renderer may not exist yet when a component
       * inits, so attach it as soon as the scene is ready. Setting
       * scene.environment makes EVERY MeshStandardMaterial in the scene use
       * it automatically — no per-material wiring needed. */
      var sceneEl = this.el.sceneEl;
      this.paperTextures = [];    // for the anisotropy fixup below
      var self0 = this;
      var applyEnv = function () {
        var tex = buildEnvironment(sceneEl.renderer, {
          skyTop: d.envSkyTop, skyHorizon: d.envSkyHorizon,
          groundNear: d.envGroundNear, groundFar: d.envGroundFar,
          sun: d.envSun
        });
        if (tex) sceneEl.object3D.environment = tex;

        // If the renderer wasn't ready when the cranes were built, their
        // textures got anisotropy 1. Fix them now that it is.
        var r = sceneEl.renderer;
        if (r) {
          var maxA = r.capabilities.getMaxAnisotropy();
          self0.paperTextures.forEach(function (t) {
            t.anisotropy = Math.min(d.anisotropy, maxA);
            t.needsUpdate = true;
          });
        }
        if (!tex && d.pbr) {
          console.warn('[sedge-flock] no environment map — PBR will look ' +
                       'flat. Check PMREMGenerator availability.');
        }
      };
      if (sceneEl.renderer) applyEnv();
      else sceneEl.addEventListener('renderstart', applyEnv, { once: true });

      var loader = new THREE.TextureLoader();
      var scale = d.wingspan / 1.1; // crane units → meters
      var lead = 1.18;              // lead crane is slightly larger (spec)

      for (var i = 0; i < d.count; i++) {
        this.buildCrane(i, loader, scale * (i === 0 ? lead : 1));
      }
      this.el.object3D.visible = false;

      // events (public API)
      var self = this;
      this.el.addEventListener('flock-show',   function () { self.show(); });
      this.el.addEventListener('flock-hide',   function () { self.hide(); });
      this.el.addEventListener('flock-freeze', function () { self.frozen = true; });
      this.el.addEventListener('flock-resume', function () { self.frozen = false; });
      this.el.addEventListener('flock-beat',   function (e) {
        self.beat = { name: (e.detail && e.detail.name) || 'wobble', t0: self.clock };
      });
      if (d.autoTarget) {
        var onFound = function () { self.show(); self.frozen = false; };
        var onLost  = function () { self.frozen = true; };
        [this.el, this.el.parentEl].forEach(function (t) {
          if (!t) return;
          t.addEventListener('targetFound', onFound);
          t.addEventListener('targetLost', onLost);
        });
      }
      if (d.autoShow) this.show();

      // ?debug → print the numbers that matter
      if (/[?&]debug/.test(location.search)) {
        var tris = 0;
        this.el.object3D.traverse(function (o) {
          if (o.isMesh) tris += o.geometry.getAttribute('position').count / 3;
        });
        var useFold = (d.geom === 'fold') && window.CRANE_FOLD;
        console.log('[sedge-flock ' + VERSION + '] geom:',
          useFold ? 'fold (authentic tsuru)' : 'proc', '| cranes:', d.count,
          '| triangles total:', tris, '(' + Math.round(tris / d.count) + '/crane)',
          '| est. draw calls:', d.count * (useFold ? 2 : 6),
          '| pbr:', d.pbr);
      }
    },

    buildCrane: function (i, loader, scale) {
      var d = this.data;
      var rand = mulberry32(1000 + i * 77);   // per-crane personality seed
      var jit = d.jitter;                     // 0 since 0.6.0 — see TUNABLES
      var matOpts = {
        pbr: d.pbr, roughness: d.roughness, envIntensity: d.envIntensity
      };

      var self = this;
      var mat; // created below; the error callback needs to reference it
      var tex = loader.load(
        // ?v= busts the phone's cache when the papers are regenerated
        d.papersPath + this.PAPERS[i % this.PAPERS.length] + '?v=' + VERSION,
        undefined, undefined,
        function () { // texture 404 / network error → plain-paper fallback
          console.warn('[sedge-flock] paper texture missing for crane ' + i +
            ' — using solid color. Is docs/assets/papers/ deployed?');
          mat.map = null;
          mat.color.setHex(self.FALLBACK_COLORS[i % self.FALLBACK_COLORS.length]);
          mat.needsUpdate = true;
        });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(d.patternRepeat, d.patternRepeat);
      tex.offset.set(rand(), rand());         // no two cranes wear it alike
      // Anisotropic filtering: without it, a wing banking away from the
      // camera smears its pattern into mush (mipmaps average too hard at
      // grazing angles). Our cranes bank constantly, so this matters.
      var renderer = this.el.sceneEl.renderer;
      var maxAniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
      tex.anisotropy = Math.min(d.anisotropy, maxAniso);
      this.paperTextures.push(tex);
      mat = makePaperMaterial(tex, matOpts);

      var unit = new THREE.Group();           // V position + bob
      var off = this.V_OFFSETS[i % this.V_OFFSETS.length];
      unit.position.set(off[0], off[1], off[2]);
      var roll = new THREE.Group();           // banking + flutter + beats
      unit.add(roll);

      var craneRoot = new THREE.Group();      // scaled crane-units → meters
      craneRoot.scale.setScalar(scale);
      roll.add(craneRoot);

      // NOTE: the dark crease LineSegments that lived here in 0.5.x is gone.
      // The ridge, the neck fold and the wing folds are all real angle
      // changes in the geometry — the key light draws them, correctly, from
      // every viewpoint. That is what a crease actually is.

      var wings = [];   // 4-panel rig ('proc'); stays empty for 'fold'
      var fold = null;  // soft-skinned deform state ('fold'); null for 'proc'

      var useFold = (d.geom === 'fold') && window.CRANE_FOLD;
      if (d.geom === 'fold' && !window.CRANE_FOLD) {
        console.warn('[sedge-flock] geom:"fold" requested but ' +
          'crane_fold_geometry.js is not loaded — falling back to procedural. ' +
          'Add <script src="js/crane_fold_geometry.js"> before flock.js.');
      }

      if (useFold) {
        // ONE authentic mesh (body+neck+tail+wings). Wings flap by deforming
        // this same buffer in tick() — no child pivots, so fewer draw calls.
        fold = buildFoldGeometry();
        craneRoot.add(new THREE.Mesh(fold.geo, mat));
      } else {
        // Procedural crane: body mesh + articulated wing rig.
        craneRoot.add(new THREE.Mesh(
          buildBodyGeometry(rand, jit, d.grain, d.bakedAO), mat));
        // wings: root pivot → inner panel → fold pivot → outer panel
        for (var side = 0; side < 2; side++) {
          var rootPivot = new THREE.Group();
          rootPivot.position.set(WING_ROOT_X, WING_ROOT_Y, 0);
          if (side === 1) rootPivot.scale.x = -1;   // mirror = free left wing
          rootPivot.position.x *= (side === 1 ? -1 : 1);
          var inner = new THREE.Mesh(
            buildInnerWing(rand, jit, d.grain, d.bakedAO), mat);
          var foldPivot = new THREE.Group();
          foldPivot.position.set(WING_INNER_LEN, -0.015, 0);
          var outer = new THREE.Mesh(
            buildOuterWing(rand, jit, d.grain, d.bakedAO), mat);
          foldPivot.add(outer);
          rootPivot.add(inner);
          rootPivot.add(foldPivot);
          craneRoot.add(rootPivot);
          wings.push({ root: rootPivot, fold: foldPivot });
        }
      }

      // blob shadow: child of the UNIT (not roll) so banking never tilts it
      var shMat = new THREE.MeshBasicMaterial({
        map: this.shadowTex, transparent: true, opacity: 0, depthWrite: false
      });
      var shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.setScalar(d.wingspan * 1.4);
      unit.add(shadow);

      this.formation.add(unit);

      this.cranes.push({
        unit: unit, roll: roll, wings: wings, fold: fold, mat: mat,
        shadow: shadow,
        baseOffset: off.slice(),
        flapFreq: 3.1 * (0.85 + rand() * 0.30),   // ±15% (spec)
        flapPhase: rand() * Math.PI * 2,
        bobPhase: rand() * Math.PI * 2,
        flutterSeed: rand() * 20,
        flapWeight: 1, gliding: false,
        nextGlideCheck: 2 + rand() * 4
      });
    },

    show: function () {
      if (this.shown) { this.frozen = false; return; }
      this.shown = true; this.frozen = false;
      this.el.object3D.visible = true;
      this.fadeT = 0;
    },
    hide: function () {
      this.shown = false; this.frozen = true;
      this.el.object3D.visible = false;
    },

    /* ------------------------------- TICK -------------------------------- */
    tick: function (time, dtMs) {
      if (this.frozen && this.fadeT < 0) return;   // freeze = hold the pose
      var dt = Math.min(dtMs, 50) / 1000;          // clamp tab-switch spikes
      var d = this.data;

      // fade-in runs even during freeze so 'show' always completes visually
      if (this.fadeT >= 0) {
        this.fadeT += dt;
        var f = Math.min(this.fadeT / 1.5, 1);
        var eased = f * f * (3 - 2 * f);
        for (var k = 0; k < this.cranes.length; k++) {
          this.cranes[k].mat.opacity = eased;
        }
        if (f >= 1) {
          this.fadeT = -1;
          for (k = 0; k < this.cranes.length; k++) {
            this.cranes[k].mat.transparent = false; // cheaper once opaque
            this.cranes[k].mat.needsUpdate = true;
          }
        }
        if (this.frozen) return;
      }

      this.clock += dt;
      var t = this.clock;

      // orbit (one revolution per orbitSeconds)
      this.orbitGroup.rotation.y = (t * Math.PI * 2) / d.orbitSeconds;
      var bank = -0.22;   // ~12° roll into the turn; flip sign if leaning out

      // story-beat bookkeeping
      var beat = this.beat, bp = 0;
      if (beat) {
        var dur = beat.name === 'finale' ? 4.5 : 2.5;
        bp = (t - beat.t0) / dur;                  // beat progress 0..1
        if (bp >= 1) { this.beat = beat = null; bp = 0; }
      }
      // finale morph weight: ease in (1 s) → hold → ease out (last 1 s)
      var circleW = 0;
      if (beat && beat.name === 'finale') {
        var e = (t - beat.t0);
        circleW = Math.min(e, 1) * Math.min(Math.max((4.5 - e), 0), 1);
      }

      for (var i = 0; i < this.cranes.length; i++) {
        var c = this.cranes[i];

        // -- occasional glide: skip 1–2 flap cycles (spec §4.3) ------------
        if (t > c.nextGlideCheck) {
          c.gliding = !c.gliding && Math.random() < 0.5;
          c.nextGlideCheck = t + (c.gliding
            ? (1 + Math.random()) * (1 / c.flapFreq) * 2   // glide 1–2 cycles
            : 2.5 + Math.random() * 4);                    // then flap a while
        }
        var targetW = c.gliding ? 0 : 1;
        c.flapWeight += (targetW - c.flapWeight) * Math.min(dt * 5, 1);

        // -- flap ------------------------------------------------------------
        c.flapPhase += dt * c.flapFreq * Math.PI * 2 * (0.35 + 0.65 * c.flapWeight);
        var glideLift = (1 - c.flapWeight) * 0.30;           // wings held up
        if (c.fold) {
          // 'fold' geometry: soft-skin both wings up/down about the root hinge.
          // sin drives the beat; glideLift keeps them raised during a glide.
          var ang = Math.sin(c.flapPhase) * 0.80 * c.flapWeight + glideLift;
          deformFoldWings(c.fold, ang);
        } else {
          // 'proc' geometry: two-segment pivot flap, outer lagging the inner.
          var innerRot = -(Math.sin(c.flapPhase) * 0.85 * c.flapWeight + glideLift);
          var outerRot = -(Math.sin(c.flapPhase - 0.45) * 0.65 * c.flapWeight);
          for (var w = 0; w < 2; w++) {
            c.wings[w].root.rotation.z = innerRot;
            c.wings[w].fold.rotation.z = outerRot;
          }
        }

        // -- bob (±2 cm, spec) + flutter noise ------------------------------
        var bob = Math.sin(t * 1.1 + c.bobPhase) * 0.02;
        var fl = noise(t, c.flutterSeed);
        var b = c.baseOffset;

        // finale: lerp the V offset toward a circle position
        var px = b[0], py = b[1], pz = b[2];
        if (circleW > 0) {
          var a = (i / this.cranes.length) * Math.PI * 2 + t * 0.4;
          px += (Math.cos(a) * 0.16 - b[0]) * circleW;
          py += (0.02 - b[1]) * circleW;
          pz += (Math.sin(a) * 0.16 - b[2]) * circleW;
        }
        c.unit.position.set(px + fl * 0.004, py + bob, pz);

        // -- banking + flutter roll/pitch -----------------------------------
        c.roll.rotation.z = bank + fl * 0.07;
        c.roll.rotation.x = noise(t * 0.8, c.flutterSeed + 9) * 0.05;
        c.roll.rotation.y = 0;
        c.roll.position.y = 0;

        // -- story beats act on the LEAD crane ------------------------------
        if (i === 0 && beat) {
          if (beat.name === 'wobble') {
            // "her first folds were crooked" — a decaying tipsy roll
            c.roll.rotation.z += Math.sin(bp * 22) * 0.55 * (1 - bp);
          } else if (beat.name === 'loop') {
            // "she kept practicing" — a proud vertical loop
            var s = Math.sin(bp * Math.PI);
            c.roll.position.y = s * 0.09;
            c.roll.rotation.x = -bp * Math.PI * 2;
          }
        }

        // -- blob shadow: lower crane → smaller offset, stronger shadow -----
        var h = d.altitude + py + bob;                 // height above plane
        c.shadow.position.y = -(d.altitude + b[1] + bob) + 0.002;
        var sh = Math.max(0.15, 0.5 - h * 1.6);
        c.shadow.material.opacity = (c.mat.opacity) * sh;
        var ss = d.wingspan * (1.1 + h * 2.0);
        c.shadow.scale.set(ss, ss, 1);
      }
    },

    remove: function () {
      // free GPU memory if the entity is ever removed
      if (envRT) { envRT.dispose(); envRT = null; }
      this.el.object3D.traverse(function (o) {
        if (o.isMesh || o.isLineSegments) {
          o.geometry.dispose();
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
    }
  });

  window.SEDGE_FLOCK_VERSION = VERSION;
})();

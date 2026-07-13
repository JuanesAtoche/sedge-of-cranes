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
 *   - Each crane is only ~6 draw calls: 1 body mesh (body+neck+head+tail
 *     merged), 4 wing panels (separate ONLY because they pivot), 1 crease
 *     LineSegments, 1 blob-shadow plane. 7 cranes ≈ 50 calls — comfortable
 *     for a mid-range Android. Draw calls, not triangles, are the budget
 *     that matters at this scale.
 *   - Wing-fold creases are baked as darkened vertex colors instead of
 *     extra Line objects: that saved 14 draw calls for an identical look.
 *   - No shadow maps. The "shadows" are radial-gradient planes (~free).
 *   - flatShading:true lights each facet uniformly — folded paper in one
 *     boolean. Per-face brightness jitter (vertex colors) adds the grain.
 * ========================================================================== */

/* global AFRAME, THREE */
(function () {
  'use strict';
  if (typeof AFRAME === 'undefined') {
    throw new Error('flock.js: A-Frame must be loaded first');
  }

  var VERSION = '0.5.0-dev';

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
   * which is exactly what flat shading and per-FACE vertex colors need). */
  function GB(rand) {
    this.pos = []; this.col = []; this.uv = [];
    this.rand = rand;
  }
  GB.prototype.tri = function (a, b, c, shade, uvOf) {
    // one brightness value per FACE → the paper-grain facet look
    var j = shade * (0.93 + this.rand() * 0.07);
    var pts = [a, b, c];
    for (var i = 0; i < 3; i++) {
      var p = pts[i];
      this.pos.push(p[0], p[1], p[2]);
      this.col.push(j, j, j);
      var t = uvOf(p);
      this.uv.push(t[0], t[1]);
    }
  };
  /* Subdivide a triangle once (4 children), nudging the midpoints along the
   * face normal — turns one flat face into a cluster of slightly-off facets,
   * i.e. hand-folded paper instead of CAD paper. */
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

  function buildBodyGeometry(rand, jit) {
    var gb = new GB(rand);
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

  function buildInnerWing(rand, jit) {
    // Local frame: origin AT the root pivot, wing extends +X, forward +Z.
    var gb = new GB(rand);
    gb.quadGrid(
      [0, 0, 0.14],                    [WING_INNER_LEN, -0.015, 0.10],
      [WING_INNER_LEN, -0.015, -0.12], [0, 0, -0.16],
      3, 2, 1.0, uvTopDown, jit);
    return gb.build();
  }

  function buildOuterWing(rand, jit) {
    // Local frame: origin AT the fold-line pivot. First column darkened →
    // the visible crease of the wing fold, with zero extra draw calls.
    var gb = new GB(rand);
    var creaseCol = function (i) { return i === 0 ? 0.82 : 1.0; };
    var midX = WING_OUTER_LEN * 0.55;
    gb.quadGrid(
      [0, 0, 0.10],           [midX, 0, 0.055],
      [midX, 0, -0.085],      [0, 0, -0.12],
      2, 2, 0.98, uvTopDown, jit, creaseCol);
    // taper to the swept-back tip
    var tip = [WING_OUTER_LEN, 0, -0.05];
    gb.tri([midX, 0, 0.055], tip, [midX, 0, -0.085], 0.98, uvTopDown);
    return gb.build();
  }

  /* Static crease lines (ridge, neck fold, tail fold, wing roots). Wing-fold
   * creases live in vertex colors instead — see buildOuterWing. */
  function buildCreaseGeometry() {
    var pts = [];
    function seg(a, b) { pts.push(a[0], a[1], a[2], b[0], b[1], b[2]); }
    seg(F, T); seg(T, Bk);                                     // spine ridge
    seg([0, 0.02, 0.26], [0, 0.09, 0.235]);                    // neck base fold
    seg([0, 0.02, -0.24], [0, 0.09, -0.215]);                  // tail base fold
    seg([WING_ROOT_X, WING_ROOT_Y, 0.13], [WING_ROOT_X, WING_ROOT_Y, -0.15]);   // wing roots
    seg([-WING_ROOT_X, WING_ROOT_Y, 0.13], [-WING_ROOT_X, WING_ROOT_Y, -0.15]);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
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

  /* Paper material: flat shading + vertex-color grain + texture + a darker
   * BACK face. The back-face trick is a 1-line shader injection: paper's
   * reverse side is always a bit dimmer, and it makes DoubleSide geometry
   * read as a sheet with two sides rather than a hollow shell. */
  function makePaperMaterial(texture) {
    var m = new THREE.MeshLambertMaterial({
      map: texture, vertexColors: true, flatShading: true,
      side: THREE.DoubleSide, transparent: true, opacity: 0
    });
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
      wingspan:     { default: 0.11 },  // meters (real-world ≈ 11 cm)
      orbitRadius:  { default: 0.13 },  // meters from mat/crane center
      altitude:     { default: 0.12 },  // meters above the anchor plane
      orbitSeconds: { default: 20 },    // one full orbit (spec: ≈ 20 s)
      papersPath:   { default: 'assets/papers/' },
      autoTarget:   { default: true },  // react to MindAR targetFound/Lost
      autoShow:     { default: false }  // fade in immediately (preview page)
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
      this.formation = new THREE.Group();
      this.formation.position.set(d.orbitRadius, d.altitude, 0);
      this.formation.rotation.y = Math.PI; // face direction of travel
      this.orbitGroup.add(this.formation);
      this.el.object3D.add(this.orbitGroup);

      this.creaseMat = new THREE.LineBasicMaterial({
        color: 0x2b1f14, transparent: true, opacity: 0
      });
      this.shadowTex = getShadowTexture();

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
        console.log('[sedge-flock ' + VERSION + '] cranes:', d.count,
          '| triangles total:', tris, '(' + Math.round(tris / d.count) + '/crane)',
          '| est. draw calls:', d.count * 7);
      }
    },

    buildCrane: function (i, loader, scale) {
      var d = this.data;
      var rand = mulberry32(1000 + i * 77);   // per-crane personality seed
      var jit = 0.008;                        // facet jitter (crane units)

      var self = this;
      var mat; // created below; the error callback needs to reference it
      var tex = loader.load(
        d.papersPath + this.PAPERS[i % this.PAPERS.length],
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
      tex.repeat.set(2.4, 2.4);
      tex.offset.set(rand(), rand());         // no two cranes wear it alike
      mat = makePaperMaterial(tex);

      var unit = new THREE.Group();           // V position + bob
      var off = this.V_OFFSETS[i % this.V_OFFSETS.length];
      unit.position.set(off[0], off[1], off[2]);
      var roll = new THREE.Group();           // banking + flutter + beats
      unit.add(roll);

      var craneRoot = new THREE.Group();      // scaled crane-units → meters
      craneRoot.scale.setScalar(scale);
      roll.add(craneRoot);

      craneRoot.add(new THREE.Mesh(buildBodyGeometry(rand, jit), mat));
      craneRoot.add(new THREE.LineSegments(buildCreaseGeometry(), this.creaseMat));

      // wings: root pivot → inner panel → fold pivot → outer panel
      var wings = [];
      for (var side = 0; side < 2; side++) {
        var rootPivot = new THREE.Group();
        rootPivot.position.set(WING_ROOT_X, WING_ROOT_Y, 0);
        if (side === 1) rootPivot.scale.x = -1;   // mirror = free left wing
        rootPivot.position.x *= (side === 1 ? -1 : 1);
        var inner = new THREE.Mesh(buildInnerWing(rand, jit), mat);
        var foldPivot = new THREE.Group();
        foldPivot.position.set(WING_INNER_LEN, -0.015, 0);
        var outer = new THREE.Mesh(buildOuterWing(rand, jit), mat);
        foldPivot.add(outer);
        rootPivot.add(inner);
        rootPivot.add(foldPivot);
        craneRoot.add(rootPivot);
        wings.push({ root: rootPivot, fold: foldPivot });
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
        unit: unit, roll: roll, wings: wings, mat: mat, shadow: shadow,
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
        this.creaseMat.opacity = eased * 0.30;
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

        // -- two-segment flap: outer panel lags the inner -------------------
        c.flapPhase += dt * c.flapFreq * Math.PI * 2 * (0.35 + 0.65 * c.flapWeight);
        var glideLift = (1 - c.flapWeight) * 0.30;           // wings held up
        var innerRot = -(Math.sin(c.flapPhase) * 0.85 * c.flapWeight + glideLift);
        var outerRot = -(Math.sin(c.flapPhase - 0.45) * 0.65 * c.flapWeight);
        for (var w = 0; w < 2; w++) {
          c.wings[w].root.rotation.z = innerRot;
          c.wings[w].fold.rotation.z = outerRot;
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

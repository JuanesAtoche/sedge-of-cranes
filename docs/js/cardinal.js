/* ==========================================================================
 * cardinal.js — a walking origami CARDINAL character · v0.1.0-dev
 * ==========================================================================
 * A SELF-CONTAINED A-Frame component <a-entity walking-cardinal>. It is used
 * ONLY on crane-preview.html (the lab page) — the main AR app never loads it,
 * so nothing about the shipped experience changes.
 *
 * The geometry is baked offline from a Robert Lang origami cardinal .fold by
 * tools/generate_cardinal_from_fold.py into window.CARDINAL_FOLD. This file
 * turns those numbers into a paper-shaded mesh and makes it WALK: the two
 * short legs swing fore-aft in opposite phase while the body bobs, waddles
 * (rolls) and pitches, and the whole bird strolls along a slow circle.
 *
 * It reuses the exact paper look developed for the cranes in flock.js —
 * MeshStandardMaterial (metalness 0, roughness 0.62), flatShading so every
 * facet reads as a folded panel, a slightly darker back face, a procedural
 * environment map for sheen, and a soft radial blob shadow.
 *
 * PUBLIC API (events on the entity), mirroring the flock so the preview's
 * Freeze button just works:
 *   emit('flock-freeze')  / emit('walk-pause')   stop walking, hold the pose
 *   emit('flock-resume')  / emit('walk-resume')  carry on
 *   emit('cardinal-peck')                         a quick head-dip nod
 * ========================================================================== */
(function () {
  'use strict';
  if (typeof AFRAME === 'undefined') { console.error('[cardinal] needs A-Frame'); return; }
  var THREE = AFRAME.THREE;
  window.CARDINAL_VERSION = '0.1.0-dev';

  // ---- small helpers, ported from flock.js so the paper matches ------------

  /* Procedural environment: a tiny equirect gradient (sky above, warm floor
   * bounce below) with one soft bright patch = a window. PMREM pre-blurs it
   * for roughness. Zero download; generated on the phone in ~2 ms. */
  var envRT = null;
  function buildEnvironment(renderer) {
    if (envRT) return envRT.texture;
    if (!renderer || !THREE.PMREMGenerator) return null;
    var W = 128, H = 64, c = document.createElement('canvas');
    c.width = W; c.height = H; var ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0.00, '#eaf3fb'); g.addColorStop(0.45, '#cfe0ee');
    g.addColorStop(0.55, '#e7dcc8'); g.addColorStop(1.00, '#d8c7a8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var s = ctx.createRadialGradient(W * 0.30, H * 0.22, 1, W * 0.30, H * 0.22, H * 0.5);
    s.addColorStop(0, '#fffdf6'); s.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = s; ctx.fillRect(0, 0, W, H);
    var tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    var p = new THREE.PMREMGenerator(renderer);
    p.compileEquirectangularShader();
    envRT = p.fromEquirectangular(tex); p.dispose(); tex.dispose();
    return envRT.texture;
  }

  /* Soft blob shadow texture (radial gradient), drawn once. */
  var shadowTex = null;
  function getShadowTexture() {
    if (shadowTex) return shadowTex;
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(30,22,15,0.42)'); g.addColorStop(1, 'rgba(30,22,15,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    shadowTex = new THREE.CanvasTexture(c); return shadowTex;
  }

  /* Faint paper-grain map (near white). vertexColors supply the cardinal red /
   * black mask / orange beak; this only adds a whisper of fibre variation so
   * flat colour areas don't look like plastic. */
  var grainTex = null;
  function getGrainTexture() {
    if (grainTex) return grainTex;
    var N = 128, c = document.createElement('canvas'); c.width = c.height = N;
    var x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data;
    for (var i = 0; i < N * N; i++) {
      var v = 236 + (Math.random() * 20 - 10);   // 226..246, near white
      d[i*4] = d[i*4+1] = d[i*4+2] = v; d[i*4+3] = 255;
    }
    x.putImageData(img, 0, 0);
    grainTex = new THREE.CanvasTexture(c);
    grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
    return grainTex;
  }

  function makePaperMaterial(opts) {
    var m = new THREE.MeshStandardMaterial({
      map: getGrainTexture(), vertexColors: true, flatShading: true,
      side: THREE.DoubleSide, transparent: true, opacity: 0,
      metalness: 0.0, roughness: opts.roughness, envMapIntensity: opts.envIntensity
    });
    // paper's reverse side is always a touch dimmer — one line of shader inject
    m.onBeforeCompile = function (shader) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  if (!gl_FrontFacing) diffuseColor.rgb *= 0.80;');
    };
    return m;
  }

  function smoothstep(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  // ---- the component -------------------------------------------------------
  AFRAME.registerComponent('walking-cardinal', {
    schema: {
      size:         { default: 0.16 },   // world metres, tail-to-beak length
      speed:        { default: 1.0 },    // overall gait/stroll speed multiplier
      pathRadius:   { default: 0.16 },   // radius of the stroll circle (m)
      swing:        { default: 0.6 },    // leg swing amplitude (radians)
      autoShow:     { default: true },
      pbr:          { default: true },
      roughness:    { default: 0.62 },
      envIntensity: { default: 1.0 }
    },

    init: function () {
      var d = this.data, self = this;
      var C = window.CARDINAL_FOLD;
      if (!C) { console.error('[cardinal] window.CARDINAL_FOLD missing — ' +
        'load js/cardinal_fold_geometry.js before cardinal.js'); return; }

      // --- geometry (writable position attribute for the leg deform) --------
      var geo = new THREE.BufferGeometry();
      this.pos  = new THREE.BufferAttribute(new Float32Array(C.position), 3);
      this.rest = new Float32Array(C.position);              // untouched pose
      geo.setAttribute('position', this.pos);
      geo.setAttribute('uv',    new THREE.BufferAttribute(new Float32Array(C.uv), 2));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(C.color), 3));
      geo.computeVertexNormals();                            // once; flatShading wins
      this.legW = C.legW; this.side = C.legSide;
      this.hipL = C.hipL; this.hipR = C.hipR;

      // --- material + env ---------------------------------------------------
      this.mat = makePaperMaterial(d);
      var renderer = this.el.sceneEl.renderer;
      var env = d.pbr ? buildEnvironment(renderer) : null;
      if (env) this.mat.envMap = env;

      // --- rig: root(stroll) -> body(bob/roll/pitch) -> mesh ----------------
      this.root = new THREE.Group();
      this.body = new THREE.Group();
      this.mesh = new THREE.Mesh(geo, this.mat);
      this.mesh.scale.setScalar(d.size);
      this.body.add(this.mesh);
      this.root.add(this.body);

      // blob shadow: child of root (stays on the ground; never bobs)
      var sMat = new THREE.MeshBasicMaterial({ map: getShadowTexture(),
        transparent: true, depthWrite: false, opacity: 0 });
      this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(d.size * 1.6, d.size * 1.6), sMat);
      this.shadow.rotation.x = -Math.PI / 2;
      this.shadow.position.y = 0.001;
      this.root.add(this.shadow);

      this.el.setObject3D('cardinal', this.root);

      // --- state ------------------------------------------------------------
      this.phase = 0; this.frozen = false; this.shown = false;
      this.fade = 0; this.peck = 0;
      this.targetOpacity = d.autoShow ? 1 : 0;
      if (d.autoShow) this.shown = true;

      // --- events (mirror the flock so the preview Freeze button works) -----
      var pause  = function () { self.frozen = true; };
      var resume = function () { self.frozen = false; };
      this.el.addEventListener('flock-freeze', pause);
      this.el.addEventListener('walk-pause',   pause);
      this.el.addEventListener('flock-resume', resume);
      this.el.addEventListener('walk-resume',  resume);
      this.el.addEventListener('cardinal-peck', function () { self.peck = 1; });
      this.el.addEventListener('flock-show', function () {
        self.shown = true; self.targetOpacity = 1; });
      this.el.addEventListener('flock-hide', function () { self.targetOpacity = 0; });
    },

    tick: function (time, dt) {
      if (!this.root) return;
      var d = this.data, s = (dt || 16) / 1000;

      // fade in/out
      this.fade += (this.targetOpacity - this.fade) * Math.min(1, s * 3);
      this.mat.opacity = this.fade;
      this.shadow.material.opacity = this.fade * 0.9;

      if (this.frozen) return;
      this.phase += s * d.speed;

      // ---- stroll along a slow circle, facing the tangent ------------------
      var a = this.phase * 0.5;                     // how fast we go around
      var R = d.pathRadius;
      this.root.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
      // +X of the mesh is the beak; face the direction of travel (tangent)
      this.root.rotation.y = -a + Math.PI / 2;

      // ---- gait: two steps per stride --------------------------------------
      var step = this.phase * 3.2;                  // stride frequency
      // body bob (2x per stride: up on each footfall)
      this.body.position.y = 0.018 * Math.abs(Math.sin(step)) * d.size / 0.16;
      // waddle: roll side to side, once per stride
      this.body.rotation.z = 0.10 * Math.sin(step);
      // subtle pitch bob + a peck dip if requested
      if (this.peck > 0) this.peck = Math.max(0, this.peck - s * 2.5);
      this.body.rotation.x = 0.04 * Math.sin(step * 2) + this.peck * 0.5;

      // ---- legs: swing fore-aft in opposite phase, lift at the top ---------
      var aL = d.swing * Math.sin(step);
      var aR = d.swing * Math.sin(step + Math.PI);
      var liftL = Math.max(0, Math.sin(step)) * 0.05;   // raise the swinging foot
      var liftR = Math.max(0, Math.sin(step + Math.PI)) * 0.05;
      var pos = this.pos.array, rest = this.rest, W = this.legW, side = this.side;
      var hipL = this.hipL, hipR = this.hipR;
      for (var i = 0; i < W.length; i++) {
        var w = W[i];
        if (w === 0) { pos[i*3] = rest[i*3]; pos[i*3+1] = rest[i*3+1]; pos[i*3+2] = rest[i*3+2]; continue; }
        var left = side[i] > 0;
        var hip = left ? hipL : hipR;
        var ang = (left ? aL : aR) * w;
        var lift = (left ? liftL : liftR) * w;
        // rotate rest position about the hip, around the lateral (Z) axis
        var qx = rest[i*3]     - hip[0];
        var qy = rest[i*3 + 1] - hip[1];
        var c = Math.cos(ang), sn = Math.sin(ang);
        pos[i*3]     = hip[0] + qx * c - qy * sn;
        pos[i*3 + 1] = hip[1] + qx * sn + qy * c + lift;
        pos[i*3 + 2] = rest[i*3 + 2];
      }
      this.pos.needsUpdate = true;   // flatShading re-lights facets in-shader

      // ---- shadow reacts to bob (higher body = larger, softer shadow) ------
      var lift2 = this.body.position.y / (0.018 * d.size / 0.16 + 1e-6);
      var sc = 1 + lift2 * 0.15;
      this.shadow.scale.set(sc, sc, sc);
    },

    remove: function () {
      if (this.root) this.el.removeObject3D('cardinal');
    }
  });
})();

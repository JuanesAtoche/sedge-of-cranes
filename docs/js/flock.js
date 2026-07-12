/**
 * flock.js — the crane flock, in two A-Frame components.
 *
 *  paper-crane : builds ONE origami crane out of ~30 triangles (no .glb
 *                download — zero bytes, license is ours, and the wings are
 *                separate meshes so they can flap).
 *  flock       : creates 7 paper-cranes in a V (sedge) formation, orbits
 *                them around the mat center, bobs them, flaps their wings,
 *                fades them in on first tracking, and freezes everything
 *                the instant tracking is lost.
 *
 * Coordinate system (MindAR target space): mat width = 1 unit,
 * x → right, y → top of the mat, z → up out of the paper.
 * The mat is 29.7 cm wide, so 1 cm ≈ 0.034 units.
 */

/* ============================ paper-crane ============================ */

AFRAME.registerComponent("paper-crane", {
  schema: {
    color:     { default: "#f7f3ea" },
    size:      { default: 1 },     // 1 → ≈ 8 cm wingspan on the mat
    flapFreq:  { default: 2.5 },   // flaps per second
    flapPhase: { default: 0 },
    flapAmp:   { default: 38 },    // degrees
  },

  init() {
    const D = this.data;
    const paper = new THREE.MeshLambertMaterial({
      color: D.color, side: THREE.DoubleSide,
      flatShading: true, transparent: true, opacity: 1,
    });
    const ink = new THREE.MeshLambertMaterial({
      color: "#24435c", side: THREE.DoubleSide, transparent: true, opacity: 1,
    });
    this.materials = [paper, ink];

    // helper: triangle list → mesh
    const mesh = (tris, material) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position",
        new THREE.BufferAttribute(new Float32Array(tris.flat(2)), 3));
      g.computeVertexNormals();
      return new THREE.Mesh(g, material);
    };

    // ---- body: flattened paper diamond with a keel underneath ----
    const nose = [0, 0.50, 0.00], tail = [0, -0.50, 0.06];
    const L = [-0.07, 0, 0.02], R = [0.07, 0, 0.02], keel = [0, -0.02, -0.10];
    const body = mesh([
      [nose, R, tail], [nose, tail, L],          // top faces
      [nose, keel, R], [nose, L, keel],          // bottom front
      [tail, R, keel], [tail, keel, L],          // bottom back
      // neck (thin triangle rising to the head)
      [[-0.018, 0.48, 0.02], [0.018, 0.48, 0.02], [0, 0.80, 0.24]],
      // tail fin
      [[-0.018, -0.48, 0.06], [0.018, -0.48, 0.06], [0, -0.78, 0.26]],
    ], paper);

    // ---- beak: tiny ink triangle at the head tip ----
    const beak = mesh([
      [[-0.012, 0.79, 0.23], [0.012, 0.79, 0.23], [0, 0.90, 0.20]],
    ], ink);

    // ---- wings: separate meshes on pivots at the body edge ----
    const wing = (side) => {
      const w = mesh([
        [[0, 0.22, 0], [0, -0.12, 0], [side * 0.95, -0.08, 0.03]],
      ], paper);
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.06, 0.05, 0.02);
      pivot.add(w);
      return pivot;
    };
    this.wingL = wing(-1);
    this.wingR = wing(1);

    const model = new THREE.Group();
    model.add(body, beak, this.wingL, this.wingR);
    const s = 0.14 * D.size;   // 0.14 → ≈ 8 cm wingspan (spec: 8–12 cm)
    model.scale.set(s, s, s);
    this.el.setObject3D("mesh", model);
  },

  /** Called every frame by the flock. t = ms. */
  flap(t) {
    const D = this.data;
    const a = THREE.MathUtils.degToRad(D.flapAmp) *
              Math.sin(2 * Math.PI * D.flapFreq * t / 1000 + D.flapPhase);
    this.wingL.rotation.y = a;
    this.wingR.rotation.y = -a;
  },

  setOpacity(o) {
    this.materials.forEach((m) => { m.opacity = o; });
  },
});

/* =============================== flock =============================== */

AFRAME.registerComponent("flock", {
  schema: {
    orbitSeconds: { default: 20 },    // one full orbit of the mat (spec)
    height:       { default: 0.30 },  // flight height above the mat
    orbitRadius:  { default: 0.28 },  // distance of the V apex from center
    bobAmp:       { default: 0.067 }, // ±2 cm vertical bobbing (spec)
    bobSeconds:   { default: 3 },
    fadeSeconds:  { default: 1.5 },
  },

  init() {
    this.paused = true;      // frozen until the mat is found
    this.everFound = false;
    this.fadeStart = null;
    this.cranes = [];

    // V formation, local coords: +y = direction of flight, x = lateral.
    // Lead crane at the apex: bigger, red — the story's protagonist.
    const V = [
      { x:  0.00, y:  0.00, z:  0.00, size: 1.25, color: "#d34a3e" },
      { x: -0.09, y: -0.13, z: -0.02, size: 1.00, color: "#f7f3ea" },
      { x:  0.09, y: -0.13, z: -0.02, size: 1.00, color: "#dbe9f2" },
      { x: -0.16, y: -0.26, z: -0.04, size: 0.95, color: "#f6dbd8" },
      { x:  0.16, y: -0.26, z: -0.04, size: 0.95, color: "#fbf0d4" },
      { x: -0.22, y: -0.39, z: -0.06, size: 0.90, color: "#dcead9" },
      { x:  0.22, y: -0.39, z: -0.06, size: 0.90, color: "#f7f3ea" },
    ];

    // pivot rotates around the mat center → the whole V orbits
    this.pivot = document.createElement("a-entity");
    this.el.appendChild(this.pivot);

    // formation sits out on the orbit circle, heading along +y
    this.formation = document.createElement("a-entity");
    this.formation.object3D.position.set(this.data.orbitRadius, 0, this.data.height);
    this.pivot.appendChild(this.formation);

    V.forEach((p, i) => {
      const e = document.createElement("a-entity");
      e.setAttribute("paper-crane", {
        color: p.color,
        size: p.size,
        // each crane flaps at its own rhythm (±15%, spec) and phase
        flapFreq: 2.5 * (1 + 0.15 * Math.sin(i * 2.399)),
        flapPhase: i * 1.7,
      });
      e.object3D.position.set(p.x, p.y, p.z);
      this.formation.appendChild(e);
      this.cranes.push({ el: e, base: p, bobPhase: i * 1.3 });
    });

    // start invisible; fade in on the FIRST targetFound (spec: ~1.5 s)
    this.el.addEventListener("loaded", () => this.setOpacity(0), { once: true });

    // tracking events fire on the parent mindar-image-target entity
    const anchor = this.el.parentEl;
    anchor.addEventListener("targetFound", () => {
      this.paused = false;
      if (!this.everFound) { this.everFound = true; this.fadePending = true; }
    });
    anchor.addEventListener("targetLost", () => { this.paused = true; });
  },

  setOpacity(o) {
    this.cranes.forEach((c) => {
      const pc = c.el.components["paper-crane"];
      if (pc) pc.setOpacity(o);
    });
  },

  tick(t) {
    if (this.paused) return;   // freezes orbit, bob, flap ≤ one frame (spec: 300 ms)

    if (this.fadePending) { this.fadePending = false; this.fadeStart = t; }
    if (this.fadeStart !== null) {
      const k = Math.min(1, (t - this.fadeStart) / (this.data.fadeSeconds * 1000));
      this.setOpacity(k);
      if (k >= 1) this.fadeStart = null;
    }

    // orbit: one revolution per orbitSeconds
    this.pivot.object3D.rotation.z = (2 * Math.PI * t) / (this.data.orbitSeconds * 1000);

    // per-crane bob + flap
    this.cranes.forEach((c) => {
      c.el.object3D.position.z = c.base.z +
        this.data.bobAmp * Math.sin((2 * Math.PI * t) / (this.data.bobSeconds * 1000) + c.bobPhase);
      const pc = c.el.components["paper-crane"];
      if (pc) pc.flap(t);
    });
  },
});

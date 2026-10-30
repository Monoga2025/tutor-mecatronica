import * as THREE from 'three';

export interface MouseAnimInput {
  speed: number;      // velocidad horizontal (m/s), con signo hacia adelante
  turn: number;       // -1..1
  grounded: boolean;
  vy: number;
}

const TAIL_SEGMENTS = 9;

export class MouseModel {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly ears: THREE.Object3D[] = [];
  private readonly legs: THREE.Object3D[] = [];
  private readonly tail: THREE.Object3D[] = [];
  private phase = 0;
  private t = 0;
  private squash = 0;
  private wasGrounded = true;
  private lastVy = 0;
  private lean = 0;
  private walkBlend = 0;

  constructor() {
    const fur = new THREE.MeshStandardMaterial({ color: 0xb9a89a, roughness: 0.85 });
    const belly = new THREE.MeshStandardMaterial({ color: 0xf1e6da, roughness: 0.9 });
    const pink = new THREE.MeshStandardMaterial({ color: 0xf2a0ae, roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d1a1f, roughness: 0.25 });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const hat = new THREE.MeshStandardMaterial({ color: 0xf6c33b, roughness: 0.45 });
    const whisker = new THREE.MeshBasicMaterial({ color: 0x3a3236 });

    const sph = (r: number, ws = 20, hs = 14): THREE.SphereGeometry => new THREE.SphereGeometry(r, ws, hs);
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh => {
      const o = new THREE.Mesh(g, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      parent.add(o);
      return o;
    };

    this.root.add(this.body);
    this.body.position.y = 0.42;
    const torso = mesh(sph(0.36), fur, this.body);
    torso.scale.set(0.85, 0.82, 1.12);
    const bel = mesh(sph(0.3), belly, this.body, 0, -0.05, 0.12);
    bel.scale.set(0.72, 0.7, 0.9);

    this.head.position.set(0, 0.24, 0.3);
    this.body.add(this.head);
    mesh(sph(0.25), fur, this.head);
    const snout = mesh(sph(0.15), fur, this.head, 0, -0.04, 0.2);
    snout.scale.set(0.8, 0.72, 1.25);
    mesh(sph(0.05, 12, 8), pink, this.head, 0, -0.02, 0.38);
    for (const s of [-1, 1]) {
      const eye = mesh(sph(0.045, 12, 8), dark, this.head, s * 0.1, 0.06, 0.2);
      mesh(sph(0.015, 8, 6), white, eye, s * 0.012, 0.018, 0.035).castShadow = false;
      const ear = new THREE.Group();
      ear.position.set(s * 0.17, 0.2, -0.02);
      ear.rotation.z = -s * 0.35;
      this.head.add(ear);
      const outer = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 24), fur, ear, 0, 0.1, 0);
      outer.rotation.x = Math.PI / 2;
      const inner = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 20), pink, ear, 0, 0.1, 0.022);
      inner.rotation.x = Math.PI / 2;
      this.ears.push(ear);
      for (let k = 0; k < 3; k++) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.24, 4), whisker);
        w.position.set(s * 0.15, -0.05 + (k - 1) * 0.025, 0.3);
        w.rotation.z = Math.PI / 2 + s * (k - 1) * 0.18;
        w.rotation.y = -s * 0.25;
        this.head.add(w);
      }
    }
    // casco de ingeniero
    const helmet = new THREE.Group();
    helmet.position.set(0, 0.16, -0.03);
    helmet.rotation.x = -0.15;
    this.head.add(helmet);
    mesh(new THREE.SphereGeometry(0.15, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), hat, helmet);
    mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.025, 24), hat, helmet, 0, 0.005, 0.02);
    mesh(new THREE.BoxGeometry(0.03, 0.03, 0.3), hat, helmet, 0, 0.14, 0);

    const legGeo = new THREE.CapsuleGeometry(0.055, 0.14, 4, 10);
    const footGeo = sph(0.065, 12, 8);
    const hips: [number, number, number][] = [[-0.17, -0.2, 0.2], [0.17, -0.2, 0.2], [-0.19, -0.2, -0.22], [0.19, -0.2, -0.22]];
    for (const [x, y, z] of hips) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      this.body.add(pivot);
      mesh(legGeo, fur, pivot, 0, -0.1, 0);
      const foot = mesh(footGeo, pink, pivot, 0, -0.19, 0.03);
      foot.scale.set(0.9, 0.45, 1.3);
      this.legs.push(pivot);
    }

    let parent: THREE.Object3D = this.body;
    const seg = 0.1;
    for (let i = 0; i < TAIL_SEGMENTS; i++) {
      const j = new THREE.Group();
      j.position.set(0, i === 0 ? -0.1 : 0, i === 0 ? -0.38 : -seg);
      parent.add(j);
      const r = 0.035 * (1 - i / (TAIL_SEGMENTS + 2));
      const c = mesh(new THREE.CylinderGeometry(r * 0.85, r, seg + 0.01, 8), pink, j, 0, 0, -seg / 2);
      c.rotation.x = Math.PI / 2;
      this.tail.push(j);
      parent = j;
    }
  }

  update(dt: number, a: MouseAnimInput): void {
    this.t += dt;
    const t = this.t;
    const sp = Math.abs(a.speed);
    const target = a.grounded ? Math.min(sp / 3, 1) : 0;
    this.walkBlend += (target - this.walkBlend) * (1 - Math.exp(-10 * dt));
    const w = this.walkBlend;
    this.phase += dt * (4 + sp * 2.6) * Math.sign(a.speed || 1);

    if (a.grounded && !this.wasGrounded) this.squash = Math.min(0.28, Math.max(0.06, -this.lastVy * 0.03));
    this.wasGrounded = a.grounded;
    this.lastVy = a.vy;
    this.squash *= Math.exp(-9 * dt);

    const stretch = a.grounded ? 0 : THREE.MathUtils.clamp(a.vy * 0.025, -0.1, 0.14);
    const breathe = 0.015 * Math.sin(t * 2.2) * (1 - w);
    const sy = 1 + stretch + breathe - this.squash;
    const sxz = 1 - stretch * 0.5 + this.squash * 0.6;
    this.body.scale.set(sxz, sy, sxz);
    const bob = Math.abs(Math.sin(this.phase)) * 0.045 * w;
    this.body.position.y = 0.42 * sy + bob;

    this.lean += (-a.turn * Math.min(sp, 3) * 0.06 - this.lean) * (1 - Math.exp(-6 * dt));
    this.body.rotation.z = this.lean;
    this.body.rotation.x = a.grounded ? 0.08 * w * Math.sign(a.speed) : THREE.MathUtils.clamp(-a.vy * 0.04, -0.25, 0.25);

    const idle = 1 - w;
    this.head.rotation.y = idle * 0.35 * Math.sin(t * 0.7) * Math.sin(t * 0.23) + a.turn * 0.25;
    this.head.rotation.x = idle * 0.08 * Math.sin(t * 0.9) - 0.04 * w;
    const twitch = Math.max(0, Math.sin(t * 1.3) ** 24);
    this.ears.forEach((e, i) => {
      const s = i === 0 ? -1 : 1;
      e.rotation.z = -s * (0.35 + 0.18 * twitch * (i === 0 ? 1 : 0.4)) + s * 0.05 * w * Math.sin(this.phase * 2);
    });

    const amp = 0.75 * w;
    const air = a.grounded ? 0 : 1;
    this.legs.forEach((l, i) => {
      const diag = i === 0 || i === 3 ? 0 : Math.PI;
      const front = i < 2 ? 1 : -1;
      l.rotation.x = Math.sin(this.phase + diag) * amp * (1 - air) + air * front * -0.6;
    });

    const wag = 2.4 + sp * 1.5;
    this.tail.forEach((s, i) => {
      s.rotation.x = i === 0 ? -0.55 + air * 0.3 : 0.12 + 0.02 * (1 - w) - air * 0.05;
      s.rotation.y = Math.sin(t * wag - i * 0.55) * (0.12 + 0.04 * i * 0.3);
    });
  }
}

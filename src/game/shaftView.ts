import * as THREE from 'three';

/** Paradas del mapa de color de τ (0 = sin esfuerzo, 1 = fondo de escala). Compartidas con la leyenda HTML. */
export const STRESS_STOPS: [number, string][] = [
  [0, '#2c5fd6'], [0.3, '#22b8c9'], [0.55, '#4cc35a'], [0.75, '#f2d03b'], [0.9, '#f08a24'], [1, '#d62f2f'],
];
const STOP_COLORS = STRESS_STOPS.map(([t, c]) => [t, new THREE.Color(c)] as const);

export function stressColor(t: number, out = new THREE.Color()): THREE.Color {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < STOP_COLORS.length; i++) {
    const [t1, c1] = STOP_COLORS[i]!;
    const [t0, c0] = STOP_COLORS[i - 1]!;
    if (x <= t1) return out.copy(c0).lerp(c1, (x - t0) / (t1 - t0));
  }
  return out.copy(STOP_COLORS.at(-1)![1]);
}

type Boundary = (theta: number) => number;
const HANDLE_LEN = 0.95;
const NT = 64, NL = 48, NR = 6;

interface DeformMesh { mesh: THREE.Mesh; base: Float32Array; nbase: Float32Array }

/** Trozo de eje entre dos fronteras x = b(θ) (planas o en hélice). Se tuerce girando cada sección α(x). */
class Piece {
  readonly group = new THREE.Group();
  readonly meshes: DeformMesh[] = [];
  phi = 0; // giro dibujado en x = Lv (rad), lineal en x
  endCap: THREE.Mesh | null = null;
  endCapRho: Float32Array | null = null;

  constructor(readonly Lv: number, readonly rv: number, b0: Boundary, b1: Boundary, mats: {
    lateral: THREE.Material; cap: THREE.Material; fracture: THREE.Material; disc: THREE.Material;
  }, opts: { startFracture: boolean; endFracture: boolean; endDisc: boolean; helix: boolean; seed: number }) {
    this.add(this.lateral(b0, b1), mats.lateral);
    const rnd = mulberry(opts.seed);
    const c0 = this.cap(b0, -1, opts.startFracture ? rnd : null);
    this.add(c0.geo, opts.startFracture ? mats.fracture : mats.cap);
    const c1 = this.cap(b1, 1, opts.endFracture ? rnd : null);
    const m1 = this.add(c1.geo, opts.endDisc ? mats.disc : opts.endFracture ? mats.fracture : mats.cap);
    if (opts.endDisc) { this.endCap = m1; this.endCapRho = c1.rho; }
    if (opts.helix && opts.startFracture) this.add(this.seam(b0), mats.fracture);
    if (opts.helix && opts.endFracture) this.add(this.seam(b1), mats.fracture);
  }

  private add(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    const base = (geo.attributes.position!.array as Float32Array).slice();
    const nbase = (geo.attributes.normal!.array as Float32Array).slice();
    this.meshes.push({ mesh, base, nbase });
    return mesh;
  }

  private lateral(b0: Boundary, b1: Boundary): THREE.BufferGeometry {
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= NT; j++) {
      const th = -Math.PI + (2 * Math.PI * j) / NT;
      const x0 = b0(th), x1 = b1(th);
      for (let i = 0; i <= NL; i++) {
        const x = x0 + ((x1 - x0) * i) / NL;
        pos.push(x, this.rv * Math.cos(th), this.rv * Math.sin(th));
        nor.push(0, Math.cos(th), Math.sin(th));
        uv.push(x / this.Lv, j / NT);
      }
    }
    for (let j = 0; j < NT; j++) for (let i = 0; i < NL; i++) {
      const a = j * (NL + 1) + i, b = a + NL + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    return geom(pos, nor, idx, uv);
  }

  /** Tapa radial en x = b(θ); dir = +1 mira a +x. Con rnd, superficie de fractura rugosa. */
  private cap(b: Boundary, dir: 1 | -1, rnd: (() => number) | null): { geo: THREE.BufferGeometry; rho: Float32Array } {
    const pos: number[] = [], nor: number[] = [], idx: number[] = [], rho: number[] = [];
    for (let j = 0; j <= NT; j++) {
      const th = -Math.PI + (2 * Math.PI * j) / NT;
      for (let k = 0; k <= NR; k++) {
        const r = (this.rv * k) / NR;
        const jit = rnd && k > 0 && k < NR && j > 0 && j < NT ? (rnd() - 0.5) * this.rv * 0.18 : 0;
        pos.push(b(th) + jit, r * Math.cos(th), r * Math.sin(th));
        nor.push(dir, 0, 0);
        rho.push(r / this.rv);
      }
    }
    for (let j = 0; j < NT; j++) for (let k = 0; k < NR; k++) {
      const a = j * (NR + 1) + k, c = a + NR + 1;
      if (dir > 0) idx.push(a, c, a + 1, c, c + 1, a + 1);
      else idx.push(a, a + 1, c, c, a + 1, c + 1);
    }
    const g = geom(pos, nor, idx);
    if (rnd) g.computeVertexNormals();
    return { geo: g, rho: new Float32Array(rho) };
  }

  /** Escalón axial de la hélice en θ = ±π. */
  private seam(b: Boundary): THREE.BufferGeometry {
    const xa = b(-Math.PI), xb = b(Math.PI);
    const pos: number[] = [], nor: number[] = [], idx: number[] = [];
    for (let k = 0; k <= NR; k++) {
      const r = (this.rv * k) / NR;
      pos.push(xa, -r, 0, xb, -r, 0);
      nor.push(0, 0, 1, 0, 0, 1);
    }
    for (let k = 0; k < NR; k++) { const a = 2 * k; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    return geom(pos, nor, idx);
  }

  /** Aplica la torsión: cada sección x gira α(x) = phi·x/Lv alrededor del eje. */
  deform(): void {
    const k = this.phi / this.Lv;
    for (const { mesh, base, nbase } of this.meshes) {
      const p = mesh.geometry.attributes.position!.array as Float32Array;
      const n = mesh.geometry.attributes.normal!.array as Float32Array;
      for (let i = 0; i < base.length; i += 3) {
        const a = k * base[i]!, c = Math.cos(a), s = Math.sin(a);
        const y = base[i + 1]!, z = base[i + 2]!;
        p[i] = base[i]!; p[i + 1] = y * c - z * s; p[i + 2] = y * s + z * c;
        const ny = nbase[i + 1]!, nz = nbase[i + 2]!;
        n[i] = nbase[i]!; n[i + 1] = ny * c - nz * s; n[i + 2] = ny * s + nz * c;
      }
      mesh.geometry.attributes.position!.needsUpdate = true;
      mesh.geometry.attributes.normal!.needsUpdate = true;
      mesh.geometry.computeBoundingSphere();
    }
  }

  dispose(): void {
    for (const { mesh } of this.meshes) mesh.geometry.dispose();
    this.group.removeFromParent();
  }
}

function geom(pos: number[], nor: number[], idx: number[], uv?: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function mulberry(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rejilla dibujada sobre la superficie: las generatrices se vuelven hélices al torcer. */
function gridTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#b9c0c8'); grd.addColorStop(0.5, '#e4e8ec'); grd.addColorStop(1, '#b9c0c8');
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = 'rgba(40,52,70,.75)';
  for (let k = 0; k < 8; k++) g.fillRect(0, (k * 256) / 8 - 2, 1024, 4);
  g.fillStyle = 'rgba(40,52,70,.35)';
  for (let k = 1; k < 12; k++) g.fillRect((k * 1024) / 12 - 1, 0, 2, 256);
  g.fillStyle = 'rgba(200,40,40,.9)';
  g.fillRect(0, 128 - 4, 1024, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export interface ShaftMetrics {
  phiDibujado: number;
  anguloMedido: number;
  roto: boolean;
  fractura: 'ductil' | 'fragil' | null;
  ghostScale: number | null;
  ghostScaleDibujado: number | null;
  surplusScale: number | null;
  neededScale: number | null;
  amber: boolean;
  vibAmp: number;
}

/**
 * Eje empotrado en x = 0 que llega a x = Lv, con disco de esfuerzos en el extremo, llave y flecha de torque.
 * Todo en coordenadas locales del grupo (eje a lo largo de +x).
 */
export class ShaftView {
  readonly group = new THREE.Group();
  Lv: number;
  rv: number;
  private readonly Lv0: number;
  private readonly rv0: number;
  private readonly ring: THREE.Mesh;
  private readonly handle: THREE.Mesh;
  readonly gripMesh: THREE.Mesh;
  readonly asaL: THREE.Mesh;
  readonly asaC: THREE.Mesh;
  private readonly hiMats = new Map<string, THREE.MeshStandardMaterial[]>();
  private pieces: Piece[] = [];
  private readonly mats;
  private readonly gridTex = gridTexture();
  readonly wrench = new THREE.Group();
  readonly wrenchGrip = new THREE.Object3D();
  private readonly arrow = new THREE.Group();
  private readonly arrowMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.9 });
  private readonly ghost: THREE.Mesh;
  private readonly surplus: THREE.Mesh;
  private readonly core: THREE.Mesh;
  private readonly tmpColor = new THREE.Color();
  private broken: { fractura: 'ductil' | 'fragil'; t: number; phi0: number; spin: number } | null = null;
  private amberOn = false;
  private vib = 0;
  private t = 0;
  private stressFrac = 0;
  private ghostS: number | null = null;
  private surplusS: number | null = null;
  private neededS: number | null = null;
  phiDrawn = 0;
  /** Fracción del fondo de escala de τ en la superficie (para el mapa de color). */
  get stress(): number { return this.stressFrac; }

  constructor(Lv: number, rv: number) {
    this.Lv = this.Lv0 = Lv;
    this.rv = this.rv0 = rv;
    this.mats = {
      lateral: new THREE.MeshStandardMaterial({ map: this.gridTex, metalness: 0.55, roughness: 0.38, transparent: true, opacity: 1 }),
      cap: new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.6, roughness: 0.35 }),
      fracture: new THREE.MeshStandardMaterial({ color: 0x7d858e, metalness: 0.3, roughness: 0.95, side: THREE.DoubleSide }),
      disc: new THREE.MeshBasicMaterial({ vertexColors: true }),
    };
    this.build();

    const steel = new THREE.MeshStandardMaterial({ color: 0x5b6b7c, metalness: 0.6, roughness: 0.4 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0xd8452f, roughness: 0.6 });
    const ring = this.ring = new THREE.Mesh(new THREE.TorusGeometry(rv * 1.25, rv * 0.28, 10, 32), steel);
    ring.rotation.y = Math.PI / 2;
    const handle = this.handle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, HANDLE_LEN), steel);
    const grip = this.gripMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 16), gripMat);
    grip.rotation.x = Math.PI / 2;
    grip.name = 'llave';
    handle.userData.kind = grip.userData.kind = 'llave';
    for (const m of [ring, handle, grip]) { m.castShadow = true; this.wrench.add(m); }
    this.wrench.add(this.wrenchGrip);
    this.group.add(this.wrench);
    this.hiMats.set('llave', [gripMat, steel]);

    const asaLMat = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5 });
    this.asaL = new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 12), asaLMat);
    this.asaL.userData.kind = 'asaL';
    const asaCMat = new THREE.MeshStandardMaterial({ color: 0x35b6c8, roughness: 0.5 });
    this.asaC = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 10, 40), asaCMat);
    this.asaC.rotation.y = Math.PI / 2;
    this.asaC.userData.kind = 'asaC';
    this.asaL.visible = this.asaC.visible = false;
    this.group.add(this.asaL, this.asaC);
    this.hiMats.set('asaL', [asaLMat]);
    this.hiMats.set('asaC', [asaCMat]);

    const R = rv * 2.3;
    const arc = new THREE.Mesh(new THREE.TorusGeometry(R, 0.022, 8, 48, Math.PI * 1.4), this.arrowMat);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 16), this.arrowMat);
    cone.position.set(R * Math.cos(Math.PI * 1.4), R * Math.sin(Math.PI * 1.4), 0);
    cone.rotation.z = Math.PI * 1.4;
    this.arrow.add(arc, cone);
    this.arrow.rotation.y = Math.PI / 2;
    this.arrow.visible = false;
    this.group.add(this.arrow);

    const cyl = (mat: THREE.Material): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rv, rv, Lv, 48, 1, false), mat);
      m.geometry.rotateZ(-Math.PI / 2);
      m.geometry.translate(Lv / 2, 0, 0);
      m.visible = false;
      this.group.add(m);
      return m;
    };
    this.ghost = cyl(new THREE.MeshStandardMaterial({ color: 0x4aa3ff, transparent: true, opacity: 0.22, depthWrite: false, roughness: 0.4 }));
    this.ghost.renderOrder = 5;
    this.surplus = cyl(new THREE.MeshStandardMaterial({ color: 0xffa23a, transparent: true, opacity: 0.35, depthWrite: false, roughness: 0.5 }));
    this.surplus.renderOrder = 4;
    this.core = cyl(new THREE.MeshStandardMaterial({ color: 0x5fb46a, metalness: 0.3, roughness: 0.5 }));
    this.placeParts();
    this.setStress(0);
  }

  /** Coloca llave, flecha, asas y fantasmas según Lv y rv actuales. */
  private placeParts(): void {
    const { Lv, rv } = this;
    const k = rv / this.rv0;
    const ringR = rv * 1.25;
    this.ring.scale.setScalar(k);
    this.handle.position.set(0, 0, ringR + HANDLE_LEN / 2);
    this.gripMesh.position.set(0, 0, ringR + HANDLE_LEN - 0.12);
    this.wrenchGrip.position.copy(this.gripMesh.position);
    this.wrench.position.x = Lv - rv * 0.5;
    this.arrow.position.x = Lv + 0.18;
    this.arrow.scale.setScalar((0.6 + 0.4 * Math.min(1, this.stressFrac)) * k);
    this.asaL.position.set(Lv + 0.42, 0, 0);
    this.asaC.position.set(Lv * 0.5, 0, 0);
    this.asaC.scale.setScalar(rv * 1.7);
    for (const [m, s] of [[this.ghost, this.ghostS], [this.surplus, this.surplusS], [this.core, this.neededS]] as const) {
      const r = (s === null ? 1 : clampScale(s)) * k;
      m.scale.set(Lv / this.Lv0, r, r);
    }
  }

  /** Cambia longitud y radio dibujados (modo explorar). */
  setDims(Lv: number, rv: number): void {
    if (Math.abs(Lv - this.Lv) < 1e-9 && Math.abs(rv - this.rv) < 1e-9) return;
    this.Lv = Lv;
    this.rv = rv;
    this.build();
    this.placeParts();
  }

  get dims0(): { Lv: number; rv: number } { return { Lv: this.Lv0, rv: this.rv0 }; }

  setAsas(on: boolean): void { this.asaL.visible = this.asaC.visible = on; }

  /** Objetos que el brazo puede agarrar (userData.kind). */
  interactivos(): THREE.Object3D[] {
    return [this.gripMesh, this.handle, ...(this.asaL.visible ? [this.asaL, this.asaC] : [])];
  }

  highlight(kind: string | null): void {
    for (const [k, mats] of this.hiMats) for (const m of mats) m.emissive.setHex(k === kind ? 0x5a3a00 : 0);
  }

  private build(fractura: 'ductil' | 'fragil' | null = null, xf = 0): void {
    for (const p of this.pieces) p.dispose();
    this.pieces = [];
    const Lv = this.Lv, rv = this.rv;
    if (!fractura) {
      const p = new Piece(Lv, rv, () => 0, () => Lv, this.mats, { startFracture: false, endFracture: false, endDisc: true, helix: false, seed: 1 });
      this.pieces.push(p);
    } else {
      // Dúctil: plano perpendicular al eje. Frágil: hélice a 45° (avance axial = rv·θ).
      const b: Boundary = fractura === 'ductil' ? () => xf : (th) => xf + rv * th;
      const helix = fractura === 'fragil';
      this.pieces.push(new Piece(Lv, rv, () => 0, b, this.mats, { startFracture: false, endFracture: true, endDisc: false, helix, seed: 7 }));
      this.pieces.push(new Piece(Lv, rv, b, () => Lv, this.mats, { startFracture: true, endFracture: false, endDisc: true, helix, seed: 9 }));
    }
    for (const p of this.pieces) this.group.add(p.group);
    this.applyTwist();
    this.paintDisc();
  }

  get free(): Piece { return this.pieces.at(-1)!; }

  setTwist(phiDrawn: number): void {
    this.phiDrawn = phiDrawn;
    if (!this.broken) this.applyTwist();
  }

  private applyTwist(): void {
    for (const p of this.pieces) { p.phi = this.broken ? p.phi : this.phiDrawn; p.deform(); }
    this.syncEnd();
  }

  /** La llave y la flecha siguen al extremo libre. */
  private syncEnd(): void {
    const fp = this.free;
    const a = this.broken ? fp.group.rotation.x : this.phiDrawn;
    this.wrench.rotation.x = a;
    this.wrench.position.y = fp.group.position.y;
    this.wrench.position.z = fp.group.position.z;
  }

  /** τ en la superficie como fracción del fondo de escala. */
  setStress(frac: number): void {
    this.stressFrac = frac;
    this.paintDisc();
    this.arrow.visible = frac > 0.002 && !this.broken;
    this.arrow.scale.setScalar((0.6 + 0.4 * Math.min(1, frac)) * (this.rv / this.rv0));
  }

  private paintDisc(): void {
    const p = this.free;
    if (!p.endCap || !p.endCapRho) return;
    const g = p.endCap.geometry;
    let col = g.attributes.color as THREE.BufferAttribute | undefined;
    if (!col) { col = new THREE.Float32BufferAttribute(new Float32Array(p.endCapRho.length * 3), 3); g.setAttribute('color', col); }
    const arr = col.array as Float32Array;
    const f = this.broken ? 0 : this.stressFrac;
    for (let i = 0; i < p.endCapRho.length; i++) {
      stressColor(f * p.endCapRho[i]!, this.tmpColor);
      arr[3 * i] = this.tmpColor.r; arr[3 * i + 1] = this.tmpColor.g; arr[3 * i + 2] = this.tmpColor.b;
    }
    col.needsUpdate = true;
  }

  breakNow(fractura: 'ductil' | 'fragil', xfFrac = 0.42): void {
    if (this.broken) return;
    const phi0 = this.phiDrawn;
    this.broken = { fractura, t: 0, phi0, spin: phi0 * 0.6 };
    this.build(fractura, this.Lv * xfFrac);
    for (const p of this.pieces) { p.phi = phi0; p.deform(); }
    this.arrow.visible = false;
    this.paintDisc();
  }

  setAmber(on: boolean): void { this.amberOn = on; if (!on) (this.mats.lateral as THREE.MeshStandardMaterial).emissive.setHex(0); }
  setVibration(a: number): void { this.vib = a; }

  setGhost(scale: number | null): void {
    this.ghostS = scale;
    this.ghost.visible = scale !== null;
    this.placeParts();
  }

  setSurplus(scale: number | null): void {
    this.surplusS = scale;
    this.surplus.visible = scale !== null;
    this.placeParts();
  }

  /** Núcleo que bastaba; el resto del eje se vuelve translúcido (material de sobra). */
  setNeeded(scale: number | null): void {
    this.neededS = scale;
    this.core.visible = scale !== null;
    const lat = this.mats.lateral as THREE.MeshStandardMaterial;
    lat.opacity = scale === null ? 1 : 0.4;
    lat.depthWrite = scale === null;
    this.placeParts();
  }

  update(dt: number): void {
    this.t += dt;
    const lat = this.mats.lateral as THREE.MeshStandardMaterial;
    if (this.amberOn) lat.emissive.setRGB(0.55, 0.32, 0).multiplyScalar(0.5 + 0.5 * Math.sin(this.t * 9));
    const v = this.vib * Math.sin(this.t * 2 * Math.PI * 14);
    this.group.position.z = v;
    if (this.broken) {
      const b = this.broken;
      b.t += dt;
      const [fixed, free] = this.pieces as [Piece, Piece];
      // retroceso elástico amortiguado del trozo fijo
      fixed.phi = b.phi0 * Math.exp(-6 * b.t) * Math.cos(18 * b.t);
      fixed.deform();
      // el trozo libre se destuerce, gira por inercia y cae al suelo
      free.phi = b.phi0 * Math.exp(-6 * b.t) * Math.cos(18 * b.t);
      free.deform();
      free.group.rotation.x = b.phi0 + b.spin * (1 - Math.exp(-2.5 * b.t));
      const drop = Math.min(this.fallDepth, 0.5 * 9.81 * Math.max(0, b.t - 0.12) ** 2);
      free.group.position.y = -drop;
      free.group.position.z = Math.min(0.25, drop * 0.3);
      this.syncEnd();
    }
  }

  /** Distancia hasta el suelo (la pone la escena). */
  fallDepth = 0.8;

  /** Punto de agarre de la llave en coordenadas de mundo. */
  gripWorld(out = new THREE.Vector3()): THREE.Vector3 { return this.wrenchGrip.getWorldPosition(out); }

  /** Ángulo real de la generatriz θ=0 en el extremo libre, leído de los vértices. */
  measuredEndAngle(): number {
    const p = this.free;
    const m = p.meshes[0]!;
    const pos = m.mesh.geometry.attributes.position!.array as Float32Array;
    // columna j = NT/2 (θ = 0), fila i = NL (x = b1)
    const i = ((NT / 2) * (NL + 1) + NL) * 3;
    return Math.atan2(pos[i + 2]!, pos[i + 1]!) + (this.broken ? p.group.rotation.x : 0);
  }

  metrics(): ShaftMetrics {
    return {
      phiDibujado: this.phiDrawn,
      anguloMedido: this.measuredEndAngle(),
      roto: !!this.broken,
      fractura: this.broken?.fractura ?? null,
      ghostScale: this.ghostS,
      ghostScaleDibujado: this.ghostS === null ? null : clampScale(this.ghostS),
      surplusScale: this.surplusS,
      neededScale: this.neededS,
      amber: this.amberOn,
      vibAmp: this.vib,
    };
  }

  reset(): void {
    this.broken = null;
    this.build();
    this.setAmber(false);
    this.setVibration(0);
    this.setGhost(null);
    this.setSurplus(null);
    this.setNeeded(null);
    this.setTwist(0);
    this.setStress(0);
    this.free.group.rotation.x = 0;
    this.free.group.position.set(0, 0, 0);
    this.syncEnd();
  }

  dispose(): void {
    for (const p of this.pieces) p.dispose();
    this.gridTex.dispose();
  }
}

export const clampScale = (s: number): number => Math.min(3.5, Math.max(0.3, s));

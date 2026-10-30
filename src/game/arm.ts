import * as THREE from 'three';

const SEGS = 28, RADIAL = 10;

/**
 * Brazo elástico del ratón: tubo curvo del hombro a la garra (Bézier cuadrática con comba que se tensa al estirarse)
 * y garra de tres dedos que se abre al buscar y se cierra al agarrar.
 */
export class ArmView {
  readonly group = new THREE.Group();
  readonly tip = new THREE.Vector3();
  private readonly tube: THREE.Mesh;
  private readonly claw = new THREE.Group();
  private readonly fingers: THREE.Group[] = [];
  private readonly mat = new THREE.MeshStandardMaterial({ color: 0xb9a89a, roughness: 0.8 });
  private readonly curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
  private grip = 0; // 0 abierta, 1 cerrada
  private readonly tmp = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  length = 0;

  constructor(readonly shoulder: THREE.Object3D) {
    this.tube = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.tube.castShadow = true;
    this.group.add(this.tube, this.claw);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), this.mat);
    this.claw.add(palm);
    const nail = new THREE.MeshStandardMaterial({ color: 0xf2a0ae, roughness: 0.5 });
    for (let k = 0; k < 3; k++) {
      const f = new THREE.Group();
      f.rotation.z = (k / 3) * Math.PI * 2;
      const hinge = new THREE.Group();
      hinge.position.y = 0.05;
      f.add(hinge);
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.09, 4, 8), nail);
      seg.position.set(0, 0.0, 0.05);
      seg.rotation.x = Math.PI / 2;
      hinge.add(seg);
      this.claw.add(f);
      this.fingers.push(hinge);
    }
    shoulder.getWorldPosition(this.tip);
    this.rebuild();
  }

  /** Avanza la animación: la punta persigue al objetivo (o se fija a él si `lock`). */
  update(dt: number, target: THREE.Vector3, closed: boolean, lock: boolean): void {
    const k = 1 - Math.exp(-(lock ? 40 : 12) * dt);
    if (lock && this.tip.distanceTo(target) < 0.05) this.tip.copy(target);
    else this.tip.lerp(target, k);
    this.grip += ((closed ? 1 : 0) - this.grip) * (1 - Math.exp(-14 * dt));
    this.rebuild();
  }

  private rebuild(): void {
    const a = this.shoulder.getWorldPosition(this.curve.v0);
    const b = this.curve.v2.copy(this.tip);
    this.length = a.distanceTo(b);
    const sag = Math.max(0.05, 0.35 - this.length * 0.08);
    this.curve.v1.copy(a).add(b).multiplyScalar(0.5).addScaledVector(this.up, sag);
    const r = 0.045 * Math.sqrt(0.6 / Math.max(0.6, this.length));
    this.tube.geometry.dispose();
    this.tube.geometry = new THREE.TubeGeometry(this.curve, SEGS, r, RADIAL, false);
    this.claw.position.copy(b);
    const dir = this.curve.getTangent(1, this.tmp).normalize();
    this.claw.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    const open = 0.75 * (1 - this.grip) + 0.1;
    for (const f of this.fingers) f.rotation.x = -open;
  }

  dispose(): void {
    this.tube.geometry.dispose();
  }
}

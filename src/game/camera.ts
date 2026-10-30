import * as THREE from 'three';

export const CAM = { distance: 5.2, height: 2.5, lookHeight: 0.9, posK: 7, yawK: 4.5 };

function dampAngle(a: number, b: number, k: number, dt: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-k * dt));
}

/** Devuelve la distancia libre desde `from` en la dirección `dir` (unitaria) hasta `max`. */
export type CollideFn = (from: THREE.Vector3, dir: THREE.Vector3, max: number) => number;

export class FollowCamera {
  collide: CollideFn | null = null;
  private curDist = -1;
  private readonly dir = new THREE.Vector3();
  private readonly out = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();
  readonly camera: THREE.PerspectiveCamera;
  readonly target = new THREE.Vector3();
  private readonly smoothTarget = new THREE.Vector3();
  private yaw = 0;
  private readonly desired = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 160);
  }

  resize(w: number, h: number): void {
    const aspect = w / h;
    this.camera.aspect = aspect;
    // en vertical se conserva el campo horizontal
    this.camera.fov = aspect < 1 ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(55) / 2) / aspect * 0.75)) : 55;
    this.camera.updateProjectionMatrix();
  }

  snap(feet: THREE.Vector3, yaw: number): void {
    this.yaw = yaw;
    this.curDist = -1;
    this.smoothTarget.copy(feet);
    this.update(0, feet, yaw);
  }

  update(dt: number, feet: THREE.Vector3, yaw: number): void {
    this.yaw = dampAngle(this.yaw, yaw, CAM.yawK, dt);
    this.smoothTarget.lerp(feet, dt === 0 ? 1 : 1 - Math.exp(-CAM.posK * 2 * dt));
    this.target.set(this.smoothTarget.x, this.smoothTarget.y + CAM.lookHeight, this.smoothTarget.z);
    this.desired.set(
      this.target.x - Math.sin(this.yaw) * CAM.distance,
      this.target.y + CAM.height - CAM.lookHeight,
      this.target.z - Math.cos(this.yaw) * CAM.distance,
    );
    this.origin.set(feet.x, feet.y + CAM.lookHeight, feet.z);
    const p = this.place(this.origin, this.desired, dt);
    this.camera.position.copy(p);
    this.tmp.copy(this.target);
    this.tmp.y += 0.25;
    this.camera.lookAt(this.tmp);
  }

  private place(target: THREE.Vector3, desired: THREE.Vector3, dt: number): THREE.Vector3 {
    if (!this.collide) return desired;
    this.dir.subVectors(desired, target);
    const full = this.dir.length();
    this.dir.divideScalar(full);
    const free = Math.min(full, this.collide(target, this.dir, full));
    // entra al instante (nunca atraviesa), sale suave
    if (this.curDist < 0 || dt === 0 || free < this.curDist) this.curDist = free;
    else this.curDist += (free - this.curDist) * (1 - Math.exp(-4 * dt));
    return this.out.copy(target).addScaledVector(this.dir, this.curDist);
  }
}

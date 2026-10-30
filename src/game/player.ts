import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { InputState } from './input';

export const MOVE = {
  walk: 4.0,
  back: 2.4,
  turnRate: 2.8,
  accelGround: 28,
  accelAir: 10,
  jumpHeight: 1.35,
  timeToApex: 0.38,
  fallMultiplier: 1.6,
  jumpCutMultiplier: 2.2,
  coyoteTime: 0.12,
  jumpBuffer: 0.12,
  get gravity(): number { return (2 * this.jumpHeight) / (this.timeToApex * this.timeToApex); },
  get jumpSpeed(): number { return (2 * this.jumpHeight) / this.timeToApex; },
};

export const CAPSULE = { radius: 0.3, halfHeight: 0.25 };
const CENTER_Y = CAPSULE.radius + CAPSULE.halfHeight;

export class Player {
  readonly pos = new THREE.Vector3();
  readonly prevPos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly actualVel = new THREE.Vector3();
  yaw = 0;
  prevYaw = 0;
  grounded = false;
  jumping = false;
  jumps = 0;
  private coyote = 0;
  private buffer = 0;
  private prevJump = false;
  readonly collider: RAPIER.Collider;
  private readonly kcc: RAPIER.KinematicCharacterController;
  private readonly fwd = new THREE.Vector3();

  constructor(private readonly world: RAPIER.World, spawn: THREE.Vector3, yaw: number) {
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(CAPSULE.halfHeight, CAPSULE.radius));
    this.kcc = world.createCharacterController(0.02);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.enableAutostep(0.3, 0.2, false);
    this.kcc.enableSnapToGround(0.3);
    this.kcc.setMaxSlopeClimbAngle((46 * Math.PI) / 180);
    this.kcc.setMinSlopeSlideAngle((35 * Math.PI) / 180);
    this.kcc.setSlideEnabled(true);
    this.teleport(spawn.x, spawn.y, spawn.z, yaw);
  }

  forward(out = this.fwd): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  teleport(x: number, y: number, z: number, yaw = this.yaw): void {
    this.pos.set(x, y, z);
    this.prevPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.coyote = this.buffer = 0;
    this.jumping = false;
    this.actualVel.set(0, 0, 0);
    this.yaw = this.prevYaw = yaw;
    this.collider.setTranslation({ x, y: y + CENTER_Y, z });
  }

  fixedUpdate(dt: number, input: InputState): void {
    this.prevPos.copy(this.pos);
    this.prevYaw = this.yaw;
    this.yaw += input.turn * MOVE.turnRate * dt;
    const f = this.forward();
    const speed = input.forward >= 0 ? MOVE.walk * input.forward : MOVE.back * input.forward;
    const accel = (this.grounded ? MOVE.accelGround : MOVE.accelAir) * dt;
    const tx = f.x * speed - this.vel.x, tz = f.z * speed - this.vel.z;
    const tl = Math.hypot(tx, tz);
    const k = tl > accel ? accel / tl : 1;
    this.vel.x += tx * k;
    this.vel.z += tz * k;

    if (this.grounded) this.coyote = MOVE.coyoteTime;
    else this.coyote -= dt;
    if (input.jump && !this.prevJump) this.buffer = MOVE.jumpBuffer;
    else this.buffer -= dt;
    this.prevJump = input.jump;
    if (this.buffer > 0 && this.coyote > 0) {
      this.vel.y = MOVE.jumpSpeed;
      this.buffer = this.coyote = 0;
      this.jumping = true;
      this.grounded = false;
      this.jumps++;
    }
    let g = MOVE.gravity;
    if (this.vel.y < 0) g *= MOVE.fallMultiplier;
    else if (this.jumping && !input.jump) g *= MOVE.jumpCutMultiplier;
    this.vel.y -= g * dt;
    this.vel.y = Math.max(this.vel.y, -30);

    const desired = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    this.kcc.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const m = this.kcc.computedMovement();
    const c = this.collider.translation();
    this.collider.setTranslation({ x: c.x + m.x, y: c.y + m.y, z: c.z + m.z });
    this.pos.set(c.x + m.x, c.y + m.y - CENTER_Y, c.z + m.z);
    this.actualVel.set(m.x / dt, m.y / dt, m.z / dt);
    this.grounded = this.kcc.computedGrounded();
    if (this.grounded && this.vel.y <= 0) { this.vel.y = 0; this.jumping = false; }
    if (this.vel.y > 0 && m.y < desired.y * 0.5) this.vel.y = 0; // techo
  }

  dispose(): void {
    this.world.removeCharacterController(this.kcc);
    this.world.removeCollider(this.collider, false);
  }
}

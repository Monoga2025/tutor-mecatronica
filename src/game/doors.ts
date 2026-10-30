import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { DoorDef } from './level';
import { labelTexture } from './textures';

export const DOOR = { width: 1.6, height: 2.2, zoneDepth: 0.9 };

export class Door {
  readonly group = new THREE.Group();
  readonly colliders: RAPIER.Collider[] = [];
  locked: boolean;
  private readonly portalMat: THREE.MeshStandardMaterial;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly label: THREE.Sprite;
  private readonly bars = new THREE.Group();
  private t = 0;

  constructor(readonly def: DoorDef, world: RAPIER.World) {
    this.locked = def.locked;
    const [x, y, z] = def.pos;
    this.group.position.set(x, y, z);
    const W = DOOR.width, H = DOOR.height;
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xd9b58a, roughness: 0.7 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.6 });
    const box = (sx: number, sy: number, sz: number, px: number, py: number, pz: number, m: THREE.Material, solid = true): void => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
      mesh.position.set(px, py, pz);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      if (solid) {
        this.colliders.push(world.createCollider(
          RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setTranslation(x + px, y + py, z + pz),
        ));
      }
    };
    box(0.3, H + 0.3, 0.5, -W / 2 - 0.15, (H + 0.3) / 2, 0, frameMat);
    box(0.3, H + 0.3, 0.5, W / 2 + 0.15, (H + 0.3) / 2, 0, frameMat);
    box(W + 0.9, 0.35, 0.6, 0, H + 0.3, 0, trim);
    box(W + 0.4, 0.12, 0.7, 0, H + 0.53, 0, frameMat, false);
    box(W, H, 0.1, 0, H / 2, 0.22, trim); // fondo: detiene al ratón dentro del portal

    this.portalMat = new THREE.MeshStandardMaterial({
      color: this.locked ? 0x8f97a3 : 0xffd27a,
      emissive: this.locked ? 0x222730 : 0xffa53a,
      emissiveIntensity: 0.9,
      roughness: 0.4,
    });
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(W, H), this.portalMat);
    portal.rotation.y = Math.PI;
    portal.position.set(0, H / 2, 0.16);
    this.group.add(portal);

    this.ringMat = new THREE.MeshBasicMaterial({
      color: this.locked ? 0x9aa3ad : 0xffc44d, transparent: true, opacity: 0.8, depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 40), this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.02, -0.9);
    this.group.add(ring);

    const tex = labelTexture(def.title, this.locked ? '#5d6570' : '#fff3dc', this.locked ? '#eef1f4' : '#5a3a17');
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
    this.label.scale.set(2.4, 0.6, 1);
    this.label.position.set(0, H + 1.05, -0.1);
    this.group.add(this.label);

    const barMat = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.5, metalness: 0.6 });
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, H, 8), barMat);
      b.position.set(-W / 2 + 0.2 + i * (W - 0.4) / 4, H / 2, -0.05);
      b.castShadow = true;
      this.bars.add(b);
    }
    this.group.add(this.bars);
    this.bars.visible = this.locked;
    // barrera invisible del portal mientras esté bloqueada
    this.lockCollider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(W / 2, H / 2, 0.08).setTranslation(x, y + H / 2, z - 0.05),
    );
    this.lockCollider.setEnabled(this.locked);
    this.colliders.push(this.lockCollider);
  }

  private readonly lockCollider: RAPIER.Collider;

  setLocked(locked: boolean): void {
    this.locked = locked;
    this.bars.visible = locked;
    this.lockCollider.setEnabled(locked);
    this.portalMat.color.set(locked ? 0x8f97a3 : 0xffd27a);
    this.portalMat.emissive.set(locked ? 0x222730 : 0xffa53a);
    this.ringMat.color.set(locked ? 0x9aa3ad : 0xffc44d);
  }

  /** ¿Está el punto (pies) en la zona de entrada, justo delante del portal? */
  inZone(p: THREE.Vector3): boolean {
    const [x, y, z] = this.def.pos;
    return Math.abs(p.x - x) < DOOR.width / 2 && p.z > z - DOOR.zoneDepth && p.z < z + 0.3 && Math.abs(p.y - y) < 0.8;
  }

  distanceTo(p: THREE.Vector3): number {
    const [x, y, z] = this.def.pos;
    return Math.hypot(p.x - x, p.y - y, p.z - z);
  }

  update(dt: number, near: boolean): void {
    this.t += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
    if (!this.locked) {
      this.portalMat.emissiveIntensity = 0.7 + 0.5 * pulse + (near ? 0.4 : 0);
      this.ringMat.opacity = 0.45 + 0.45 * pulse;
    }
    const s = near ? 1.15 : 1;
    this.label.scale.set(2.4 * s, 0.6 * s, 1);
    this.label.position.y = DOOR.height + 1.05 + 0.06 * Math.sin(this.t * 1.6);
  }
}

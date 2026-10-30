import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { dirtTexture, grassTexture, stoneTexture, woodTexture } from './textures';

export type Vec3 = [number, number, number];
export type Style = 'grass' | 'stone' | 'wood' | 'rock' | 'trunk';

export interface BoxSolid { id: string; kind: 'box'; center: Vec3; size: Vec3; rotX?: number; style: Style }
export interface CylSolid { id: string; kind: 'cyl'; center: Vec3; radius: number; height: number; style: Style }
export type Solid = BoxSolid | CylSolid;

export interface DoorDef { id: string; title: string; pos: Vec3; locked: boolean }
export interface Waypoint { x: number; z: number; jump?: boolean }

export interface LevelDef {
  spawn: { pos: Vec3; yaw: number };
  killY: number;
  solids: Solid[];
  trees: Vec3[];
  doors: DoorDef[];
  /** Ruta de referencia para el bot (saltar al llegar a los puntos con jump). */
  path: Waypoint[];
}

export const HUB_RADIUS = 7;

export const LEVEL: LevelDef = {
  spawn: { pos: [0, 0, -1.5], yaw: 0 },
  killY: -12,
  solids: [
    { id: 'hub', kind: 'cyl', center: [0, -0.6, 0], radius: HUB_RADIUS, height: 1.2, style: 'grass' },
    { id: 'roca1', kind: 'box', center: [3.4, 0.25, 2.6], size: [1.1, 0.5, 0.9], style: 'rock' },
    { id: 'roca2', kind: 'box', center: [-3.2, 0.2, 4.8], size: [0.8, 0.4, 0.8], style: 'rock' },
    { id: 'p1', kind: 'box', center: [0, 0.3, 8.75], size: [3, 0.6, 2.5], style: 'stone' },
    { id: 'p2', kind: 'box', center: [2.2, 1.0, 11.9], size: [2.6, 0.6, 2.6], style: 'stone' },
    { id: 'p3', kind: 'box', center: [0.4, 1.7, 15.0], size: [2.6, 0.6, 2.6], style: 'stone' },
    { id: 'rampa', kind: 'box', center: [0.4, 2.2084, 17.3496], size: [2, 0.3, 2.1190], rotX: -0.33667, style: 'wood' },
    { id: 'plaza', kind: 'box', center: [0.4, 2.4, 20.3], size: [7, 0.6, 4], style: 'stone' },
  ],
  doors: [
    { id: 'eje_macizo', title: 'Eje macizo', pos: [-1.0, 2.7, 21.7], locked: false },
    { id: 'predecir_giro', title: 'Predecir el giro', pos: [2.1, 2.7, 21.7], locked: true },
  ],
  path: [
    { x: 0, z: 5.6 }, { x: 0, z: 6.75, jump: true }, { x: 0.2, z: 8.9 },
    { x: 0.85, z: 9.75, jump: true }, { x: 2.2, z: 11.9 },
    { x: 1.55, z: 12.95, jump: true }, { x: 0.6, z: 14.9 },
    { x: 0.4, z: 16.3 }, { x: 0.0, z: 19.2 }, { x: -1.0, z: 21.4 },
  ],
  trees: [[-4.6, 0, -1.2], [4.8, 0, -2.4], [-4.4, 0, 3.0], [3.4, 0, -5.0], [-2.8, 0, -5.4]],
};

export interface BuiltLevel {
  group: THREE.Group;
  colliders: RAPIER.Collider[];
  dispose(world: RAPIER.World): void;
}

export function buildLevel(def: LevelDef, world: RAPIER.World): BuiltLevel {
  const group = new THREE.Group();
  const colliders: RAPIER.Collider[] = [];
  const mats = {
    grass: new THREE.MeshStandardMaterial({ map: grassTexture(4), roughness: 0.95 }),
    dirt: new THREE.MeshStandardMaterial({ map: dirtTexture(), roughness: 1 }),
    stone: new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.85 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.8 }),
    rock: new THREE.MeshStandardMaterial({ color: 0xa7a19a, roughness: 0.9, flatShading: true }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x8a5a3b, roughness: 0.9 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x6fae4f, roughness: 0.8, flatShading: true }),
    leaf2: new THREE.MeshStandardMaterial({ color: 0x8cc35c, roughness: 0.8, flatShading: true }),
  };
  const add = (m: THREE.Mesh): THREE.Mesh => {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const topMat = (s: Style): THREE.Material => (s === 'grass' ? mats.grass : s === 'stone' ? mats.stone : mats[s]);
  const sideMat = (s: Style): THREE.Material => (s === 'grass' ? mats.dirt : topMat(s));

  for (const s of def.solids) {
    if (s.kind === 'cyl') {
      const g = new THREE.CylinderGeometry(s.radius, s.radius * 0.9, s.height, 48);
      add(new THREE.Mesh(g, [sideMat(s.style), topMat(s.style), sideMat(s.style)])).position.set(...s.center);
      colliders.push(world.createCollider(
        RAPIER.ColliderDesc.cylinder(s.height / 2, s.radius).setTranslation(...s.center),
      ));
    } else {
      const g = new THREE.BoxGeometry(...s.size);
      if (s.style === 'stone' || s.style === 'grass') {
        const uv = g.getAttribute('uv') as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s.size[0] / 2, uv.getY(i) * s.size[2] / 2);
      }
      const side = sideMat(s.style), top = topMat(s.style);
      const m = s.style === 'rock'
        ? add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), mats.rock))
        : add(new THREE.Mesh(g, [side, side, top, side, side, side]));
      if (s.style === 'rock') { g.dispose(); m.scale.set(s.size[0] * 1.1, s.size[1] * 1.6, s.size[2] * 1.1); }
      m.position.set(...s.center);
      const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), s.rotX ?? 0);
      m.quaternion.copy(rot);
      colliders.push(world.createCollider(
        RAPIER.ColliderDesc.cuboid(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2)
          .setTranslation(...s.center)
          .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w }),
      ));
    }
  }

  const trunkG = new THREE.CylinderGeometry(0.16, 0.24, 1.4, 10);
  const leafG = new THREE.IcosahedronGeometry(1, 0);
  def.trees.forEach(([x, y, z], i) => {
    add(new THREE.Mesh(trunkG, mats.trunk)).position.set(x, y + 0.7, z);
    const a = add(new THREE.Mesh(leafG, i % 2 ? mats.leaf : mats.leaf2));
    a.position.set(x, y + 1.9, z);
    a.scale.set(1.1, 0.9, 1.1);
    const b = add(new THREE.Mesh(leafG, i % 2 ? mats.leaf2 : mats.leaf));
    b.position.set(x + 0.15, y + 2.6, z - 0.1);
    b.scale.setScalar(0.7);
    colliders.push(world.createCollider(RAPIER.ColliderDesc.cylinder(0.7, 0.24).setTranslation(x, y + 0.7, z)));
    colliders.push(world.createCollider(RAPIER.ColliderDesc.ball(0.95).setTranslation(x, y + 2.0, z)));
  });

  // mar de nubes lejano bajo el vacío
  const sea = new THREE.Mesh(
    new THREE.CircleGeometry(120, 48),
    new THREE.MeshStandardMaterial({ color: 0xb4cde3, roughness: 1 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = def.killY - 4;
  group.add(sea);

  return {
    group,
    colliders,
    dispose(w: RAPIER.World): void {
      for (const c of colliders) w.removeCollider(c, false);
      colliders.length = 0;
    },
  };
}

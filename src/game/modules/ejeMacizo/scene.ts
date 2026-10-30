import * as THREE from 'three';
import { MouseModel } from '../../mouse';
import { ShaftView } from '../../shaftView';
import { woodTexture } from '../../textures';

export const SHAFT_Y = 1.05;
export const LV = 2.4;

export interface FreeRect { x: number; y: number; w: number; h: number }

/** Taller: pared con el empotramiento, suelo de madera, eje, ratón y cámara que encuadra el área libre de la UI. */
export class Taller {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.05, 60);
  readonly shaft: ShaftView;
  readonly mouse = new MouseModel();
  private readonly target = new THREE.Vector3(LV * 0.55, SHAFT_Y - 0.05, 0);
  private readonly dir = new THREE.Vector3(0.55, 0.42, 1).normalize();
  private readonly woodTex = woodTexture();

  constructor(rv: number) {
    const s = this.scene;
    s.background = new THREE.Color(0xe8dccb);
    s.fog = new THREE.Fog(0xe8dccb, 12, 30);
    s.add(new THREE.HemisphereLight(0xfff3e0, 0x7a5e44, 1.5));
    const key = new THREE.DirectionalLight(0xffe6c4, 2.2);
    key.position.set(3.5, 6, 5);
    key.target.position.set(1.2, 0.6, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -4; sc.right = 4; sc.top = 4; sc.bottom = -4; sc.near = 0.5; sc.far = 20;
    key.shadow.bias = -0.0005;
    s.add(key, key.target);

    this.woodTex.wrapS = this.woodTex.wrapT = THREE.RepeatWrapping;
    this.woodTex.repeat.set(5, 5);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: this.woodTex, roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xc9a27e, roughness: 0.9 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, 7), wallMat);
    wall.position.set(-0.25, 1.7, -0.5);
    wall.receiveShadow = true;
    s.add(wall);
    const back = new THREE.Mesh(new THREE.BoxGeometry(12, 3.4, 0.3), new THREE.MeshStandardMaterial({ color: 0xe3cdb0, roughness: 0.95 }));
    back.position.set(4, 1.7, -2.2);
    back.receiveShadow = true;
    s.add(back);
    // franjas de aviso del empotramiento
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.0, 1.0), new THREE.MeshStandardMaterial({ color: 0x3d3a36, roughness: 0.8 }));
    hatch.position.set(0.005, SHAFT_Y, 0);
    s.add(hatch);
    const flangeMat = new THREE.MeshStandardMaterial({ color: 0x59636e, metalness: 0.6, roughness: 0.4 });
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(rv * 2.2, rv * 2.2, 0.07, 40), flangeMat);
    flange.rotation.z = Math.PI / 2;
    flange.position.set(0.05, SHAFT_Y, 0);
    flange.castShadow = true;
    s.add(flange);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.06, 8), flangeMat);
      bolt.rotation.z = Math.PI / 2;
      bolt.position.set(0.1, SHAFT_Y + Math.cos(a) * rv * 1.7, Math.sin(a) * rv * 1.7);
      s.add(bolt);
    }
    // mesa baja bajo el extremo (donde cae el trozo roto)
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 1.1), new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.7 }));
    bench.position.set(LV * 0.72, 0.42, 0);
    bench.castShadow = bench.receiveShadow = true;
    s.add(bench);
    for (const [dx, dz] of [[-0.7, -0.45], [0.7, -0.45], [-0.7, 0.45], [0.7, 0.45]] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.07), new THREE.MeshStandardMaterial({ color: 0x6d4529 }));
      leg.position.set(LV * 0.72 + dx, 0.21, dz);
      s.add(leg);
    }

    this.shaft = new ShaftView(LV, rv);
    this.shaft.group.position.set(0, SHAFT_Y, 0);
    this.shaft.fallDepth = SHAFT_Y - 0.46 - rv;
    s.add(this.shaft.group);

    this.mouse.root.position.set(LV + 0.45, 0, -0.95);
    this.mouse.root.rotation.y = -0.35;
    s.add(this.mouse.root);
  }

  /** Encuadra eje + ratón dentro del rectángulo libre (fuera del panel). */
  fit(W: number, H: number, r: FreeRect): void {
    const cam = this.camera;
    cam.aspect = W / H;
    const contentW = LV + 1.5, contentH = 2.1;
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const visH = Math.max(contentH * H / r.h, contentW * H / r.w) * 1.08;
    const d = visH / (2 * tan);
    cam.position.copy(this.target).addScaledVector(this.dir, d);
    cam.lookAt(this.target);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    cam.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    cam.updateProjectionMatrix();
  }

  /** Proyecta un punto de mundo a píxeles de pantalla. */
  toScreen(p: THREE.Vector3, W: number, H: number): { x: number; y: number } {
    const v = p.clone().project(this.camera);
    return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H };
  }

  update(dt: number): void {
    this.shaft.update(dt);
    this.mouse.update(dt, { speed: 0, turn: 0, grounded: true, vy: 0 });
  }

  dispose(): void {
    this.shaft.dispose();
    this.woodTex.dispose();
  }
}

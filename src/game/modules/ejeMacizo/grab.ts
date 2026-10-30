import * as THREE from 'three';
import { ArmView } from '../../arm';
import type { Taller } from './scene';

export type Agarrable = 'llave' | 'asaL' | 'asaC';

export interface GrabCallbacks {
  puede(kind: Agarrable): boolean;
  start(kind: Agarrable): void;
  /** Desplazamiento del puntero en px desde que se agarró (y positivo hacia abajo). */
  drag(kind: Agarrable, dx: number, dy: number): void;
  end(kind: Agarrable): void;
}

const MAX_REACH = 3.6;

/** Puntero → raycast contra lo agarrable, resalte, brazo que sigue al cursor/dedo y arrastre. */
export class Grabber {
  readonly arm: ArmView;
  hover: Agarrable | null = null;
  dragging: { kind: Agarrable; x0: number; y0: number; id: number } | null = null;
  private pointer: { x: number; y: number } | null = null;
  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.35);
  private readonly target = new THREE.Vector3();
  private readonly shoulder = new THREE.Object3D();
  private readonly rest = new THREE.Object3D();
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly canvas: HTMLCanvasElement, private readonly taller: Taller, private readonly cb: GrabCallbacks) {
    this.shoulder.position.set(0.2, 0.62, 0.22);
    this.rest.position.set(0.32, 0.5, 0.5);
    taller.mouse.root.add(this.shoulder, this.rest);
    taller.mouse.root.updateMatrixWorld(true);
    this.arm = new ArmView(this.shoulder);
    taller.scene.add(this.arm.group);
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
    canvas.addEventListener('pointerleave', this.leave);
  }

  private setPointer(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    this.ndc.set((this.pointer.x / r.width) * 2 - 1, -(this.pointer.y / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.taller.camera);
  }

  private pick(): Agarrable | null {
    const objs = this.taller.shaft.interactivos().filter((o) => this.cb.puede(o.userData.kind as Agarrable));
    const hit = this.ray.intersectObjects(objs, false)[0];
    return (hit?.object.userData.kind as Agarrable | undefined) ?? null;
  }

  private readonly down = (e: PointerEvent): void => {
    this.setPointer(e);
    const k = this.pick();
    if (!k) return;
    this.dragging = { kind: k, x0: e.clientX, y0: e.clientY, id: e.pointerId };
    this.canvas.setPointerCapture(e.pointerId);
    this.cb.start(k);
    e.preventDefault();
  };

  private readonly move = (e: PointerEvent): void => {
    this.setPointer(e);
    const d = this.dragging;
    if (d && e.pointerId === d.id) { this.cb.drag(d.kind, e.clientX - d.x0, e.clientY - d.y0); return; }
    this.setHover(this.pick());
  };

  private readonly up = (e: PointerEvent): void => {
    const d = this.dragging;
    if (!d || e.pointerId !== d.id) return;
    this.dragging = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    this.cb.end(d.kind);
  };

  private readonly leave = (): void => { if (!this.dragging) { this.pointer = null; this.setHover(null); } };

  /** Suelta lo agarrado (p. ej. si el eje se rompe). */
  release(): void {
    const d = this.dragging;
    if (!d) return;
    this.dragging = null;
    if (this.canvas.hasPointerCapture(d.id)) this.canvas.releasePointerCapture(d.id);
  }

  private setHover(k: Agarrable | null): void {
    if (k === this.hover) return;
    this.hover = k;
    this.taller.shaft.highlight(k);
    this.canvas.style.cursor = k ? 'grab' : '';
  }

  /** Punto de agarre de cada objeto, en coordenadas de mundo. */
  grabPoint(kind: Agarrable, out = new THREE.Vector3()): THREE.Vector3 {
    const sh = this.taller.shaft;
    if (kind === 'llave') return sh.gripWorld(out);
    if (kind === 'asaL') return sh.asaL.getWorldPosition(out);
    return sh.asaC.localToWorld(out.set(0, 1, 0));
  }

  update(dt: number): void {
    const d = this.dragging;
    if (d) {
      this.grabPoint(d.kind, this.target);
      this.canvas.style.cursor = 'grabbing';
    } else if (this.pointer && this.ray.ray.intersectPlane(this.plane, this.target)) {
      const s = this.shoulder.getWorldPosition(this.tmp);
      const v = this.target.sub(s);
      if (v.length() > MAX_REACH) v.setLength(MAX_REACH);
      this.target.copy(s).add(v);
      if (this.target.y < 0.1) this.target.y = 0.1;
    } else {
      this.rest.getWorldPosition(this.target);
    }
    this.arm.update(dt, this.target, !!d, !!d);
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.down);
    this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up);
    this.canvas.removeEventListener('pointercancel', this.up);
    this.canvas.removeEventListener('pointerleave', this.leave);
    this.canvas.style.cursor = '';
    this.arm.dispose();
  }
}

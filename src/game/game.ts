import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { FollowCamera } from './camera';
import { disposeObject } from './dispose';
import { Door } from './doors';
import { Hud } from './hud';
import { Input, type InputState } from './input';
import { buildLevel, LEVEL, type BuiltLevel } from './level';
import { MouseModel } from './mouse';
import { Perf } from './perf';
import { Player } from './player';
import { skyTexture } from './textures';

export const FIXED_DT = 1 / 60;

export interface GameOptions { testMode: boolean; debug: boolean; container?: HTMLElement }

type Listener = (detail: Record<string, unknown>) => void;

/** Contexto que recibe una escena de módulo al montarse. */
export interface ModuleContext {
  id: string;
  game: Game;
  renderer: THREE.WebGLRenderer;
  /** Contenedor HTML propio del módulo (se elimina al salir). */
  root: HTMLElement;
  /** Desmonta el módulo y vuelve al mundo central. */
  exit(result?: Record<string, unknown>): void;
}
export interface ModuleInstance {
  scene: THREE.Scene;
  camera: THREE.Camera;
  update(dt: number): void;
  resize?(w: number, h: number): void;
  /** Liberación extra; la escena se recorre y libera automáticamente después. */
  dispose?(): void;
}
export type ModuleFactory = (ctx: ModuleContext) => ModuleInstance | Promise<ModuleInstance>;

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly world: RAPIER.World;
  readonly input: Input;
  readonly player: Player;
  readonly mouse = new MouseModel();
  readonly cam: FollowCamera;
  readonly perf: Perf;
  readonly hud = new Hud();
  readonly level: BuiltLevel;
  readonly def = LEVEL;
  readonly doors: Door[] = [];
  readonly eventLog: { type: string; detail: unknown; t: number }[] = [];
  respawns = 0;
  simTime = 0;
  fixedSteps = 0;
  private acc = 0;
  private lastInput: InputState = { forward: 0, turn: 0, jump: false };
  private readonly listeners = new Map<string, Set<Listener>>();
  private raf = 0;
  private readonly interp = new THREE.Vector3();
  private readonly onResize = (): void => this.resize();
  private disposed = false;
  private dirty = false;
  private readonly factories = new Map<string, ModuleFactory>();
  private active: { id: string; inst: ModuleInstance; root: HTMLElement } | null = null;
  private mounting: string | null = null;
  private zoneDoor: string | null = null;
  private lastEntered: string | null = null;
  private readonly castShape = new RAPIER.Ball(0.25);

  constructor(opts: GameOptions) {
    const container = opts.container ?? document.body;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    const horizon = '#e9e0d4';
    this.scene.background = skyTexture('#8cc4ec', horizon);
    this.scene.fog = new THREE.Fog(horizon, 28, 85);
    const hemi = new THREE.HemisphereLight(0xfff1dc, 0x8a7055, 1.6);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe2b8, 2.4);
    sun.position.set(-8, 14, 6);
    sun.target.position.set(0, 0, 8);
    sun.castShadow = true;
    const coarse = matchMedia('(pointer: coarse)').matches;
    sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    const sc = sun.shadow.camera;
    sc.left = -16; sc.right = 16; sc.top = 20; sc.bottom = -16; sc.near = 1; sc.far = 50;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);

    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_DT;
    this.level = buildLevel(LEVEL, this.world);
    this.scene.add(this.level.group);
    for (const d of LEVEL.doors) {
      const door = new Door(d, this.world);
      this.doors.push(door);
      this.scene.add(door.group);
    }
    this.world.step();

    const [sx, sy, sz] = LEVEL.spawn.pos;
    this.player = new Player(this.world, new THREE.Vector3(sx, sy, sz), LEVEL.spawn.yaw);
    this.scene.add(this.mouse.root);

    this.input = new Input();
    this.cam = new FollowCamera(1);
    this.cam.collide = (from, dir, max) => {
      const hit = this.world.castShape(
        from, { x: 0, y: 0, z: 0, w: 1 }, dir, this.castShape, 0, max, true,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.player.collider,
      );
      return hit ? Math.max(0.35, hit.time_of_impact - 0.05) : max;
    };
    this.perf = new Perf(this.renderer, opts.debug);
    addEventListener('resize', this.onResize);
    this.resize();
    this.cam.snap(this.player.pos, this.player.yaw);
    this.syncVisuals(0);
  }

  on(type: string, fn: Listener): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  emit(type: string, detail: Record<string, unknown>): void {
    this.eventLog.push({ type, detail, t: this.simTime });
    if (this.eventLog.length > 200) this.eventLog.shift();
    this.listeners.get(type)?.forEach((fn) => fn(detail));
    window.dispatchEvent(new CustomEvent(type, { detail }));
  }

  resize(): void {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.cam.resize(w, h);
    this.active?.inst.resize?.(w, h);
  }

  /** Avanza la simulación con paso fijo (acumulador) y actualiza animación y cámara. */
  tick(dt: number): void {
    if (this.active) {
      this.active.inst.update(dt);
      return;
    }
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= FIXED_DT - 1e-9) {
      this.acc -= FIXED_DT;
      this.fixedUpdate(FIXED_DT);
    }
    this.syncVisuals(dt);
  }

  private fixedUpdate(dt: number): void {
    this.lastInput = this.input.read();
    this.player.fixedUpdate(dt, this.lastInput);
    this.world.step();
    this.simTime += dt;
    this.fixedSteps++;
    if (this.player.pos.y < LEVEL.killY) this.respawn();
    this.checkDoors();
  }

  private respawn(): void {
    const [x, y, z] = LEVEL.spawn.pos;
    this.respawns++;
    this.teleport(x, y, z, LEVEL.spawn.yaw);
    this.emit('player:respawn', { count: this.respawns });
  }

  private checkDoors(): void {
    const door = this.doors.find((d) => d.inZone(this.player.pos)) ?? null;
    const id = door?.def.id ?? null;
    if (id === this.zoneDoor) return;
    this.zoneDoor = id;
    if (!door) { this.hud.hide(); return; }
    if (door.locked) {
      this.hud.show(`«${door.def.title}» está bloqueada`, 'Se abre cuando domines el módulo anterior.', 2500);
      this.emit('module:locked', { id: door.def.id });
    } else {
      this.enterModule(door.def.id);
    }
  }

  /** Registra la escena de un módulo; se monta al entrar por su puerta o con enterModule(id). */
  registerModule(id: string, factory: ModuleFactory): void {
    this.factories.set(id, factory);
  }

  setDoorLocked(id: string, locked: boolean): void {
    this.doors.find((d) => d.def.id === id)?.setLocked(locked);
  }

  get currentModule(): string | null { return this.active?.id ?? null; }

  /** Emite module:enter y, si hay escena registrada, la monta y pausa el mundo. */
  enterModule(id: string): boolean {
    const door = this.doors.find((d) => d.def.id === id);
    if (!door || door.locked || this.active || this.mounting) return false;
    this.lastEntered = id;
    this.emit('module:enter', { id, title: door.def.title });
    const factory = this.factories.get(id);
    if (!factory) {
      this.hud.show(`Entrando a «${door.def.title}»`, 'Módulo en construcción.', 3000);
      return true;
    }
    this.hud.show(`Entrando a «${door.def.title}»…`, '', 1500);
    this.mounting = id;
    const root = document.createElement('div');
    root.className = 'module-root';
    root.dataset.module = id;
    document.body.appendChild(root);
    this.input.setTouchVisible(false);
    const ctx: ModuleContext = { id, game: this, renderer: this.renderer, root, exit: (r) => this.exitModule(r) };
    void Promise.resolve(factory(ctx)).then((inst) => {
      this.mounting = null;
      if (this.disposed) return;
      this.active = { id, inst, root };
      inst.resize?.(innerWidth, innerHeight);
      this.emit('module:mounted', { id });
    });
    return true;
  }

  /** Desmonta el módulo activo, libera sus recursos y deja al ratón frente a la puerta. */
  exitModule(result: Record<string, unknown> = {}): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    a.inst.dispose?.();
    disposeObject(a.inst.scene);
    a.root.remove();
    this.input.setTouchVisible(true);
    const door = this.doors.find((d) => d.def.id === a.id);
    if (door) {
      const [x, y, z] = door.def.pos;
      this.teleport(x, y, z - 2.4, Math.PI);
    }
    this.zoneDoor = null;
    this.hud.hide();
    this.emit('module:exit', { id: a.id, ...result });
  }

  private syncVisuals(dt: number): void {
    const alpha = Math.max(0, Math.min(1, this.acc / FIXED_DT));
    const p = this.player;
    this.interp.lerpVectors(p.prevPos, p.pos, alpha);
    this.mouse.root.position.copy(this.interp);
    this.mouse.root.rotation.y = p.prevYaw + (p.yaw - p.prevYaw) * alpha;
    const f = p.forward();
    this.mouse.update(dt, {
      speed: p.actualVel.x * f.x + p.actualVel.z * f.z,
      turn: this.lastInput.turn,
      grounded: p.grounded,
      vy: p.actualVel.y,
    });
    this.cam.update(dt, this.interp, this.mouse.root.rotation.y);
    for (const d of this.doors) d.update(dt, d.distanceTo(p.pos) < 4);
  }

  render(): void {
    if (this.active) this.renderer.render(this.active.inst.scene, this.active.inst.camera);
    else this.renderer.render(this.scene, this.cam.camera);
  }

  /** Ejecuta n pasos de dt (modo de prueba); se dibuja en el siguiente fotograma del navegador. */
  step(dt: number, n = 1): void {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) this.tick(dt);
    this.perf.frame(0, performance.now() - t0);
    this.dirty = true;
  }

  /** Modo de prueba: solo dibuja cuando step() cambió algo; la simulación no depende del dibujo. */
  startRenderOnly(): void {
    const loop = (): void => {
      if (this.disposed) return;
      if (this.dirty) { this.dirty = false; this.render(); }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  start(): void {
    let last = performance.now();
    const loop = (t: number): void => {
      if (this.disposed) return;
      const t0 = performance.now();
      const interval = t - last;
      last = t;
      this.tick(Math.min(interval / 1000, 0.1));
      this.render();
      this.perf.frame(interval, performance.now() - t0);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  teleport(x: number, y: number, z: number, yaw?: number): void {
    this.player.teleport(x, y, z, yaw);
    this.cam.snap(this.player.pos, this.player.yaw);
    this.syncVisuals(0);
  }

  getState(): Record<string, unknown> {
    const p = this.player;
    const c = this.cam.camera.position;
    const r = (v: number): number => Math.round(v * 1e4) / 1e4;
    return {
      t: r(this.simTime),
      steps: this.fixedSteps,
      pos: { x: r(p.pos.x), y: r(p.pos.y), z: r(p.pos.z) },
      vel: { x: r(p.actualVel.x), y: r(p.actualVel.y), z: r(p.actualVel.z) },
      speed: r(Math.hypot(p.actualVel.x, p.actualVel.z)),
      yaw: r(p.yaw),
      grounded: p.grounded,
      camera: { x: r(c.x), y: r(c.y), z: r(c.z), dist: r(c.distanceTo(this.cam.target)), ...this.cameraClearance() },
      jumps: p.jumps,
      respawns: this.respawns,
      module: this.currentModule,
      lastEnteredModule: this.lastEntered,
      nearDoor: this.zoneDoor,
      input: this.lastInput,
      touchControls: this.input.touchVisible,
      perf: this.perf.snapshot(),
    };
  }

  /** ¿Está la cámara dentro de algún colisionador? y distancia a la superficie más cercana. */
  cameraClearance(): { inside: boolean; clearance: number } {
    const c = this.cam.camera.position;
    const proj = this.world.projectPoint(c, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.player.collider);
    if (!proj) return { inside: false, clearance: 99 };
    const d = Math.hypot(proj.point.x - c.x, proj.point.y - c.y, proj.point.z - c.z);
    return { inside: proj.isInside, clearance: Math.round(d * 1e4) / 1e4 };
  }

  dispose(): void {
    this.disposed = true;
    if (this.active) this.exitModule();
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.perf.dispose();
    this.hud.dispose();
    this.player.dispose();
    for (const d of this.doors) d.colliders.forEach((c) => this.world.removeCollider(c, false));
    this.level.dispose(this.world);
    disposeObject(this.scene);
    (this.scene.background as THREE.Texture | null)?.dispose();
    this.world.free();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

import type * as THREE from 'three';

export interface PerfSnapshot {
  frameMs: number;     // intervalo entre fotogramas (media móvil)
  frameP95Ms: number;
  cpuMs: number;       // tiempo de CPU de tick+render (media móvil)
  heapMB: number | null;
  geometries: number;
  textures: number;
  drawCalls: number;
  triangles: number;
  frames: number;
}

export class Perf {
  private intervals: number[] = [];
  private frameAvg = 0;
  private cpuAvg = 0;
  private frames = 0;
  private overlay: HTMLElement | null = null;
  private lastOverlay = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer, debug: boolean) {
    if (debug) {
      this.overlay = document.createElement('div');
      this.overlay.className = 'perf-overlay';
      this.overlay.dataset.testid = 'perf';
      document.body.appendChild(this.overlay);
    }
  }

  frame(intervalMs: number, cpuMs: number): void {
    this.frames++;
    const a = this.frames < 10 ? 0.5 : 0.05;
    if (intervalMs > 0) {
      this.frameAvg += (intervalMs - this.frameAvg) * a;
      this.intervals.push(intervalMs);
      if (this.intervals.length > 240) this.intervals.shift();
    }
    this.cpuAvg += (cpuMs - this.cpuAvg) * a;
    if (this.overlay && performance.now() - this.lastOverlay > 250) {
      this.lastOverlay = performance.now();
      const s = this.snapshot();
      this.overlay.textContent =
        `${s.frameMs > 0 ? (1000 / s.frameMs).toFixed(0) : '-'} fps · frame ${s.frameMs.toFixed(1)} ms (p95 ${s.frameP95Ms.toFixed(1)})\n` +
        `cpu ${s.cpuMs.toFixed(2)} ms · heap ${s.heapMB?.toFixed(1) ?? 'n/d'} MB\n` +
        `geo ${s.geometries} · tex ${s.textures} · draw ${s.drawCalls} · tri ${s.triangles}`;
    }
  }

  snapshot(): PerfSnapshot {
    const sorted = [...this.intervals].sort((x, y) => x - y);
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const info = this.renderer.info;
    return {
      frameMs: this.frameAvg,
      frameP95Ms: sorted.length ? sorted[Math.floor(sorted.length * 0.95)] ?? 0 : 0,
      cpuMs: this.cpuAvg,
      heapMB: mem ? mem.usedJSHeapSize / 1048576 : null,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      frames: this.frames,
    };
  }

  dispose(): void {
    this.overlay?.remove();
  }
}

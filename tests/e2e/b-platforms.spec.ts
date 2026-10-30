import { test, expect, type Page } from '@playwright/test';
import { boot, expectNoErrors, run, state, type State, type V3 } from './helpers';

const H = 1.35, T_APEX = 0.38, DT = 1 / 60;
const G = (2 * H) / (T_APEX * T_APEX), V0 = (2 * H) / T_APEX;

function expectedApex(): number {
  let vy = V0, y = 0, max = 0;
  for (let i = 0; i < 120; i++) { vy -= G * DT; y += vy * DT; max = Math.max(max, y); if (vy < 0) break; }
  return max;
}

/** Pasos de uno en uno registrando la altura máxima. */
async function trace(page: Page, keys: Record<string, boolean>, n: number): Promise<State[]> {
  return page.evaluate(([k, steps]) => {
    const out: unknown[] = [];
    window.__game.setInput(k as Record<string, boolean>);
    for (let i = 0; i < (steps as number); i++) { window.__game.step(1 / 60, 1); out.push(window.__game.getState()); }
    return out as State[];
  }, [keys, n] as const);
}

test('capa b: salto (altura, aterrizaje en plataforma, coyote, buffer, respawn)', async ({ page }) => {
  const errors = await boot(page);
  let s = await run(page, {}, 20);
  const y0 = s.pos.y;
  expect(s.grounded).toBe(true);

  // altura máxima del salto manteniendo espacio
  const tr = await trace(page, { Space: true }, 70);
  const maxY = Math.max(...tr.map((x) => x.pos.y)) - y0;
  const exp = expectedApex();
  console.log(`salto: altura máx ${maxY.toFixed(4)} m (esperada discreta ${exp.toFixed(4)}, continua ${H}), g=${G.toFixed(2)} v0=${V0.toFixed(3)}`);
  expect(Math.abs(maxY - exp) / exp).toBeLessThan(0.03);
  expect(tr.at(-1)!.grounded).toBe(true);
  expect(Math.abs(tr.at(-1)!.pos.y - y0)).toBeLessThan(0.03);

  // salto corto (soltar espacio pronto) más bajo
  await run(page, {}, 10);
  const short = [...(await trace(page, { Space: true }, 6)), ...(await trace(page, {}, 60))];
  const maxShort = Math.max(...short.map((x) => x.pos.y)) - y0;
  console.log(`salto corto: ${maxShort.toFixed(3)} m`);
  expect(maxShort).toBeLessThan(maxY * 0.8);

  // salta hacia la plataforma p1 (techo 0.6) y aterriza en ella
  await page.evaluate(() => window.__game.teleport(0, 0, 5.4, 0));
  s = await run(page, {}, 5);
  for (let k = 0; k < 200; k++) {
    s = (await trace(page, { ArrowUp: true, Space: s.pos.z > 6.6 && s.pos.z < 7.2 }, 1))[0]!;
    if (s.pos.z > 7.7 && s.grounded) break;
  }
  s = await run(page, {}, 30);
  console.log(`aterrizaje p1: y=${s.pos.y.toFixed(4)} z=${s.pos.z.toFixed(3)} grounded=${s.grounded}`);
  expect(s.grounded).toBe(true);
  expect(Math.abs(s.pos.y - 0.6)).toBeLessThan(0.04);

  // coyote time: saltar 83 ms después de dejar el suelo funciona; a 200 ms no
  for (const [delay, should] of [[5, true], [12, false]] as const) {
    await page.evaluate(() => window.__game.teleport(0, 0.6, 9.0, 0));
    await run(page, {}, 5);
    let left = false;
    for (let i = 0; i < 120 && !left; i++) {
      s = (await trace(page, { ArrowUp: true }, 1))[0]!;
      left = !s.grounded;
    }
    expect(left).toBe(true);
    const jumpsBefore = s.jumps as number;
    await trace(page, { ArrowUp: true }, delay - 1);
    const after = await trace(page, { ArrowUp: true, Space: true }, 3);
    const jumped = (after.at(-1)!.jumps as number) > jumpsBefore;
    console.log(`coyote ${Math.round(delay * 1000 / 60)} ms -> salta=${jumped} vy=${after.at(-1)!.vel.y.toFixed(2)}`);
    expect(jumped).toBe(should);
  }

  // caída al vacío -> respawn en el inicio
  const fall = await trace(page, {}, 200);
  const r = fall.find((x) => (x.respawns as number) > 0);
  expect(r, 'respawn tras caer').toBeTruthy();
  expect(Math.hypot(r!.pos.x - 0, r!.pos.z + 1.5)).toBeLessThan(0.2);

  // jump buffer: pulsar espacio 67 ms antes de aterrizar -> salta al tocar suelo
  await run(page, {}, 30);
  await trace(page, { Space: true }, 3);
  for (let i = 0; i < 120; i++) {
    s = (await trace(page, {}, 1))[0]!;
    if (s.vel.y < 0 && s.pos.y - y0 < 0.6) break;
  }
  const jb = s.jumps as number;
  const buf = await trace(page, { Space: true }, 12);
  const firstGround = buf.findIndex((x) => x.grounded || (x.jumps as number) > jb);
  console.log(`buffer: pulsado a ${(s.pos.y - y0).toFixed(3)} m del suelo, salto nuevo en paso ${firstGround}`);
  expect((buf.at(-1)!.jumps as number)).toBe(jb + 1);

  expectNoErrors(errors);
});

interface BotResult {
  reached: boolean; steps: number; enterEvent: unknown; cams: V3[];
  insideCount: number; minClearance: number; respawns: number; final: State;
}

test('capa b: bot recorre plataformas hasta la puerta; cámara nunca dentro de geometría', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors = await boot(page);
  const res: BotResult = await page.evaluate(() => {
    const g = window.__game;
    const game = g.game as { def: { path: { x: number; z: number; jump?: boolean }[] } };
    const path = game.def.path;
    let i = 0, hold = 0, steps = 0, insideCount = 0, minClearance = 99;
    const cams: { x: number; y: number; z: number }[] = [];
    let s = g.getState() as any;
    const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
    while (steps < 4000 && i < path.length) {
      const wp = path[i]!;
      const dx = wp.x - s.pos.x, dz = wp.z - s.pos.z;
      if (Math.hypot(dx, dz) < (wp.jump ? 0.3 : 0.45)) {
        if (wp.jump) hold = 12;
        i++;
        continue;
      }
      const err = wrap(Math.atan2(dx, dz) - s.yaw);
      const keys: Record<string, boolean> = {};
      if (err > 0.04) keys.ArrowLeft = true;
      if (err < -0.04) keys.ArrowRight = true;
      if (Math.abs(err) < 0.5) keys.ArrowUp = true;
      if (hold > 0) { keys.Space = true; hold--; }
      g.setInput(keys);
      g.step(1 / 60, 1);
      steps++;
      s = g.getState();
      cams.push({ x: s.camera.x, y: s.camera.y, z: s.camera.z });
      if (s.camera.inside) insideCount++;
      minClearance = Math.min(minClearance, s.camera.clearance);
      if (g.events.some((e) => e.type === 'module:enter')) break;
    }
    g.setInput({});
    return {
      reached: g.events.some((e) => e.type === 'module:enter'),
      steps, enterEvent: g.events.find((e) => e.type === 'module:enter')?.detail ?? null,
      cams, insideCount, minClearance, respawns: s.respawns, final: s,
    };
  });
  console.log(`bot: ${res.steps} pasos (${(res.steps / 60).toFixed(1)} s sim), evento=${JSON.stringify(res.enterEvent)}, respawns=${res.respawns}, cámara dentro=${res.insideCount}, holgura mín=${res.minClearance.toFixed(3)} m`);
  expect(res.reached).toBe(true);
  expect(res.enterEvent).toMatchObject({ id: 'eje_macizo' });
  expect(res.respawns).toBe(0);
  expect(res.insideCount).toBe(0);
  expect(res.minClearance).toBeGreaterThan(0.1);

  // verificación independiente con la geometría declarada del nivel
  const solids = await page.evaluate(() => (window.__game.game as any).def.solids);
  let bad = 0;
  for (const c of res.cams) {
    for (const sd of solids) {
      const [cx, cy, cz] = sd.center;
      if (sd.kind === 'cyl') {
        if (Math.hypot(c.x - cx, c.z - cz) < sd.radius && Math.abs(c.y - cy) < sd.height / 2) bad++;
      } else {
        const a = -(sd.rotX ?? 0);
        const ly = (c.y - cy) * Math.cos(a) - (c.z - cz) * Math.sin(a);
        const lz = (c.y - cy) * Math.sin(a) + (c.z - cz) * Math.cos(a);
        if (Math.abs(c.x - cx) < sd.size[0] / 2 && Math.abs(ly) < sd.size[1] / 2 && Math.abs(lz) < sd.size[2] / 2) bad++;
      }
    }
  }
  expect(bad).toBe(0);
  await expect(page.getByTestId('notice')).toContainText('Eje macizo');
  // desde la capa c la puerta monta el módulo real: salir antes de la captura del mundo
  await page.waitForFunction(() => (window.__game.getState() as any).module === 'eje_macizo');
  await page.evaluate(() => (window.__game.game as any).exitModule());

  // captura frente a las puertas
  await run(page, {}, 30);
  await page.evaluate(() => window.__game.teleport(0.5, 2.7, 17.6, 0));
  await run(page, {}, 60);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `tests/e2e/screens/b-${info.project.name}.png` });
  expectNoErrors(errors);
});

test('capa b: puerta bloqueada, montaje/desmontaje de módulo y cámara contra la puerta', async ({ page }) => {
  const errors = await boot(page);
  // puerta bloqueada
  await page.evaluate(() => window.__game.teleport(2.1, 2.7, 19.5, 0));
  let s = await run(page, { ArrowUp: true }, 90);
  const ev = await page.evaluate(() => window.__game.events.map((e) => e.type + ':' + (e.detail as any).id));
  console.log(`bloqueada: z=${s.pos.z.toFixed(3)} eventos=${ev.join(',')}`);
  expect(ev).toContain('module:locked:predecir_giro');
  expect(ev).not.toContain('module:enter:predecir_giro');
  expect(s.pos.z).toBeLessThan(21.7 - 0.3);

  // módulo de prueba: se monta, pausa el mundo, se desmonta y libera recursos
  await run(page, {}, 5);
  const r = await page.evaluate(async () => {
    const g = window.__game;
    const game = g.game as any;
    const three = game.scene.constructor;
    const before = game.renderer.info.memory.geometries;
    let updates = 0;
    game.registerModule('eje_macizo', (ctx: any) => {
      const scene = new three();
      const box = game.mouse.root.children[0].children[0];
      const mesh = new box.constructor(box.geometry.clone(), box.material.clone());
      scene.add(mesh);
      ctx.root.textContent = 'módulo';
      const cam = new game.cam.camera.constructor(50, 1, 0.1, 100);
      cam.position.set(0, 0, 3);
      cam.lookAt(0, 0, 0);
      return { scene, camera: cam, update: () => { updates++; } };
    });
    g.enterModule('eje_macizo');
    await new Promise((res) => setTimeout(res, 20));
    g.step(1 / 60, 10);
    game.render();
    const during = { module: (g.getState() as any).module, geo: game.renderer.info.memory.geometries, root: !!document.querySelector('.module-root'), updates };
    game.exitModule({ ok: true });
    g.step(1 / 60, 30);
    game.render();
    const st = g.getState() as any;
    return { before, during, after: game.renderer.info.memory.geometries, st, root: !!document.querySelector('.module-root'), events: g.events.map((e) => e.type) };
  });
  console.log(`módulo: geometrías antes ${r.before}, montado ${r.during.geo}, después ${r.after}; updates=${r.during.updates}; cámara tras volver dist=${r.st.camera.dist} inside=${r.st.camera.inside}`);
  expect(r.during.module).toBe('eje_macizo');
  expect(r.during.root).toBe(true);
  expect(r.during.updates).toBe(10);
  expect(r.during.geo).toBe(r.before + 1);
  expect(r.after).toBe(r.before);
  expect(r.root).toBe(false);
  expect(r.st.module).toBe(null);
  expect(r.events).toEqual(expect.arrayContaining(['module:enter', 'module:mounted', 'module:exit']));
  // de vuelta frente a la puerta, mirando al centro: la cámara quedaría tras el muro, debe acercarse sin entrar
  expect(r.st.pos.z).toBeCloseTo(21.7 - 2.4, 1);
  expect(r.st.camera.inside).toBe(false);
  expect(r.st.camera.dist).toBeLessThan(4.5);
  s = await state(page);
  expect(s.camera.clearance).toBeGreaterThan(0.1);
  expectNoErrors(errors);
});

test('rendimiento: tiempo de fotograma y memoria con bucle real (?debug=1)', async ({ page }) => {
  const errors = await boot(page, '?debug=1');
  await page.waitForTimeout(3000);
  const s = await state(page);
  console.log(`perf: frame ${s.perf.frameMs.toFixed(2)} ms, cpu ${s.perf.cpuMs.toFixed(2)} ms, heap ${s.perf.heapMB?.toFixed(1)} MB, geo ${s.perf.geometries}, tex ${s.perf.textures}, draw ${s.perf.drawCalls}`);
  expect(s.perf.frameMs).toBeGreaterThan(0);
  await expect(page.getByTestId('perf')).toContainText('fps');
  expectNoErrors(errors);
});

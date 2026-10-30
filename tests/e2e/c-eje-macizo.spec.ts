import { test, expect, type Page } from '@playwright/test';
import { boot, expectNoErrors, run } from './helpers';

type M = any;
export const mod = (page: Page): Promise<M> => page.evaluate(() => (window.__game as any).module?.state ?? null);
export const steps = (page: Page, n: number): Promise<void> => page.evaluate((k) => { window.__game.step(1 / 60, k); (window.__game.game as any).render(); }, n);

/** Camina desde la plaza hasta la puerta «Eje macizo» y espera el montaje. */
async function entrarDesdeElMundo(page: Page): Promise<void> {
  await page.evaluate(() => window.__game.teleport(-1.0, 2.7, 19.6, 0));
  await run(page, {}, 10);
  for (let i = 0; i < 40; i++) {
    await run(page, { ArrowUp: true }, 5);
    if (await page.evaluate(() => window.__game.events.some((e) => e.type === 'module:enter'))) break;
  }
  await run(page, {}, 1);
  await page.waitForFunction(() => !!(window.__game as any).module);
  const ev = await page.evaluate(() => window.__game.events.map((e) => e.type));
  expect(ev).toEqual(expect.arrayContaining(['module:enter', 'module:mounted']));
}

/** Resuelve con los ganchos: c = d·mult·conv, T en N·m. */
async function resolver(page: Page, o: { mult: number; conv: number; pred: string; conf: string; formula?: string }): Promise<M> {
  return page.evaluate((o) => {
    const m = (window.__game as any).module;
    m.selectFormula(o.formula ?? 'tau_max_macizo');
    m.bind('T', 'T'); m.convert('T', 1e3);
    m.bind('c', 'd'); m.scale('c', o.mult); m.convert('c', o.conv);
    m.predict(o.pred); m.confidence(o.conf);
    const ok = m.apply();
    return { ok, s: m.state };
  }, o);
}

test('capa c: entra desde el mundo, arrastre real, resuelve correcto y vuelve', async ({ page }, info) => {
  const errors = await boot(page);
  await entrarDesdeElMundo(page);
  await page.evaluate(() => (window.__game as any).module.nuevo({ variante: 1 }));
  await steps(page, 2);
  let s = await mod(page);
  expect(s.presentacion).toBe('ejemplo_resuelto');
  expect(s.fase).toBe('resolver');
  await expect(page.getByTestId('pasos')).toContainText('Ejemplo resuelto');
  await page.getByTestId('formula-tau_max_macizo').click();
  await expect(page.getByTestId('slot-T')).toBeVisible();
  if (info.project.name === 'desktop') {
    // arrastre real con el ratón: ficha T → hueco T
    const ficha = page.getByTestId('ficha-T');
    await page.getByTestId('slot-T').scrollIntoViewIfNeeded();
    const a = (await ficha.boundingBox())!;
    const b = (await page.getByTestId('slot-T').boundingBox())!;
    const ax = a.x + a.width / 2, ay = a.y + a.height / 2, bx = b.x + b.width / 2, by = b.y + b.height / 2;
    await page.mouse.move(ax, ay);
    await page.mouse.down();
    for (let k = 1; k <= 12; k++) await page.mouse.move(ax + (bx - ax) * k / 12, ay + (by - ay) * k / 12);
    await page.mouse.up();
  } else {
    // en el teléfono: tocar la ficha y luego el hueco
    await page.getByTestId('ficha-T').tap();
    await page.getByTestId('slot-T').tap();
  }
  s = await mod(page);
  console.log(`interacción real (${info.project.name}): slot T = ${JSON.stringify(s.slots.T)}`);
  expect(s.slots.T.ficha).toBe('T');
  await page.getByTestId('conv-T-1000').click();
  s = await mod(page);
  expect(s.bindings.T).toEqual({ valor: 800, unidad: 'N·m' });

  // sin predicción no se aplica
  await page.evaluate(() => { const m = (window.__game as any).module; m.bind('c', 'd'); m.scale('c', 0.5); m.convert('c', 1e-3); });
  expect(await page.evaluate(() => (window.__game as any).module.apply())).toBe(false);
  await expect(page.getByTestId('msg')).toContainText('Predice');
  const r = await resolver(page, { mult: 0.5, conv: 1e-3, pred: 'aprueba', conf: 'media' });
  expect(r.ok).toBe(true);
  expect(r.s.fase).toBe('animando');
  await steps(page, 60);
  s = await mod(page);
  console.log(`a mitad de rampa: φ dibujado ${s.shaft.phiDibujado.toFixed(4)} rad, medido en vértices ${s.shaft.anguloMedido.toFixed(4)}`);
  expect(Math.abs(s.shaft.anguloMedido - s.shaft.phiDibujado)).toBeLessThan(1e-4);
  await steps(page, 200);
  s = await mod(page);
  const f = s.fisica;
  const J = Math.PI * f.c ** 4 / 2;
  const phi = f.T * f.L / (J * f.G);
  console.log(`correcto: τ=${s.veredicto.valorMostrado.toFixed(2)} MPa estado=${s.visual.estado} φreal=${phi.toFixed(5)} rad ×${f.exageracion} → dibujado ${s.shaft.phiDibujado.toFixed(5)} (medido ${s.shaft.anguloMedido.toFixed(5)})`);
  expect(s.fase).toBe('resultado');
  expect(s.veredicto.resultado).toBe('correcto');
  expect(s.veredicto.valorMostrado).toBeCloseTo(63.66, 1);
  expect(s.visual.estado).toBe('ok');
  expect(s.shaft.roto).toBe(false);
  expect(s.shaft.phiDibujado).toBeCloseTo(phi * f.exageracion, 9);
  expect(Math.abs(s.shaft.anguloMedido - s.shaft.phiDibujado)).toBeLessThan(1e-4);
  expect(s.diagnostico.prediccion.acierta).toBe(true);
  await expect(page.getByTestId('exag')).toContainText(`dibujado ×${f.exageracion}`);
  await expect(page.getByTestId('diagnostico')).toContainText('¡Correcto!');
  await page.waitForTimeout(150);
  await page.screenshot({ path: `tests/e2e/screens/c-${info.project.name}.png` });

  // siguiente ejercicio: se retira el ejemplo resuelto
  await page.getByTestId('otro').click();
  s = await mod(page);
  expect(s.presentacion).toBe('pasos_parciales');
  expect(s.variante).not.toBe(1);

  await page.getByTestId('exit').click();
  await run(page, {}, 5);
  const st = await page.evaluate(() => ({ module: (window.__game.getState() as any).module, hook: !!(window.__game as any).module, root: !!document.querySelector('.module-root'), ev: window.__game.events.map((e) => e.type) }));
  expect(st.module).toBe(null);
  expect(st.hook).toBe(false);
  expect(st.root).toBe(false);
  expect(st.ev).toContain('module:exit');
  expectNoErrors(errors);
});

test('capa c: errores típicos con diagnóstico y consecuencias distintas', async ({ page }, info) => {
  const errors = await boot(page);
  await page.evaluate(() => window.__game.enterModule('eje_macizo'));
  await page.waitForFunction(() => !!(window.__game as any).module);
  const casos = [
    { id: 'diametro_por_radio', nombre: 'Diámetro en lugar de radio', mult: 1, conv: 1e-3, v: 0 },
    { id: 'mm_sin_convertir', nombre: 'mm sin convertir a m', mult: 0.5, conv: 1, v: 0 },
    { id: 'j_polar_cuarto', nombre: 'J polar mal (πc⁴/4)', mult: 0.5, conv: 1e-3, v: 1, formula: 'tau_j_cuarto' },
  ];
  const out: Record<string, M> = {};
  for (const c of casos) {
    await page.evaluate((v) => (window.__game as any).module.nuevo({ variante: v }), c.v);
    const r = await resolver(page, { mult: c.mult, conv: c.conv, pred: 'aprueba', conf: 'alta', ...(c.formula ? { formula: c.formula } : {}) });
    expect(r.ok).toBe(true);
    await steps(page, 220);
    const s = await mod(page);
    out[c.id] = s;
    console.log(`${c.id}: veredicto=${s.veredicto.errorId} τjug=${s.veredicto.valorMostrado.toPrecision(4)} MPa estado=${s.visual.estado} fractura=${s.shaft.fractura} roto=${s.shaft.roto} ghost=${s.visual.ghostScale?.toPrecision(4)} (dibujado ${s.shaft.ghostScaleDibujado}) surplus=${s.visual.surplusScale?.toPrecision(4)} paso=${s.diagnostico.paso?.n} «${s.diagnostico.paso?.texto}»`);
    expect(s.fase).toBe('resultado');
    expect(s.veredicto.resultado).toBe('error');
    expect(s.veredicto.errorId).toBe(c.id);
    expect(s.diagnostico.titulo).toBe(c.nombre);
    await expect(page.getByTestId('diagnostico')).toContainText(c.nombre);
    await expect(page.getByTestId('paso-difiere')).toBeAttached();
    if (c.id === 'diametro_por_radio') {
      await page.waitForTimeout(150);
      await page.screenshot({ path: `tests/e2e/screens/c-${info.project.name}-error.png` });
    }
  }
  const a = out.diametro_por_radio, b = out.mm_sin_convertir, j = out.j_polar_cuarto;
  expect(a.visual.estado).toBe('rompe');
  expect(a.shaft.roto).toBe(true);
  expect(a.shaft.fractura).toBe('ductil');
  expect(a.visual.ghostScale).toBeCloseTo(2, 6);
  expect(a.diagnostico.paso.n).toBe(1);
  expect(a.diagnostico.prediccion.acierta).toBe(false);
  expect(b.visual.estado).toBe('rompe');
  expect(b.visual.ghostScale).toBeCloseTo(1000, 3);
  expect(b.shaft.ghostScaleDibujado).toBe(3.5);
  expect(b.visual.uJugador).toBeLessThan(1e-6);
  expect(b.shaft.ghostScaleDibujado).not.toBe(a.shaft.ghostScaleDibujado);
  expect(j.visual.estado).toBe('sobra');
  expect(j.shaft.roto).toBe(false);
  expect(j.visual.surplusScale).toBeCloseTo(Math.cbrt(2 * j.visual.uReal), 6);
  expect(j.shaft.surplusScale).toBeGreaterThan(1);
  expect(j.diagnostico.formulaOk).toBe(false);
  expectNoErrors(errors);
});

test('capa c: pistas graduales según decidirAyuda y ejemplo al cortar', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => window.__game.enterModule('eje_macizo'));
  await page.waitForFunction(() => !!(window.__game as any).module);
  await page.evaluate(() => (window.__game as any).module.nuevo({ variante: 0 }));
  expect(await page.evaluate(() => (window.__game as any).module.hint())).toBe(null);
  await expect(page.getByTestId('hint')).toBeDisabled();
  await page.evaluate(() => window.__game.clock.set(window.__game.clock.now() + 121_000));
  await steps(page, 40);
  await expect(page.getByTestId('hint')).toBeEnabled();
  await page.getByTestId('hint').click();
  let s = await mod(page);
  expect(s.pistasUsadas).toBe(1);
  await expect(page.getByTestId('pistas')).toContainText('superficie');
  expect(s.pistas.join(' ')).not.toContain('119');
  await page.evaluate(() => window.__game.clock.set(window.__game.clock.now() + 241_000));
  await steps(page, 40);
  expect(await page.evaluate(() => (window.__game as any).module.hint())).toContain('τ = Tc/J');
  for (let k = 0; k < 4; k++) {
    await resolver(page, { mult: 1, conv: 1e-3, pred: 'aprueba', conf: 'baja' });
    await steps(page, 220);
    await page.evaluate(() => (window.__game as any).module.corregir());
  }
  s = await mod(page);
  expect(s.ayuda.accion).toBe('cortar');
  await page.getByTestId('hint').click();
  s = await mod(page);
  expect(s.mostrarEjemplo).toBe(true);
  expectNoErrors(errors);
});

import { test, expect } from '@playwright/test';
import { boot, expectNoErrors, run, state } from './helpers';

const WALK = 4.0, ACCEL = 28, TURN = 2.8, DT = 1 / 60;

function expectedWalk(steps: number): number {
  let v = 0, x = 0;
  for (let i = 0; i < steps; i++) { v = Math.min(WALK, v + ACCEL * DT); x += v * DT; }
  return x;
}

test('capa a: camina, gira, cámara sigue, controles según puntero', async ({ page }, info) => {
  const errors = await boot(page);
  let s = await run(page, {}, 30);
  expect(s.grounded).toBe(true);
  const start = s.pos;
  const yaw0 = s.yaw;

  // (a) avanzar 90 pasos (1,5 s) con ↑
  s = await run(page, { ArrowUp: true }, 90);
  const dz = s.pos.z - start.z, dx = s.pos.x - start.x;
  const exp = expectedWalk(90);
  console.log(`avance: real ${dz.toFixed(4)} m, esperado ${exp.toFixed(4)} m, v=${s.speed} m/s`);
  expect(Math.abs(dz - exp) / exp).toBeLessThan(0.02);
  expect(Math.abs(dx)).toBeLessThan(0.01);
  expect(s.speed).toBeCloseTo(WALK, 2);
  expect(Math.abs(s.pos.y - start.y)).toBeLessThan(0.03);

  // la cámara queda detrás y a distancia estable
  s = await run(page, {}, 120);
  expect(s.camera.z).toBeLessThan(s.pos.z - 3);
  expect(s.camera.y).toBeGreaterThan(s.pos.y + 1.2);
  expect(s.camera.dist).toBeGreaterThan(4.5);
  expect(s.camera.dist).toBeLessThan(6);

  // (b) girar 60 pasos con ← (yaw aumenta) y quedarse en el sitio
  const before = s;
  s = await run(page, { ArrowLeft: true }, 60);
  console.log(`giro: Δyaw ${(s.yaw - before.yaw).toFixed(4)} rad, esperado ${TURN.toFixed(4)}`);
  expect(s.yaw - before.yaw).toBeCloseTo(TURN, 3);
  expect(Math.hypot(s.pos.x - before.pos.x, s.pos.z - before.pos.z)).toBeLessThan(0.01);
  // tras girar, avanzar va en la nueva dirección
  const p1 = s.pos;
  s = await run(page, { ArrowUp: true }, 30);
  const dir = Math.atan2(s.pos.x - p1.x, s.pos.z - p1.z);
  expect(Math.abs(dir - s.yaw) % (2 * Math.PI)).toBeLessThan(0.02);
  // ↓ retrocede
  const p2 = s.pos;
  s = await run(page, { ArrowDown: true }, 60);
  const back = (s.pos.x - p2.x) * Math.sin(s.yaw) + (s.pos.z - p2.z) * Math.cos(s.yaw);
  expect(back).toBeLessThan(-1);

  // ↑ por teclado real también
  const p3 = (await state(page)).pos;
  await page.keyboard.down('ArrowUp');
  s = await run(page, {}, 20);
  await page.keyboard.up('ArrowUp');
  expect(Math.hypot(s.pos.x - p3.x, s.pos.z - p3.z)).toBeGreaterThan(0.5);

  // controles táctiles solo con puntero grueso
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  expect(s.touchControls).toBe(coarse);
  expect(await page.locator('.touch-ui').count()).toBe(coarse ? 1 : 0);
  if (info.project.name === 'phone') expect(coarse).toBe(true);
  else expect(coarse).toBe(false);

  // pose para la captura
  await page.evaluate(([y]) => window.__game.teleport(0, 0, -1.5, y as number), [yaw0]);
  await run(page, {}, 90);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `tests/e2e/screens/a-${info.project.name}.png` });
  expectNoErrors(errors);
});

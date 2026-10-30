# Ratón Ingeniero — plan y contratos (fuente de verdad para todos los agentes)

Requisitos completos del usuario: the original (local) requirements prompt (léelo si tu capa toca pedagogía o UI).
Pedagogía: `.claude/skills/tutor-mecatronica/SKILL.md` y `references/juegos.md`. Fuente de contenido: a Beer–Johnston ch. 3 PDF (not included, copyrighted).

## Stack
Vite + TypeScript estricto + three + @dimforge/rapier3d-compat + katex + idb + zod + vite-plugin-pwa. Pruebas: vitest (unit) y @playwright/test (e2e, chromium, proyectos `desktop` 1280x800 y `phone` Pixel 7). Sin dependencias de pago ni llaves.

## Estructura
```
src/engine/   TS puro, SIN three ni DOM (testeable en node)
  units.ts      dimensiones SI y conversiones (mm, m, kN·m, N·m, GPa, MPa, rpm, Hz, kW...)
  expr.ts       mini-intérprete seguro de expresiones (+ - * / ^, pi, paréntesis, variables). Nada de eval.
  pack.ts       esquema zod del paquete de contenido + loadPack(json)
  generator.ts  generate(pack, exerciseId, seed) -> Instance (valores concretos, respuesta correcta, pasos, respuestas de cada error)
  judge.ts      judge(instance, submission) -> Verdict
  rng.ts        PRNG con semilla (mulberry32)
  learner/      LearnerModel (interfaz), bkt.ts, baseline.ts (promedio móvil), policy.ts (siguiente ejercicio + ayuda), schedule.ts (repaso 1/3/7/21 d)
  log.ts        EventLog sobre IndexedDB (idb) con export JSON; versión en memoria para tests
src/game/     three + rapier: world, mouse (ratón), camera, controls (teclado + táctil), modules/, arm (brazo), shaftView
src/ui/       capa HTML sobre el canvas: formula bank, drag&drop (Pointer Events), KaTeX, panel, diálogos
src/testhooks.ts  window.__game
contenido/paquetes/torsion.json
tests/unit/*.test.ts   tests/e2e/*.spec.ts
```

## Contratos
- Paquete: `{ id, titulo, kcs:[{id,nombre}], formulas:[{id, latex, expr, resultado:{simbolo,unidad}, variables:[simbolo]}], ejercicios:[{id, modulo, kcs:[], enunciado (con {placeholders}), variables:[{simbolo, nombre, unidad_mostrada, valores:[...] }], incognita, formula_correcta, pasos:[...], errores:[{id, nombre, descripcion, expr_equivocada, consecuencia:'rompe'|'sobra'|'gira_mas'|'gira_menos'|..., pista_diagnostico}], pistas:[concepto, formula, paso] , limites:{tau_adm?, phi_adm?}}] }`. Valores en unidades mostradas; el motor convierte a SI.
- `judge` tolerancia relativa 3 %. Si no coincide con la correcta, compara con cada `expr_equivocada`; si coincide → `errorId`; si no → `'no_clasificado'`.
- La sumisión del jugador es estructurada: `{formulaId, bindings:{simbolo: {valor, unidad}}, prediccion?, confianza:'baja'|'media'|'alta'}`; el motor calcula. No hay calculadora.
- `LearnerModel`: `update(kcIds, correct, meta)`, `pMastery(kcId)`, `snapshot()`, `restore()`. BKT con parámetros compartidos p0=0.2, T=0.15, S=0.1, G=0.2.
- Reloj inyectable (`now()`) en todo lo que dependa de fechas.
- `window.__game = { ready:boolean, seed, getState(), setInput(keys), step(dt, n), teleport(x,y,z), enterModule(id), engine, clock:{set(ms)} }`. `?test=1` en la URL → bucle fijo controlado por `step`, semilla fija.

## Convenciones
- UI en español. Comentarios mínimos. Fórmulas siempre con KaTeX.
- Exageración visual siempre rotulada ("dibujado ×N").
- Cada capa termina con: `npm run build` sin errores, `npm test` verde, e2e/capturas en `tests/e2e/screens/<capa>-{desktop,phone}.png`, consola sin errores. Commit por capa terminando con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Depura con números (posiciones, transformaciones, esperado vs real), arregla la causa raíz.
- Al terminar, añade a `docs/ESTADO.md` una sección corta: qué hiciste, cómo se verificó, qué NO se verificó.

## Capas
0 andamiaje · a escena+ratón+cámara · b salto+plataformas+puerta · c módulo Eje macizo (motor+ejercicio+fórmulas+consecuencia) · d brazo agarrador · e modelo del jugador+panel+registro · f módulo Predecir el giro + prueba sin pistas + modo examen + bot e2e.


# Estado por capas

## Capa 0: andamiaje
**Qué se hizo:** Vite + TS estricto (noUncheckedIndexedAccess), PWA (manifest "Ratón Ingeniero", es, offline por workbox), Playwright con proyectos desktop (1280x800) y phone (Pixel 7) sobre `vite preview` tras build, WebGL por software (swiftshader). Estructura de carpetas del PLAN con stubs; `src/main.ts` monta cubo three.js, inicializa Rapier y expone `window.__game` (ready tras init; setInput/teleport/enterModule/clock son no-op con TODO). `src/engine/rng.ts` (mulberry32) con test.

**Verificación:** `npm run build`, `npm test` (3 tests) y `npm run e2e` (2 tests, 0 errores de consola) en verde; capturas `tests/e2e/screens/0-{desktop,phone}.png` revisadas (cubo visible, no negro).

**No verificado:** instalación PWA / funcionamiento offline real (solo se genera el service worker); GPU real; el proyecto phone es retrato (Pixel 7 por defecto), la orientación horizontal no se probó.

## Capas a y b: mundo, ratón, salto y plataformas
**Qué se hizo:** escena cálida (cielo en degradado, niebla, sombras PCF, texturas procedurales), ratón de primitivas con casco y animación de caminar/reposo/salto, cámara de 3.ª persona suavizada que no atraviesa geometría, controles táctiles con `pointer: coarse`. Hub con plataformas a 0,6/1,3/2,0 m, rampa de 19°, plaza a 2,7 m con puertas «Eje macizo» (abierta) y «Predecir el giro» (bloqueada). Rapier KinematicCharacterController, coyote time, jump buffer, respawn bajo y=-12. API de módulos `game.registerModule` y eventos `module:enter/mounted/exit`.

**Verificación (números):** caminar 4 m/s (5,7467 m en 90 pasos = esperado), giro 2,8 rad/s, salto máx. 1,2912 m (= cálculo discreto), coyote a 83 ms sí / 200 ms no. Bot llega a la puerta en 413 pasos sin respawns; holgura mínima de cámara 1,89 m. e2e 12/12 (desktop + phone), 0 errores de consola. Liberación de módulo: 65 → 66 → 65 geometrías.

**No verificado:** táctil con dedos reales, 60 fps en GPU real (swiftshader no representa), teléfono horizontal, sensación del salto con teclado real, `Game.dispose()` completo.

## Motor y paquete de torsión
**Qué se hizo:** `src/engine/` (unidades, intérprete de expresiones propio, esquema zod, generador con semilla, juez ±3 % con clasificación de errores, BKT + promedio móvil de línea base, repaso 1/3/7/21 días, políticas de siguiente ejercicio y de ayuda, registro de eventos en memoria/IndexedDB con export JSON, fachada `Tutor`). `contenido/paquetes/torsion.json`: 9 KC, 5 fórmulas + 4 distractoras, 5 módulos (21 variantes), 28 errores típicos con fórmula equivocada, consecuencia y pista.

**Verificación:** 83 tests vitest. Sin solapes ±3 % entre correcta y errores en todas las variantes; ninguna pista contiene el resultado. Libro: Problema modelo 3.1 (J, τmáx 86,2 MPa, τmín 64,7 MPa, dmín 77,8 mm) y 3.4 (8000 psi, φAB 2,22°) reproducidos con < 0,2 % de error.

**No verificado:** φCD del Problema modelo 3.4 (la diapositiva dice L = 24 in y da 2,95°; con 24 in sale 1,96°, cuadraría con 36 in — dato de la figura no legible); `IdbEventLog` sin prueba real (solo tipos); umbrales de política sin calibrar con datos.

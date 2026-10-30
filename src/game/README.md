# src/game

The browser game layer, built on three.js and Rapier.

- `game.ts`: main loop and scene assembly; `session.ts` and `level.ts` manage the session and layout.
- `player.ts`, `mouse.ts`, `arm.ts`: the mouse character, its movement and animation.
- `camera.ts`, `input.ts`: third-person camera and keyboard and touch input.
- `doors.ts`, `hud.ts`: doors that unlock modules, and the on-screen HUD.
- `modules/`: game modules, including the solid-shaft exercise.

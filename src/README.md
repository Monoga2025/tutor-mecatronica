# src

Application source for the tutor.

- `main.ts`: app entry point; `testhooks.ts` exposes hooks used by the end-to-end tests.
- `engine/`: pure TypeScript tutor logic, with no rendering.
- `game/`: the 3D world, character, camera and modules.
- `ui/`: the HTML overlay for exercises.

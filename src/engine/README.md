# src/engine

Pure TypeScript tutor engine, with no rendering or DOM access.

- `units.ts`, `expr.ts`: units and a safe expression parser (no `eval`).
- `pack.ts`: content-pack schema (zod); `generator.ts` builds seeded instances with `rng.ts`.
- `judge.ts`: grades answers within 3 % and names the conceptual error.
- `tutor.ts`, `clock.ts`: exercise flow and timing.
- `learner/`: Bayesian knowledge tracing, baseline and spaced review.
- `log.ts`: event log, persisted through IndexedDB.

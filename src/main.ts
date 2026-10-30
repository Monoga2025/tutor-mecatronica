import RAPIER from '@dimforge/rapier3d-compat';
import { installHook } from './testhooks';
import { Game } from './game/game';
import { createEjeMacizo, MODULO as EJE_MACIZO } from './game/modules/ejeMacizo';

const params = new URLSearchParams(location.search);
const testMode = params.has('test');
const debug = params.has('debug');
const seed = testMode ? 12345 : (Date.now() & 0x7fffffff);

async function boot(): Promise<void> {
  await RAPIER.init();
  const game = new Game({ testMode, debug });
  game.registerModule(EJE_MACIZO, createEjeMacizo);
  const hook = installHook({
    seed,
    step: (dt, n = 1) => game.step(dt, n),
    getState: () => game.getState(),
    setInput: (keys) => game.input.setInjected(keys),
    teleport: (x, y, z, yaw) => game.teleport(x, y, z, yaw),
    enterModule: (id) => { game.enterModule(id); },
    events: game.eventLog,
    game,
  });
  game.render();
  if (testMode) game.startRenderOnly();
  else game.start();
  hook.ready = true;
}

void boot();

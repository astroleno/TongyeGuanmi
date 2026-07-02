import { createSceneRuntimeDomShell, SceneRuntimeDomShell } from './SceneRuntimeDomShell.js';
import { createMvpInkTransitionPlayer } from './MvpInkTransitionPlayer.js';
import { createSceneRuntimeMvpVisualRegistry } from './SceneRuntimeMvpVisualRegistry.js';

function startSceneRuntimeDomShell() {
  const href = globalThis.location?.href || 'http://localhost/';
  if (!SceneRuntimeDomShell.isEnabledFromUrl(href)) return null;

  const root = globalThis.document?.querySelector?.('[data-scene-runtime-shell]') || null;
  const transitionLayer = root?.querySelector?.('[data-runtime-layer="transition"]') || null;
  const { registry } = createSceneRuntimeMvpVisualRegistry();
  const shell = createSceneRuntimeDomShell({
    root,
    registry,
    transitionPlayer: createMvpInkTransitionPlayer({ layer: transitionLayer }),
    stableScenePlayers: ['hero', 'pattern', 'star-map'],
    timeouts: {
      transition: 2200,
      scene: 15000
    }
  });
  globalThis.__sceneRuntimeDomShell = shell;
  shell.start('hero').catch((error) => {
    console.error('[SceneRuntimeDomShell]', error);
  });
  return shell;
}

if (globalThis.document?.readyState === 'loading') {
  globalThis.document.addEventListener('DOMContentLoaded', startSceneRuntimeDomShell, { once: true });
} else {
  startSceneRuntimeDomShell();
}

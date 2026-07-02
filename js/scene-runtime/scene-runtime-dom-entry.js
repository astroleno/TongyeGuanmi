import { createSceneRuntimeDomShell, SceneRuntimeDomShell } from './SceneRuntimeDomShell.js';

function startSceneRuntimeDomShell() {
  const href = globalThis.location?.href || 'http://localhost/';
  if (!SceneRuntimeDomShell.isEnabledFromUrl(href)) return null;

  const shell = createSceneRuntimeDomShell();
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

const params = new URLSearchParams(window.location.search);
const sceneRuntimeEnabled = params.get('sceneRuntime') === '1';
const legacyTimelineEnabled = params.get('legacyTimeline') === '1';

if (sceneRuntimeEnabled && legacyTimelineEnabled) {
  throw new Error('?sceneRuntime=1 and ?legacyTimeline=1 are mutually exclusive.');
}

if (sceneRuntimeEnabled) {
  const { initSceneRuntime } = await import('./scenes/runtime/SceneRuntime.js');
  initSceneRuntime();
} else {
  const { initLegacyHomepage } = await import('./site/legacy-homepage.js');
  initLegacyHomepage();
}

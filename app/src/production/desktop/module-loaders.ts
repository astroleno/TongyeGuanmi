/** Desktop keeps the existing Stage/Director scene registry behind its shell boundary. */
export {
  loadSceneModule as loadDesktopSceneModule,
  loadTransitionModule as loadDesktopTransitionModule,
  loadedProductionModules as loadedDesktopModules
} from '../module-loaders';

import { canonicalSceneIds, canonicalSegments } from '../story/canonical-spine';
import type { SceneId, SceneModule, SegmentId, TransitionModule } from '../story/types';

const sceneCache = new Map<SceneId, Promise<SceneModule>>();
const transitionCache = new Map<SegmentId, Promise<TransitionModule>>();

export const productionSceneIds = canonicalSceneIds;
export const productionSegmentIds = canonicalSegments.map(({ id }) => id);

function importScene(id: SceneId): Promise<SceneModule> {
  switch (id) {
    case 'hero': return import('../scenes/hero').then(({ heroScene }) => heroScene);
    case 'pattern': return import('../scenes/pattern').then(({ patternScene }) => patternScene);
    case 'pattern-compact':
      return Promise.reject(new Error(`${id} is phone-only`));
    case 'star-map': return import('../scenes/star-map').then(({ starMapScene }) => starMapScene);
    case 'aod-animation': return import('../scenes/aod-animation').then(({ aodAnimationScene }) => aodAnimationScene);
    case 'method-top': return import('../scenes/method-top').then(({ methodTopScene }) => methodTopScene);
    case 'figure2-animation': return import('../scenes/figure2-animation').then(({ figure2AnimationScene }) => figure2AnimationScene);
    case 'figure2-proof': return import('../scenes/figure2-proof').then(({ figure2ProofScene }) => figure2ProofScene);
    case 'brand': return import('../scenes/brand').then(({ brandScene }) => brandScene);
    case 'figure3-animation': return import('../scenes/figure3-animation').then(({ figure3AnimationScene }) => figure3AnimationScene);
    case 'services': return import('../scenes/services').then(({ servicesScene }) => servicesScene);
    case 'ttg-animation': return import('../scenes/ttg-animation').then(({ ttgAnimationScene }) => ttgAnimationScene);
    case 'lab': return import('../scenes/lab').then(({ labScene }) => labScene);
    case 'ph-animation': return import('../scenes/ph-animation').then(({ phAnimationScene }) => phAnimationScene);
    case 'education': return import('../scenes/education').then(({ educationScene }) => educationScene);
    case 'crane-animation': return import('../scenes/crane-animation').then(({ craneAnimationScene }) => craneAnimationScene);
    case 'contact': return import('../scenes/contact').then(({ contactScene }) => contactScene);
    case 'figure2-proof-opening':
    case 'figure2-proof-cards':
    case 'figure2-proof-closing':
    case 'method-bottom':
      return Promise.reject(new Error(`${id} retired`));
  }
}

function importTransition(id: SegmentId): Promise<TransitionModule> {
  switch (id) {
    case 'hero-pattern': return import('../transitions/hero-pattern').then(({ createHeroPatternTransition }) => createHeroPatternTransition());
    case 'pattern-star-map': return import('../transitions/pattern-star-map').then(({ createPatternStarMapTransition }) => createPatternStarMapTransition());
    case 'pattern-collapse':
      return Promise.reject(new Error(`${id} is phone-only`));
    case 'star-map-aod': return import('../transitions/star-map-aod').then(({ createStarMapAodTransition }) => createStarMapAodTransition());
    case 'aod-method-top': return import('../transitions/aod-method-top').then(({ createAodMethodTopTransition }) => createAodMethodTopTransition());
    case 'method-bottom-figure2': return import('../transitions/method-bottom-figure2').then(({ createMethodBottomFigure2Transition }) => createMethodBottomFigure2Transition());
    case 'figure2-distance-expand': return import('../transitions/figure2-distance-expand').then(({ createFigure2DistanceExpandTransition }) => createFigure2DistanceExpandTransition());
    case 'figure2-proof-brand': return import('../transitions/figure2-proof-brand').then(({ createFigure2ProofBrandTransition }) => createFigure2ProofBrandTransition());
    case 'brand-figure3': return import('../transitions/brand-figure3').then(({ createBrandFigure3Transition }) => createBrandFigure3Transition());
    case 'figure3-services': return import('../transitions/figure3-services').then(({ createFigure3ServicesTransition }) => createFigure3ServicesTransition());
    case 'services-ttg': return import('../transitions/services-ttg').then(({ createServicesTtgTransition }) => createServicesTtgTransition());
    case 'ttg-lab': return import('../transitions/ttg-lab').then(({ createTtgLabTransition }) => createTtgLabTransition());
    case 'lab-ph': return import('../transitions/lab-ph').then(({ createLabPhTransition }) => createLabPhTransition());
    case 'ph-education': return import('../transitions/ph-education').then(({ createPhEducationTransition }) => createPhEducationTransition());
    case 'education-crane': return import('../transitions/education-crane').then(({ createEducationCraneTransition }) => createEducationCraneTransition());
    case 'crane-contact': return import('../transitions/crane-contact').then(({ createCraneContactTransition }) => createCraneContactTransition());
    case 'figure2-proof-opening-cards':
    case 'figure2-proof-cards-closing':
    case 'method-top-method-bottom':
      return Promise.reject(new Error(`${id} retired`));
  }
}

export function loadSceneModule(id: SceneId): Promise<SceneModule> {
  const cached = sceneCache.get(id);
  if (cached) {
    return cached;
  }
  const promise = Promise.all([import('./editorial-layout.css'), importScene(id)]).then(([, module]) => {
    if (module.id !== id) {
      throw new Error(`Scene loader returned ${module.id} for ${id}`);
    }
    return module;
  });
  sceneCache.set(id, promise);
  void promise.catch(() => {
    if (sceneCache.get(id) === promise) {
      sceneCache.delete(id);
    }
  });
  return promise;
}

export function loadTransitionModule(id: SegmentId): Promise<TransitionModule> {
  const cached = transitionCache.get(id);
  if (cached) {
    return cached;
  }
  const promise = importTransition(id).then((module) => {
    if (module.id !== id) {
      throw new Error(`Transition loader returned ${module.id} for ${id}`);
    }
    return module;
  });
  transitionCache.set(id, promise);
  void promise.catch(() => {
    if (transitionCache.get(id) === promise) {
      transitionCache.delete(id);
    }
  });
  return promise;
}

export function loadedProductionModules(): Readonly<{
  scenes: readonly SceneId[];
  transitions: readonly SegmentId[];
}> {
  return {
    scenes: [...sceneCache.keys()],
    transitions: [...transitionCache.keys()]
  };
}

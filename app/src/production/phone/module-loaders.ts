import {
  frontHalfPhoneSceneIds,
  frontHalfPhoneTransitionIds
} from './adapter-groups/front-half';
import {
  gradeAPhoneSceneIds,
  gradeAPhoneTransitionIds
} from './adapter-groups/grade-a';
import {
  group45PhoneSceneIds,
  group45PhoneTransitionIds
} from './adapter-groups/group4-5';
import {
  group67PhoneSceneIds,
  group67PhoneTransitionIds
} from './adapter-groups/group6-7';
import type {
  PhoneLoaderAdapterModule,
  PhoneSceneAdapterId,
  PhoneSceneAdapterComponent,
  PhoneSceneAdapterModule,
  PhoneTransitionAdapterId,
  PhoneTransitionAdapterComponent,
  PhoneTransitionAdapterModule
} from './types';
let loaderCache: Promise<PhoneLoaderAdapterModule> | undefined;
let resolvedLoaderCache: PhoneLoaderAdapterModule | undefined;
const sceneCache = new Map<PhoneSceneAdapterId, Promise<PhoneSceneAdapterModule>>();
const resolvedSceneCache = new Map<PhoneSceneAdapterId, PhoneSceneAdapterModule>();
const transitionCache = new Map<PhoneTransitionAdapterId, Promise<PhoneTransitionAdapterModule>>();
const resolvedTransitionCache = new Map<
  PhoneTransitionAdapterId,
  PhoneTransitionAdapterModule
>();

export const initialPhoneSceneAdapterIds = frontHalfPhoneSceneIds;
export const initialPhoneTransitionAdapterIds = frontHalfPhoneTransitionIds;
export const phoneSceneAdapterIds = [
  ...frontHalfPhoneSceneIds,
  ...gradeAPhoneSceneIds,
  ...group45PhoneSceneIds,
  ...group67PhoneSceneIds
] as const;
export const phoneTransitionAdapterIds = [
  ...frontHalfPhoneTransitionIds,
  ...gradeAPhoneTransitionIds,
  ...group45PhoneTransitionIds,
  ...group67PhoneTransitionIds
] as const;

function importPhoneLoaderAdapter(): Promise<PhoneLoaderAdapterModule> {
  return import('./scenes/PhoneLoader').then(({ PhoneLoader: Component }) => ({
    id: 'loader',
    Component
  }));
}

function sceneComponent(
  id: PhoneSceneAdapterId,
  module: Promise<unknown>,
  name: string
): Promise<PhoneSceneAdapterModule> {
  return module.then((loaded) => ({
    id,
    Component: (
      (loaded as Record<string, unknown>)[name]
    ) as PhoneSceneAdapterComponent
  }));
}

function importPhoneSceneAdapter(id: PhoneSceneAdapterId): Promise<PhoneSceneAdapterModule> {
  switch (id) {
    case 'hero':
      return sceneComponent(id, import('./scenes/PhoneHero'), 'PhoneHero');
    case 'pattern':
      return sceneComponent(id, import('./scenes/PhonePattern'), 'PhonePattern');
    case 'star-map':
      return sceneComponent(id, import('./scenes/PhoneStarMap'), 'PhoneStarMap');
    case 'aod-animation':
      return import('./scenes/PhoneAod').then(({
        PhoneAod: Component,
        PHONE_AOD_ALPHA_START_PROGRESS: aodAlphaStartProgress,
        PHONE_AOD_ALPHA_END_PROGRESS: aodAlphaEndProgress
      }) => ({
        id,
        Component: Component as unknown as PhoneSceneAdapterComponent,
        aodAlphaStartProgress,
        aodAlphaEndProgress
      }));
    case 'method-top':
      return sceneComponent(
        id,
        import('./scenes/PhoneMethodTop'),
        'PhoneMethodTop'
      );
    case 'figure2-animation':
      return sceneComponent(
        id,
        import('./scenes/PhoneFigure2'),
        'PhoneFigure2'
      );
    case 'figure2-proof':
      return sceneComponent(
        id,
        import('./scenes/PhoneFigure2Proof'),
        'PhoneFigure2Proof'
      );
    case 'brand':
      return sceneComponent(
        id,
        import('../../scenes/brand/phone/PhoneBrand'),
        'PhoneBrand'
      );
    case 'figure3-animation':
      return sceneComponent(
        id,
        import('../../scenes/figure3-animation/phone/PhoneFigure3'),
        'PhoneFigure3'
      );
    case 'services':
      return sceneComponent(
        id,
        import('../../scenes/services/phone/PhoneServices'),
        'PhoneServices'
      );
    case 'ttg-animation':
      return sceneComponent(
        id,
        import('../../scenes/ttg-animation/phone/PhoneTtg'),
        'PhoneTtg'
      );
    case 'lab':
      return sceneComponent(
        id,
        import('../../scenes/lab/phone/PhoneLab'),
        'PhoneLab'
      );
    case 'ph-animation':
      return sceneComponent(id, import('./scenes/PhonePh'), 'PhonePh');
    case 'education':
      return sceneComponent(
        id,
        import('./scenes/PhoneEducation'),
        'PhoneEducation'
      );
    case 'crane-animation':
      return sceneComponent(id, import('./scenes/PhoneCrane'), 'PhoneCrane');
    case 'contact':
      return sceneComponent(id, import('./scenes/PhoneContact'), 'PhoneContact');
  }
}

function transitionComponent(
  id: PhoneTransitionAdapterId,
  module: Promise<unknown>,
  name: string
): Promise<PhoneTransitionAdapterModule> {
  return module.then((loaded) => ({
    id,
    Component: (
      (loaded as Record<string, unknown>)[name]
    ) as PhoneTransitionAdapterComponent
  }));
}

function importPhoneTransitionAdapter(id: PhoneTransitionAdapterId): Promise<PhoneTransitionAdapterModule> {
  switch (id) {
    case 'hero-pattern':
      return transitionComponent(
        id,
        import('./transitions/hero-pattern'),
        'PhoneHeroPatternTransition'
      );
    case 'pattern-star-map':
      return transitionComponent(
        id,
        import('./transitions/pattern-star-map'),
        'PhonePatternStarMapTransition'
      );
    case 'star-map-aod':
      return transitionComponent(
        id,
        import('./transitions/star-map-aod'),
        'PhoneStarMapAodTransition'
      );
    case 'aod-method-top':
      return import('./transitions/aod-method-top').then(({ phoneAodMethodTopTransition }) => phoneAodMethodTopTransition);
    case 'method-bottom-figure2':
      return transitionComponent(
        id,
        import('./transitions/method-bottom-figure2'),
        'PhoneMethodBottomFigure2Transition'
      );
    case 'figure2-distance-expand':
      return transitionComponent(
        id,
        import('./transitions/figure2-distance-expand'),
        'PhoneFigure2DistanceExpandTransition'
      );
    case 'figure2-proof-brand':
      return transitionComponent(
        id,
        import('./transitions/figure2-proof-brand'),
        'PhoneFigure2ProofBrandTransition'
      );
    case 'brand-figure3':
      return transitionComponent(
        id,
        import('../../transitions/brand-figure3/phone'),
        'PhoneBrandFigure3Transition'
      );
    case 'figure3-services':
      return transitionComponent(
        id,
        import('../../transitions/figure3-services/phone'),
        'PhoneFigure3ServicesTransition'
      );
    case 'services-ttg':
      return transitionComponent(
        id,
        import('../../transitions/services-ttg/phone'),
        'PhoneServicesTtgTransition'
      );
    case 'ttg-lab':
      return transitionComponent(
        id,
        import('../../transitions/ttg-lab/phone'),
        'PhoneTtgLabTransition'
      );
    case 'lab-ph':
      return transitionComponent(
        id,
        import('../../transitions/lab-ph/phone'),
        'PhoneLabPhTransition'
      );
    case 'ph-education':
      return transitionComponent(
        id,
        import('../../transitions/ph-education/phone'),
        'PhonePhEducationTransition'
      );
    case 'education-crane':
      return transitionComponent(
        id,
        import('../../transitions/education-crane/phone'),
        'PhoneEducationCraneTransition'
      );
    case 'crane-contact':
      return transitionComponent(
        id,
        import('../../transitions/crane-contact/phone'),
        'PhoneCraneContactTransition'
      );
  }
}

function cachedAdapter<
  Id extends string,
  Module extends Readonly<{ id: Id }>
>(
  id: Id,
  pending: Map<Id, Promise<Module>>,
  resolved: Map<Id, Module>,
  load: (id: Id) => Promise<Module>,
  kind: string
): Promise<Module> {
  const cached = pending.get(id);
  if (cached) return cached;
  const promise = load(id).then((adapter) => {
    if (adapter.id !== id) {
      throw new Error(`Phone ${kind} adapter returned ${adapter.id} for ${id}`);
    }
    resolved.set(id, adapter);
    return adapter;
  });
  pending.set(id, promise);
  void promise.catch(() => {
    if (pending.get(id) === promise) pending.delete(id);
  });
  return promise;
}

export function loadPhoneSceneAdapter(id: PhoneSceneAdapterId): Promise<PhoneSceneAdapterModule> {
  return cachedAdapter(
    id,
    sceneCache,
    resolvedSceneCache,
    importPhoneSceneAdapter,
    'scene'
  );
}

export function loadPhoneLoaderAdapter(): Promise<PhoneLoaderAdapterModule> {
  if (loaderCache) return loaderCache;
  const promise = importPhoneLoaderAdapter().then((adapter) => {
    resolvedLoaderCache = adapter;
    return adapter;
  });
  loaderCache = promise;
  void promise.catch(() => {
    if (loaderCache === promise) loaderCache = undefined;
  });
  return promise;
}

export function resolvedPhoneLoaderAdapter(): PhoneLoaderAdapterModule | undefined {
  return resolvedLoaderCache;
}

export function resolvedPhoneSceneAdapter(
  id: PhoneSceneAdapterId
): PhoneSceneAdapterModule | undefined {
  return resolvedSceneCache.get(id);
}

export function loadPhoneTransitionAdapter(id: PhoneTransitionAdapterId): Promise<PhoneTransitionAdapterModule> {
  return cachedAdapter(
    id,
    transitionCache,
    resolvedTransitionCache,
    importPhoneTransitionAdapter,
    'transition'
  );
}

export function resolvedPhoneTransitionAdapter(
  id: PhoneTransitionAdapterId
): PhoneTransitionAdapterModule | undefined {
  return resolvedTransitionCache.get(id);
}

export function loadedPhoneAdapters(): Readonly<{
  loader: boolean;
  scenes: readonly PhoneSceneAdapterId[];
  transitions: readonly PhoneTransitionAdapterId[];
}> {
  return {
    loader: Boolean(loaderCache),
    scenes: [...sceneCache.keys()],
    transitions: [...transitionCache.keys()]
  };
}

export async function loadPhoneRunDependencyClosure(
  dependencies: Readonly<{
    scenes: readonly PhoneSceneAdapterId[];
    transitions: readonly PhoneTransitionAdapterId[];
  }>
): Promise<Readonly<{
  scenes: readonly PhoneSceneAdapterModule[];
  transitions: readonly PhoneTransitionAdapterModule[];
}>> {
  const [scenes, transitions] = await Promise.all([
    Promise.all(dependencies.scenes.map(loadPhoneSceneAdapter)),
    Promise.all(dependencies.transitions.map(loadPhoneTransitionAdapter))
  ]);
  return { scenes, transitions };
}

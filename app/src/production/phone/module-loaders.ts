import {
  frontHalfPhoneSceneIds,
  frontHalfPhoneTransitionIds
} from './adapter-groups/front-half';
import type {
  PhoneAodAdapterComponent,
  PhoneSceneAdapterId,
  PhoneSceneAdapterComponent,
  PhoneSceneAdapterModule,
  PhoneTransitionAdapterId,
  PhoneTransitionAdapterModule
} from './types';

const sceneCache = new Map<PhoneSceneAdapterId, Promise<PhoneSceneAdapterModule>>();
const transitionCache = new Map<PhoneTransitionAdapterId, Promise<PhoneTransitionAdapterModule>>();

export const phoneSceneAdapterIds = frontHalfPhoneSceneIds;
export const phoneTransitionAdapterIds = frontHalfPhoneTransitionIds;

function importPhoneSceneAdapter(id: PhoneSceneAdapterId): Promise<PhoneSceneAdapterModule> {
  switch (id) {
    case 'hero':
      return import('./scenes/PhoneHero').then(({ PhoneHero: Component }) => ({
        id,
        Component: Component as unknown as PhoneSceneAdapterComponent
      }));
    case 'pattern':
      return import('./scenes/PhonePattern').then(({ PhonePattern: Component }) => ({
        id,
        Component: Component as unknown as PhoneSceneAdapterComponent
      }));
    case 'star-map':
      return import('./scenes/PhoneStarMap').then(({ PhoneStarMap: Component }) => ({
        id,
        Component: Component as unknown as PhoneSceneAdapterComponent
      }));
    case 'aod-animation':
      return import('./scenes/PhoneAod').then(({ PhoneAod: Component }) => ({
        id,
        Component: Component as unknown as PhoneAodAdapterComponent
      }));
    case 'method-top':
      return import('./scenes/PhoneMethodTop').then(({ PhoneMethodTop: Component }) => ({
        id,
        Component: Component as unknown as PhoneSceneAdapterComponent
      }));
  }
}

function importPhoneTransitionAdapter(id: PhoneTransitionAdapterId): Promise<PhoneTransitionAdapterModule> {
  switch (id) {
    case 'hero-pattern':
      return import('./transitions/hero-pattern').then(({ PhoneHeroPatternTransition: Component }) => ({ id, Component }));
    case 'pattern-star-map':
      return import('./transitions/pattern-star-map').then(({ PhonePatternStarMapTransition: Component }) => ({ id, Component }));
    case 'star-map-aod':
      return import('./transitions/star-map-aod').then(({ PhoneStarMapAodTransition: Component }) => ({ id, Component }));
    case 'aod-method-top':
      return import('./transitions/aod-method-top').then(({ phoneAodMethodTopTransition }) => phoneAodMethodTopTransition);
  }
}

export function loadPhoneSceneAdapter(id: PhoneSceneAdapterId): Promise<PhoneSceneAdapterModule> {
  const cached = sceneCache.get(id);
  if (cached) return cached;
  const promise = importPhoneSceneAdapter(id).then((adapter) => {
    if (adapter.id !== id) throw new Error(`Phone scene adapter returned ${adapter.id} for ${id}`);
    return adapter;
  });
  sceneCache.set(id, promise);
  void promise.catch(() => {
    if (sceneCache.get(id) === promise) sceneCache.delete(id);
  });
  return promise;
}

export function loadPhoneTransitionAdapter(id: PhoneTransitionAdapterId): Promise<PhoneTransitionAdapterModule> {
  const cached = transitionCache.get(id);
  if (cached) return cached;
  const promise = importPhoneTransitionAdapter(id).then((adapter) => {
    if (adapter.id !== id) throw new Error(`Phone transition adapter returned ${adapter.id} for ${id}`);
    return adapter;
  });
  transitionCache.set(id, promise);
  void promise.catch(() => {
    if (transitionCache.get(id) === promise) transitionCache.delete(id);
  });
  return promise;
}

export function loadedPhoneAdapters(): Readonly<{
  scenes: readonly PhoneSceneAdapterId[];
  transitions: readonly PhoneTransitionAdapterId[];
}> {
  return { scenes: [...sceneCache.keys()], transitions: [...transitionCache.keys()] };
}

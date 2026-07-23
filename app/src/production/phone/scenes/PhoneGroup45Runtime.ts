import type {
  Group45PhoneSceneAdapterModule,
  Group45PhoneSceneId,
  Group45PhoneTransitionAdapterModule,
  Group45PhoneTransitionId
} from '../adapter-groups/group4-5';

const sceneCache = new Map<
  Group45PhoneSceneId,
  Promise<Group45PhoneSceneAdapterModule>
>();
const resolvedSceneCache = new Map<
  Group45PhoneSceneId,
  Group45PhoneSceneAdapterModule
>();
const transitionCache = new Map<
  Group45PhoneTransitionId,
  Promise<Group45PhoneTransitionAdapterModule>
>();
const resolvedTransitionCache = new Map<
  Group45PhoneTransitionId,
  Group45PhoneTransitionAdapterModule
>();

/**
 * The focused Brand → Lab route has its own split adapter runtime while Unit 4
 * is still moving. Keeping literal renderer imports in the adapter zone
 * preserves the shell boundary and keeps the desktop entry free of this batch.
 */
function importGroup45Scene(
  id: Group45PhoneSceneId
): Promise<Group45PhoneSceneAdapterModule> {
  switch (id) {
    case 'brand':
      return import('../../../scenes/brand/phone/PhoneBrand').then(({ PhoneBrand: Component }) => ({
        id,
        Component
      }));
    case 'figure3-animation':
      return import('../../../scenes/figure3-animation/phone/PhoneFigure3').then(({
        PhoneFigure3: Component
      }) => ({ id, Component }));
    case 'services':
      return import('../../../scenes/services/phone/PhoneServices').then(({ PhoneServices: Component }) => ({
        id,
        Component
      }));
    case 'ttg-animation':
      return import('../../../scenes/ttg-animation/phone/PhoneTtg').then(({ PhoneTtg: Component }) => ({
        id,
        Component
      }));
    case 'lab':
      return import('../../../scenes/lab/phone/PhoneLab').then(({ PhoneLab: Component }) => ({
        id,
        Component
      }));
  }
}

function importGroup45Transition(
  id: Group45PhoneTransitionId
): Promise<Group45PhoneTransitionAdapterModule> {
  switch (id) {
    case 'brand-figure3':
      return import('../../../transitions/brand-figure3/phone').then(({
        PhoneBrandFigure3Transition: Component
      }) => ({ id, Component }));
    case 'figure3-services':
      return import('../../../transitions/figure3-services/phone').then(({
        PhoneFigure3ServicesTransition: Component
      }) => ({ id, Component }));
    case 'services-ttg':
      return import('../../../transitions/services-ttg/phone').then(({
        PhoneServicesTtgTransition: Component
      }) => ({ id, Component }));
    case 'ttg-lab':
      return import('../../../transitions/ttg-lab/phone').then(({
        PhoneTtgLabTransition: Component
      }) => ({ id, Component }));
  }
}

export function loadGroup45PhoneSceneAdapter(
  id: Group45PhoneSceneId
): Promise<Group45PhoneSceneAdapterModule> {
  const cached = sceneCache.get(id);
  if (cached) return cached;
  const promise = importGroup45Scene(id).then((adapter) => {
    if (adapter.id !== id) throw new Error(`Group 4–5 scene returned ${adapter.id} for ${id}`);
    resolvedSceneCache.set(id, adapter);
    return adapter;
  });
  sceneCache.set(id, promise);
  void promise.catch(() => {
    if (sceneCache.get(id) === promise) sceneCache.delete(id);
  });
  return promise;
}

export function loadGroup45PhoneTransitionAdapter(
  id: Group45PhoneTransitionId
): Promise<Group45PhoneTransitionAdapterModule> {
  const cached = transitionCache.get(id);
  if (cached) return cached;
  const promise = importGroup45Transition(id).then((adapter) => {
    if (adapter.id !== id) throw new Error(`Group 4–5 transition returned ${adapter.id} for ${id}`);
    resolvedTransitionCache.set(id, adapter);
    return adapter;
  });
  transitionCache.set(id, promise);
  void promise.catch(() => {
    if (transitionCache.get(id) === promise) transitionCache.delete(id);
  });
  return promise;
}

export function resolvedGroup45PhoneSceneAdapter(
  id: Group45PhoneSceneId
): Group45PhoneSceneAdapterModule | undefined {
  return resolvedSceneCache.get(id);
}

export function resolvedGroup45PhoneTransitionAdapter(
  id: Group45PhoneTransitionId
): Group45PhoneTransitionAdapterModule | undefined {
  return resolvedTransitionCache.get(id);
}

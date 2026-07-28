import { useEffect, useState } from 'react';
import {
  group45PhoneSceneIds,
  group45PhoneTransitionIds,
  type Group45PhoneSceneAdapterComponent,
  type Group45PhoneSceneId,
  type Group45PhoneTransitionAdapterComponent,
  type Group45PhoneTransitionId
} from './adapter-groups/group4-5';
import {
  loadPhoneSceneAdapter,
  loadPhoneTransitionAdapter,
  resolvedPhoneSceneAdapter,
  resolvedPhoneTransitionAdapter
} from './module-loaders';

type Group45Modules = Readonly<{
  scenes: Partial<Record<Group45PhoneSceneId, Group45PhoneSceneAdapterComponent>>;
  transitions: Partial<
    Record<Group45PhoneTransitionId, Group45PhoneTransitionAdapterComponent>
  >;
}>;

export type Group45AdapterPlan = Readonly<{
  scenes: readonly Group45PhoneSceneId[];
  transitions: readonly Group45PhoneTransitionId[];
}>;

function sceneIndex(scene: Group45PhoneSceneId): number {
  return group45PhoneSceneIds.indexOf(scene);
}

const GROUP45_READING_SCENES = [
  'brand',
  'services',
  'lab'
] as const satisfies readonly Group45PhoneSceneId[];

function unique<Type>(values: readonly Type[]): Type[] {
  return [...new Set(values)];
}

type Group45ExecutionRun = 'brand-services' | 'services-lab';

/**
 * Direct stable holds are bidirectional input boundaries. Each plan therefore
 * retains the complete renderer/transition closure for every composite run
 * incident to either the direct-entry scene or the current projected scene.
 */
const group45RunClosures: Readonly<Record<
  Group45ExecutionRun,
  Group45AdapterPlan
>> = {
  'brand-services': {
    scenes: ['brand', 'figure3-animation', 'services'],
    transitions: ['brand-figure3', 'figure3-services']
  },
  'services-lab': {
    scenes: ['services', 'ttg-animation', 'lab'],
    transitions: ['services-ttg', 'ttg-lab']
  }
};

function runsForScene(
  scene: Group45PhoneSceneId
): readonly Group45ExecutionRun[] {
  if (scene === 'brand' || scene === 'figure3-animation') {
    return ['brand-services'];
  }
  if (scene === 'services') return ['brand-services', 'services-lab'];
  return ['services-lab'];
}

/**
 * Reading roots establish the complete native document geometry for a direct
 * entry. Its immediate inbound and outbound execution closures are loaded
 * before the stable hold is allowed to receive a physical boundary input.
 * Lab deliberately has no Lab → PH plan in Unit7-A.
 */
export function group45AdapterPlanForEntry(
  entryScene: Group45PhoneSceneId,
  activeScene: Group45PhoneSceneId = entryScene
): Group45AdapterPlan {
  const entryIndex = sceneIndex(entryScene);
  const readingScenes = GROUP45_READING_SCENES.filter(
    (scene) => sceneIndex(scene) >= entryIndex
  );
  const runs = unique([
    ...runsForScene(entryScene),
    ...runsForScene(activeScene)
  ]);
  return {
    scenes: unique([
      ...readingScenes,
      ...runs.flatMap((run) => group45RunClosures[run].scenes)
    ]),
    transitions: unique(runs.flatMap((run) => group45RunClosures[run].transitions))
  };
}

function resolvedGroup45Modules(): Group45Modules {
  const scenes: Partial<Record<
    Group45PhoneSceneId,
    Group45PhoneSceneAdapterComponent
  >> = {};
  const transitions: Partial<Record<
    Group45PhoneTransitionId,
    Group45PhoneTransitionAdapterComponent
  >> = {};

  for (const id of group45PhoneSceneIds) {
    const adapter = resolvedPhoneSceneAdapter(id);
    if (adapter) {
      scenes[id] = adapter.Component as Group45PhoneSceneAdapterComponent;
    }
  }
  for (const id of group45PhoneTransitionIds) {
    const Component = resolvedPhoneTransitionAdapter(id)?.Component;
    if (Component) {
      transitions[id] = Component as Group45PhoneTransitionAdapterComponent;
    }
  }
  return { scenes, transitions };
}

function planIsResolved(plan: Group45AdapterPlan, modules: Group45Modules): boolean {
  return plan.scenes.every((id) => Boolean(modules.scenes[id]))
    && plan.transitions.every((id) => Boolean(modules.transitions[id]));
}

/**
 * Group 4–5 loads only after the focused phone scope is selected. The suffix
 * plan keeps direct Services/Lab links from replaying or downloading retired
 * visual media, while a Brand entry resolves its independently split reading
 * roots in parallel before the document route becomes scrollable.
 */
export function usePhoneGroup45Adapters(
  entryScene: Group45PhoneSceneId,
  activeScene: Group45PhoneSceneId = entryScene
) {
  const [modules, setModules] = useState<Group45Modules>(resolvedGroup45Modules);
  const [failed, setFailed] = useState(false);
  const initialPlan = group45AdapterPlanForEntry(entryScene);
  const plan = group45AdapterPlanForEntry(entryScene, activeScene);
  const rootReady = Boolean(modules.scenes[entryScene]);
  const entryReady = planIsResolved(initialPlan, modules);
  const ready = planIsResolved(plan, modules);

  useEffect(() => {
    if (ready) return;
    const loadPlan = group45AdapterPlanForEntry(entryScene, activeScene);
    let current = true;
    setFailed(false);
    const pending = [
      ...loadPlan.scenes.map(loadPhoneSceneAdapter),
      ...loadPlan.transitions.map(loadPhoneTransitionAdapter)
    ].map((promise) => promise.then((module) => {
      if (current) setModules(resolvedGroup45Modules());
      return module;
    }));
    void Promise.allSettled(pending).then((results) => {
      if (!current) return;
      setModules(resolvedGroup45Modules());
      setFailed(results.some(({ status }) => status === 'rejected'));
    });
    return () => {
      current = false;
    };
  }, [activeScene, entryScene, ready]);

  return { ...modules, plan, rootReady, entryReady, ready, failed };
}

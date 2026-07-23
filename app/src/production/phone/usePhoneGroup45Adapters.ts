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
  loadGroup45PhoneSceneAdapter,
  loadGroup45PhoneTransitionAdapter,
  resolvedGroup45PhoneSceneAdapter,
  resolvedGroup45PhoneTransitionAdapter
} from './scenes/PhoneGroup45Runtime';

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

/** Direct entry never downloads or mounts earlier media chapters. */
export function group45AdapterPlanForEntry(
  entryScene: Group45PhoneSceneId
): Group45AdapterPlan {
  const index = sceneIndex(entryScene);
  return {
    scenes: group45PhoneSceneIds.slice(index),
    transitions: group45PhoneTransitionIds.slice(index)
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
    const adapter = resolvedGroup45PhoneSceneAdapter(id);
    if (adapter) {
      scenes[id] = adapter.Component;
    }
  }
  for (const id of group45PhoneTransitionIds) {
    const adapter = resolvedGroup45PhoneTransitionAdapter(id);
    if (adapter) {
      transitions[id] = adapter.Component;
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
 * visual media, while a Brand entry resolves its independently split chunks
 * in parallel before the document route becomes scrollable.
 */
export function usePhoneGroup45Adapters(entryScene: Group45PhoneSceneId) {
  const [modules, setModules] = useState<Group45Modules>(resolvedGroup45Modules);
  const [failed, setFailed] = useState(false);
  const plan = group45AdapterPlanForEntry(entryScene);
  const ready = planIsResolved(plan, modules);

  useEffect(() => {
    if (ready) return;
    const loadPlan = group45AdapterPlanForEntry(entryScene);
    let current = true;
    setFailed(false);
    void Promise.allSettled([
      ...loadPlan.scenes.map(loadGroup45PhoneSceneAdapter),
      ...loadPlan.transitions.map(loadGroup45PhoneTransitionAdapter)
    ]).then((results) => {
      if (!current) return;
      setModules(resolvedGroup45Modules());
      setFailed(results.some(({ status }) => status === 'rejected'));
    });
    return () => {
      current = false;
    };
  }, [entryScene, ready]);

  return { ...modules, plan, ready, failed };
}

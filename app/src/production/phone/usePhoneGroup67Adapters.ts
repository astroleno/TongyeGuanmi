import { useEffect, useState } from 'react';
import {
  group67NextAdapterByScene,
  group67PhoneSceneIds,
  group67PhoneTransitionIds,
  type Group67PhoneSceneId,
  type Group67PhoneTransitionId
} from './adapter-groups/group6-7';
import {
  loadPhoneSceneAdapter,
  loadPhoneTransitionAdapter,
  resolvedPhoneSceneAdapter,
  resolvedPhoneTransitionAdapter
} from './module-loaders';
import type {
  PhoneSceneAdapterComponent,
  PhoneTransitionAdapterComponent
} from './types';

export type Group67AdapterFocus = 'lab' | Group67PhoneSceneId;

type Group67Modules = Readonly<{
  scenes: Partial<Record<Group67PhoneSceneId, PhoneSceneAdapterComponent>>;
  transitions: Partial<
    Record<Group67PhoneTransitionId, PhoneTransitionAdapterComponent>
  >;
}>;

export type Group67AdapterPlan = Readonly<{
  scenes: readonly Group67PhoneSceneId[];
  transitions: readonly Group67PhoneTransitionId[];
}>;

/** Complete composite closures; a focus change may not drop the exit leg. */
export function group67AdapterPlanForFocus(
  focus: Group67AdapterFocus
): Group67AdapterPlan {
  if (focus === 'lab') {
    return {
      scenes: ['ph-animation', 'education'],
      transitions: ['lab-ph', 'ph-education']
    };
  }
  if (focus === 'education') {
    return {
      scenes: ['education', 'crane-animation', 'contact'],
      transitions: ['education-crane', 'crane-contact']
    };
  }
  const next = group67NextAdapterByScene[focus];
  return {
    scenes: next ? [focus, next[0]] : [focus],
    transitions: next ? [next[1]] : []
  };
}

function resolvedGroup67Modules(): Group67Modules {
  const scenes: Partial<Record<
    Group67PhoneSceneId,
    PhoneSceneAdapterComponent
  >> = {};
  const transitions: Partial<Record<
    Group67PhoneTransitionId,
    PhoneTransitionAdapterComponent
  >> = {};

  for (const id of group67PhoneSceneIds) {
    const adapter = resolvedPhoneSceneAdapter(id);
    if (adapter) {
      scenes[id] = adapter.Component as PhoneSceneAdapterComponent;
    }
  }
  for (const id of group67PhoneTransitionIds) {
    const Component = resolvedPhoneTransitionAdapter(id)?.Component;
    if (Component) transitions[id] = Component;
  }
  return { scenes, transitions };
}

function planIsResolved(
  plan: Group67AdapterPlan,
  modules: Group67Modules
): boolean {
  return plan.scenes.every((id) => Boolean(modules.scenes[id]))
    && plan.transitions.every((id) => Boolean(modules.transitions[id]));
}

/** Shared-cache Group6–7 loader; no QA-local cache or import branch exists. */
export function usePhoneGroup67Adapters(focus: Group67AdapterFocus) {
  const [modules, setModules] = useState<Group67Modules>(
    resolvedGroup67Modules
  );
  const plan = group67AdapterPlanForFocus(focus);
  const ready = planIsResolved(plan, modules);

  useEffect(() => {
    if (ready) return;
    const loadPlan = group67AdapterPlanForFocus(focus);
    let current = true;
    const pending = [
      ...loadPlan.scenes.map(loadPhoneSceneAdapter),
      ...loadPlan.transitions.map(loadPhoneTransitionAdapter)
    ];
    void Promise.allSettled(pending).then(() => {
      if (!current) return;
      setModules(resolvedGroup67Modules());
    });
    return () => {
      current = false;
    };
  }, [focus, ready]);

  return { ...modules, ready };
}

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

/**
 * One adjacency window:
 * - Lab owns only PH and Lab→PH preparation.
 * - A mounted Group6–7 scene owns itself, its next real receiver and the
 *   boundary between them.
 * - Contact is a cold terminal entry with no preceding media imports.
 */
export function group67AdapterPlanForFocus(
  focus: Group67AdapterFocus
): Group67AdapterPlan {
  if (focus === 'lab') {
    return {
      scenes: ['ph-animation'],
      transitions: ['lab-ph']
    };
  }
  const next = group67NextAdapterByScene[focus];
  return {
    scenes: next ? [focus, next.scene] : [focus],
    transitions: next ? [next.transition] : []
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
  const [failed, setFailed] = useState(false);
  const plan = group67AdapterPlanForFocus(focus);
  const ready = planIsResolved(plan, modules);

  useEffect(() => {
    if (ready) return;
    const loadPlan = group67AdapterPlanForFocus(focus);
    let current = true;
    setFailed(false);
    const pending = [
      ...loadPlan.scenes.map(loadPhoneSceneAdapter),
      ...loadPlan.transitions.map(loadPhoneTransitionAdapter)
    ].map((promise) => promise.then((module) => {
      if (current) setModules(resolvedGroup67Modules());
      return module;
    }));
    void Promise.allSettled(pending).then((results) => {
      if (!current) return;
      setModules(resolvedGroup67Modules());
      setFailed(results.some(({ status }) => status === 'rejected'));
    });
    return () => {
      current = false;
    };
  }, [focus, ready]);

  return { ...modules, plan, ready, failed };
}

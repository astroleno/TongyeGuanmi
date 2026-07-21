import { useEffect, useState } from 'react';
import {
  gradeAPhoneSceneIds,
  gradeAPhoneTransitionIds
} from './adapter-groups/grade-a';
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

type GradeAModules = Readonly<{
  Figure2: PhoneSceneAdapterComponent | undefined;
  Proof: PhoneSceneAdapterComponent | undefined;
  MethodFigure2: PhoneTransitionAdapterComponent | undefined;
  Figure2Proof: PhoneTransitionAdapterComponent | undefined;
  ProofBrand: PhoneTransitionAdapterComponent | undefined;
}>;

function resolvedGradeAModules(): GradeAModules {
  return {
    Figure2: resolvedPhoneSceneAdapter('figure2-animation')?.Component as
      | PhoneSceneAdapterComponent
      | undefined,
    Proof: resolvedPhoneSceneAdapter('figure2-proof')?.Component as
      | PhoneSceneAdapterComponent
      | undefined,
    MethodFigure2: resolvedPhoneTransitionAdapter('method-bottom-figure2')?.Component,
    Figure2Proof: resolvedPhoneTransitionAdapter('figure2-distance-expand')?.Component,
    ProofBrand: resolvedPhoneTransitionAdapter('figure2-proof-brand')?.Component
  };
}

function gradeAModulesReady(modules: GradeAModules): boolean {
  return Boolean(
    modules.Figure2
    && modules.Proof
    && modules.MethodFigure2
    && modules.Figure2Proof
    && modules.ProofBrand
  );
}

export function usePhoneGradeAAdapters() {
  const [modules, setModules] = useState<GradeAModules>(resolvedGradeAModules);
  const [failed, setFailed] = useState(false);
  const ready = gradeAModulesReady(modules);

  useEffect(() => {
    if (ready || failed) return;
    let current = true;
    void Promise.allSettled([
      ...gradeAPhoneSceneIds.map(loadPhoneSceneAdapter),
      ...gradeAPhoneTransitionIds.map(loadPhoneTransitionAdapter)
    ]).then((results) => {
      if (!current) return;
      setModules(resolvedGradeAModules());
      setFailed(results.some(({ status }) => status === 'rejected'));
    });
    return () => {
      current = false;
    };
  }, [failed, ready]);

  return { ...modules, ready, failed };
}

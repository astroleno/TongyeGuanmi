import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { fromSyntheticVisibility } from '../story/visibility-predicate';
import type { HandleRegistry } from '../story/registry';
import type { LayerVisibilityState, SceneId, SceneModule, StageLayerRole } from '../story/types';

export type SceneLayerProps = {
  module: SceneModule;
  role: StageLayerRole;
  registry: HandleRegistry;
  visibility: LayerVisibilityState | undefined;
  copyCueActive?: boolean;
  zIndex: number;
  onElement?: ((scene: SceneId, element: HTMLElement | null) => void) | undefined;
};

function defaultVisibility(role: StageLayerRole): LayerVisibilityState {
  if (role === 'current') {
    return fromSyntheticVisibility({
      mounted: true,
      opacity: 1,
      visibility: 'visible',
      inert: false,
      pointerEvents: 'auto'
    });
  }
  return fromSyntheticVisibility({
    mounted: true,
    opacity: 0,
    visibility: 'hidden',
    inert: true,
    pointerEvents: 'none'
  });
}

export function SceneLayer({ module, role, registry, visibility, copyCueActive = false, zIndex, onElement }: SceneLayerProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const state = visibility ?? defaultVisibility(role);
  const hidden = !state.visible || state.opacity <= 0.001;
  const style = useMemo<CSSProperties>(
    () => ({
      opacity: state.opacity,
      visibility: state.visible ? 'visible' : 'hidden',
      pointerEvents: state.pointerEvents,
      zIndex
    }),
    [state.opacity, state.pointerEvents, state.visible, zIndex]
  );

  useEffect(() => {
    registry.registerScene(module);
    void registry.startPreload(module.id);
  }, [module, registry]);

  const registerRoot = (element: HTMLElement | null) => {
    rootRef.current = element;
    registry.registerRoot(module.id, element, module.requiredHandles ?? []);
    onElement?.(module.id, element);
  };

  const registerHandle = (name: string, element: HTMLElement | null) => {
    registry.registerHandle(module.id, name, element);
  };

  const Component = module.Component;

  return (
    <section
      ref={registerRoot}
      className="stage-layer"
      data-stage-layer={module.id}
      data-role={role}
      data-visible={String(state.visible && state.opacity > 0.001)}
      data-interactable={String(!state.inert && state.pointerEvents === 'auto')}
      data-copy-cue-active={String(copyCueActive)}
      aria-hidden={state.inert ? 'true' : 'false'}
      inert={state.inert ? true : undefined}
      style={style}
    >
      <Component scene={module.id} hidden={hidden} copyCueActive={copyCueActive} registerHandle={registerHandle} />
    </section>
  );
}

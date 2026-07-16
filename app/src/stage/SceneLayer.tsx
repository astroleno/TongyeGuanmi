import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';
import { fromSyntheticVisibility } from '../story/visibility-predicate';
import type { HandleRegistry } from '../story/registry';
import type {
  LayerVisibilityState,
  SceneId,
  SceneModule,
  ScenePresentationState,
  StageLayerRole
} from '../story/types';

export type SceneLayerProps = {
  module: SceneModule;
  role: StageLayerRole;
  registry: HandleRegistry;
  visibility: LayerVisibilityState | undefined;
  reading?: boolean;
  copyCueActive?: boolean;
  presentation?: ScenePresentationState;
  zIndex: number;
  onElement?: ((scene: SceneId, element: HTMLElement | null) => void) | undefined;
  onMount?: ((scene: SceneId) => void) | undefined;
  onDispose?: ((scene: SceneId, resources: { canvases: number; videos: number }) => void) | undefined;
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

function releaseLayerResources(root: HTMLElement | null): { canvases: number; videos: number } {
  if (!root) {
    return { canvases: 0, videos: 0 };
  }
  const canvases = [...root.querySelectorAll('canvas')];
  const videos = [...root.querySelectorAll('video')];
  const images = [...root.querySelectorAll('img')];
  for (const image of images) {
    image.removeAttribute('src');
    image.removeAttribute('srcset');
    image.removeAttribute('sizes');
  }
  for (const video of videos) {
    (video as HTMLVideoElement & { __r5TimelineVideoDispose?: () => void })
      .__r5TimelineVideoDispose?.();
    video.pause();
    video.removeAttribute('poster');
    video.removeAttribute('src');
    for (const source of video.querySelectorAll('source')) {
      source.removeAttribute('src');
    }
    video.load();
  }
  for (const canvas of canvases) {
    if (canvas.matches('[data-r4-ink-renderer-status], [data-aod-ink-canvas]')) {
      const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      context?.getExtension('WEBGL_lose_context')?.loseContext();
    }
    canvas.width = 1;
    canvas.height = 1;
  }
  return { canvases: canvases.length, videos: videos.length };
}

export function SceneLayer({ module, role, registry, visibility, reading = false, copyCueActive = false, presentation, zIndex, onElement, onMount, onDispose }: SceneLayerProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const lastRootRef = useRef<HTMLElement | null>(null);
  const pendingDisposeRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
    if (pendingDisposeRef.current) {
      clearTimeout(pendingDisposeRef.current);
      pendingDisposeRef.current = undefined;
    }
    registry.registerScene(module);
    void registry.startPreload(module.id);
    onMount?.(module.id);
    return () => {
      const root = lastRootRef.current;
      pendingDisposeRef.current = setTimeout(() => {
        const resources = releaseLayerResources(root);
        void module.dispose?.();
        onDispose?.(module.id, resources);
        pendingDisposeRef.current = undefined;
      }, 0);
    };
  }, [module, onDispose, onMount, registry]);

  useLayoutEffect(() => {
    const heroIntroPending = module.id === 'hero'
      && (presentation?.heroIntroMode === 'waiting' || presentation?.heroIntroMode === 'running');
    if (role === 'current' && state.visible && state.opacity > 0.999 && !heroIntroPending) {
      module.renderHold(rootRef.current);
    }
  }, [module, presentation?.heroIntroMode, role, state.opacity, state.visible]);

  const registerRoot = useCallback((element: HTMLElement | null) => {
    rootRef.current = element;
    if (element) {
      lastRootRef.current = element;
    }
    registry.registerRoot(module.id, element, module.requiredHandles ?? []);
    onElement?.(module.id, element);
  }, [module, onElement, registry]);

  const registerHandle = useCallback((name: string, element: HTMLElement | null) => {
    registry.registerHandle(module.id, name, element);
  }, [module.id, registry]);

  const Component = module.Component;

  return (
    <section
      ref={registerRoot}
      className="stage-layer"
      data-stage-layer={module.id}
      data-role={role}
      data-visible={String(state.visible && state.opacity > 0.001)}
      data-interactable={String(!state.inert && state.pointerEvents === 'auto')}
      data-reading={String(reading)}
      data-copy-cue-active={String(copyCueActive)}
      aria-hidden={state.inert ? 'true' : 'false'}
      inert={state.inert ? true : undefined}
      tabIndex={reading && !state.inert ? 0 : undefined}
      style={style}
    >
      <Component
        scene={module.id}
        hidden={hidden}
        role={role}
        copyCueActive={copyCueActive}
        {...(presentation ? { presentation } : {})}
        registerHandle={registerHandle}
      />
    </section>
  );
}

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef
} from 'react';
import {
  createPhonePackedAlphaSurface,
  type PhonePackedAlphaSurfaceMode,
  type PhonePackedAlphaSurface
} from './phone-packed-alpha-surface';
import {
  disposeFigure2Media,
  ensureFigure2HoldFrame,
  figure2AnimationScene,
  parkFigure2Media,
  renderFigure2AnimationProgress,
  renderFigure2Hold
} from '../../../scenes/figure2-animation';
import type {
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
} from '../types';
import {
  phoneRuntimePresentationTokenKey,
  type PhoneRenderedPresentationFrame,
  type PresentationToken
} from '../phone-story/runtime';
import { phoneMediaUrlFor } from '../phone-media';
import './PhoneFigure2.css';

const Figure2Surface = figure2AnimationScene.Component;
const FIGURE2_PACKED_ALPHA_VIDEO = phoneMediaUrlFor(
  'figure2-pair-packed',
  'figure2-animation'
);
const FIGURE2_POSTER_IMAGE = phoneMediaUrlFor(
  'figure2-pair-poster',
  'figure2-animation'
);
const FIGURE2_ENDPOINT_SECONDS = 2.6;

type PhoneFigure2StaticPresentationBinding = {
  token: PresentationToken;
  key: string;
  frameSequence: number;
  report: (frame: PhoneRenderedPresentationFrame) => void;
  reported: boolean;
  paintFrame: number | null;
  proofFrame: number | null;
};

function cancelFigure2StaticPresentationFrames(
  binding: PhoneFigure2StaticPresentationBinding
): void {
  if (typeof window === 'undefined') return;
  if (binding.paintFrame !== null) window.cancelAnimationFrame(binding.paintFrame);
  if (binding.proofFrame !== null) window.cancelAnimationFrame(binding.proofFrame);
  binding.paintFrame = null;
  binding.proofFrame = null;
}

/** The Figure2 leaf preserves the runner-issued static token unchanged. */
export function phoneFigure2StaticPresentationFrame(
  token: PresentationToken,
  frameSequence: number,
  observedAt: number
): PhoneRenderedPresentationFrame {
  return {
    token,
    frameSequence,
    observedAt,
    origin: 'leaf-static-poster'
  };
}

/** Phone composition for the canonical Figure2 media/camera owner. */
export const PhoneFigure2 = forwardRef<
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
>(function PhoneFigure2({ active, onReady }, forwardedRef) {
  const rootRef = useRef<HTMLElement | null>(null);
  const packedSurfaceRef = useRef<PhonePackedAlphaSurface | undefined>(undefined);
  const mediaControllerRef = useRef<AbortController | undefined>(undefined);
  const sceneActiveRef = useRef(false);
  const scrollProgressRef = useRef(0);
  const scrollDirectionRef = useRef<1 | -1>(1);
  const presentationBindingRef = useRef<Readonly<{
    token: PresentationToken;
    key: string;
    frameSequence: number;
    report: (frame: PhoneRenderedPresentationFrame) => void;
  }> | null>(null);
  const staticPresentationBindingRef = useRef<
    PhoneFigure2StaticPresentationBinding | null
  >(null);
  const reportRenderedFrame = useCallback((presentationKey: string | null) => {
    const binding = presentationBindingRef.current;
    if (!binding || binding.key !== presentationKey) return;
    const next = {
      ...binding,
      frameSequence: binding.frameSequence + 1
    };
    presentationBindingRef.current = next;
    next.report({
      token: next.token,
      frameSequence: next.frameSequence,
      observedAt: typeof performance !== 'undefined'
        && typeof performance.now === 'function'
        ? performance.now()
        : 0
    });
  }, []);
  const releaseStaticPresentation = useCallback((
    token?: PresentationToken
  ): boolean => {
    const binding = staticPresentationBindingRef.current;
    if (
      !binding
      || (token && binding.key !== phoneRuntimePresentationTokenKey(token))
    ) return false;
    cancelFigure2StaticPresentationFrames(binding);
    const stack = rootRef.current?.querySelector<HTMLElement>(
      '.r4-figure2__media-stack--combined'
    );
    if (stack?.dataset.figure2StaticPoster === binding.key) {
      delete stack.dataset.figure2StaticPoster;
    }
    if (staticPresentationBindingRef.current === binding) {
      staticPresentationBindingRef.current = null;
    }
    return true;
  }, []);
  const requestBoundStaticPresentation = useCallback(() => {
    const binding = staticPresentationBindingRef.current;
    if (
      !binding
      || binding.reported
      || binding.paintFrame !== null
      || binding.proofFrame !== null
      || typeof window === 'undefined'
    ) return;
    // Candidate projection has made Figure2 the physical receiver. Render the
    // authored non-media hold, mark that exact endpoint, then report only
    // after one further browser frame has had a chance to paint it.
    binding.paintFrame = window.requestAnimationFrame(() => {
      binding.paintFrame = null;
      if (staticPresentationBindingRef.current !== binding || binding.reported) {
        return;
      }
      const root = rootRef.current;
      const stack = root?.querySelector<HTMLElement>(
        '.r4-figure2__media-stack--combined'
      );
      if (!root || !stack) return;
      renderFigure2Hold(root);
      stack.dataset.figure2StaticPoster = binding.key;
      if (
        staticPresentationBindingRef.current !== binding
        || stack.dataset.figure2StaticPoster !== binding.key
      ) return;
      binding.proofFrame = window.requestAnimationFrame(() => {
        binding.proofFrame = null;
        if (
          staticPresentationBindingRef.current !== binding
          || binding.reported
          || stack.dataset.figure2StaticPoster !== binding.key
        ) return;
        binding.reported = true;
        binding.frameSequence += 1;
        binding.report(phoneFigure2StaticPresentationFrame(
          binding.token,
          binding.frameSequence,
          typeof performance !== 'undefined'
            && typeof performance.now === 'function'
            ? performance.now()
            : 0
        ));
      });
    });
  }, []);
  const releasePackedSurface = useCallback(() => {
    const root = rootRef.current;
    mediaControllerRef.current?.abort();
    mediaControllerRef.current = undefined;
    presentationBindingRef.current = null;
    packedSurfaceRef.current?.(['release']);
    if (root) parkFigure2Media(root);
  }, []);
  const ensurePackedSurface = useCallback((
    mode: PhonePackedAlphaSurfaceMode = 'forward'
  ) => {
    const root = rootRef.current;
    const video = root?.querySelector<HTMLVideoElement>(
      '[data-figure2-combined-video]'
    );
    const canvas = root?.querySelector<HTMLCanvasElement>(
      '[data-figure2-packed-alpha-canvas]'
    );
    const container = video?.parentElement;
    if (!root || !video || !canvas || !container) return undefined;
    const controller = new AbortController();
    mediaControllerRef.current?.abort();
    mediaControllerRef.current = controller;
    const surface = packedSurfaceRef.current ?? createPhonePackedAlphaSurface([
      root,
      container,
      canvas,
      video,
      FIGURE2_PACKED_ALPHA_VIDEO,
      FIGURE2_ENDPOINT_SECONDS,
      'phoneFigure2Alpha',
      'figure2-pair',
      'r4-figure2__packed-alpha-canvas',
      null,
      (presentationKey) => {
        video.dataset.phoneFigure2Alpha = 'verified';
        canvas.dataset.phoneFigure2Alpha = 'verified';
        reportRenderedFrame(presentationKey);
      }
    ]);
    packedSurfaceRef.current = surface;
    surface(['activate', mode]);
    if (root.dataset.phoneFigure2Alpha === 'awaiting-native-playback') {
      root.dataset.phoneFigure2Alpha = 'probing';
      video.dataset.phoneFigure2Alpha = 'probing';
    } else if (root.dataset.phoneFigure2Alpha === 'static-fallback') {
      root.dataset.phoneFigure2Alpha = 'poster-fallback';
      video.dataset.phoneFigure2Alpha = 'poster-fallback';
    }
    void ensureFigure2HoldFrame(root, controller.signal)
      .then(() => {
        if (!controller.signal.aborted && !sceneActiveRef.current) {
          parkFigure2Media(root);
        }
      }).catch(() => undefined);
    return surface;
  }, [reportRenderedFrame]);
  const setSceneActive = useCallback((active: boolean) => {
    const root = rootRef.current;
    if (!root || sceneActiveRef.current === active) return;
    sceneActiveRef.current = active;
    if (!active) {
      releasePackedSurface();
    }
  }, [releasePackedSurface]);
  const registerHandle = useCallback((name: string, element: HTMLElement | null) => {
    if (name === 'stage') {
      rootRef.current = element?.closest<HTMLElement>('[data-r4-scene="figure2-animation"]') ?? null;
    }
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const video = root.querySelector<HTMLVideoElement>('[data-figure2-combined-video]');
    const canvas = root.querySelector<HTMLCanvasElement>('[data-figure2-packed-alpha-canvas]');
    if (!video || !canvas) {
      if (import.meta.env.DEV) root.dataset.phoneFigure2Ready = 'failed';
      return;
    }
    root.style.setProperty(
      '--phone-figure2-poster-image',
      `url(${JSON.stringify(FIGURE2_POSTER_IMAGE)})`
    );
    /*
     * Scene/transition readiness must never depend on Safari producing a
     * decoded WebGL video frame. The transparent opening poster is the visual
     * fallback; packed video upgrades it asynchronously when decoding works.
     */
    if (import.meta.env.DEV) root.dataset.phoneFigure2Ready = 'true';
    onReady?.();
    return () => {
      releaseStaticPresentation();
      releasePackedSurface();
      packedSurfaceRef.current?.(['dispose']);
      packedSurfaceRef.current = undefined;
      disposeFigure2Media(root);
      root.style.removeProperty('--phone-figure2-poster-image');
      delete root.dataset.phoneFigure2Alpha;
      if (import.meta.env.DEV) delete root.dataset.phoneFigure2Ready;
      delete video.dataset.phoneFigure2Alpha;
      delete canvas.dataset.phoneFigure2Alpha;
    };
  }, [onReady, releasePackedSurface, releaseStaticPresentation]);

  /*
   * Active is a decoder / packed-alpha resource lease only. The authority
   * projector owns the root role, visibility, z-index, and endpoint coverage.
   */
  useLayoutEffect(() => {
    const root = rootRef.current;
    setSceneActive(active);
    if (!root) return;
    if (active) root.removeAttribute('aria-hidden');
    else root.setAttribute('aria-hidden', 'true');
  }, [active, setSceneActive]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    async prepareTargetPresentation({
      progress,
      signal,
      directEntry,
      presentationToken
    }) {
      const mode = progress >= 0.999 ? 'endpoint' : 'forward';
      const surface = ensurePackedSurface(mode);
      if (!surface) {
        throw new Error('Figure2 presentation unavailable');
      }
      await surface([
        'prepare',
        mode,
        signal,
        directEntry === true,
        phoneRuntimePresentationTokenKey(presentationToken as PresentationToken)
      ]);
    },
    update(progress) {
      if (staticPresentationBindingRef.current) {
        scrollProgressRef.current = 0;
        renderFigure2Hold(rootRef.current);
        return;
      }
      if (progress > scrollProgressRef.current) {
        scrollDirectionRef.current = 1;
      } else if (progress < scrollProgressRef.current) {
        scrollDirectionRef.current = -1;
      }
      scrollProgressRef.current = progress;
      ensurePackedSurface();
      renderFigure2AnimationProgress(rootRef.current, progress, {
        videoMode: 'seek',
        mediaRun: {
          runId: 'f2',
          direction: scrollDirectionRef.current
        }
      });
    },
    enter() {
      setSceneActive(true);
      rootRef.current?.removeAttribute('aria-hidden');
    },
    leave() {
      setSceneActive(false);
      rootRef.current?.setAttribute('aria-hidden', 'true');
    },
    reverse() {
      setSceneActive(true);
      rootRef.current?.removeAttribute('aria-hidden');
    },
    presentPresentation(token, report) {
      releaseStaticPresentation();
      if (token.kind === 'static-poster') {
        staticPresentationBindingRef.current = {
          token,
          key: phoneRuntimePresentationTokenKey(token),
          frameSequence: 0,
          report,
          reported: false,
          paintFrame: null,
          proofFrame: null
        };
        requestBoundStaticPresentation();
        return;
      }
      const key = phoneRuntimePresentationTokenKey(token);
      presentationBindingRef.current = {
        token,
        key,
        frameSequence: 0,
        report
      };
      const surface = packedSurfaceRef.current ?? ensurePackedSurface();
      surface?.(['present', key]);
    },
    disposePresentation(token) {
      if (releaseStaticPresentation(token)) return;
      const binding = presentationBindingRef.current;
      if (
        binding
        && binding.key === phoneRuntimePresentationTokenKey(token)
      ) presentationBindingRef.current = null;
    },
    dispose() {
      releaseStaticPresentation();
      releasePackedSurface();
      packedSurfaceRef.current?.(['dispose']);
      packedSurfaceRef.current = undefined;
      disposeFigure2Media(rootRef.current);
    }
  }), [
    ensurePackedSurface,
    releasePackedSurface,
    releaseStaticPresentation,
    requestBoundStaticPresentation,
    setSceneActive
  ]);

  return (
    <Figure2Surface
      scene="figure2-animation"
      hidden={false}
      registerHandle={registerHandle}
    />
  );
});

export default PhoneFigure2;

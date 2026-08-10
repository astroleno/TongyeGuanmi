import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FakeElement,
  FakeVideo
} from '../../../transitions/__fixtures__/back-half.fixture';
import {
  applyPhonePhMediaFallback,
  parkPhonePhMedia,
  PhonePh,
  phonePhPresentedFrameMatchesToken,
  phonePhForegroundParallaxY,
  phonePhPresentationProgress,
  phonePhTimelineProgressForMediaProgress
} from './PhonePh';
import {
  phoneRuntimePresentationTokenKey,
  type PresentationToken
} from '../../../production/phone/phone-story/runtime';

const source = readFileSync(new URL('./PhonePh.tsx', import.meta.url), 'utf8');
const motionSource = readFileSync(
  new URL('./PhonePh.motion.ts', import.meta.url),
  'utf8'
);
const reverseSource = readFileSync(
  new URL('./PhonePh.reverse.ts', import.meta.url),
  'utf8'
);
const nativeClockSource = readFileSync(
  new URL('../../../production/phone/phone-native-autoplay.ts', import.meta.url),
  'utf8'
);
const cinematicRunSource = readFileSync(
  new URL(
    '../../../production/phone/scenes/usePhoneCinematicRun.ts',
    import.meta.url
  ),
  'utf8'
);
const css = readFileSync(new URL('./PhonePh.css', import.meta.url), 'utf8');

describe('PhonePh', () => {
  it('keeps one canonical PH visual/media owner', () => {
    const markup = renderToStaticMarkup(createElement(PhonePh, {
      active: true,
      reducedMotion: false
    }));

    expect(markup.match(/data-r4-scene="ph-animation"/g)).toHaveLength(1);
    expect(markup.match(/data-media-key="ph-figure-motion"/g)).toHaveLength(1);
    expect(markup).toContain('data-phone-scene="ph-animation"');
    expect(markup).toContain('preload="auto"');
  });

  it('lets the packed surface own its Canvas instead of a React Portal', () => {
    expect(source).not.toContain('createPortal');
    expect(source).not.toContain('figureCanvasRef');
    expect(source).not.toContain('figureCanvasHost');
    expect(source).not.toContain('querySelector<HTMLCanvasElement>');
    expect(source).toContain('createPhonePackedAlphaSurface');
  });

  it('[R5] redraws its prepared packed surface when an active media token starts', () => {
    expect(source).toContain('const presentPreparedFrame = useCallback((token: PresentationToken) => {');
    expect(source).toContain("surface?.(['present', key])");
    expect(source).toContain('presentPreparedFrame,');
  });


  it('[execution hard cutover] exposes only the runner-issued play command', () => {
    expect(source).toContain('play(direction: 1 | -1, request?: PhoneExecutionToken)');
    expect(source).not.toMatch(/\n\s*enter\(/);
    expect(source).not.toMatch(/\n\s*reverse\(/);
  });

  it('uses stable reduced-motion endpoints in canonical order', () => {
    expect(phonePhPresentationProgress(0.49, true)).toBe(0);
    expect(phonePhPresentationProgress(0.5, true)).toBe(1);
    expect(phonePhPresentationProgress(0.75)).toBe(0.75);
  });

  it('keeps native media time aligned to the Figure2 phone camera', () => {
    expect(phonePhTimelineProgressForMediaProgress(0)).toBe(0);
    expect(phonePhTimelineProgressForMediaProgress(0.445)).toBeCloseTo(0.5, 5);
    expect(phonePhTimelineProgressForMediaProgress(1)).toBeCloseTo(1, 5);
    expect(phonePhForegroundParallaxY({ figureY: 135 })).toBe(135);
    expect(css).toContain('left: 61%');
    expect(css).toContain('--phone-ph-plate-width');
    expect(css).toContain('--phone-ph-front-width');
    expect(css).toContain('* .044');
    expect(css).toMatch(/\.ph-layer--front\s*\{[^}]*opacity: 1 !important;[^}]*filter: none;[^}]*mix-blend-mode: normal;/s);
    expect(css).toContain('-webkit-mask-image: none');
    expect(css).toContain('var(--phone-cinematic-stage-height, 100lvh) * .74');
    expect(css).toContain('object-position: 12% 50%');
    expect(css).toContain('* 1.65');
    expect(css).toContain('* .105');
    expect(css).toContain('* .245');
    expect(css).toContain('opacity: 1 !important');
    expect(css).toContain('.ph-layer-stack::before');
    expect(css).toContain('background: #d9d0b9');
    expect(css).toContain('var(--phone-ph-island-source)');
    expect(css).toContain('.phone-ph .ph-edge-light');
    expect(css).toContain('background: none');
    expect(css).not.toContain('::after');
    expect(source).toContain('PH_FRONT_SRC');
    expect(source).toContain("'--phone-ph-island-source'");
  });

  it('reuses the AOD native-time policy and Figure2 stable-surface policy', () => {
    expect(source).toContain('createPhoneNativeAutoplay');
    expect(source).toContain('createPhonePackedAlphaSurface');
    expect(source).not.toContain('createPortal');
    expect(source).not.toContain('figureCanvasRef');
    expect(source).toContain("phoneMediaUrlFor('ph-figure-packed'");
    expect(source).toContain('usePhoneCinematicRun([');
    expect(source).toContain('ensurePackedSurface,');
    expect(source).toContain('prepareTargetPresentation');
    expect(source).toContain(
      'phoneRuntimePresentationTokenKey(request.presentationToken as PresentationToken)'
    );
    expect(source).toContain('lifecycleRef.current[1](1)');
    expect(source).toContain('lifecycleRef.current[1](-1)');
    expect(source).not.toContain('phonePresentedFrameOwner');
    expect(source).not.toContain('PH_FIGURE_OPENING_SRC');
    expect(source).not.toContain('beginRun');
    expect(source).toContain('presentedFrameRef.current?.(presentationKey);');
    expect(cinematicRunSource).toContain("options.activateSurface('endpoint')");
    expect(source).not.toContain(
      "ensurePackedSurface(reducedMotion ? 'endpoint' : 'forward')"
    );
    expect(source).toContain(
      "request.progress >= 0.999 || request.direction === -1"
    );
    expect(source).toContain('PH_FIGURE_END_SECONDS');
    expect(source).toContain('createPhonePhPresentedReverse');
    expect(source).toContain('beginPreparedReverse');
    expect(cinematicRunSource).toContain("publish('progress', direction, progress)");
    expect(source).toContain('renderProgress,');
    expect(source).toContain('play(direction: 1 | -1, request?: PhoneExecutionToken)');
    expect(source).toContain('startRun(direction, request ?? null)');
    expect(cinematicRunSource).toContain('options.reverseReady(');
    expect(motionSource).toContain("'presented-frame-reverse'");
    expect(reverseSource).toContain('createPhonePresentedReversePlayback');
    expect(reverseSource).toContain('preparePhoneTimelineVideoFrame');
    expect(reverseSource).toContain('phPlaybackProgress(progress)');
    expect(reverseSource).toContain("'timeline'");
    expect(reverseSource).not.toContain('TimelineVideoDriveInput');
    expect(motionSource).toContain('phonePhForegroundParallaxY');
    expect(nativeClockSource).toContain('video.currentTime / duration');
    expect(nativeClockSource).toContain("video.addEventListener('timeupdate'");
    expect(nativeClockSource).not.toContain('primeFromGesture');
    expect(nativeClockSource).not.toContain("addEventListener('touchstart'");
    expect(source).not.toContain('driveTimelineVideo');
    expect(source).not.toContain("mode: 'timeline'");
    expect(reverseSource).toContain("'timeline'");
    expect(reverseSource).not.toContain('endpoint-dissolve');
  });

  it('[P0 PH reverse] requires the current token draw instead of a generic verified status', () => {
    const reverseReadyStart = source.indexOf('const reverseReady = useCallback');
    const reverseReadyEnd = source.indexOf('const beforeForward', reverseReadyStart);
    const reverseReady = source.slice(reverseReadyStart, reverseReadyEnd);

    expect(reverseReadyStart).toBeGreaterThanOrEqual(0);
    expect(reverseReady).not.toContain("root?.dataset.phonePhAlpha === 'verified'");
    expect(reverseReady).toContain('phonePhPresentedFrameMatchesToken');
    expect(reverseReady).toContain('presentedReverseFrameRef');
  });

  it('[PH token-bound reverse] rejects stale frames and accepts only the current immutable token', () => {
    const token: PresentationToken = {
      authorityId: 'phone-authority',
      sessionId: 'phone-session-7',
      generation: 3,
      revision: 11,
      subject: 'ph-animation',
      leg: 0,
      kind: 'packed-canvas-frame'
    };
    const key = phoneRuntimePresentationTokenKey(token);

    expect(phonePhPresentedFrameMatchesToken(null, token)).toBe(false);
    expect(phonePhPresentedFrameMatchesToken(`${key}:stale`, token)).toBe(false);
    expect(phonePhPresentedFrameMatchesToken(key, null)).toBe(false);
    expect(phonePhPresentedFrameMatchesToken(key, token)).toBe(true);
  });

  it('falls back to its static layers and parks media without a reload', () => {
    const root = new FakeElement();
    const video = new FakeVideo();
    root.dataset.r4Scene = 'ph-animation';
    root.connect('[data-ph-alpha-video]', video);
    video.paused = false;

    applyPhonePhMediaFallback(root as unknown as HTMLElement);

    expect(root.dataset.phonePhMedia).toBe('fallback');
    expect(video.dataset.phonePhMedia).toBe('fallback');
    expect(video.paused).toBe(true);

    video.paused = false;
    parkPhonePhMedia(root as unknown as HTMLElement);

    expect(video.paused).toBe(true);
    expect(video.preload).toBe('auto');
    expect(video.loadCalls).toBe(0);
  });
});

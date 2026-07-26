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
  phonePhForegroundParallaxY,
  phonePhPresentationProgress,
  phonePhTimelineProgressForMediaProgress
} from './PhonePh';

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
    expect(source).toContain('createPortal');
    expect(source).toContain('figureCanvasRef');
    expect(source).toContain("phoneMediaUrlFor('ph-figure-packed'");
    expect(source).toContain('activateSurface: ensurePackedSurface');
    expect(source).toContain('prepareTargetPresentation');
    expect(source).toContain('surface.prepare(mode, request.signal)');
    expect(source).toContain('run.failRun(1)');
    expect(source).toContain('run.failRun(-1)');
    expect(source).not.toContain('phonePresentedFrameOwner');
    expect(source).not.toContain('PH_FIGURE_OPENING_SRC');
    expect(source).not.toContain('beginRun');
    expect(source).not.toContain('presentedFrame');
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
    expect(source).toContain("phase: 'progress'");
    expect(cinematicRunSource).toContain('options.reverseReady()');
    expect(motionSource).toContain("'presented-frame-reverse'");
    expect(reverseSource).toContain('createPhonePresentedReversePlayback');
    expect(reverseSource).toContain('prepareTimelineVideoFrame');
    expect(reverseSource).toContain('phPlaybackProgress(progress)');
    expect(reverseSource).toContain('allowSeekedFrameFallback: true');
    expect(motionSource).toContain('phonePhForegroundParallaxY');
    expect(nativeClockSource).toContain('video.currentTime / duration');
    expect(nativeClockSource).toContain("video.addEventListener('timeupdate'");
    expect(nativeClockSource).not.toContain('primeFromGesture');
    expect(nativeClockSource).not.toContain("addEventListener('touchstart'");
    expect(source).not.toContain('driveTimelineVideo');
    expect(source).not.toContain("mode: 'timeline'");
    expect(reverseSource).toContain("mode: 'timeline'");
    expect(reverseSource).not.toContain('endpoint-dissolve');
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

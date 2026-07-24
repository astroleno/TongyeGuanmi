import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FakeElement,
  FakeVideo
} from '../../../transitions/__fixtures__/back-half.fixture';
import {
  applyPhoneCraneMediaFallback,
  parkPhoneCraneMedia,
  PHONE_CRANE_STABLE_HOLD_PROGRESS,
  PhoneCrane,
  phoneCranePresentationProgress,
  renderPhoneCranePresentation
} from './PhoneCrane';
import {
  PHONE_CRANE_FIGURE_PLAYBACK_RATE,
  PHONE_CRANE_FIGURE_MEDIA_SECONDS,
  PHONE_CRANE_FLOCK_MEDIA_SECONDS,
  PHONE_CRANE_FLOCK_PLAYBACK_RATE,
  phoneCraneTimelineProgressForFigureMediaProgress,
  phoneCraneTimelineProgressForFlockMediaProgress
} from './PhoneCrane.autoplay';
import {
  PHONE_CRANE_FLOCK_ARRIVAL_SCALE,
  PHONE_CRANE_FLOCK_OPENING_SCALE,
  PHONE_CRANE_FLOCK_TOP_ARRIVAL_SECONDS,
  PHONE_CRANE_FLOCK_TOP_ARRIVAL_Y_VH,
  PHONE_CRANE_FIGURE_OPENING_SCALE,
  PHONE_CRANE_FIGURE_OPENING_X_VH,
  PHONE_CRANE_FIGURE_OPENING_Y_VH
} from './PhoneCrane.motion';

const source = readFileSync(new URL('./PhoneCrane.tsx', import.meta.url), 'utf8');
const autoplaySource = readFileSync(
  new URL('./PhoneCrane.autoplay.ts', import.meta.url),
  'utf8'
);
const motionSource = readFileSync(
  new URL('./PhoneCrane.motion.ts', import.meta.url),
  'utf8'
);
const cinematicRunSource = readFileSync(
  new URL(
    '../../../production/phone/scenes/usePhoneCinematicRun.ts',
    import.meta.url
  ),
  'utf8'
);
const css = readFileSync(new URL('./PhoneCrane.css', import.meta.url), 'utf8');

describe('PhoneCrane', () => {
  it('keeps one canonical Crane stage with two media surfaces', () => {
    const markup = renderToStaticMarkup(createElement(PhoneCrane, {
      active: true,
      reducedMotion: false
    }));

    expect(markup.match(/data-r4-scene="crane-animation"/g)).toHaveLength(1);
    expect(markup.match(/data-media-key="crane-figure-motion"/g)).toHaveLength(1);
    expect(markup.match(/data-media-key="crane-flock-motion"/g)).toHaveLength(1);
    expect(markup).toContain('data-phone-scene="crane-animation"');
  });

  it('uses the formal packed flock media on every route', () => {
    expect(source).toContain('packedSourceUrl: PHONE_CRANE_FLOCK_PACKED');
    expect(source).not.toContain('qa-media');
    expect(source).not.toContain('phoneCraneFlockPackedUrlFor');
  });

  it('uses stable reduced-motion endpoints in canonical order', () => {
    expect(phoneCranePresentationProgress(0.49, true)).toBe(0);
    expect(phoneCranePresentationProgress(0.5, true)).toBe(1);
    expect(phoneCranePresentationProgress(0.25)).toBe(0.25);
  });

  it('reuses AOD native clocks with the authored half-second media stagger', () => {
    expect(autoplaySource).toContain('createPhoneNativeAutoplay');
    expect(source).toContain('createPhonePackedAlphaSurface');
    expect(source).toContain('createPortal');
    expect(source).toContain('figureCanvasRef');
    expect(source).toContain('flockCanvasRef');
    expect(source).toContain("'crane-figure-packed'");
    expect(source).toContain("'crane-flock-packed'");
    expect(source).toContain("ensurePackedSurfaces('endpoint')");
    expect(source).toContain("reducedMotion ? 'endpoint' : 'forward'");
    expect(autoplaySource).toContain('FIGURE_START_SECONDS = 0.5');
    expect(autoplaySource).toContain('figureClock.start()');
    expect(motionSource).toContain('renderPhoneCranePresentation');
    expect(motionSource).toContain("'presented-frame-reverse'");
    expect(source).toContain("ensurePackedSurfaces('endpoint')");
    expect(source).not.toContain('prepareCraneAnimationFrame');
    expect(autoplaySource).toContain('prepareCraneAnimationFrame');
    expect(autoplaySource).toContain('createPhonePresentedReversePlayback');
    expect(source).toContain('PHONE_CRANE_STABLE_HOLD_PROGRESS');
    expect(source).toContain('PHONE_CRANE_FIGURE_ENDPOINT_SECONDS = CRANE_VIDEO_END_SECONDS');
    expect(source).toContain('PHONE_CRANE_FLOCK_ENDPOINT_SECONDS = CRANE_VIDEO_END_SECONDS');
    expect(source).toContain('beginPreparedReverse');
    expect(cinematicRunSource).toContain("'preparing-reverse'");
    expect(source).toContain("phase: 'progress'");
    expect(autoplaySource).toContain('figure.playbackRate = PHONE_CRANE_FIGURE_PLAYBACK_RATE');
    expect(autoplaySource).toContain('figure.currentTime = CRANE_VIDEO_END_SECONDS');
    expect(autoplaySource).toContain("root.dataset.phoneCraneFigurePreroll = 'released'");
    expect(autoplaySource).toContain("owner === 'flock'");
    expect(autoplaySource).toContain('if (!figureStarted)');
    expect(autoplaySource).not.toContain('nativeGate');
    expect(css).toContain('.phone-crane .r4-crane-animation .phone-crane__figure-canvas');
    expect(css).toContain('--phone-crane-motion-height');
    expect(css).toContain('width: calc(var(--phone-crane-motion-height) * 16 / 9)');
    expect(css).toContain('height: var(--phone-crane-motion-height)');
    expect(css).toContain('aspect-ratio: auto');
    expect(css).not.toContain('--phone-crane-motion-width');
    expect(css).toContain('--phone-crane-flock-center-y: 50.2%');
    expect(css).toContain('--crane-flock-scale: .57');
    expect(css).toContain('var(--phone-crane-tune-flock-x, -1lvh)');
    expect(css).toContain('var(--phone-crane-tune-flock-y, 10.75lvh)');
    expect(css).toContain('var(--phone-crane-figure-camera-x, -3.75lvh)');
    expect(css).toContain('var(--phone-crane-figure-camera-y, 8.75lvh)');
    expect(motionSource).toContain(
      'figureOpeningScale + (1 - figureOpeningScale) * grow'
    );
    expect(PHONE_CRANE_FIGURE_OPENING_SCALE).toBe(0.5);
    expect(PHONE_CRANE_FIGURE_OPENING_X_VH).toBe(-3.75);
    expect(PHONE_CRANE_FIGURE_OPENING_Y_VH).toBe(8.75);
    expect(PHONE_CRANE_FLOCK_TOP_ARRIVAL_SECONDS).toBe(1.5);
    expect(PHONE_CRANE_FLOCK_TOP_ARRIVAL_Y_VH).toBe(-10.95);
    expect(PHONE_CRANE_FLOCK_OPENING_SCALE).toBe(0.57);
    expect(PHONE_CRANE_FLOCK_ARRIVAL_SCALE).toBe(1);
    expect(css).toContain('--phone-crane-flock-motion-scale');
    expect(css).toContain('filter: none');
    expect(motionSource).toContain(
      'var(--phone-crane-tune-building-y, 3.25lvh)'
    );
    expect(motionSource).toContain(
      'var(--phone-crane-tune-bottom-cloud-y, 3.25lvh)'
    );
    expect(css).toContain('position: absolute');
    expect(css).toContain('clip-path: none');
    expect(css).not.toContain('9dvh');
    expect(PHONE_CRANE_STABLE_HOLD_PROGRESS).toBe(1);
    expect(PHONE_CRANE_FIGURE_MEDIA_SECONDS).toBe(2.5);
    expect(PHONE_CRANE_FIGURE_PLAYBACK_RATE).toBeCloseTo(2.467 / 2.5, 8);
    expect(PHONE_CRANE_FLOCK_MEDIA_SECONDS).toBe(2.5);
    expect(PHONE_CRANE_FLOCK_PLAYBACK_RATE).toBeCloseTo(2.467 / 2.5, 8);
    expect(phoneCraneTimelineProgressForFigureMediaProgress(0)).toBeCloseTo(1 / 6, 8);
    expect(phoneCraneTimelineProgressForFigureMediaProgress(1)).toBe(1);
    expect(phoneCraneTimelineProgressForFlockMediaProgress(0)).toBe(0);
    expect(phoneCraneTimelineProgressForFlockMediaProgress(1)).toBeCloseTo(5 / 6, 8);
    expect(autoplaySource).toContain(
      'flock.playbackRate = PHONE_CRANE_FLOCK_PLAYBACK_RATE'
    );
    expect(autoplaySource).toContain(
      'phoneCraneTimelineProgressForFlockMediaProgress(1)'
    );
    expect(autoplaySource).not.toContain('PHONE_CRANE_REVERSE_DISSOLVE_MS');
    expect(autoplaySource).not.toContain('endpoint-dissolve');

    const endpoint = new FakeElement();
    const arch = new FakeElement();
    const flockCanvas = new FakeElement();
    endpoint.dataset.r4Scene = 'crane-animation';
    endpoint.connect('.crane-layer--arch', arch);
    endpoint.connect('.phone-crane__flock-canvas', flockCanvas);
    renderPhoneCranePresentation(
      endpoint as unknown as HTMLElement,
      0
    );
    expect(endpoint.style.values.get('--crane-video-scale')).toBe('0.5000');
    expect(
      endpoint.style.values.get('--phone-crane-figure-camera-x')
    ).toBe('-3.75lvh');
    expect(
      endpoint.style.values.get('--phone-crane-figure-camera-y')
    ).toBe('8.75lvh');
    expect(endpoint.style.values.get('--crane-flock-y')).toBe('0.00lvh');
    expect(
      endpoint.style.values.get('--phone-crane-flock-motion-scale')
    ).toBe('0.5700');
    renderPhoneCranePresentation(
      endpoint as unknown as HTMLElement,
      0.5
    );
    expect(endpoint.style.values.get('--crane-flock-y')).toBe('-10.95lvh');
    expect(
      endpoint.style.values.get('--phone-crane-flock-motion-scale')
    ).toBe('1.0000');
    renderPhoneCranePresentation(
      endpoint as unknown as HTMLElement,
      1
    );
    expect(endpoint.style.values.get('--crane-flock-opacity')).toBe('0.0000');
    expect(endpoint.style.values.get('--crane-video-scale')).toBe('1.0000');
    expect(
      endpoint.style.values.get('--phone-crane-figure-camera-x')
    ).toBe('0.00lvh');
    expect(
      endpoint.style.values.get('--phone-crane-figure-camera-y')
    ).toBe('0.00lvh');
    expect(endpoint.dataset.phoneCraneProgress).toBe('1.0000');
    expect(endpoint.dataset.phoneCraneFlockState).toBe('retired');
    expect(flockCanvas.style.opacity).toBe('0');
    expect(flockCanvas.style.visibility).toBe('hidden');
    expect(
      (arch.style as unknown as { transform: string }).transform
    ).toContain('993.60px');

    renderPhoneCranePresentation(
      endpoint as unknown as HTMLElement,
      0.8,
      -1
    );
    expect(endpoint.dataset.phoneCraneFlockState).toBe('active');
    expect(flockCanvas.style.opacity).toBe('');
    expect(flockCanvas.style.visibility).toBe('visible');
  });

  it('keeps the static Crane layers on media failure and retires both videos', () => {
    const root = new FakeElement();
    const figure = new FakeVideo();
    const flock = new FakeVideo();
    root.dataset.r4Scene = 'crane-animation';
    root.connect('[data-crane-figure-video]', figure);
    root.connect('[data-crane-figure-front-video]', flock);
    figure.paused = false;
    flock.paused = false;

    applyPhoneCraneMediaFallback(root as unknown as HTMLElement);

    expect(root.dataset.phoneCraneMedia).toBe('fallback');
    expect(figure.dataset.phoneCraneMedia).toBe('fallback');
    expect(flock.dataset.phoneCraneMedia).toBe('fallback');
    expect(figure.paused).toBe(true);
    expect(flock.paused).toBe(true);

    figure.paused = false;
    flock.paused = false;
    parkPhoneCraneMedia(root as unknown as HTMLElement);

    expect(figure.paused).toBe(true);
    expect(flock.paused).toBe(true);
    expect(figure.preload).toBe('auto');
    expect(flock.preload).toBe('auto');
  });
});

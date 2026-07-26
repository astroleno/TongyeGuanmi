import {
  createPhoneInkAdapter
} from '../../production/phone/transitions/PhoneInkTransition';

export const PHONE_BRAND_FIGURE3_FIELD = {
  kind: 'horizontal',
  direction: 'bottom-to-top',
  seed: 'brand-figure3'
} as const;

export const PHONE_BRAND_FIGURE3_DECISION = {
  strategy: 'validated-phone-ink',
  camera: 'desktop-brand-figure3/star-map-aod-bottom-to-top-field',
  fallback: 'stable-endpoint-dissolve',
  forwardEndpoint: 'figure3-animation:stable-initial-frame',
  reverseEndpoint: 'brand:readable-hold',
  rationale: 'Reuse the authored desktop Brand → Figure3 contour through the physical-iPhone-approved Star-map → AOD field renderer; the same Brand and Figure3 roots remain the complementary A/B owners.'
} as const;

export type PhoneBrandFigure3Frame = Readonly<{
  progress: number;
  fromOpacity: number;
  toOpacity: number;
}>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function phoneBrandFigure3Frame(
  rawProgress: number,
  reducedMotion = false,
  mediaFailed = false,
  direction: 1 | -1 = 1
): PhoneBrandFigure3Frame {
  const progress = mediaFailed
    ? direction === 1 ? 1 : 0
    : reducedMotion ? rawProgress <= 0 ? 0 : 1
      : clamp(rawProgress);
  return { progress, fromOpacity: 1 - progress, toOpacity: progress };
}

export const PhoneBrandFigure3Transition = createPhoneInkAdapter({
  id: 'phone-brand-figure3',
  field: PHONE_BRAND_FIGURE3_FIELD,
  grade: 'edge-bright',
  canvasClassName: 'portrait-scroll-spike__ink phone-brand-figure3__ink',
  portraitInk: 'brand-figure3',
  renderFrame(from, to, progress, reducedMotion, direction, host) {
    const frame = phoneBrandFigure3Frame(
      progress,
      reducedMotion,
      from?.dataset.phoneMediaState === 'fallback'
        || to?.dataset.phoneMediaState === 'fallback',
      direction
    );
    if (import.meta.env.DEV) {
      if (host) {
        host.dataset.phoneTransition = 'brand-figure3:validated-phone-ink';
        host.dataset.phoneTransitionProgress = frame.progress.toFixed(4);
      }
      if (from) {
        from.dataset.phoneInkSource = 'brand-figure3';
        from.dataset.phoneInkSourceOpacity = frame.fromOpacity.toFixed(4);
      }
      if (to) {
        to.dataset.phoneInkReceiver = 'brand-figure3';
        to.dataset.phoneInkReceiverOpacity = frame.toOpacity.toFixed(4);
      }
    }
    return frame.progress;
  }
});

export default PhoneBrandFigure3Transition;

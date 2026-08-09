import { canUseDOM } from '../runtime/browser-guard';

export type PresentationFamily = 'desktop' | 'phone';

export type PresentationProfileInput = Readonly<{
  width: number;
  height: number;
  pointerCoarse: boolean;
  hoverNone: boolean;
}>;

/**
 * This classifier selects a renderer once.  A PhoneStoryShell subsequently
 * adapts its own layout as the device rotates instead of allowing App to
 * replace the mounted story with the desktop shell.
 */
export function presentationFamilyFor(input: PresentationProfileInput): PresentationFamily {
  const width = Math.max(1, input.width);
  const height = Math.max(1, input.height);
  const phoneCapabilities = input.pointerCoarse && input.hoverNone;
  const portraitPhone = height > width && width <= 600;
  const landscapePhone = width > height && height <= 500;
  return phoneCapabilities && (portraitPhone || landscapePhone) ? 'phone' : 'desktop';
}

export function initialPresentationFamily(): PresentationFamily {
  if (!canUseDOM()) {
    return 'desktop';
  }
  const viewport = window.visualViewport;
  // Chromium's mobile emulation exposes touch input through
  // `maxTouchPoints` while leaving the pointer media feature at its desktop
  // default. Treat that as the same coarse/non-hover capability the physical
  // phone has; otherwise a release build can silently mount DesktopStoryShell
  // at `/` and all phone acceptance evidence becomes irrelevant.
  // Playwright/WebKit and iPadOS desktop-mode Safari can expose a phone
  // viewport while reporting zero maxTouchPoints.  The navigator identity is
  // a capability fact here, not a route override; geometry still decides
  // whether the phone renderer is appropriate.
  const touchCapable = navigator.maxTouchPoints > 0
    || navigator.userAgent.includes('iP');
  return presentationFamilyFor({
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
    pointerCoarse: window.matchMedia('(pointer: coarse)').matches || touchCapable,
    hoverNone: window.matchMedia('(hover: none)').matches || touchCapable
  });
}

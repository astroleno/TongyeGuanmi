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
  return presentationFamilyFor({
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
    pointerCoarse: window.matchMedia('(pointer: coarse)').matches,
    hoverNone: window.matchMedia('(hover: none)').matches
  });
}

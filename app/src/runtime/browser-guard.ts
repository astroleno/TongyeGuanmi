export function canUseDOM(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function assertBrowserRuntime(apiName: string): void {
  if (!canUseDOM()) {
    throw new Error(`${apiName} must run behind a browser guard`);
  }
}

export function runBrowserOnly<T>(callback: () => T, fallback: T): T {
  if (!canUseDOM()) {
    return fallback;
  }
  return callback();
}

export function getMatchMedia(): typeof window.matchMedia | undefined {
  if (!canUseDOM() || typeof window.matchMedia !== 'function') {
    return undefined;
  }
  return window.matchMedia.bind(window);
}

type GsapMatchMedia = ReturnType<typeof import('gsap').gsap.matchMedia>;

export async function withGsapMatchMedia<T>(callback: (matchMedia: GsapMatchMedia) => T | Promise<T>): Promise<T | undefined> {
  if (!canUseDOM()) {
    return undefined;
  }
  const { gsap } = await import('gsap');
  return callback(gsap.matchMedia());
}

export function isMediaElement(value: unknown): value is HTMLMediaElement {
  return canUseDOM() && value instanceof HTMLMediaElement;
}

export type PhoneMotionDriver = Readonly<{
  set(target: HTMLElement, vars: Readonly<Record<string, string | number>>): void;
  quickTo(
    target: HTMLElement,
    property: 'x' | 'y',
    vars: Readonly<{ duration: number; ease: string }>
  ): (value: number) => void;
}>;

export const PHONE_FIGURE_DURATION_SECONDS = 2.042;

export type PhoneParallaxTarget = Readonly<{
  element: HTMLElement;
  x: number;
  y: number;
}>;

export type PhoneDeviceParallax = Readonly<{
  requestPermission(): void;
  dispose(): void;
}>;

type DeviceOrientationPermissionConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

type OrientationBaseline = Readonly<{
  beta: number;
  gamma: number;
}>;

type PhoneDeviceParallaxOptions = Readonly<{
  root: HTMLElement;
  targets: readonly PhoneParallaxTarget[];
  motionDriver: PhoneMotionDriver;
  eventTarget?: Window;
}>;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function orientationConstructor(): DeviceOrientationPermissionConstructor | undefined {
  if (typeof DeviceOrientationEvent === 'undefined') {
    return undefined;
  }
  return DeviceOrientationEvent as DeviceOrientationPermissionConstructor;
}

export function phoneDeviceParallaxSample(
  beta: number,
  gamma: number,
  baseline: OrientationBaseline
): Readonly<{ x: number; y: number }> {
  return {
    x: clamp((gamma - baseline.gamma) / 20, -1, 1),
    y: clamp((beta - baseline.beta) / 24, -1, 1)
  };
}

/**
 * iOS permits device orientation only from a user activation. Android and
 * browsers without that gate start listening immediately; iOS exposes the
 * same parallax after the first touch without competing with vertical scroll.
 */
export function attachPhoneDeviceParallax(
  options: PhoneDeviceParallaxOptions
): PhoneDeviceParallax {
  const eventTarget = options.eventTarget ?? window;
  const targets = options.targets.filter((target) => Boolean(target.element));
  const root = options.root;
  const motionDriver = options.motionDriver;
  const source = orientationConstructor();
  const permissionRequired = typeof source?.requestPermission === 'function';
  let disposed = false;
  let listening = false;
  let requesting = false;
  let baseline: OrientationBaseline | undefined;

  const setters = targets.map((target) => ({
    ...target,
    xTo: motionDriver.quickTo(target.element, 'x', { duration: 0.58, ease: 'power3.out' }),
    yTo: motionDriver.quickTo(target.element, 'y', { duration: 0.58, ease: 'power3.out' })
  }));

  const reset = () => {
    for (const target of setters) {
      target.xTo(0);
      target.yTo(0);
    }
  };

  const onOrientation = (event: Event) => {
    const orientation = event as DeviceOrientationEvent;
    if (!finite(orientation.beta) || !finite(orientation.gamma)) {
      return;
    }
    if (!baseline) {
      baseline = { beta: orientation.beta, gamma: orientation.gamma };
      root.dataset.phoneHeroParallax = 'calibrated';
      return;
    }
    const sample = phoneDeviceParallaxSample(orientation.beta, orientation.gamma, baseline);
    for (const target of setters) {
      target.xTo(sample.x * target.x);
      target.yTo(sample.y * target.y);
    }
  };

  const beginListening = () => {
    if (disposed || listening) {
      return;
    }
    listening = true;
    root.dataset.phoneHeroParallax = 'active';
    eventTarget.addEventListener('deviceorientation', onOrientation, { passive: true });
  };

  if (!source) {
    root.dataset.phoneHeroParallax = 'unavailable';
  } else if (permissionRequired) {
    root.dataset.phoneHeroParallax = 'gesture-required';
  } else {
    beginListening();
  }

  return {
    requestPermission() {
      if (disposed || listening || requesting || !source) {
        return;
      }
      if (!permissionRequired) {
        beginListening();
        return;
      }
      requesting = true;
      root.dataset.phoneHeroParallax = 'requesting';
      void source.requestPermission?.().then(
        (state) => {
          requesting = false;
          if (disposed) {
            return;
          }
          if (state === 'granted') {
            beginListening();
            return;
          }
          root.dataset.phoneHeroParallax = 'denied';
        },
        () => {
          requesting = false;
          if (!disposed) {
            root.dataset.phoneHeroParallax = 'denied';
          }
        }
      );
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      if (listening) {
        eventTarget.removeEventListener('deviceorientation', onOrientation);
      }
      reset();
      delete root.dataset.phoneHeroParallax;
    }
  };
}

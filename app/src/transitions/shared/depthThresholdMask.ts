import type { InkDepthTransform } from './inkField';

const ATLAS_COLUMNS = 8;
const ATLAS_FRAMES = 32;
const ATLAS_ROWS = Math.ceil(ATLAS_FRAMES * 2 / ATLAS_COLUMNS);

export type DepthThresholdPolarity = 'reveal' | 'conceal';

export type DepthThresholdTarget = Readonly<{
  element: HTMLElement;
  polarity: DepthThresholdPolarity;
}>;

export type DepthThresholdTables = Readonly<{
  reveal: readonly number[];
  conceal: readonly number[];
}>;

export type DepthThresholdMask = {
  readonly ready: Promise<void>;
  commit(): void;
  committed(): boolean;
  render(progress: number, transform?: InkDepthTransform): DepthThresholdTables;
  dispose(): void;
};

const MASK_STYLE_PROPERTIES = [
  'mask-image',
  '-webkit-mask-image',
  'mask-size',
  '-webkit-mask-size',
  'mask-position',
  '-webkit-mask-position',
  'mask-repeat',
  '-webkit-mask-repeat',
  'mask-mode',
  '-webkit-mask-mode'
] as const;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function attributeNumber(value: number): string {
  return String(Number(value.toFixed(4)));
}

export function thresholdTable(progress: number, steps = 256): number[] {
  const size = Math.max(2, Math.floor(steps));
  const revealCount = Math.round(clamp(progress) * size);
  return Array.from({ length: size }, (_, index) => index < revealCount ? 1 : 0);
}

export function thresholdTables(progress: number, steps = 256): DepthThresholdTables {
  const reveal = thresholdTable(progress, steps);
  return {
    reveal,
    conceal: reveal.map((value) => 1 - value)
  };
}

type AttachedTarget = Readonly<{
  element: HTMLElement;
  polarity: DepthThresholdPolarity;
  maskUrl: string;
  previousStyles: ReadonlyMap<string, string>;
}>;

function applyManagedMask(
  target: AttachedTarget,
  frame: number,
  transform: InkDepthTransform
): void {
  const { cover, camera } = transform;
  const originX = cover.x + cover.width * camera.originX;
  const originY = cover.y + cover.height * camera.originY;
  const tileWidth = cover.width * camera.scale;
  const tileHeight = cover.height * camera.scale;
  const tileX = camera.translateX + originX + (cover.x - originX) * camera.scale;
  const tileY = camera.translateY + originY + (cover.y - originY) * camera.scale;
  const index = frame * 2 + (target.polarity === 'conceal' ? 1 : 0);
  const column = index % ATLAS_COLUMNS;
  const row = Math.floor(index / ATLAS_COLUMNS);
  const size = `${attributeNumber(tileWidth * ATLAS_COLUMNS)}px ${attributeNumber(tileHeight * ATLAS_ROWS)}px`;
  const position = `${attributeNumber(tileX - column * tileWidth)}px ${attributeNumber(tileY - row * tileHeight)}px`;
  target.element.style.setProperty('mask-image', target.maskUrl);
  target.element.style.setProperty('-webkit-mask-image', target.maskUrl);
  target.element.style.setProperty('mask-size', size);
  target.element.style.setProperty('-webkit-mask-size', size);
  target.element.style.setProperty('mask-position', position);
  target.element.style.setProperty('-webkit-mask-position', position);
  target.element.style.setProperty('mask-repeat', 'no-repeat');
  target.element.style.setProperty('-webkit-mask-repeat', 'no-repeat');
  target.element.style.setProperty('mask-mode', 'alpha');
  target.element.style.setProperty('-webkit-mask-mode', 'alpha');
}

function restoreManagedMaskStyles(target: AttachedTarget): void {
  for (const property of MASK_STYLE_PROPERTIES) {
    const previous = target.previousStyles.get(property) ?? '';
    if (previous) target.element.style.setProperty(property, previous);
    else target.element.style.removeProperty(property);
  }
}

function attachMask(target: DepthThresholdTarget, maskUrl: string, runId: string): AttachedTarget {
  const previousStyles = new Map<string, string>();
  for (const property of MASK_STYLE_PROPERTIES) {
    previousStyles.set(property, target.element.style.getPropertyValue(property));
  }

  const attached: AttachedTarget = { ...target, maskUrl, previousStyles };
  target.element.setAttribute('data-r4-depth-mask-run', runId);
  target.element.setAttribute('data-r4-depth-mask-polarity', target.polarity);
  return attached;
}

function restoreTarget(target: AttachedTarget): void {
  restoreManagedMaskStyles(target);
  target.element.removeAttribute('data-r4-depth-mask-run');
  target.element.removeAttribute('data-r4-depth-mask-polarity');
  target.element.removeAttribute('data-r4-depth-mask-progress');
}

function defaultDepthTransform(host: HTMLElement): InkDepthTransform {
  const rect = host.getBoundingClientRect?.();
  const width = rect?.width || host.clientWidth || (typeof window === 'undefined' ? 1440 : window.innerWidth) || 1440;
  const height = rect?.height || host.clientHeight || (typeof window === 'undefined' ? 900 : window.innerHeight) || 900;
  return {
    viewport: { width, height },
    cover: { x: 0, y: 0, width, height },
    camera: {
      scale: 1,
      translateX: 0,
      translateY: 0,
      originX: 0.5,
      originY: 0.5
    }
  };
}

export function createDepthThresholdMask(options: {
  host: HTMLElement | null;
  targets: readonly DepthThresholdTarget[];
  polarities?: readonly DepthThresholdPolarity[];
  atlasSrc: string;
  runId: string;
  steps?: number;
  transform?: InkDepthTransform;
}): DepthThresholdMask | null {
  const { host, targets, atlasSrc } = options;
  const requestedPolarities = [...new Set([
    ...(options.polarities ?? []),
    ...targets.map((target) => target.polarity)
  ])];
  if (!host || requestedPolarities.length === 0) {
    return null;
  }
  const steps = Math.max(2, Math.floor(options.steps ?? 256));
  let lastTransform = options.transform ?? defaultDepthTransform(host);

  let attachedTargets: AttachedTarget[] = [];
  let disposed = false;
  let isCommitted = false;
  let resourceReady = false;
  let resourceError: Error | undefined;
  let lastProgress = 0;
  let revealCount = 0;
  const revealTable = Array<number>(steps).fill(0);
  const concealTable = Array<number>(steps).fill(1);
  const lastTables: DepthThresholdTables = { reveal: revealTable, conceal: concealTable };
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  let readinessSettled = false;
  let readinessCompleting = false;
  let probe: HTMLImageElement | undefined;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  void ready.catch(() => undefined);

  const settleReady = () => {
    if (readinessSettled) {
      return;
    }
    readinessSettled = true;
    resourceReady = true;
    resolveReady();
  };
  const settleError = (error: Error) => {
    if (readinessSettled) {
      return;
    }
    readinessSettled = true;
    resourceError = error;
    rejectReady(error);
  };

  if (typeof Image === 'undefined') {
    settleReady();
  } else {
    probe = new Image();
    probe.decoding = 'async';
    const finishDecode = async () => {
      if (readinessSettled || readinessCompleting) {
        return;
      }
      readinessCompleting = true;
      try {
        await probe?.decode?.();
        settleReady();
      } catch (error) {
        settleError(error instanceof Error
          ? error
          : new Error(`Depth mask atlas ${atlasSrc} failed to decode`));
      }
    };
    probe.onload = () => {
      void finishDecode();
    };
    probe.onerror = () => {
      settleError(new Error(`Depth mask atlas ${atlasSrc} failed to load`));
    };
    probe.src = atlasSrc;
    if (probe.complete && probe.naturalWidth > 0) {
      void finishDecode();
    }
  }

  const updateTables = (progress: number): DepthThresholdTables => {
    const nextCount = Math.round(progress * steps);
    if (nextCount > revealCount) {
      for (let index = revealCount; index < nextCount; index += 1) {
        revealTable[index] = 1;
        concealTable[index] = 0;
      }
    } else if (nextCount < revealCount) {
      for (let index = nextCount; index < revealCount; index += 1) {
        revealTable[index] = 0;
        concealTable[index] = 1;
      }
    }
    revealCount = nextCount;
    return lastTables;
  };

  const targetDiagnostics = new WeakMap<HTMLElement, {
    progress: string;
    masked: boolean;
  }>();
  const applyTargetState = (progress: number) => {
    const progressValue = progress.toFixed(4);
    const frame = Math.round(progress * (ATLAS_FRAMES - 1));
    for (const target of attachedTargets) {
      const fullyVisible = (target.polarity === 'conceal' && progress === 0)
        || (target.polarity === 'reveal' && progress === 1);
      const masked = !fullyVisible;
      const previous = targetDiagnostics.get(target.element);
      if (masked) {
        applyManagedMask(target, frame, lastTransform);
      } else if (previous?.masked !== false) {
        restoreManagedMaskStyles(target);
      }
      if (previous?.progress !== progressValue) {
        target.element.setAttribute('data-r4-depth-mask-progress', progressValue);
      }
      targetDiagnostics.set(target.element, { progress: progressValue, masked });
    }
  };

  return {
    ready,
    commit() {
      if (disposed || isCommitted) {
        return;
      }
      if (resourceError) {
        throw resourceError;
      }
      if (!resourceReady) {
        throw new Error(`Depth mask atlas ${atlasSrc} is not ready to commit`);
      }
      attachedTargets = targets.map((target) => attachMask(
        target,
        `url(${JSON.stringify(atlasSrc)})`,
        options.runId
      ));
      isCommitted = true;
      applyTargetState(lastProgress);
    },
    committed() {
      return isCommitted;
    },
    render(progress, transform) {
      const clamped = clamp(progress);
      const tables = updateTables(clamped);
      lastProgress = clamped;
      if (disposed) {
        return tables;
      }
      if (transform) lastTransform = transform;
      if (isCommitted) {
        applyTargetState(clamped);
      }
      return tables;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const target of attachedTargets) {
        restoreTarget(target);
      }
      attachedTargets = [];
      if (probe) {
        probe.onload = null;
        probe.onerror = null;
        probe.src = '';
        probe = undefined;
      }
      if (!readinessSettled) {
        settleReady();
      }
      isCommitted = false;
    }
  };
}

import type { InkDepthTransform } from './inkField';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const ATLAS_COLUMNS = 8;
const ATLAS_FRAMES = 32;
const ATLAS_TILE_WIDTH = 384;
const ATLAS_TILE_HEIGHT = 216;
const ATLAS_WIDTH = ATLAS_COLUMNS * ATLAS_TILE_WIDTH;
const ATLAS_ROWS = Math.ceil(ATLAS_FRAMES * 2 / ATLAS_COLUMNS);
const ATLAS_HEIGHT = ATLAS_ROWS * ATLAS_TILE_HEIGHT;

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
  readonly maskIds: Readonly<Record<DepthThresholdPolarity, string>>;
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

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-') || 'depth-mask';
}

type AttachedTarget = Readonly<{
  element: HTMLElement;
  polarity: DepthThresholdPolarity;
  maskUrl: string;
  previousStyles: ReadonlyMap<string, string>;
}>;

function applyManagedMask(target: AttachedTarget): void {
  target.element.style.setProperty('mask-image', target.maskUrl);
  target.element.style.setProperty('-webkit-mask-image', target.maskUrl);
  target.element.style.setProperty('mask-size', '100% 100%');
  target.element.style.setProperty('-webkit-mask-size', '100% 100%');
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

function atlasFrameTransform(frame: number): string {
  const index = frame * 2;
  const column = index % ATLAS_COLUMNS;
  const row = Math.floor(index / ATLAS_COLUMNS);
  return `translate(${-column * ATLAS_TILE_WIDTH} ${-row * ATLAS_TILE_HEIGHT})`;
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
  const documentRef = targets[0]?.element.ownerDocument
    ?? host?.ownerDocument
    ?? (typeof document === 'undefined' ? null : document);
  const requestedPolarities = [...new Set([
    ...(options.polarities ?? []),
    ...targets.map((target) => target.polarity)
  ])];
  if (!host || requestedPolarities.length === 0 || !documentRef) {
    return null;
  }
  const steps = Math.max(2, Math.floor(options.steps ?? 256));
  const runScope = safeId(options.runId);
  const maskIds: Record<DepthThresholdPolarity, string> = {
    reveal: `${runScope}-depth-threshold-reveal-mask`,
    conceal: `${runScope}-depth-threshold-conceal-mask`
  };
  const svg = documentRef.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('data-r4-depth-mask-run', options.runId);
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';

  const defs = documentRef.createElementNS(SVG_NAMESPACE, 'defs');
  const atlasFrameId = `${runScope}-depth-threshold-atlas-frame`;
  const atlasFrame = documentRef.createElementNS(SVG_NAMESPACE, 'g');
  atlasFrame.setAttribute('id', atlasFrameId);
  atlasFrame.setAttribute('data-r4-depth-atlas-frame', 'true');
  atlasFrame.setAttribute('transform', atlasFrameTransform(0));
  const image = documentRef.createElementNS(SVG_NAMESPACE, 'image');
  image.setAttribute('x', '0'); image.setAttribute('y', '0');
  image.setAttribute('width', String(ATLAS_WIDTH));
  image.setAttribute('height', String(ATLAS_HEIGHT));
  image.setAttribute('preserveAspectRatio', 'none'); image.setAttribute('href', atlasSrc);
  atlasFrame.append(image); defs.append(atlasFrame);
  const masks: SVGMaskElement[] = [];
  const cameras: SVGGElement[] = [];
  const viewports: SVGSVGElement[] = [];
  for (const polarity of ['reveal', 'conceal'] as const) {
    const mask = documentRef.createElementNS(SVG_NAMESPACE, 'mask');
    mask.setAttribute('id', maskIds[polarity]);
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    mask.setAttribute('maskContentUnits', 'userSpaceOnUse');
    mask.setAttribute('mask-type', 'alpha');
    const camera = documentRef.createElementNS(SVG_NAMESPACE, 'g');
    camera.setAttribute('data-r4-depth-camera', 'true');
    const viewport = documentRef.createElementNS(SVG_NAMESPACE, 'svg');
    viewport.setAttribute('preserveAspectRatio', 'none');
    viewport.setAttribute('overflow', 'hidden');
    viewport.setAttribute('viewBox', `0 0 ${ATLAS_TILE_WIDTH} ${ATLAS_TILE_HEIGHT}`);
    const use = documentRef.createElementNS(SVG_NAMESPACE, 'use');
    use.setAttribute('href', `#${atlasFrameId}`);
    if (polarity === 'conceal') {
      const offset = documentRef.createElementNS(SVG_NAMESPACE, 'g');
      offset.setAttribute('transform', `translate(${-ATLAS_TILE_WIDTH} 0)`);
      offset.append(use); viewport.append(offset);
    } else viewport.append(use);
    camera.append(viewport); mask.append(camera); defs.append(mask);
    masks.push(mask); cameras.push(camera); viewports.push(viewport);
  }

  let transformSignature = '';
  const applyTransform = (transform: InkDepthTransform) => {
    const { viewport, cover, camera } = transform;
    const nextSignature = [
      viewport.width, viewport.height,
      cover.x, cover.y, cover.width, cover.height,
      camera.scale, camera.translateX, camera.translateY,
      camera.originX, camera.originY
    ].map(attributeNumber).join(':');
    if (nextSignature === transformSignature) {
      return;
    }
    transformSignature = nextSignature;
    const originX = cover.x + cover.width * camera.originX;
    const originY = cover.y + cover.height * camera.originY;
    const cameraTransform = [
      `translate(${attributeNumber(camera.translateX)} ${attributeNumber(camera.translateY)})`,
      `translate(${attributeNumber(originX)} ${attributeNumber(originY)})`,
      `scale(${attributeNumber(camera.scale)})`,
      `translate(${attributeNumber(-originX)} ${attributeNumber(-originY)})`
    ].join(' ');
    for (const mask of masks) {
      mask.setAttribute('x', '0');
      mask.setAttribute('y', '0');
      mask.setAttribute('width', attributeNumber(viewport.width));
      mask.setAttribute('height', attributeNumber(viewport.height));
    }
    for (const viewportElement of viewports) {
      viewportElement.setAttribute('x', attributeNumber(cover.x));
      viewportElement.setAttribute('y', attributeNumber(cover.y));
      viewportElement.setAttribute('width', attributeNumber(cover.width));
      viewportElement.setAttribute('height', attributeNumber(cover.height));
    }
    for (const cameraElement of cameras) {
      cameraElement.setAttribute('transform', cameraTransform);
    }
  };

  applyTransform(options.transform ?? defaultDepthTransform(host));
  svg.append(defs);

  let attachedTargets: AttachedTarget[] = [];
  let disposed = false;
  let isCommitted = false;
  let resourceReady = false;
  let resourceError: Error | undefined;
  let lastProgress = 0;
  let lastFrame = 0;
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

  const updateAtlasFrame = (progress: number) => {
    const frame = Math.round(progress * (ATLAS_FRAMES - 1));
    if (frame === lastFrame) {
      return;
    }
    lastFrame = frame;
    atlasFrame.setAttribute('transform', atlasFrameTransform(frame));
  };

  const targetDiagnostics = new WeakMap<HTMLElement, {
    progress: string;
    masked: boolean;
  }>();
  const applyTargetState = (progress: number) => {
    const progressValue = progress.toFixed(4);
    for (const target of attachedTargets) {
      const fullyVisible = (target.polarity === 'conceal' && progress === 0)
        || (target.polarity === 'reveal' && progress === 1);
      const masked = !fullyVisible;
      const previous = targetDiagnostics.get(target.element);
      if (previous?.masked !== masked) {
        if (masked) applyManagedMask(target);
        else restoreManagedMaskStyles(target);
      }
      if (previous?.progress !== progressValue) {
        target.element.setAttribute('data-r4-depth-mask-progress', progressValue);
      }
      targetDiagnostics.set(target.element, { progress: progressValue, masked });
    }
  };

  return {
    maskIds,
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
      host.append(svg);
      attachedTargets = targets.map((target) => attachMask(
        target,
        `url("#${maskIds[target.polarity]}")`,
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
      if (transform) {
        applyTransform(transform);
      }
      updateAtlasFrame(clamped);
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
      svg.remove();
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

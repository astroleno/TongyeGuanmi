import type { InkDepthTransform } from './inkField';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

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
  readonly filterIds: Readonly<Record<DepthThresholdPolarity, string>>;
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
  applyManagedMask(attached);
  target.element.setAttribute('data-r4-depth-mask-run', runId);
  target.element.setAttribute('data-r4-depth-mask-polarity', target.polarity);

  return attached;
}

function restoreTarget(target: AttachedTarget): void {
  restoreManagedMaskStyles(target);
  target.element.removeAttribute('data-r4-depth-mask-run');
  target.element.removeAttribute('data-r4-depth-mask-polarity');
  target.element.removeAttribute('data-r4-depth-mask-progress');
  target.element.removeAttribute('data-r4-depth-mask-values');
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

function thresholdIntercept(progress: number): number {
  return 0.5001 - clamp(progress) * 1.0002;
}

export function createDepthThresholdMask(options: {
  host: HTMLElement | null;
  targets: readonly DepthThresholdTarget[];
  depthSrc: string;
  runId: string;
  steps?: number;
  transform?: InkDepthTransform;
}): DepthThresholdMask | null {
  const { host, targets, depthSrc } = options;
  const documentRef = targets[0]?.element.ownerDocument
    ?? host?.ownerDocument
    ?? (typeof document === 'undefined' ? null : document);
  if (!host || targets.length === 0 || !documentRef) {
    return null;
  }

  const steps = Math.max(2, Math.floor(options.steps ?? 256));
  const runScope = safeId(options.runId);
  const filterIds: Record<DepthThresholdPolarity, string> = {
    reveal: `${runScope}-depth-threshold-reveal-filter`,
    conceal: `${runScope}-depth-threshold-conceal-filter`
  };
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
  const thresholdFunctions: Record<DepthThresholdPolarity, SVGComponentTransferFunctionElement[]> = {
    reveal: [],
    conceal: []
  };
  const filters: SVGFilterElement[] = [];
  const masks: SVGMaskElement[] = [];
  const images: SVGImageElement[] = [];

  for (const polarity of ['reveal', 'conceal'] as const) {
    const filter = documentRef.createElementNS(SVG_NAMESPACE, 'filter');
    filter.setAttribute('id', filterIds[polarity]);
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute('primitiveUnits', 'userSpaceOnUse');
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    const luminance = documentRef.createElementNS(SVG_NAMESPACE, 'feColorMatrix');
    luminance.setAttribute('type', 'matrix');
    luminance.setAttribute('values', [
      '0.2126 0.7152 0.0722 0 0',
      '0.2126 0.7152 0.0722 0 0',
      '0.2126 0.7152 0.0722 0 0',
      '0 0 0 0 1'
    ].join(' '));
    luminance.setAttribute('result', `${polarity}-depth-luminance`);

    const thresholdOffset = documentRef.createElementNS(SVG_NAMESPACE, 'feComponentTransfer');
    thresholdOffset.setAttribute('in', `${polarity}-depth-luminance`);
    thresholdOffset.setAttribute('result', `${polarity}-threshold-offset`);
    for (const channel of ['R', 'G', 'B'] as const) {
      const fn = documentRef.createElementNS(SVG_NAMESPACE, `feFunc${channel}`);
      fn.setAttribute('type', 'linear');
      fn.setAttribute('slope', '1');
      fn.setAttribute('intercept', attributeNumber(thresholdIntercept(0)));
      thresholdOffset.append(fn);
      thresholdFunctions[polarity].push(fn);
    }

    const binaryTransfer = documentRef.createElementNS(SVG_NAMESPACE, 'feComponentTransfer');
    binaryTransfer.setAttribute('in', `${polarity}-threshold-offset`);
    binaryTransfer.setAttribute('result', `${polarity}-binary-depth`);
    for (const channel of ['R', 'G', 'B'] as const) {
      const fn = documentRef.createElementNS(SVG_NAMESPACE, `feFunc${channel}`);
      fn.setAttribute('type', 'discrete');
      fn.setAttribute('tableValues', polarity === 'reveal' ? '1 0' : '0 1');
      binaryTransfer.append(fn);
    }
    const alphaFunction = documentRef.createElementNS(SVG_NAMESPACE, 'feFuncA');
    alphaFunction.setAttribute('type', 'discrete');
    alphaFunction.setAttribute('tableValues', '1 1');
    binaryTransfer.append(alphaFunction);

    const binaryAlpha = documentRef.createElementNS(SVG_NAMESPACE, 'feColorMatrix');
    binaryAlpha.setAttribute('in', `${polarity}-binary-depth`);
    binaryAlpha.setAttribute('type', 'matrix');
    binaryAlpha.setAttribute('values', [
      '0 0 0 0 1',
      '0 0 0 0 1',
      '0 0 0 0 1',
      '1 0 0 0 0'
    ].join(' '));
    binaryAlpha.setAttribute('result', `${polarity}-binary-alpha`);
    filter.append(luminance, thresholdOffset, binaryTransfer, binaryAlpha);

    const mask = documentRef.createElementNS(SVG_NAMESPACE, 'mask');
    mask.setAttribute('id', maskIds[polarity]);
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    mask.setAttribute('maskContentUnits', 'userSpaceOnUse');
    mask.setAttribute('mask-type', 'alpha');
    const image = documentRef.createElementNS(SVG_NAMESPACE, 'image');
    image.setAttribute('preserveAspectRatio', 'none');
    image.setAttribute('href', depthSrc);
    image.setAttribute('filter', `url("#${filterIds[polarity]}")`);
    mask.append(image);
    defs.append(filter, mask);
    filters.push(filter);
    masks.push(mask);
    images.push(image);
  }

  const applyTransform = (transform: InkDepthTransform) => {
    const { viewport, cover, camera } = transform;
    const originX = cover.x + cover.width * camera.originX;
    const originY = cover.y + cover.height * camera.originY;
    const cameraTransform = [
      `translate(${attributeNumber(camera.translateX)} ${attributeNumber(camera.translateY)})`,
      `translate(${attributeNumber(originX)} ${attributeNumber(originY)})`,
      `scale(${attributeNumber(camera.scale)})`,
      `translate(${attributeNumber(-originX)} ${attributeNumber(-originY)})`
    ].join(' ');
    for (const filter of filters) {
      filter.setAttribute('x', '0');
      filter.setAttribute('y', '0');
      filter.setAttribute('width', attributeNumber(viewport.width));
      filter.setAttribute('height', attributeNumber(viewport.height));
    }
    for (const mask of masks) {
      mask.setAttribute('x', '0');
      mask.setAttribute('y', '0');
      mask.setAttribute('width', attributeNumber(viewport.width));
      mask.setAttribute('height', attributeNumber(viewport.height));
    }
    for (const image of images) {
      image.setAttribute('x', attributeNumber(cover.x));
      image.setAttribute('y', attributeNumber(cover.y));
      image.setAttribute('width', attributeNumber(cover.width));
      image.setAttribute('height', attributeNumber(cover.height));
      image.setAttribute('transform', cameraTransform);
    }
  };

  applyTransform(options.transform ?? defaultDepthTransform(host));
  svg.append(defs);
  host.append(svg);

  const attachedTargets = targets.map((target) => attachMask(
    target,
    `url("#${maskIds[target.polarity]}")`,
    options.runId
  ));

  let disposed = false;
  return {
    maskIds,
    filterIds,
    render(progress, transform) {
      const clamped = clamp(progress);
      const tables = thresholdTables(clamped, steps);
      if (disposed) {
        return tables;
      }
      if (transform) {
        applyTransform(transform);
      }
      const intercept = attributeNumber(thresholdIntercept(clamped));
      for (const polarity of ['reveal', 'conceal'] as const) {
        for (const fn of thresholdFunctions[polarity]) {
          fn.setAttribute('intercept', intercept);
        }
      }
      for (const target of attachedTargets) {
        const table = tables[target.polarity];
        const fullyVisible = (target.polarity === 'conceal' && clamped === 0)
          || (target.polarity === 'reveal' && clamped === 1);
        if (fullyVisible) restoreManagedMaskStyles(target);
        else applyManagedMask(target);
        target.element.setAttribute('data-r4-depth-mask-progress', clamped.toFixed(4));
        target.element.setAttribute('data-r4-depth-mask-values', [...new Set(table)].join(','));
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
      svg.remove();
    }
  };
}

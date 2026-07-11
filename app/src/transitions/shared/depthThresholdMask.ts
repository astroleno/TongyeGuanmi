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
  render(progress: number): DepthThresholdTables;
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
  previousStyles: ReadonlyMap<string, string>;
}>;

function attachMask(target: DepthThresholdTarget, maskUrl: string, runId: string): AttachedTarget {
  const previousStyles = new Map<string, string>();
  for (const property of MASK_STYLE_PROPERTIES) {
    previousStyles.set(property, target.element.style.getPropertyValue(property));
  }

  target.element.style.setProperty('mask-image', maskUrl);
  target.element.style.setProperty('-webkit-mask-image', maskUrl);
  target.element.style.setProperty('mask-size', '100% 100%');
  target.element.style.setProperty('-webkit-mask-size', '100% 100%');
  target.element.style.setProperty('mask-repeat', 'no-repeat');
  target.element.style.setProperty('-webkit-mask-repeat', 'no-repeat');
  target.element.style.setProperty('mask-mode', 'alpha');
  target.element.style.setProperty('-webkit-mask-mode', 'alpha');
  target.element.setAttribute('data-r4-depth-mask-run', runId);
  target.element.setAttribute('data-r4-depth-mask-polarity', target.polarity);

  return { ...target, previousStyles };
}

function restoreTarget(target: AttachedTarget): void {
  for (const property of MASK_STYLE_PROPERTIES) {
    const previous = target.previousStyles.get(property) ?? '';
    if (previous) {
      target.element.style.setProperty(property, previous);
    } else {
      target.element.style.removeProperty(property);
    }
  }
  target.element.removeAttribute('data-r4-depth-mask-run');
  target.element.removeAttribute('data-r4-depth-mask-polarity');
  target.element.removeAttribute('data-r4-depth-mask-progress');
  target.element.removeAttribute('data-r4-depth-mask-values');
}

export function createDepthThresholdMask(options: {
  host: HTMLElement | null;
  targets: readonly DepthThresholdTarget[];
  depthSrc: string;
  runId: string;
  steps?: number;
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
  const channelFunctions: Record<DepthThresholdPolarity, SVGComponentTransferFunctionElement[]> = {
    reveal: [],
    conceal: []
  };

  for (const polarity of ['reveal', 'conceal'] as const) {
    const filter = documentRef.createElementNS(SVG_NAMESPACE, 'filter');
    filter.setAttribute('id', filterIds[polarity]);
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    filter.setAttribute('width', '100%');
    filter.setAttribute('height', '100%');
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

    const transfer = documentRef.createElementNS(SVG_NAMESPACE, 'feComponentTransfer');
    transfer.setAttribute('in', `${polarity}-depth-luminance`);
    transfer.setAttribute('result', `${polarity}-binary-depth`);
    for (const channel of ['R', 'G', 'B'] as const) {
      const fn = documentRef.createElementNS(SVG_NAMESPACE, `feFunc${channel}`);
      fn.setAttribute('type', 'discrete');
      transfer.append(fn);
      channelFunctions[polarity].push(fn);
    }
    const alphaFunction = documentRef.createElementNS(SVG_NAMESPACE, 'feFuncA');
    alphaFunction.setAttribute('type', 'discrete');
    alphaFunction.setAttribute('tableValues', '1 1');
    transfer.append(alphaFunction);

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
    filter.append(luminance, transfer, binaryAlpha);

    const mask = documentRef.createElementNS(SVG_NAMESPACE, 'mask');
    mask.setAttribute('id', maskIds[polarity]);
    mask.setAttribute('maskUnits', 'objectBoundingBox');
    mask.setAttribute('maskContentUnits', 'objectBoundingBox');
    mask.setAttribute('mask-type', 'alpha');
    const image = documentRef.createElementNS(SVG_NAMESPACE, 'image');
    image.setAttribute('x', '0');
    image.setAttribute('y', '0');
    image.setAttribute('width', '1');
    image.setAttribute('height', '1');
    image.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    image.setAttribute('href', depthSrc);
    image.setAttribute('filter', `url("#${filterIds[polarity]}")`);
    mask.append(image);
    defs.append(filter, mask);
  }

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
    render(progress) {
      const clamped = clamp(progress);
      const tables = thresholdTables(clamped, steps);
      if (disposed) {
        return tables;
      }

      for (const polarity of ['reveal', 'conceal'] as const) {
        const value = tables[polarity].join(' ');
        for (const fn of channelFunctions[polarity]) {
          fn.setAttribute('tableValues', value);
        }
      }
      for (const target of attachedTargets) {
        const table = tables[target.polarity];
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

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export type DepthThresholdMask = {
  readonly maskId: string;
  readonly filterId: string;
  render(progress: number): readonly number[];
  dispose(): void;
};

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function thresholdTable(progress: number, steps = 256): number[] {
  const size = Math.max(2, Math.floor(steps));
  const revealCount = Math.round(clamp(progress) * size);
  return Array.from({ length: size }, (_, index) => index < revealCount ? 1 : 0);
}

function tableValues(progress: number, steps: number): { table: number[]; value: string } {
  const table = thresholdTable(progress, steps);
  return { table, value: table.join(' ') };
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function clearOwnedMask(target: HTMLElement, maskUrl: string): void {
  for (const property of [
    'mask-image',
    '-webkit-mask-image',
    'mask-size',
    '-webkit-mask-size',
    'mask-repeat',
    '-webkit-mask-repeat',
    'mask-mode'
  ]) {
    const value = target.style.getPropertyValue(property);
    if (!value || value === maskUrl || property !== 'mask-image' && property !== '-webkit-mask-image') {
      target.style.removeProperty(property);
    }
  }
  target.removeAttribute('data-r4-depth-mask-run');
  target.removeAttribute('data-r4-depth-mask-progress');
  target.removeAttribute('data-r4-depth-mask-values');
}

export function createDepthThresholdMask(options: {
  host: HTMLElement | null;
  target: HTMLElement | null;
  depthSrc: string;
  runId: string;
  steps?: number;
}): DepthThresholdMask | null {
  const { host, target, depthSrc } = options;
  const documentRef = target?.ownerDocument
    ?? host?.ownerDocument
    ?? (typeof document === 'undefined' ? null : document);
  if (!host || !target || !documentRef) {
    return null;
  }

  const steps = Math.max(2, Math.floor(options.steps ?? 256));
  const runScope = safeId(options.runId);
  const filterId = `${runScope}-depth-threshold-filter`;
  const maskId = `${runScope}-depth-threshold-mask`;
  const maskUrl = `url("#${maskId}")`;
  const svg = documentRef.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('data-r4-depth-mask-run', options.runId);
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';

  const defs = documentRef.createElementNS(SVG_NAMESPACE, 'defs');
  const filter = documentRef.createElementNS(SVG_NAMESPACE, 'filter');
  filter.setAttribute('id', filterId);
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
  luminance.setAttribute('result', 'depth-luminance');
  const transfer = documentRef.createElementNS(SVG_NAMESPACE, 'feComponentTransfer');
  transfer.setAttribute('in', 'depth-luminance');
  transfer.setAttribute('result', 'binary-depth');
  const channels = ['R', 'G', 'B'] as const;
  const channelFunctions = channels.map((channel) => {
    const fn = documentRef.createElementNS(SVG_NAMESPACE, `feFunc${channel}`);
    fn.setAttribute('type', 'discrete');
    transfer.append(fn);
    return fn;
  });
  const alphaFunction = documentRef.createElementNS(SVG_NAMESPACE, 'feFuncA');
  alphaFunction.setAttribute('type', 'discrete');
  alphaFunction.setAttribute('tableValues', '1 1');
  transfer.append(alphaFunction);
  const binaryAlpha = documentRef.createElementNS(SVG_NAMESPACE, 'feColorMatrix');
  binaryAlpha.setAttribute('in', 'binary-depth');
  binaryAlpha.setAttribute('type', 'matrix');
  binaryAlpha.setAttribute('values', [
    '0 0 0 0 1',
    '0 0 0 0 1',
    '0 0 0 0 1',
    '1 0 0 0 0'
  ].join(' '));
  binaryAlpha.setAttribute('result', 'binary-alpha');
  filter.append(luminance, transfer, binaryAlpha);

  const mask = documentRef.createElementNS(SVG_NAMESPACE, 'mask');
  mask.setAttribute('id', maskId);
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
  image.setAttribute('filter', `url("#${filterId}")`);
  mask.append(image);
  defs.append(filter, mask);
  svg.append(defs);
  host.append(svg);

  target.style.setProperty('mask-image', maskUrl);
  target.style.setProperty('-webkit-mask-image', maskUrl);
  target.style.setProperty('mask-size', '100% 100%');
  target.style.setProperty('-webkit-mask-size', '100% 100%');
  target.style.setProperty('mask-repeat', 'no-repeat');
  target.style.setProperty('-webkit-mask-repeat', 'no-repeat');
  target.style.setProperty('mask-mode', 'alpha');
  target.setAttribute('data-r4-depth-mask-run', options.runId);

  let disposed = false;
  return {
    maskId,
    filterId,
    render(progress) {
      if (disposed) {
        return thresholdTable(progress, steps);
      }
      const clamped = clamp(progress);
      const { table, value } = tableValues(clamped, steps);
      for (const fn of channelFunctions) {
        fn.setAttribute('tableValues', value);
      }
      target.setAttribute('data-r4-depth-mask-progress', clamped.toFixed(4));
      target.setAttribute('data-r4-depth-mask-values', [...new Set(table)].join(','));
      return table;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      clearOwnedMask(target, maskUrl);
      svg.remove();
    }
  };
}

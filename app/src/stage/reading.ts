export type ReadingEdge = 'top' | 'bottom';

export type ReadingScrollMetrics = Readonly<{
  scrollTop: number;
  maxScrollTop: number;
}>;

export function isReadingLayer(root: HTMLElement | null | undefined): boolean {
  return Boolean(
    root
    && (
      root.dataset?.reading === 'true'
      || root.matches?.('[data-reading="true"]')
    )
  );
}

export function readingScrollport(root: HTMLElement | null | undefined): HTMLElement | null {
  if (!root) {
    return null;
  }
  if (root.matches?.('[data-reading-scrollport="true"]')) {
    return root;
  }
  const explicit = root.querySelector?.<HTMLElement>('[data-reading-scrollport="true"]') ?? null;
  if (explicit) {
    return explicit;
  }
  return root.matches?.('[data-reading="true"]') ? root : null;
}

export function readingScrollMetrics(
  root: HTMLElement | null | undefined
): ReadingScrollMetrics | null {
  const scrollport = readingScrollport(root);
  if (!scrollport) {
    return null;
  }
  const maxScrollTop = Math.max(0, scrollport.scrollHeight - scrollport.clientHeight);
  return {
    scrollTop: Math.min(maxScrollTop, Math.max(0, scrollport.scrollTop)),
    maxScrollTop
  };
}

export function readingCanScroll(
  root: HTMLElement | null | undefined,
  direction: 1 | -1,
  tolerancePx = 0.001
): boolean {
  const metrics = readingScrollMetrics(root);
  if (!metrics || metrics.maxScrollTop <= tolerancePx) {
    return false;
  }
  return direction === 1
    ? metrics.scrollTop < metrics.maxScrollTop - tolerancePx
    : metrics.scrollTop > tolerancePx;
}

export function positionReadingAtEdge(
  root: HTMLElement | null | undefined,
  edge: ReadingEdge
): number {
  const scrollport = readingScrollport(root);
  if (!scrollport) {
    return 0;
  }
  const target = edge === 'bottom'
    ? Math.max(0, scrollport.scrollHeight - scrollport.clientHeight)
    : 0;
  scrollport.scrollTop = target;
  scrollport.dataset.readingEdge = edge;
  return target;
}

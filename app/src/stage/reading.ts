export type ReadingEdge = 'top' | 'bottom';

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

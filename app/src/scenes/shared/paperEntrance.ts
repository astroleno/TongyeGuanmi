export type PaperEntranceRenderState = Readonly<{
  progress: number;
  opacity: number;
  y: number;
}>;

export type PaperEntranceState = PaperEntranceRenderState & Readonly<{
  paperAlpha: number;
}>;

export function createPaperEntranceLifecycle(scene: string, offsetY: number) {
  const runByRoot = new WeakMap<HTMLElement, string>();
  const prefix = `--r4-${scene}`;

  function resolveRoot(root: HTMLElement | null | undefined): HTMLElement | null {
    return root?.matches(`[data-r4-scene="${scene}"]`)
      ? root
      : root?.querySelector<HTMLElement>(`[data-r4-scene="${scene}"]`) ?? root ?? null;
  }

  function renderProgress(
    root: HTMLElement | null | undefined,
    progress: number
  ): PaperEntranceRenderState {
    const target = resolveRoot(root);
    const clamped = Math.min(1, Math.max(0, progress));
    const y = (1 - clamped) * offsetY;
    target?.style.setProperty(`${prefix}-progress`, clamped.toFixed(4));
    target?.style.setProperty(`${prefix}-opacity`, clamped.toFixed(4));
    target?.style.setProperty(`${prefix}-y`, `${y.toFixed(2)}px`);
    target?.setAttribute(`data-${scene}-progress`, clamped.toFixed(4));
    return { progress: clamped, opacity: clamped, y };
  }

  function renderEntrance(
    root: HTMLElement | null | undefined,
    copyProgress: number,
    paperAlpha: number,
    runId: string
  ): PaperEntranceState {
    const target = resolveRoot(root);
    const copy = renderProgress(target, copyProgress);
    const paper = Math.min(1, Math.max(0, paperAlpha));
    if (target) {
      runByRoot.set(target, runId);
      target.style.setProperty(`${prefix}-paper-alpha`, paper.toFixed(4));
      target.style.setProperty(`${prefix}-wash-alpha`, paper.toFixed(4));
    }
    return { ...copy, paperAlpha: paper };
  }

  function renderHold(root: HTMLElement | null | undefined): void {
    const target = resolveRoot(root);
    renderProgress(target, 1);
    if (target) {
      runByRoot.delete(target);
      target.style.setProperty(`${prefix}-paper-alpha`, '1.0000');
      target.style.setProperty(`${prefix}-wash-alpha`, '1.0000');
    }
  }

  function release(
    root: HTMLElement | null | undefined,
    runId: string,
    endpoint: number
  ): void {
    const target = resolveRoot(root);
    if (!target || runByRoot.get(target) !== runId) {
      return;
    }
    runByRoot.delete(target);
    if (endpoint >= 0.999) {
      renderHold(target);
    }
  }

  return { renderProgress, renderEntrance, renderHold, release };
}

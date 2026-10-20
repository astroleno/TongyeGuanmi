import type { ScrollPosition } from '../story/scroll-spine';

export type ScrollIntent = Readonly<{
  generation: number; epoch: number; revision: number; layoutRevision: number;
}>;
export type ScrollPresentedFrame = Readonly<{
  progress: number; revision: number; epoch: number;
}>;
export type PreparedScrollWindow = Readonly<{
  render(position: ScrollPosition, intent: ScrollIntent): ScrollPresentedFrame | null;
  pause(): void;
  dispose(): void;
}>;
export type ScrollStoryAdapter = Readonly<{
  prepare(position: ScrollPosition, intent: ScrollIntent, signal: AbortSignal): Promise<PreparedScrollWindow>;
}>;
export type ScrollStoryView = Readonly<{
  status: 'preparing' | 'ready' | 'failed' | 'suspended';
  scene: ScrollPosition['scene']; rangeId: string; error: string | null;
}>;

/** Latest-position coordination, with no autoplay clock and no input queue. */
export function createScrollStoryRuntime(adapter: ScrollStoryAdapter, initial: ScrollPosition,
  paintPosition: (position: ScrollPosition) => void = () => {}) {
  let desired = initial;
  let presented: ScrollPresentedFrame | null = null;
  let intent: ScrollIntent = { generation: 0, epoch: 0, revision: 0, layoutRevision: 0 };
  let direction = 0;
  let preparedWindow: PreparedScrollWindow | null = null;
  let pending: AbortController | null = null;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let convergenceDeadline: ReturnType<typeof setTimeout> | undefined;
  const cancelDeadline = () => { clearTimeout(deadline); deadline = undefined; clearTimeout(convergenceDeadline); convergenceDeadline = undefined; };
  let disposed = false;
  let suspended = false;
  let view: ScrollStoryView = Object.freeze({ status: 'preparing', scene: initial.scene,
    rangeId: initial.rangeId, error: null });
  const listeners = new Set<() => void>();
  const publish = (status: ScrollStoryView['status'], error: string | null = null) => {
    const scene = desired.kind === 'segment' && desired.progress >= .5 ? desired.target : desired.scene;
    if (view.status === status && view.scene === scene && view.rangeId === desired.rangeId && view.error === error) return;
    view = Object.freeze({ status, scene, rangeId: desired.rangeId, error });
    for (const listener of listeners) listener();
  };
  const fail = (error: unknown) => {
    cancelDeadline();
    preparedWindow?.pause();
    if (!disposed && !suspended) publish('failed', error instanceof Error ? error.message : String(error));
  };
  const render = () => {
    if (disposed || suspended) return;
    paintPosition(desired);
    if (!preparedWindow || view.status === 'failed') return;
    try {
      const frame = preparedWindow.render(desired, intent);
      if (frame && frame.epoch === intent.epoch && frame.revision <= intent.revision
        && (!presented || frame.revision >= presented.revision)) {
        const advanced = !presented || presented.progress !== frame.progress;
        presented = frame;
        clearTimeout(deadline); deadline = undefined;
        if (advanced || Math.abs(frame.progress - desired.progress) < .00001) {
          clearTimeout(convergenceDeadline); convergenceDeadline = undefined;
        }
        publish('ready');
      } else if (!presented) publish('preparing');
      if ((!presented || Math.abs(presented.progress - desired.progress) >= .00001) && !convergenceDeadline) {
        convergenceDeadline = setTimeout(() => fail(new Error('当前位置的媒体帧未能收敛，请重试或直接阅读')), 20000);
      }
    } catch (error) { fail(error); }
  };
  const prepare = () => {
    cancelDeadline();
    pending?.abort();
    preparedWindow?.dispose();
    preparedWindow = null;
    presented = null;
    if (disposed || suspended) return;
    // Retired timelines may restore their old layer visibility/masks. Transfer
    // geometry ownership only AFTER that cleanup, before preparing/rendering
    // the new window (including while its asynchronous resources are pending).
    paintPosition(desired);
    const controller = new AbortController();
    pending = controller;
    intent = { ...intent, generation: intent.generation + 1 };
    const generation = intent.generation;
    publish('preparing');
    deadline = setTimeout(() => {
      if (disposed || suspended || intent.generation !== generation) return;
      controller.abort('scroll-preparation-timeout');
      pending = null;
      fail(new Error('当前位置的画面准备超时，请重试或直接阅读'));
    }, 20000);
    // Catch synchronous adapters as well as rejected module/decode promises.
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      return adapter.prepare(desired, intent, controller.signal);
    }).then((prepared) => {
      if (!prepared) return;
      if (disposed || suspended || controller.signal.aborted || intent.generation !== generation) {
        prepared.dispose();
        return;
      }
      pending = null;
      preparedWindow = prepared;
      render();
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && !disposed && intent.generation === generation) {
        pending = null;
        fail(error);
      }
    });
  };
  return Object.freeze({
    connect: prepare,
    sample(position: ScrollPosition, layoutRevision = intent.layoutRevision, navigation = false) {
      if (disposed) return;
      const step = Math.sign(position.scroll - desired.scroll);
      const changedRange = position.rangeId !== desired.rangeId;
      const reflow = layoutRevision !== intent.layoutRevision;
      const reversed = step !== 0 && direction !== 0 && step !== direction;
      if (step) direction = step;
      const changedIntent = changedRange || reflow || navigation || reversed;
      intent = { ...intent, revision: intent.revision + 1, layoutRevision,
        epoch: intent.epoch + Number(changedIntent) };
      desired = position;
      if (changedIntent) presented = null;
      if (changedRange || reflow) prepare();
      else render();
    },
    refresh: render,
    retry: prepare,
    reject(error: unknown) { pending?.abort(); pending = null; fail(error); },
    suspend() {
      cancelDeadline();
      suspended = true;
      pending?.abort();
      pending = null;
      preparedWindow?.pause();
      publish('suspended');
    },
    resume() {
      if (disposed) return;
      suspended = false;
      intent = { ...intent, epoch: intent.epoch + 1, revision: intent.revision + 1 };
      prepare();
    },
    getSnapshot: () => view,
    diagnostic: () => ({ desired, presented, intent, pending: Boolean(pending), view }),
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelDeadline();
      pending?.abort();
      pending = null;
      preparedWindow?.dispose();
      preparedWindow = null;
      listeners.clear();
    }
  });
}

export type ScrollStoryRuntime = ReturnType<typeof createScrollStoryRuntime>;

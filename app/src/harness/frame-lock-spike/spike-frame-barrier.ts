import {
  frameIndexForProgress,
  mediaTimeForFrame,
  progressForFrameIndex,
  type SpikeVideoFrameMap
} from './spike-frame-map';

export type SpikeFrameBarrierChildRequest = Readonly<{
  runId: string;
  direction: 1 | -1;
  sequence: number;
  desiredProgress: number;
  frameMap: SpikeVideoFrameMap;
  signal: AbortSignal;
}>;

export type SpikeFrameBarrierChildReceipt = Readonly<{
  status: 'presented' | 'stale';
  sequence: number;
  desiredFrameIndex: number;
  presentedFrameIndex: number;
  mediaTimeSeconds: number;
  evidence: 'video-frame-callback' | 'packed-canvas-draw' | 'none';
}>;

export type SpikeFrameBarrierClock = Readonly<{
  request(request: SpikeFrameBarrierChildRequest): Promise<SpikeFrameBarrierChildReceipt>;
}>;

export type SpikeFrameBarrierRequest = Readonly<{
  runId: string;
  direction: 1 | -1;
  sequence: number;
  desiredProgress: number;
  signal?: AbortSignal;
}>;

export type SpikeFrameBarrierReceipt = Readonly<{
  status: 'presented' | 'stale';
  runId: string;
  direction: 1 | -1;
  sequence: number;
  desiredFrameIndex: number;
  presentedFrameIndex: number;
  mediaTimeSeconds: number;
  presentedProgress: number;
  evidence: 'packed-frame-barrier' | 'none';
  children: readonly SpikeFrameBarrierChildReceipt[];
}>;

export type SpikeFrameBarrier = Readonly<{
  request(request: SpikeFrameBarrierRequest): Promise<SpikeFrameBarrierReceipt>;
  dispose(): void;
}>;

type SpikeFrameBarrierOptions = Readonly<{
  masterFrameMap: SpikeVideoFrameMap;
  childFrameMaps: readonly SpikeVideoFrameMap[];
  clocks: readonly SpikeFrameBarrierClock[];
}>;

function staleReceipt(
  request: SpikeFrameBarrierRequest,
  masterFrameMap: SpikeVideoFrameMap,
  children: readonly SpikeFrameBarrierChildReceipt[] = []
): SpikeFrameBarrierReceipt {
  const desiredFrameIndex = frameIndexForProgress(masterFrameMap, request.desiredProgress);
  return {
    status: 'stale',
    runId: request.runId,
    direction: request.direction,
    sequence: request.sequence,
    desiredFrameIndex,
    presentedFrameIndex: desiredFrameIndex,
    mediaTimeSeconds: mediaTimeForFrame(masterFrameMap, desiredFrameIndex),
    presentedProgress: progressForFrameIndex(masterFrameMap, desiredFrameIndex),
    evidence: 'none',
    children
  };
}

export function createSpikeFrameBarrier(
  options: SpikeFrameBarrierOptions
): SpikeFrameBarrier {
  if (options.clocks.length < 2 || options.clocks.length !== options.childFrameMaps.length) {
    throw new Error('Spike frame barrier requires one frame map per child clock');
  }
  let latestSequence = -1;
  let activeController: AbortController | undefined;
  let disposed = false;

  const request = async (
    input: SpikeFrameBarrierRequest
  ): Promise<SpikeFrameBarrierReceipt> => {
    const desiredFrameIndex = frameIndexForProgress(options.masterFrameMap, input.desiredProgress);
    if (disposed || input.sequence <= latestSequence) {
      return staleReceipt(input, options.masterFrameMap);
    }
    latestSequence = input.sequence;
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const abortFromCaller = () => controller.abort();
    if (input.signal) {
      if (input.signal.aborted) controller.abort();
      else input.signal.addEventListener('abort', abortFromCaller, { once: true });
    }
    const children = options.clocks.map((clock, index) => clock.request({
      // The length invariant above makes this lookup total at runtime.
      frameMap: options.childFrameMaps[index]!,
      runId: input.runId,
      direction: input.direction,
      sequence: input.sequence,
      desiredProgress: input.desiredProgress,
      signal: controller.signal
    }));
    try {
      const receipts = await Promise.all(children);
      if (controller.signal.aborted || input.sequence !== latestSequence) {
        return staleReceipt(input, options.masterFrameMap, receipts);
      }
      const childTargets = options.childFrameMaps.map((map) => (
        frameIndexForProgress(map, input.desiredProgress)
      ));
      const exact = receipts.every((receipt, index) => (
        receipt.status === 'presented'
          && receipt.sequence === input.sequence
          && receipt.desiredFrameIndex === childTargets[index]
          && receipt.presentedFrameIndex === childTargets[index]
      ));
      if (!exact) return staleReceipt(input, options.masterFrameMap, receipts);
      return {
        status: 'presented',
        runId: input.runId,
        direction: input.direction,
        sequence: input.sequence,
        desiredFrameIndex,
        presentedFrameIndex: desiredFrameIndex,
        mediaTimeSeconds: mediaTimeForFrame(options.masterFrameMap, desiredFrameIndex),
        presentedProgress: progressForFrameIndex(options.masterFrameMap, desiredFrameIndex),
        evidence: 'packed-frame-barrier',
        children: receipts
      };
    } catch (error) {
      controller.abort();
      await Promise.allSettled(children);
      throw error;
    } finally {
      if (input.signal) input.signal.removeEventListener('abort', abortFromCaller);
      if (activeController === controller) activeController = undefined;
    }
  };

  return Object.freeze({
    request,
    dispose() {
      if (disposed) return;
      disposed = true;
      activeController?.abort();
      activeController = undefined;
    }
  });
}

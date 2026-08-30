// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { mediaTimeForFrame, type SpikeVideoFrameMap } from './spike-frame-map';
import {
  FrameLockSpikeHarness,
  type FrameLockSpikeApi
} from './FrameLockSpikeHarness';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type FrameCallback = (
  now: number,
  metadata: { mediaTime: number }
) => void;

class FakeVideo {
  currentTimeWrites: number[] = [];
  duration = 2;
  readyState = 4;
  seeking = false;
  paused = true;
  private time = 0;
  private callbackId = 0;
  private readonly callbacks = new Map<number, FrameCallback>();
  private readonly listeners = new Map<string, Set<() => void>>();

  get currentTime(): number {
    return this.time;
  }

  set currentTime(value: number) {
    this.time = value;
    this.currentTimeWrites.push(value);
    this.seeking = true;
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  requestVideoFrameCallback(callback: FrameCallback): number {
    const id = ++this.callbackId;
    this.callbacks.set(id, callback);
    return id;
  }

  cancelVideoFrameCallback(id: number): void {
    this.callbacks.delete(id);
  }

  pause(): void {
    this.paused = true;
  }

  completeSeek(): void {
    this.seeking = false;
    for (const listener of this.listeners.get('seeked') ?? []) listener();
  }

  emitFrame(mediaTime: number): void {
    const callback = this.callbacks.entries().next().value as
      | [number, FrameCallback]
      | undefined;
    if (!callback) return;
    this.callbacks.delete(callback[0]);
    callback[1](0, { mediaTime });
  }
}

const phFrameMap: SpikeVideoFrameMap = {
  fpsNumerator: 30,
  fpsDenominator: 1,
  firstPtsSeconds: 0,
  frameCount: 46,
  startFrame: 0,
  endFrame: 45
};

function mountHarness(
  video: FakeVideo,
  options: Readonly<{
    onProbeRequest?: (frameIndex: number) => void;
  }> = {}
): { root: ReturnType<typeof createRoot>; host: HTMLDivElement } {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <FrameLockSpikeHarness
        autoRun={false}
        video={video as unknown as HTMLVideoElement}
        onProbeRequest={options.onProbeRequest}
      />
    );
  });
  return { root, host };
}

function readApi(): FrameLockSpikeApi {
  const api = window.__frameLockSpike;
  if (!api) throw new Error('frame-lock spike API is not installed');
  return api;
}

afterEach(() => {
  delete window.__frameLockSpike;
  document.body.replaceChildren();
});

describe('FrameLockSpikeHarness', () => {
  it('renders the deterministic PH sequence with exact presented-frame receipts and diagnostics', async () => {
    const video = new FakeVideo();
    const { root, host } = mountHarness(video, {
      onProbeRequest: (frameIndex) => {
        video.emitFrame(mediaTimeForFrame(phFrameMap, frameIndex));
      }
    });

    await act(async () => {
      await readApi().runSequence();
    });

    const snapshot = readApi().snapshot();
    expect(snapshot.rows.map((row) => row.desiredFrameIndex)).toEqual([
      0, 1, 23, 45, 12, 44, 0
    ]);
    expect(snapshot.rows.every((row) => (
      row.status === 'presented'
        && row.desiredFrameIndex === row.presentedFrameIndex
        && row.evidence === 'video-frame-callback'
    ))).toBe(true);
    expect(snapshot.staleCount).toBe(0);
    expect(host.querySelectorAll('[data-frame-lock-row]')).toHaveLength(7);
    expect(host.querySelector('[data-frame-lock-row="4"] [data-frame-lock-field="latency"]'))
      .not.toBeNull();

    await act(async () => root.unmount());
  });

  it('records an old sequence as stale without displaying it as the presented frame', async () => {
    const video = new FakeVideo();
    const { root } = mountHarness(video);
    const api = readApi();

    let oldReceipt: ReturnType<typeof api.requestFrame>;
    let latestReceipt: ReturnType<typeof api.requestFrame>;
    act(() => {
      oldReceipt = api.requestFrame(4);
      latestReceipt = api.requestFrame(9);
    });
    await act(async () => {
      await expect(oldReceipt!).resolves.toMatchObject({
        status: 'stale',
        sequence: 1
      });
    });

    act(() => {
      video.emitFrame(mediaTimeForFrame(phFrameMap, 4));
      video.completeSeek();
      video.emitFrame(mediaTimeForFrame(phFrameMap, 9));
    });
    await act(async () => {
      await expect(latestReceipt!).resolves.toMatchObject({
        status: 'presented',
        sequence: 2,
        desiredFrameIndex: 9,
        presentedFrameIndex: 9
      });
    });

    const snapshot = api.snapshot();
    expect(snapshot.rows.find((row) => row.sequence === 1)?.status).toBe('stale');
    expect(snapshot.presentedFrameIndex).toBe(9);
    expect(snapshot.rows.filter((row) => row.committed).map((row) => row.sequence)).toEqual([2]);

    await act(async () => root.unmount());
  });

  it('keeps the PH-to-Education copy/dissolve boundary locked until the matching frame is presented', async () => {
    const video = new FakeVideo();
    const { root, host } = mountHarness(video);
    const api = readApi();

    let readiness: ReturnType<typeof api.requestFrame>;
    act(() => {
      readiness = api.requestFrame(45);
    });
    expect(host.querySelector('[data-ph-education-boundary]')?.getAttribute('data-state'))
      .toBe('locked');
    expect(host.querySelector('[data-frame-clock-presented-frame]')?.textContent).toBe('0');

    act(() => {
      video.completeSeek();
      video.emitFrame(mediaTimeForFrame(phFrameMap, 44));
    });
    await act(async () => { await Promise.resolve(); });
    expect(host.querySelector('[data-ph-education-boundary]')?.getAttribute('data-state'))
      .toBe('locked');

    video.emitFrame(mediaTimeForFrame(phFrameMap, 45));
    await act(async () => { await readiness!; });
    expect(host.querySelector('[data-ph-education-boundary]')?.getAttribute('data-state'))
      .toBe('ready');
    expect(host.querySelector('[data-frame-clock-presented-frame]')?.textContent).toBe('45');
    expect(host.querySelector('[data-ph-education-boundary]')?.textContent)
      .toContain('copy/dissolve ready');

    await act(async () => root.unmount());
  });
});

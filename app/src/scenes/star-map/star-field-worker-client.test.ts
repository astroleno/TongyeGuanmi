import { afterEach, describe, expect, it, vi } from 'vitest';
import { StarFieldWorkerClient } from './star-field-worker-client';
import type { StarWorkerRequest, StarWorkerResponse } from './star-field-protocol';

function setup() {
  const drawImage = vi.fn(), onPresented = vi.fn(), onFailure = vi.fn();
  const canvas = { width: 300, height: 150, getContext: () => ({ drawImage, clearRect: vi.fn() }) } as unknown as HTMLCanvasElement;
  const worker = {
    postMessage: vi.fn(), terminate: vi.fn(),
    onmessage: null as ((event: MessageEvent<StarWorkerResponse>) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    onmessageerror: null as ((event: MessageEvent) => void) | null
  };
  const client = new StarFieldWorkerClient({ canvas, sourceUrl: '/star.webp', onPresented, onFailure, createWorker: () => worker });
  const emit = (data: StarWorkerResponse) => worker.onmessage?.({ data } as MessageEvent<StarWorkerResponse>);
  const requests = () => worker.postMessage.mock.calls.map(([r]) => r as StarWorkerRequest)
    .filter((r): r is Extract<StarWorkerRequest, { type: 'render' }> => r.type === 'render');
  const reply = (request = requests().at(-1)!) => {
    const bitmap = { width: 1672, height: 941, close: vi.fn() } as unknown as ImageBitmap;
    emit({ type: 'frame', generation: request.generation, frameId: request.frameId, bitmap });
    return bitmap;
  };
  client.start();
  return { client, worker, canvas, drawImage, onPresented, onFailure, emit, requests, reply };
}

afterEach(() => vi.useRealTimers());

describe('star field worker presentation ownership', () => {
  it('waits for a real draw and bounds work to one in-flight plus the latest request', () => {
    const p = setup();
    p.client.render({ timeSeconds: 1 });
    p.client.render({ timeSeconds: 2 });
    expect(p.requests()).toHaveLength(0);
    p.emit({ type: 'ready' });
    expect(p.requests()[0]?.frame.timeSeconds).toBe(2);
    expect(p.onPresented).not.toHaveBeenCalled();
    for (let i = 3; i <= 100; i++) p.client.render({ timeSeconds: i });
    expect(p.requests()).toHaveLength(1);
    expect(p.reply().close).toHaveBeenCalledOnce();
    expect(p.canvas.width).toBe(1672);
    expect(p.canvas.height).toBe(941);
    expect(p.onPresented).toHaveBeenCalledOnce();
    expect(p.drawImage.mock.invocationCallOrder[0]).toBeLessThan(p.onPresented.mock.invocationCallOrder[0]!);
    expect(p.requests()).toHaveLength(2);
    expect(p.requests()[1]?.frame.timeSeconds).toBe(100);
    p.client.dispose();
  });

  it('closes a paused generation without presenting it, then accepts a fresh generation', () => {
    const p = setup(); p.emit({ type: 'ready' });
    p.client.render({ timeSeconds: 1 });
    p.client.pause();
    p.client.render({ timeSeconds: 2 });
    expect(p.reply().close).toHaveBeenCalledOnce();
    expect(p.drawImage).not.toHaveBeenCalled();
    expect(p.onPresented).not.toHaveBeenCalled();
    expect(p.requests()[1]?.generation).toBe(1);
    p.reply();
    expect(p.onPresented).toHaveBeenCalledExactlyOnceWith(2);
    p.client.dispose();
  });

  it('terminates and closes late bitmaps without acknowledging them after disposal', () => {
    const p = setup(); p.emit({ type: 'ready' }); p.client.render({});
    const request = p.requests()[0]!;
    p.client.dispose();
    p.client.render({});
    expect(p.reply(request).close).toHaveBeenCalledOnce();
    expect(p.worker.terminate).toHaveBeenCalledOnce();
    expect(p.drawImage).not.toHaveBeenCalled();
    expect(p.onPresented).not.toHaveBeenCalled();
    expect(p.onFailure).not.toHaveBeenCalled();
  });

  it('rejects duplicate and out-of-order frames without freeing another request', () => {
    const p = setup(); p.emit({ type: 'ready' }); p.client.render({});
    const first = p.requests()[0]!;
    p.reply(first); p.client.render({});
    p.reply(first);
    expect(p.onPresented).toHaveBeenCalledOnce();
    p.reply(); expect(p.onPresented).toHaveBeenCalledTimes(2);
    p.client.dispose();
  });

  it('fails once when drawing fails and still closes the bitmap', () => {
    const p = setup(); p.emit({ type: 'ready' }); p.client.render({});
    p.drawImage.mockImplementationOnce(() => { throw new Error('lost context'); });
    expect(p.reply().close).toHaveBeenCalledOnce();
    expect(p.onPresented).not.toHaveBeenCalled();
    expect(p.onFailure).toHaveBeenCalledOnce();
    p.emit({ type: 'error', message: 'late error' });
    expect(p.onFailure).toHaveBeenCalledOnce();
  });

  it('falls back for startup exceptions, message failures and worker exceptions', () => {
    const failed = vi.fn();
    new StarFieldWorkerClient({ canvas: {} as HTMLCanvasElement, sourceUrl: '',
      createWorker: () => { throw new Error('unsupported'); }, onPresented: vi.fn(), onFailure: failed }).start();
    expect(failed).toHaveBeenCalledOnce();
    for (const mode of ['message', 'error', 'post'] as const) {
      const p = setup();
      if (mode === 'message') p.worker.onmessageerror?.({} as MessageEvent);
      if (mode === 'error') p.worker.onerror?.({ message: 'crash', preventDefault: vi.fn() } as unknown as ErrorEvent);
      if (mode === 'post') {
        p.worker.postMessage.mockImplementationOnce(() => { throw new Error('send failed'); });
        p.emit({ type: 'ready' }); p.client.render({});
      }
      expect(p.onFailure).toHaveBeenCalledOnce();
      expect(p.worker.terminate).toHaveBeenCalledOnce();
    }
  });

  it('bounds startup and render stalls and cancels deadlines on disposal', () => {
    vi.useFakeTimers();
    for (const booted of [false, true]) {
      const p = setup();
      if (booted) { p.emit({ type: 'ready' }); p.client.render({}); }
      vi.advanceTimersByTime(10_000);
      expect(p.onFailure).toHaveBeenCalledOnce();
    }
    const p = setup(); p.client.dispose(); vi.advanceTimersByTime(20_000);
    expect(p.onFailure).not.toHaveBeenCalled();
  });
});

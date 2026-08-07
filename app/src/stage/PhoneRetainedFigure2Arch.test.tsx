// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RetainedFigure2Arch } from './PhoneRetainedFigure2Arch';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('phone retained Figure2 arch', () => {
  const originalDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode');

  afterEach(() => {
    if (originalDecode) Object.defineProperty(HTMLImageElement.prototype, 'decode', originalDecode);
    else delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).decode;
    vi.restoreAllMocks();
  });

  it('drops a delayed decode rejection after the owner leaves', async () => {
    let rejectDecode: ((error: unknown) => void) | undefined;
    Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: () => (
      new Promise<void>((_, reject) => { rejectDecode = reject; })
    ) });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const onReady = vi.fn();
    const onFailure = vi.fn();
    await act(async () => {
      root.render(<RetainedFigure2Arch mounted visible ownerKey="attempt-a" src="arch.webp"
        onDecodeReady={onReady} onDecodeFailure={onFailure} />);
    });
    const image = host.querySelector<HTMLImageElement>('[data-stage-retained-figure2-arch]');
    expect(image).not.toBeNull();
    act(() => image?.dispatchEvent(new Event('load')));
    await act(async () => { root.unmount(); });
    await act(async () => { rejectDecode?.(new Error('stale decode')); });
    expect(onReady).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
    host.remove();
  });

  it('replays an already decoded global surface for a new transaction owner', async () => {
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => new Promise<void>(() => undefined)
    });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const onReady = vi.fn();
    await act(async () => {
      root.render(<RetainedFigure2Arch mounted visible ownerKey="attempt-a" src="arch.webp"
        onDecodeReady={onReady} onDecodeFailure={vi.fn()} />);
    });
    const image = host.querySelector<HTMLImageElement>('[data-stage-retained-figure2-arch]')!;
    image.setAttribute('data-phone-figure2-arch-ready', 'true');
    await act(async () => {
      root.render(<RetainedFigure2Arch mounted visible ownerKey="attempt-b" src="arch.webp"
        onDecodeReady={onReady} onDecodeFailure={vi.fn()} />);
    });
    expect(onReady).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    host.remove();
  });

  it('rebinds a pending decode to the current transaction owner', async () => {
    const resolves: Array<() => void> = [];
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => new Promise<void>((resolve) => { resolves.push(resolve); })
    });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const onReady = vi.fn();
    await act(async () => {
      root.render(<RetainedFigure2Arch mounted visible ownerKey="attempt-a" src="arch.webp"
        onDecodeReady={onReady} onDecodeFailure={vi.fn()} />);
    });
    const image = host.querySelector<HTMLImageElement>('[data-stage-retained-figure2-arch]')!;
    act(() => image.dispatchEvent(new Event('load')));
    await act(async () => {
      root.render(<RetainedFigure2Arch mounted visible ownerKey="attempt-b" src="arch.webp"
        onDecodeReady={onReady} onDecodeFailure={vi.fn()} />);
    });
    expect(resolves).toHaveLength(2);
    await act(async () => { resolves[0]!(); });
    expect(onReady).not.toHaveBeenCalled();
    await act(async () => { resolves[1]!(); });
    expect(onReady).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    host.remove();
  });

  it('restores active ownership across StrictMode effect replay', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const onReady = vi.fn();
    await act(async () => {
      root.render(<StrictMode><RetainedFigure2Arch mounted visible ownerKey="attempt-a" src="arch.webp"
        onDecodeReady={onReady} onDecodeFailure={vi.fn()} /></StrictMode>);
    });
    expect(onReady).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    host.remove();
  });
});

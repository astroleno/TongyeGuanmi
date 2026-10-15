// @vitest-environment jsdom
import { act, StrictMode, useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { ScrollCanvas, ScrollCanvasContext } from './ScrollCanvas';
import { createScrollCanvasWindow } from './scroll-canvas-window';

describe('window-owned React canvas', () => {
  it('provides the actual canvas before the parent layout effect, including StrictMode', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const owner = createScrollCanvasWindow(); owner.configure(1);
    const seen: HTMLCanvasElement[] = [];
    function Parent() {
      const ref = useRef<HTMLCanvasElement | null>(null);
      useLayoutEffect(() => { seen.push(ref.current!); }, []);
      return <ScrollCanvas purpose="ink" ref={ref} className="authored-canvas" data-generation="first" aria-hidden="true" />;
    }
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<StrictMode><ScrollCanvasContext value={owner}><Parent /></ScrollCanvasContext></StrictMode>));
    expect(seen).toHaveLength(2);
    expect(seen.every((canvas) => canvas instanceof HTMLCanvasElement && canvas.className === 'authored-canvas')).toBe(true);
    expect(container.querySelector('canvas')?.dataset.generation).toBe('first');
    await act(async () => root.unmount()); owner.dispose(); container.remove(); vi.unstubAllGlobals();
  });
  it('preserves an ordinary native canvas without a scroll owner', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div'), root = createRoot(container);
    await act(async () => root.render(<ScrollCanvas purpose="packed-alpha" data-native="yes" />));
    expect(container.firstElementChild?.tagName).toBe('CANVAS');
    await act(async () => root.unmount()); vi.unstubAllGlobals();
  });
});

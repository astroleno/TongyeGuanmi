import { createContext, useContext, useImperativeHandle, useLayoutEffect, useRef, type ComponentPropsWithRef } from 'react';
import type { ScrollCanvasLease, ScrollCanvasWindow } from './scroll-canvas-window';

export const ScrollCanvasContext = createContext<ScrollCanvasWindow | null>(null);
type Props = Pick<ComponentPropsWithRef<'canvas'>, 'ref' | 'className' | 'width' | 'height' | 'id' | 'aria-hidden'>
  & { purpose: 'ink' | 'packed-alpha'; [key: `data-${string}`]: string | number | boolean | undefined };

/** The host has no layout box; React owns it, and the window owns its canvas. */
export function ScrollCanvas({ purpose, ref, ...props }: Props) {
  const owner = useContext(ScrollCanvasContext);
  const host = useRef<HTMLSpanElement | null>(null);
  const lease = useRef<ScrollCanvasLease | null>(null);
  const previous = useRef<Record<string, unknown>>({});
  useLayoutEffect(() => {
    if (!owner || !host.current) return;
    const current = owner.acquire(purpose, host.current.ownerDocument);
    lease.current = current; previous.current = {};
    host.current.append(current.canvas);
    return () => { current.release(); lease.current = null; };
  }, [owner, purpose]);
  useLayoutEffect(() => {
    const canvas = lease.current?.canvas;
    if (!canvas) return;
    const next = props as Record<string, unknown>;
    for (const key of new Set([...Object.keys(previous.current), ...Object.keys(next)])) {
      if (previous.current[key] === next[key]) continue;
      const name = key === 'className' ? 'class' : key;
      if (next[key] === undefined || next[key] === null) canvas.removeAttribute(name);
      else canvas.setAttribute(name, String(next[key]));
    }
    previous.current = next;
  });
  useImperativeHandle(owner ? ref : undefined, () => lease.current!.canvas, [owner, purpose]);
  return owner ? <span ref={host} style={{ display: 'contents' }} /> : <canvas ref={ref} {...props} />;
}

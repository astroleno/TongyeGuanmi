import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { LAB_COPY } from '..';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafGenerationBinding,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import './PhoneLab.css';

const LAB_ROW_OFFSETS = [11, 14, 17, 20, 23, 26] as const;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function phoneLabFrame(
  rawProgress: number,
  reducedMotion = false
): Readonly<{ progress: number; opacity: number; y: number }> {
  const progress = reducedMotion ? 1 : clamp(rawProgress);
  return { progress, opacity: .98 + progress * .02, y: (1 - progress) * 10 };
}

function LabContent({ reading }: Readonly<{ reading: boolean }>) {
  return (
    <article
      id={reading ? 'lab-reading' : 'lab'}
      className="phone-lab"
      data-phone-scene="lab"
      data-phone-reading={reading ? 'lab' : undefined}
      data-phone-lab-stable-input="lab-ph"
      aria-labelledby={reading ? 'phone-lab-title-reading' : 'phone-lab-title'}
    >
      <section className="phone-lab__screen phone-lab__screen--intro">
        <header className="phone-lab__hero">
          <p className="phone-lab__eyebrow">{LAB_COPY[7]}</p>
          <h2 id={reading ? 'phone-lab-title-reading' : 'phone-lab-title'}>
            <span>{LAB_COPY[8]}</span>
            <span>{LAB_COPY[9]}</span>
          </h2>
          <p>{LAB_COPY[0]} <em>{LAB_COPY[1]}</em>{LAB_COPY[2]}</p>
          <p>{LAB_COPY[10]}</p>
        </header>
      </section>
      <section className="phone-lab__screen phone-lab__screen--scenarios">
        <ol className="phone-lab__list" aria-label="AI 落地场景">
          {LAB_ROW_OFFSETS.map((offset) => (
            <li key={LAB_COPY[offset]} className="phone-lab__row">
              <span>{LAB_COPY[offset]}</span>
              <h3>{LAB_COPY[offset + 1]}</h3>
              <p>{LAB_COPY[offset + 2]}</p>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}

export function Reading() {
  return <LabContent reading />;
}

/** Static clean leaf; the shell owns the separate native reading-flow copy. */
export function PhoneLab({ reports }: Readonly<{ reports: PhoneLeafReportPort }>) {
  const rootRef = useRef<HTMLElement | null>(null);
  const bindingRef = useRef<PhoneLeafGenerationBinding | null>(null);
  const paintFrameRef = useRef<number | null>(null);
  const disposedRef = useRef(false);

  const cancelPaint = useCallback(() => {
    if (paintFrameRef.current !== null) cancelAnimationFrame(paintFrameRef.current);
    paintFrameRef.current = null;
  }, []);

  const provePostPaint = useCallback(() => {
    cancelPaint();
    paintFrameRef.current = requestAnimationFrame(() => {
      paintFrameRef.current = null;
      const binding = bindingRef.current;
      if (!binding || disposedRef.current) return;
      binding.reports.reportPrepared('lab-root', {
        kind: 'static-ready', token: binding.frameToken, ready: true,
        detail: { postPaint: true }
      });
    });
  }, [cancelPaint]);

  const render = useCallback((rawProgress: number) => {
    const root = rootRef.current;
    if (!root) return;
    const frame = phoneLabFrame(rawProgress);
    root.style.setProperty('--phone-lab-opacity', frame.opacity.toFixed(4));
    root.style.setProperty('--phone-lab-y', `${frame.y.toFixed(2)}px`);
    root.dataset.phoneLabProgress = frame.progress.toFixed(4);
  }, []);

  const commands = useMemo<PhoneLeafCommandHandle>(() => Object.freeze({
    rebind(binding: PhoneLeafGenerationBinding) {
      bindingRef.current = binding;
      provePostPaint();
    },
    activate(command): PhoneActivationInvocation {
      return { invocationId: command.invocationId, surfaceIds: command.surfaceIds,
        invoked: false, settlements: [] };
    },
    render,
    settle(endpoint) { render(endpoint); },
    pause() {},
    dispose() {
      disposedRef.current = true;
      cancelPaint();
      bindingRef.current = null;
    }
  }), [cancelPaint, provePostPaint, render]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    disposedRef.current = false;
    render(1);
    reports.registerMount({
      root,
      surfaces: [{ id: 'lab-root', element: root, kind: 'dom' }],
      commands
    });
    return () => {
      disposedRef.current = true;
      cancelPaint();
      bindingRef.current = null;
    };
  }, [cancelPaint, commands, render, reports]);

  return (
    <div ref={(element) => {
      rootRef.current = element?.querySelector<HTMLElement>('#lab') ?? null;
    }} className="phone-lab__visual">
      <LabContent reading={false} />
    </div>
  );
}

export default PhoneLab;

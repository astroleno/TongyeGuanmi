import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { SERVICES_COPY } from '..';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafGenerationBinding,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import './PhoneServices.css';

const SERVICE_ROW_OFFSETS = [4, 8, 12, 16] as const;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function phoneServicesFrame(
  rawProgress: number,
  reducedMotion = false
): Readonly<{ progress: number; opacity: number; y: number }> {
  const progress = reducedMotion ? 1 : clamp(rawProgress);
  return { progress, opacity: .98 + progress * .02, y: (1 - progress) * 10 };
}

function ServicesContent({ reading }: Readonly<{ reading: boolean }>) {
  return (
    <article
      id={reading ? 'services-reading' : 'services'}
      className="phone-services"
      data-phone-scene="services"
      data-phone-reading={reading ? 'services' : undefined}
      data-phone-input-owner={reading ? 'native-document' : undefined}
      aria-labelledby={reading ? 'phone-services-title-reading' : 'phone-services-title'}
    >
      <header className="phone-services__hero">
        <p className="phone-services__eyebrow">{SERVICES_COPY[0]}</p>
        <h2 id={reading ? 'phone-services-title-reading' : 'phone-services-title'}>
          <span>{SERVICES_COPY[1]}</span>
          <span>{SERVICES_COPY[2]}</span>
        </h2>
        <p>{SERVICES_COPY[3]}</p>
      </header>
      <ol className="phone-services__list" aria-label="企业服务能力">
        {SERVICE_ROW_OFFSETS.map((offset) => (
          <li key={SERVICES_COPY[offset]} className="phone-services__row">
            <span>{SERVICES_COPY[offset]}</span>
            <h3>{SERVICES_COPY[offset + 1]}</h3>
            <p>{SERVICES_COPY[offset + 2]}</p>
            <small>{SERVICES_COPY[offset + 3]}</small>
          </li>
        ))}
      </ol>
    </article>
  );
}

export function Reading() {
  return <ServicesContent reading />;
}

export function PhoneServices({ reports }: Readonly<{ reports: PhoneLeafReportPort }>) {
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
      binding.reports.reportPrepared('services-root', {
        kind: 'static-ready', token: binding.frameToken, ready: true,
        detail: { postPaint: true }
      });
    });
  }, [cancelPaint]);

  const render = useCallback((rawProgress: number) => {
    const root = rootRef.current;
    if (!root) return;
    const frame = phoneServicesFrame(rawProgress);
    root.style.setProperty('--phone-services-opacity', frame.opacity.toFixed(4));
    root.style.setProperty('--phone-services-y', `${frame.y.toFixed(2)}px`);
    root.dataset.phoneServicesProgress = frame.progress.toFixed(4);
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
      surfaces: [{ id: 'services-root', element: root, kind: 'dom' }],
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
      rootRef.current = element?.querySelector<HTMLElement>('#services') ?? null;
    }} className="phone-services__visual" data-phone-native-mirror="services">
      <ServicesContent reading={false} />
    </div>
  );
}

export default PhoneServices;
export const phoneSceneId = 'services' as const;

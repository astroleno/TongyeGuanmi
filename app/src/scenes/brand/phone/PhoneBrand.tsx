import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { BRAND_COPY } from '..';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafGenerationBinding,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import './PhoneBrand.css';

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function phoneBrandFrame(
  rawProgress: number,
  reducedMotion = false
): Readonly<{ progress: number; opacity: number; y: number }> {
  const progress = reducedMotion ? 1 : clamp(rawProgress);
  return {
    progress,
    opacity: .96 + progress * .04,
    y: (1 - progress) * 12
  };
}

function BrandContent({ reading }: Readonly<{ reading: boolean }>) {
  return (
    <article
      id="brand"
      className="phone-brand"
      data-phone-scene="brand"
      data-phone-reading={reading ? 'brand' : undefined}
      data-phone-input-owner={reading ? 'native-document' : undefined}
      aria-labelledby={reading ? 'phone-brand-title-reading' : 'phone-brand-title'}
    >
      <div className="phone-brand__content">
        <section className="phone-brand__definition">
          <span>{BRAND_COPY[0]}</span>
          <h2 id={reading ? 'phone-brand-title-reading' : 'phone-brand-title'}>
            {BRAND_COPY[1]}
          </h2>
          <p>{BRAND_COPY[2]}</p>
        </section>
        <section className="phone-brand__definition">
          <span>{BRAND_COPY[3]}</span>
          <h2>{BRAND_COPY[4]}</h2>
          <p>{BRAND_COPY[5]}</p>
        </section>
      </div>
    </article>
  );
}

export function Reading(_props: Readonly<{ sceneId: string }>) {
  void _props;
  return <BrandContent reading />;
}

export function PhoneBrand({ reports }: Readonly<{ reports: PhoneLeafReportPort }>) {
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
      binding.reports.reportPrepared('brand-root', {
        kind: 'static-ready', token: binding.frameToken, ready: true,
        detail: { postPaint: true }
      });
    });
  }, [cancelPaint]);

  const render = useCallback((progress: number) => {
    const root = rootRef.current;
    if (!root) return;
    const frame = phoneBrandFrame(progress);
    root.style.setProperty('--phone-brand-opacity', frame.opacity.toFixed(4));
    root.style.setProperty('--phone-brand-y', `${frame.y.toFixed(2)}px`);
    root.dataset.phoneBrandProgress = frame.progress.toFixed(4);
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
    settle() { render(1); },
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
      surfaces: [{ id: 'brand-root', element: root, kind: 'dom' }],
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
      rootRef.current = element?.querySelector<HTMLElement>('.phone-brand') ?? null;
    }} className="phone-brand__visual" data-phone-native-mirror="brand">
      <BrandContent reading={false} />
    </div>
  );
}

export default PhoneBrand;
export const phoneSceneId = 'brand' as const;

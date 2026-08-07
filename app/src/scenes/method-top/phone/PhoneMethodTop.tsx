import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafGenerationBinding,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import { METHOD_COPY } from '../../../story/copy';
import './PhoneMethodTop.css';

const METHOD_TOP_COPY = METHOD_COPY.slice(0, 8);
const METHOD_STEPS_COPY = METHOD_COPY.slice(8, 23);
const METHOD_STEPS = Array.from({ length: 5 }, (_, index) => {
  const offset = index * 3;
  return {
    index: METHOD_STEPS_COPY[offset]!,
    title: METHOD_STEPS_COPY[offset + 1]!,
    body: METHOD_STEPS_COPY[offset + 2]!
  };
});

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function phoneMethodTopFrame(rawProgress: number): Readonly<{
  progress: number; opacity: number; y: number; blur: number;
}> {
  const progress = clamp(rawProgress);
  const eased = progress * progress * (3 - 2 * progress);
  return {
    progress,
    opacity: eased,
    y: 30 * (1 - eased),
    blur: 8 * (1 - eased)
  };
}

function MethodContent({ reading }: Readonly<{ reading: boolean }>) {
  return (
    <section
      id="method"
      className="portrait-scroll-spike__reading phone-method-top"
      data-phone-reading={reading ? 'method-top' : undefined}
      data-phone-input-owner={reading ? 'native-document' : undefined}
      aria-label="同野观幂 AI 落地五步"
    >
      <div className="portrait-scroll-spike__reading-intro portrait-scroll-spike__method-bridge">
        <div className="portrait-scroll-spike__method-bridge-content">
          <span>{METHOD_TOP_COPY[0]}</span>
          <h2 id={reading ? 'portrait-spike-method-title-reading' : 'portrait-spike-method-title'}>
            <span>{METHOD_TOP_COPY[1]}</span>
            <span>{METHOD_TOP_COPY[2]}</span>
          </h2>
          <p>{METHOD_TOP_COPY[3]}</p>
        </div>
      </div>
      <ol className="portrait-scroll-spike__steps" aria-label="同野观幂 AI 落地五步">
        {METHOD_STEPS.map((step) => (
          <li key={step.index}>
            <span>{step.index}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Reading(props: Readonly<{ sceneId?: string }> = {}) {
  void props;
  return <MethodContent reading />;
}

export type PhoneMethodTopProps = Readonly<{ reports: PhoneLeafReportPort }>;

/** Genuine Method leaf: runtime owns progress and the document owns reading input. */
export function PhoneMethodTop({ reports }: PhoneMethodTopProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useRef<HTMLElement | null>(null);
  const bridgeRef = useRef<HTMLDivElement | null>(null);
  const bindingRef = useRef<PhoneLeafGenerationBinding | null>(null);
  const paintFrameRef = useRef<number | null>(null);
  const disposedRef = useRef(false);
  const nativeScrollYRef = useRef(0);
  const nativeScrollFrozenRef = useRef(false);

  const syncNativeScroll = useCallback(() => {
    const root = rootRef.current;
    if (!root || typeof document === 'undefined') return;
    const scrollOwner = document.scrollingElement;
    const scrollTop = Math.max(0, scrollOwner?.scrollTop ?? window.scrollY ?? 0);
    nativeScrollYRef.current = scrollTop;
    root.style.setProperty('--phone-method-native-scroll-y', `${scrollTop.toFixed(2)}px`);
    root.dataset.phoneMethodNativeScrollY = scrollTop.toFixed(2);
  }, []);

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
      binding.reports.reportPrepared('method-root', {
        kind: 'static-ready', token: binding.frameToken, ready: true,
        detail: { postPaint: true }
      });
    });
  }, [cancelPaint]);

  const render = useCallback((progress: number) => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    const frame = phoneMethodTopFrame(progress);
    bridge.style.display = 'flex';
    bridge.style.visibility = frame.opacity > .001 ? 'visible' : 'hidden';
    bridge.style.opacity = frame.opacity.toFixed(4);
    bridge.style.filter = `blur(${frame.blur.toFixed(2)}px)`;
    bridge.style.transform = `translate3d(0, ${frame.y.toFixed(2)}px, 0)`;
    surfaceRef.current?.setAttribute('data-phone-method-progress', frame.progress.toFixed(4));
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
    const surface = surfaceRef.current;
    const bridge = bridgeRef.current;
    if (!root || !surface || !bridge) return;
    disposedRef.current = false;
    render(1);
    reports.registerMount({
      root,
      surfaces: [{ id: 'method-root', element: surface, kind: 'dom' }],
      commands
    });
    return () => {
      disposedRef.current = true;
      cancelPaint();
      bindingRef.current = null;
    };
  }, [cancelPaint, commands, render, reports]);

  useLayoutEffect(() => {
    syncNativeScroll();
    const host = rootRef.current?.closest<HTMLElement>('.phone-story');
    const freeze = () => {
      const root = rootRef.current;
      if (!root) return;
      nativeScrollFrozenRef.current = true;
      const captured = Number(root.dataset.phoneMethodNativeScrollY);
      const value = (Number.isFinite(captured) ? captured : nativeScrollYRef.current).toFixed(2);
      root.style.setProperty('--phone-method-native-scroll-y', `${value}px`);
      root.dataset.phoneMethodNativeScrollY = value;
    };
    const release = () => {
      nativeScrollFrozenRef.current = false;
      syncNativeScroll();
    };
    const readingEnabled = () => host?.getAttribute('data-phone-reading') === 'enabled';
    if (readingEnabled()) release(); else freeze();
    const observer = host && typeof MutationObserver !== 'undefined'
      ? new MutationObserver(() => (readingEnabled() ? release() : freeze())) : null;
    if (observer && host) observer.observe(host, {
      attributes: true, attributeFilter: ['data-phone-reading']
    });
    const onScroll = () => (readingEnabled() ? syncNativeScroll() : freeze());
    const onResize = () => { if (readingEnabled()) syncNativeScroll(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      observer?.disconnect();
      nativeScrollFrozenRef.current = false;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [syncNativeScroll]);

  return (
    <div ref={(element) => {
      rootRef.current = element;
      surfaceRef.current = element?.querySelector<HTMLElement>('#method') ?? null;
      bridgeRef.current = element?.querySelector<HTMLDivElement>('.portrait-scroll-spike__method-bridge') ?? null;
    }} className="phone-method-top__visual">
      <MethodContent reading={false} />
    </div>
  );
}

export default PhoneMethodTop;
export const phoneSceneId = 'method-top' as const;

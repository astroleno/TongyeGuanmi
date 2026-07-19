import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { METHOD_COPY } from '../../../story/copy';
import type { PhoneSceneAdapterHandle, PhoneSceneAdapterProps } from '../types';
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

function smoothstep(value: number): number {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
}

export const PhoneMethodTop = forwardRef<PhoneSceneAdapterHandle, PhoneSceneAdapterProps>(function PhoneMethodTop(
  { onReady },
  forwardedRef
) {
  const rootRef = useRef<HTMLElement | null>(null);
  const bridgeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    update(rawProgress) {
      const bridge = bridgeRef.current;
      if (!bridge) return;
      const progress = clamp(rawProgress);
      const eased = smoothstep(progress);
      bridge.style.display = progress > 0.001 ? 'flex' : 'none';
      bridge.style.opacity = String(eased);
      bridge.style.visibility = progress > 0.001 ? 'visible' : 'hidden';
      bridge.style.transform = `translate3d(0, ${(30 * (1 - eased)).toFixed(2)}px, 0)`;
      bridge.style.filter = `blur(${(8 * (1 - eased)).toFixed(2)}px)`;
      rootRef.current?.setAttribute('data-phone-method-entrance', progress.toFixed(4));
    },
    enter() {},
    leave() {},
    reverse() {},
    dispose() {}
  }), []);

  return (
    <section ref={rootRef} id="method" className="phone-method" aria-label="同野观幂 AI 落地五步">
      <div ref={bridgeRef} className="phone-method__bridge">
        <div className="phone-method__bridge-content">
          <span>{METHOD_TOP_COPY[0]}</span>
          <h2 id="phone-method-title"><span>{METHOD_TOP_COPY[1]}</span><span>{METHOD_TOP_COPY[2]}</span></h2>
          <p>{METHOD_TOP_COPY[3]}</p>
        </div>
      </div>
      <ol className="phone-method__steps" aria-label="同野观幂 AI 落地五步">
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
});

export default PhoneMethodTop;

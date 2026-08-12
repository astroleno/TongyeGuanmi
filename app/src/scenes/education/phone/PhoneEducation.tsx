import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import {
  educationScene,
  renderEducationHold,
  renderEducationProgress
} from '..';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafGenerationBinding,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import './PhoneEducation.css';

const EducationSurface = educationScene.Component;

/** The native document owns every reading input over Education. */
export const PHONE_EDUCATION_INPUT_POLICY = Object.freeze({
  wheel: 'native',
  touch: 'native',
  keyboard: 'native',
  focus: 'native'
} as const);

export function phoneEducationReceiverLanding(segmentId: string | null | undefined, direction: 'forward' | 'reverse' | null | undefined): 'top' | 'bottom' {
  return segmentId === 'education-crane' && direction === 'reverse' ? 'bottom' : 'top';
}

export function phoneEducationReceiverOffset(landing: 'top' | 'bottom', contentHeight: number, viewportHeight: number): number {
  return landing === 'bottom' ? -Math.max(0, contentHeight - viewportHeight) : 0;
}

function EducationContent({ reading }: Readonly<{ reading: boolean }>) {
  return (
    <div
      id={reading ? 'education-reading' : 'education'}
      className="phone-education"
      data-phone-scene="education"
      data-phone-reading={reading ? 'education' : undefined}
      data-phone-input-owner="native-document"
      data-phone-input-policy="wheel-touch-keyboard-focus-native"
    >
      <EducationSurface scene={educationScene.id} hidden={false} />
    </div>
  );
}

export function Reading() {
  return <EducationContent reading />;
}

/** Static clean leaf; native reading is rendered by the shell's reading flow. */
export function PhoneEducation({ reports }: Readonly<{
  reports: PhoneLeafReportPort;
}>) {
  const mountRef = useRef<HTMLDivElement | null>(null);
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
      binding.reports.reportPrepared('education-root', {
        kind: 'static-ready', token: binding.frameToken, ready: true,
        detail: { postPaint: true }
      });
    });
  }, [cancelPaint]);

  const render = useCallback((rawProgress: number) => {
    renderEducationProgress(rootRef.current, Math.min(1, Math.max(0, rawProgress)));
  }, []);

  const commands = useMemo<PhoneLeafCommandHandle>(() => Object.freeze({
    rebind(binding: PhoneLeafGenerationBinding) {
      bindingRef.current = binding;
      const landing = phoneEducationReceiverLanding(binding.segmentId, binding.direction);
      const mount = mountRef.current;
      mount?.setAttribute('data-phone-receiver-landing', landing);
      mount?.style.setProperty('--phone-education-receiver-y', `${phoneEducationReceiverOffset(
        landing, mount.scrollHeight, document.documentElement.clientHeight)}px`);
      provePostPaint();
    },
    activate(command): PhoneActivationInvocation {
      return {
        invocationId: command.invocationId,
        surfaceIds: command.surfaceIds,
        invoked: false,
        settlements: []
      };
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
    const mount = mountRef.current;
    const root = mount?.querySelector<HTMLElement>('#education') ?? null;
    if (!mount || !root) return;
    rootRef.current = root;
    disposedRef.current = false;
    renderEducationHold(root);
    reports.registerMount({
      root: mount,
      surfaces: [{ id: 'education-root', element: root, kind: 'dom' }],
      commands
    });
    return () => {
      disposedRef.current = true;
      cancelPaint();
      bindingRef.current = null;
      rootRef.current = null;
    };
  }, [cancelPaint, commands, reports]);

  return (
    <div ref={mountRef} className="phone-education__visual"
      data-phone-native-mirror="education">
      <EducationContent reading={false} />
    </div>
  );
}

export default PhoneEducation;
export const phoneSceneId = 'education' as const;

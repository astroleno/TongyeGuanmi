import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import {
  contactScene,
  renderContactEntrance,
  renderContactHold,
  renderContactProgress
} from '..';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafGenerationBinding,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import '../../../production/editorial-layout.css';
import './PhoneContact.css';

const ContactSurface = contactScene.Component;

/** The terminal document owns every Contact interaction path. */
export const PHONE_CONTACT_INPUT_POLICY = Object.freeze({
  wheel: 'native',
  touch: 'native',
  keyboard: 'native',
  focus: 'native',
  pointer: 'native'
} as const);

export function phoneContactPresentationFrame(
  rawProgress: number,
  craneHandoff: boolean
): Readonly<{ copyProgress: number; paperAlpha: number }> {
  const progress = Math.min(1, Math.max(0, rawProgress));
  return {
    copyProgress: progress,
    paperAlpha: craneHandoff ? progress : 1
  };
}

function ContactContent({
  reading,
  registerRoot
}: Readonly<{
  reading: boolean;
  registerRoot?: (element: HTMLElement | null) => void;
}>) {
  return (
    <div
      id={reading ? 'contact-reading' : contactScene.id}
      className="phone-contact"
      data-phone-scene="contact"
      data-phone-reading={reading ? 'contact' : undefined}
      data-phone-contact-state="terminal"
      data-phone-input-owner="native-document"
      data-phone-input-policy="wheel-touch-keyboard-focus-pointer-native"
    >
      <ContactSurface
        scene={contactScene.id}
        hidden={false}
        registerHandle={(name, element) => {
          if (name === 'copy') registerRoot?.(element);
        }}
      />
    </div>
  );
}

/** Native reading copy; the shell enables it only after the stable commit. */
export function Reading() {
  return <ContactContent reading />;
}

/** Static terminal leaf with one post-paint proof and no resource owner. */
export function PhoneContact({ reports }: Readonly<{
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
      binding.reports.reportPrepared('contact-root', {
        kind: 'static-ready', token: binding.frameToken, ready: true,
        detail: { postPaint: true }
      });
    });
  }, [cancelPaint]);

  const render = useCallback((rawProgress: number) => {
    const binding = bindingRef.current;
    const craneHandoff = binding?.segmentId === 'crane-contact';
    const frame = phoneContactPresentationFrame(rawProgress, craneHandoff);
    if (craneHandoff) {
      renderContactEntrance(
        rootRef.current,
        frame.copyProgress,
        frame.paperAlpha,
        binding?.frameToken ?? 'phone-contact:crane-handoff'
      );
    } else {
      renderContactProgress(rootRef.current, frame.copyProgress);
    }
  }, []);

  const commands = useMemo<PhoneLeafCommandHandle>(() => Object.freeze({
    rebind(binding: PhoneLeafGenerationBinding) {
      const prior = bindingRef.current; bindingRef.current = binding;
      if (binding.segmentId === 'crane-contact' && (prior?.segmentId !== binding.segmentId || prior.direction !== binding.direction || prior.stageIndex !== binding.stageIndex)) render(binding.direction === 'reverse' ? 1 : 0); provePostPaint();
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
    settle(endpoint) {
      if (endpoint === 1) renderContactHold(rootRef.current);
      else render(0);
    },
    pause() {},
    dispose() {
      disposedRef.current = true;
      cancelPaint();
      bindingRef.current = null;
    }
  }), [cancelPaint, provePostPaint, render]);

  useLayoutEffect(() => {
    const mount = mountRef.current;
    const root = rootRef.current;
    if (!mount || !root) return;
    disposedRef.current = false;
    renderContactHold(root);
    reports.registerMount({
      root: mount,
      surfaces: [{ id: 'contact-root', element: root, kind: 'dom' }],
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
    <div ref={mountRef} className="phone-contact__visual"
      data-phone-native-mirror="contact">
      <ContactContent reading={false} registerRoot={(element) => {
        rootRef.current = element;
      }} />
    </div>
  );
}

export default PhoneContact;
export const phoneSceneId = 'contact' as const;

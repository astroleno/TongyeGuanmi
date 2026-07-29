import { describe, expect, it, vi } from 'vitest';
import {
  createPhoneAodPresentationGate,
  PHONE_AOD_PREPARE_TIMEOUT_MS,
  PHONE_AOD_PROGRESS_WATCHDOG_MS,
  type PhoneAodPresentationGateSession
} from './phone-aod-presentation-gate';
import type { PhoneExecutionToken } from './phone-story-state';

function session(
  identity: PhoneExecutionToken = ['authority', 'session', 3, 0, 1]
): PhoneAodPresentationGateSession & Readonly<{
  frame: ReturnType<typeof vi.fn>;
  evidence: ReturnType<typeof vi.fn>;
  progress: ReturnType<typeof vi.fn>;
  complete: ReturnType<typeof vi.fn>;
  fail: ReturnType<typeof vi.fn>;
}> {
  const frame = vi.fn();
  const evidence = vi.fn();
  const progress = vi.fn();
  const complete = vi.fn();
  const fail = vi.fn();
  return {
    identity,
    valid: () => true,
    reportFrame: frame,
    reportEvidence: evidence,
    reportProgress: progress,
    complete,
    fail,
    frame,
    evidence,
    progress
  };
}

describe('phone AOD presentation gate', () => {
  it('does not accept decoder liveness until a successful compositor frame arrives', async () => {
    const startAutoplay = vi.fn(async () => 'playing' as const);
    const value = session();
    const gate = createPhoneAodPresentationGate({
      startAutoplay,
      onReset: vi.fn()
    });

    gate.start(value);
    await Promise.resolve();
    gate.observeMediaProgress(.7, 1, value.identity);

    expect(value.evidence).not.toHaveBeenCalled();
    expect(value.frame).not.toHaveBeenCalled();
    expect(value.progress).not.toHaveBeenCalled();

    gate.reportCompositorFrame(.7, 1, value.identity);
    expect(value.evidence).toHaveBeenCalledOnce();
    expect(value.frame).toHaveBeenCalledOnce();
    expect(value.progress).toHaveBeenCalledWith(.7);
  });

  it('rejects an old compositor token after the active AOD session changes', async () => {
    const startAutoplay = vi.fn(async () => 'playing' as const);
    const oldSession = session(['authority', 'old', 3, 0, 1]);
    const nextSession = session(['authority', 'next', 4, 0, 1]);
    const gate = createPhoneAodPresentationGate({
      startAutoplay,
      onReset: vi.fn()
    });

    gate.start(oldSession);
    gate.start(nextSession);
    await Promise.resolve();
    gate.reportCompositorFrame(.4, 1, oldSession.identity);

    expect(oldSession.frame).not.toHaveBeenCalled();
    expect(nextSession.frame).not.toHaveBeenCalled();

    gate.reportCompositorFrame(.4, 1, nextSession.identity);
    expect(nextSession.frame).toHaveBeenCalledOnce();
  });

  it('keeps a blocked decoder retryable only through a gesture retry', async () => {
    const startAutoplay = vi.fn()
      .mockResolvedValueOnce('blocked')
      .mockResolvedValueOnce('playing');
    const value = session();
    const gate = createPhoneAodPresentationGate({
      startAutoplay,
      onReset: vi.fn()
    });

    gate.start(value);
    await Promise.resolve();

    expect(gate.retryFromGesture()).toBe(true);
    await Promise.resolve();
    expect(startAutoplay).toHaveBeenCalledTimes(2);
    expect(startAutoplay).toHaveBeenNthCalledWith(2, 1, value.identity);
  });

  it('fails when a decoder advances without any packed-canvas draw', async () => {
    vi.useFakeTimers();
    try {
      const startAutoplay = vi.fn(async () => 'playing' as const);
      const reset = vi.fn();
      const value = session();
      const gate = createPhoneAodPresentationGate({ startAutoplay, onReset: reset });

      gate.start(value);
      await Promise.resolve();
      gate.observeMediaProgress(.95, 1, value.identity);
      vi.advanceTimersByTime(PHONE_AOD_PREPARE_TIMEOUT_MS);

      expect(value.fail).toHaveBeenCalledOnce();
      expect(reset).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not let media-only updates mask a lost compositor after first frame', async () => {
    vi.useFakeTimers();
    try {
      const startAutoplay = vi.fn(async () => 'playing' as const);
      const value = session();
      const gate = createPhoneAodPresentationGate({
        startAutoplay,
        onReset: vi.fn()
      });

      gate.start(value);
      await Promise.resolve();
      gate.reportCompositorFrame(.1, 1, value.identity);
      gate.observeMediaProgress(.9, 1, value.identity);
      vi.advanceTimersByTime(PHONE_AOD_PROGRESS_WATCHDOG_MS);

      expect(value.fail).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('requires a terminal compositor frame before it releases the transaction', async () => {
    const value = session();
    const gate = createPhoneAodPresentationGate({
      startAutoplay: async () => 'playing',
      onReset: vi.fn()
    });

    gate.start(value);
    await Promise.resolve();
    gate.reportCompositorFrame(.8, 1, value.identity);
    gate.complete(1, value.identity);
    expect(value.complete).not.toHaveBeenCalled();

    gate.reportCompositorFrame(1, 1, value.identity);
    gate.complete(1, value.identity);
    expect(value.complete).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  createFrameLockRolloutPresenter,
  createPhoneFrameLockRolloutPresenter,
  FRAME_LOCK_MIGRATION_EVIDENCE,
  isFrameLockDisabled
} from './frame-lock-rollout';
import type { SegmentProgressRequest } from '../story/types';
import type { PhoneMediaFrameRequest } from '../production/phone-story/protocol';

function request(): SegmentProgressRequest {
  return {
    runId: 'rollout:1',
    direction: 1,
    sequence: 3,
    desiredProgress: 0.75,
    signal: new AbortController().signal
  };
}

function phoneRequest(): PhoneMediaFrameRequest {
  return {
    frameToken: 'phone:frame:1', transactionId: 'phone', direction: -1,
    sequence: 4, desiredProgress: .8, signal: new AbortController().signal
  };
}

describe('frame-lock migration rollout helper', () => {
  it('detects only the explicit migration kill switch value', () => {
    expect(isFrameLockDisabled({ VITE_DISABLE_FRAME_LOCKED_MEDIA: '1' })).toBe(true);
    expect(isFrameLockDisabled({ VITE_DISABLE_FRAME_LOCKED_MEDIA: '0' })).toBe(false);
    expect(isFrameLockDisabled({})).toBe(false);
  });

  it('uses tolerant seek and returns migration-only evidence while disabled', async () => {
    const strictPresent = vi.fn();
    const legacySeek = vi.fn();
    const present = createFrameLockRolloutPresenter({
      strictPresent,
      legacySeek,
      env: { VITE_DISABLE_FRAME_LOCKED_MEDIA: '1' }
    });

    await expect(present(request())).resolves.toEqual({
      status: 'presented',
      runId: 'rollout:1',
      sequence: 3,
      desiredProgress: 0.75,
      presentedProgress: 0.75,
      evidence: FRAME_LOCK_MIGRATION_EVIDENCE
    });
    expect(legacySeek).toHaveBeenCalledWith(expect.objectContaining({ desiredProgress: 0.75 }));
    expect(strictPresent).not.toHaveBeenCalled();
  });

  it('uses strict presentation when the kill switch is absent', async () => {
    const strictReceipt = {
      status: 'presented' as const,
      runId: 'rollout:1' as const,
      sequence: 3,
      desiredProgress: 0.75,
      presentedProgress: 0.75,
      evidence: 'video-frame-callback' as const
    };
    const strictPresent = vi.fn(() => strictReceipt);
    const legacySeek = vi.fn();
    const present = createFrameLockRolloutPresenter({
      strictPresent,
      legacySeek,
      env: {}
    });

    await expect(present(request())).resolves.toEqual(strictReceipt);
    expect(strictPresent).toHaveBeenCalledOnce();
    expect(legacySeek).not.toHaveBeenCalled();
  });

  it('propagates a tolerant seek failure without falling back to playback', async () => {
    const present = createFrameLockRolloutPresenter({
      strictPresent: vi.fn(),
      legacySeek: () => { throw new Error('legacy seek failed'); },
      env: { VITE_DISABLE_FRAME_LOCKED_MEDIA: '1' }
    });

    await expect(present(request())).rejects.toThrow('legacy seek failed');
  });

  it('keeps phone kill-switch receipts migration-only and never invokes native playback', async () => {
    const strictPresent = vi.fn();
    const legacySeek = vi.fn();
    const present = createPhoneFrameLockRolloutPresenter({
      strictPresent, legacySeek, env: { VITE_DISABLE_FRAME_LOCKED_MEDIA: '1' }
    });
    await expect(present(phoneRequest())).resolves.toMatchObject({
      status: 'presented', frameToken: 'phone:frame:1', sequence: 4,
      presentedProgress: .8, evidence: FRAME_LOCK_MIGRATION_EVIDENCE
    });
    expect(legacySeek).toHaveBeenCalledOnce();
    expect(strictPresent).not.toHaveBeenCalled();
  });

  it('uses strict phone presentation when the kill switch is absent', async () => {
    const strictReceipt = {
      status: 'presented' as const, frameToken: 'phone:frame:1', sequence: 4,
      desiredProgress: .8, presentedProgress: .75,
      evidence: 'packed-canvas-draw' as const
    };
    const strictPresent = vi.fn(() => strictReceipt);
    const legacySeek = vi.fn();
    const present = createPhoneFrameLockRolloutPresenter({
      strictPresent, legacySeek, env: {}
    });
    await expect(present(phoneRequest())).resolves.toEqual(strictReceipt);
    expect(strictPresent).toHaveBeenCalledOnce();
    expect(legacySeek).not.toHaveBeenCalled();
  });
});

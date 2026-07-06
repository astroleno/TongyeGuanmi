import { describe, expect, it } from 'vitest';
import { createRecoveryPlan, firstStaticFallbackScene, recoveryTimeouts } from './recovery';

describe('recovery', () => {
  it('keeps the old MEDIA_READY timeout value', () => {
    expect(recoveryTimeouts.mediaReadyMs).toBe(1800);
  });

  it('falls back to the manifest static hero hold', () => {
    expect(firstStaticFallbackScene()).toBe('hero');
    expect(createRecoveryPlan('boot-failed', 'offline')).toMatchObject({
      fallbackScene: 'hero',
      reason: 'boot-failed',
      error: new Error('offline')
    });
  });
});

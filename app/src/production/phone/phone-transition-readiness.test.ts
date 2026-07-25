import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPhoneCapabilityRegistry,
  PhoneReadinessTimeoutError
} from './phone-transition-readiness';

afterEach(() => {
  vi.useRealTimers();
});

describe('phone run dependency readiness', () => {
  it('keeps the latest Strict Mode registration after stale cleanup', () => {
    const registry = createPhoneCapabilityRegistry<string, object>();
    const first = {};
    const second = {};
    const stale = registry.register('ph', 'group67-ph', first);
    registry.register('ph', 'group67-ph', second);

    stale.dispose();
    expect(registry.get('ph')).toBe(second);
    expect(() => registry.register('ph', 'other-owner', {})).toThrow(
      'Phone capability ph already belongs to group67-ph'
    );
  });

  it('resolves only after every mounted handle in the closure is present', async () => {
    const registry = createPhoneCapabilityRegistry<string, object>();
    const controller = new AbortController();
    const ready = registry.waitFor(
      ['ph', 'education', 'ph-education'],
      { signal: controller.signal, timeoutMs: 1000 }
    );

    registry.register('ph', 'ph', {});
    registry.register('education', 'education', {});
    let settled = false;
    void ready.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    registry.register('ph-education', 'ph-education', {});
    await expect(ready).resolves.toBeUndefined();
  });

  it('times out with a typed retryable readiness result', async () => {
    vi.useFakeTimers();
    const registry = createPhoneCapabilityRegistry<string, object>();
    const controller = new AbortController();
    const ready = registry.waitFor(
      ['ph', 'education'],
      { signal: controller.signal, timeoutMs: 300 }
    );
    const rejected = expect(ready).rejects.toBeInstanceOf(
      PhoneReadinessTimeoutError
    );

    await vi.advanceTimersByTimeAsync(300);
    await rejected;
  });

  it('pins a complete closure until its run lease releases', () => {
    const registry = createPhoneCapabilityRegistry<string, object>();
    const first = registry.retain(['ph', 'education', 'ph-education']);
    const second = registry.retain(['education', 'ph-education']);

    expect(registry.retained()).toEqual([
      'ph',
      'education',
      'ph-education'
    ]);
    first.dispose();
    expect(registry.retained()).toEqual(['education', 'ph-education']);
    second.dispose();
    expect(registry.retained()).toEqual([]);
  });
});

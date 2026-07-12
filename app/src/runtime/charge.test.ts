import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHARGE_DECAY_PER_MS,
  DEFAULT_CHARGE_THRESHOLD,
  applyChargeDelta,
  createChargeState,
  createQueuedIntent,
  mergeQueuedIntent,
  sampleCharge,
  sampleQueuedIntent
} from './charge';

describe('charge accumulator', () => {
  it('uses the old threshold and decay constants', () => {
    expect(DEFAULT_CHARGE_THRESHOLD).toBe(0.1);
    expect(DEFAULT_CHARGE_DECAY_PER_MS).toBe(0.001);
  });

  it('fires when accumulated delta reaches 10vh', () => {
    const first = applyChargeDelta(createChargeState(0), 0.04, 0);
    const second = applyChargeDelta(first.state, 0.07, 10);

    expect(first.fired).toBeNull();
    expect(second.fired).toBe(1);
    expect(second.state.value).toBe(0);
  });

  it('tolerates cross-browser floating-point drift at 10svh without accepting 9.9svh', () => {
    expect(applyChargeDelta(createChargeState(0), 0.1 - 1e-12, 0).fired).toBe(1);
    expect(applyChargeDelta(createChargeState(0), 0.099, 0).fired).toBeNull();
  });

  it('decays accumulated value at 0.001 per ms', () => {
    const charged = applyChargeDelta(createChargeState(0), 0.09, 0);
    const sampled = sampleCharge(charged.state, 20);

    expect(sampled.value).toBeCloseTo(0.07);
  });

  it('merges queued intent with ttl and opposite-direction cancellation', () => {
    const first = mergeQueuedIntent(undefined, 0.07, 100);
    const second = mergeQueuedIntent(first, -0.04, 120);
    const third = mergeQueuedIntent(second, -0.09, 130);

    expect(first).toMatchObject({ direction: 1, strength: 0.07, deadline: 520 });
    expect(second).toMatchObject({ direction: 1 });
    expect(second?.strength).toBeCloseTo(0.01);
    expect(third).toMatchObject({ direction: -1 });
    expect(third?.strength).toBeCloseTo(0.09);
  });

  it('expires queued intent after 420ms', () => {
    const intent = createQueuedIntent(1, 0.2, 0);

    expect(sampleQueuedIntent(intent, 421)).toBeNull();
  });
});

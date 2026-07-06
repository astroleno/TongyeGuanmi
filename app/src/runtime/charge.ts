import type { Direction, QueuedIntent } from '../story/types';

export const DEFAULT_CHARGE_THRESHOLD = 0.1;
export const DEFAULT_CHARGE_DECAY_PER_MS = 0.001;
export const DEFAULT_QUEUED_INTENT_TTL_MS = 420;

export type ChargeState = {
  value: number;
  updatedAt: number;
  threshold: number;
  decayRatePerMs: number;
};

export type ChargeUpdate = {
  state: ChargeState;
  fired: Direction | null;
};

export function createChargeState(
  now = 0,
  threshold = DEFAULT_CHARGE_THRESHOLD,
  decayRatePerMs = DEFAULT_CHARGE_DECAY_PER_MS
): ChargeState {
  return {
    value: 0,
    updatedAt: now,
    threshold,
    decayRatePerMs
  };
}

export function directionOf(value: number): Direction {
  return value >= 0 ? 1 : -1;
}

export function decaySignedValue(value: number, elapsedMs: number, decayRatePerMs: number): number {
  const decayed = Math.max(0, Math.abs(value) - Math.max(0, elapsedMs) * decayRatePerMs);
  if (decayed === 0) {
    return 0;
  }
  return directionOf(value) * decayed;
}

export function sampleCharge(state: ChargeState, now: number): ChargeState {
  return {
    ...state,
    value: decaySignedValue(state.value, now - state.updatedAt, state.decayRatePerMs),
    updatedAt: now
  };
}

export function applyChargeDelta(state: ChargeState, delta: number, now: number): ChargeUpdate {
  const sampled = sampleCharge(state, now);
  const nextValue = sampled.value + delta;
  if (Math.abs(nextValue) >= sampled.threshold) {
    return {
      fired: directionOf(nextValue),
      state: {
        ...sampled,
        value: 0
      }
    };
  }

  return {
    fired: null,
    state: {
      ...sampled,
      value: nextValue
    }
  };
}

export function createQueuedIntent(
  direction: Direction,
  strength: number,
  now: number,
  ttlMs = DEFAULT_QUEUED_INTENT_TTL_MS,
  decayRatePerMs = DEFAULT_CHARGE_DECAY_PER_MS
): QueuedIntent {
  return {
    direction,
    strength: Math.max(0, strength),
    deadline: now + ttlMs,
    updatedAt: now,
    ttlMs,
    decayRatePerMs
  };
}

export function sampleQueuedIntent(intent: QueuedIntent, now: number): QueuedIntent | null {
  if (now > intent.deadline) {
    return null;
  }
  const strength = Math.max(0, intent.strength - Math.max(0, now - intent.updatedAt) * intent.decayRatePerMs);
  if (strength === 0) {
    return null;
  }
  return {
    ...intent,
    strength,
    updatedAt: now
  };
}

export function mergeQueuedIntent(
  intent: QueuedIntent | undefined,
  delta: number,
  now: number,
  ttlMs = DEFAULT_QUEUED_INTENT_TTL_MS,
  decayRatePerMs = DEFAULT_CHARGE_DECAY_PER_MS
): QueuedIntent | undefined {
  const sampled = intent ? sampleQueuedIntent(intent, now) : null;
  const nextSigned = (sampled ? sampled.direction * sampled.strength : 0) + delta;
  if (nextSigned === 0) {
    return undefined;
  }

  return createQueuedIntent(directionOf(nextSigned), Math.abs(nextSigned), now, ttlMs, decayRatePerMs);
}

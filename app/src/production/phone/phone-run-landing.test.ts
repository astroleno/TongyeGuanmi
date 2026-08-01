import { describe, expect, it } from 'vitest';
import { resolvePhoneRunLanding } from './phone-run-landing';

describe('orchestrator-owned phone run landing', () => {
  it.each([
    ['aod-semantic-edge', 1, 'forward', 740, 800, undefined, 800],
    ['aod-semantic-edge', -1, 'reverse', 740, 800, undefined, 800],
    ['authored-boundary', 1, 'forward', 740, 800, undefined, 800],
    ['authored-boundary', -1, 'reverse', 740, 800, undefined, 740],
    ['authored-boundary', -1, 'rollback', 900, 800, undefined, 800],
    ['preserve-composite', 1, 'direct-entry', 740, 800, 612, 612],
    ['preserve-composite', -1, 'rollback', 740, 800, 612, 612]
  ] as const)('resolves %s %s %s without a generic fallback', (
    policy,
    direction,
    _reason,
    currentY,
    boundaryY,
    compositeY,
    expected
  ) => {
    expect(resolvePhoneRunLanding({
      policy,
      direction,
      currentY,
      boundaryY,
      compositeY
    })).toBe(expected);
  });

  it('commits an authored reverse run at its registered target marker', () => {
    expect(resolvePhoneRunLanding({
      policy: 'authored-boundary',
      direction: -1,
      currentY: 5_619,
      boundaryY: 5_619,
      targetY: 4_051
    } as Parameters<typeof resolvePhoneRunLanding>[0])).toBe(4_051);
  });

  it('[AOD→Method execution cutover] keeps the source boundary for admission but lands the completed forward target', () => {
    expect(resolvePhoneRunLanding({
      policy: 'aod-semantic-edge',
      direction: 1,
      currentY: 1_382,
      boundaryY: 1_382,
      targetY: 1_728
    } as Parameters<typeof resolvePhoneRunLanding>[0])).toBe(1_728);
    expect(resolvePhoneRunLanding({
      policy: 'aod-semantic-edge',
      direction: -1,
      currentY: 1_728,
      boundaryY: 1_382,
      targetY: 1_728
    } as Parameters<typeof resolvePhoneRunLanding>[0])).toBe(1_382);
  });
});

import assert from 'node:assert/strict';
import {
  CLEAN_CUTOVER_BASELINE_BYTES,
  CLEAN_CUTOVER_MAX_LAZY_LEAF_BYTES,
  PERFORMANCE_BUDGETS,
  performanceBudgetViolations,
  performanceCutoverBaseline
} from './verify-performance-budgets.mjs';

const { test } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test');

function actual(overrides = {}) {
  return {
    initialJsRawBytes: 1,
    initialJsGzipBytes: 1,
    initialCssRawBytes: 1,
    desktopJsRawBytes: PERFORMANCE_BUDGETS.desktopJsRawBytes - 4096,
    phoneJsRawBytes: PERFORMANCE_BUDGETS.phoneJsRawBytes,
    totalJsRawBytes: PERFORMANCE_BUDGETS.totalJsRawBytes,
    largestLazyJsRawBytes: 1,
    loaderInkLazyJsRawBytes: 1,
    totalAssetBytes: 1,
    largestAssetBytes: 1,
    ...overrides
  };
}

test('phone and total JavaScript pass at the device-contract 665,600-byte cap', () => {
  assert.deepEqual(performanceBudgetViolations(actual()), []);
});

test('phone and total JavaScript fail only above the immutable cap', () => {
  assert.deepEqual(
    performanceBudgetViolations(actual({ phoneJsRawBytes: 665_601 })),
    ['phoneJsRawBytes exceeded: 665601 > 665600']
  );
  assert.deepEqual(
    performanceBudgetViolations(actual({ totalJsRawBytes: 665_601 })),
    ['totalJsRawBytes exceeded: 665601 > 665600']
  );
});

test('phone and total headroom below 4 KiB is informational', () => {
  assert.deepEqual(performanceBudgetViolations(actual({
    phoneJsRawBytes: 665_599,
    totalJsRawBytes: 665_599
  })), []);
});

test('desktop headroom below 4 KiB remains a build failure', () => {
  assert.deepEqual(
    performanceBudgetViolations(actual({
      desktopJsRawBytes: PERFORMANCE_BUDGETS.desktopJsRawBytes - 4095
    })),
    ['desktopJsHeadroomBytes below required headroom: 4095 < 4096']
  );
});

test('records the first clean cutover bundle and largest lazy leaf as report-only baselines', () => {
  assert.equal(CLEAN_CUTOVER_BASELINE_BYTES, 604_751);
  assert.equal(CLEAN_CUTOVER_MAX_LAZY_LEAF_BYTES, 50_892);
  assert.deepEqual(performanceCutoverBaseline(actual({
    phoneJsRawBytes: 604_800,
    largestLazyJsRawBytes: 50_900
  })), {
    cleanCutoverBaselineBytes: 604_751,
    cleanCutoverMaxLazyLeafBytes: 50_892,
    phoneJsDeltaFromCleanCutoverBytes: 49,
    largestLazyDeltaFromCleanCutoverBytes: 8,
    status: 'warning'
  });
  assert.deepEqual(performanceBudgetViolations(actual({
    phoneJsRawBytes: 604_800,
    largestLazyJsRawBytes: 50_900
  })), []);
});

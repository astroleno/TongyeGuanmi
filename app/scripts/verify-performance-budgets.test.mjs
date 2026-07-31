import assert from 'node:assert/strict';
import {
  PERFORMANCE_BUDGETS,
  performanceBudgetViolations
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

test('phone and total JavaScript pass at the immutable 663,552-byte cap', () => {
  assert.deepEqual(performanceBudgetViolations(actual()), []);
});

test('phone and total JavaScript fail only above the immutable cap', () => {
  assert.deepEqual(
    performanceBudgetViolations(actual({ phoneJsRawBytes: 663_553 })),
    ['phoneJsRawBytes exceeded: 663553 > 663552']
  );
  assert.deepEqual(
    performanceBudgetViolations(actual({ totalJsRawBytes: 663_553 })),
    ['totalJsRawBytes exceeded: 663553 > 663552']
  );
});

test('phone and total headroom below 4 KiB is informational', () => {
  assert.deepEqual(performanceBudgetViolations(actual({
    phoneJsRawBytes: 663_551,
    totalJsRawBytes: 663_551
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

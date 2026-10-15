import { describe, expect, it } from 'vitest';
import { percentile95, SCROLL_PERFORMANCE_SEGMENTS, summarizeScrollPerformance } from './scroll-performance-metrics.mjs';

function healthyRun() {
  const id = 'hero-pattern';
  const samples = Array.from({ length: 601 }, (_, index) => ({
    time: index * 10000 / 600, interval: 10000 / 600,
    desired: .2 + index * .6 / 600, documentPose: .2 + index * .6 / 600,
    presented: .2 + index * .6 / 600 - .001, rangeId: id,
    epoch: 1, presentedEpoch: 1, visible: true,
    videos: [{ target: index / 600, sourceTime: index / 600, paused: true }]
  }));
  return { id, samples, longTasks: [], longTasksSupported: true, convergenceMs: 20,
    final: { desired: { rangeId: id, progress: .8 }, presented: { progress: .8, epoch: 1 }, intent: { epoch: 1 },
      pending: false, view: { status: 'ready', error: null } } };
}

describe('continuous-scroll performance evidence', () => {
  it('covers the eight approved representative segments including the shader path', () => {
    expect(SCROLL_PERFORMANCE_SEGMENTS).toHaveLength(8);
    expect(SCROLL_PERFORMANCE_SEGMENTS).toContain('pattern-star-map');
  });
  it('passes complete supported evidence against the original budgets', () => {
    expect(summarizeScrollPerformance(healthyRun())).toMatchObject({ passed: true, measuredPassed: true, unavailable: [], failures: [] });
  });
  it('does not turn empty, partial or non-finite sampling into zero latency', () => {
    expect(percentile95([])).toBeNull();
    expect(percentile95([16, NaN])).toBeNull();
    for (const samples of [[], healthyRun().samples.slice(0, 60), healthyRun().samples.map(s => ({ ...s, presented: null })),
      healthyRun().samples.map(s => ({ ...s, desired: NaN }))]) {
      expect(summarizeScrollPerformance({ ...healthyRun(), samples }).passed).toBe(false);
    }
  });
  it('keeps unsupported long-task measurements explicitly incomplete', () => {
    expect(summarizeScrollPerformance({ ...healthyRun(), longTasksSupported: false })).toMatchObject({
      passed: false, measuredPassed: true, unavailable: ['longTasks'], metrics: { over50msTasks: null }
    });
  });
  it('rejects measured long tasks without changing the 50ms boundary', () => {
    expect(summarizeScrollPerformance({ ...healthyRun(), longTasks: [{ duration: 50 }] }).passed).toBe(true);
    expect(summarizeScrollPerformance({ ...healthyRun(), longTasks: [{ duration: 50.01 }] }).failures).toContain('longTasks');
    expect(summarizeScrollPerformance({ ...healthyRun(), longTasks: [{ duration: NaN }] }).passed).toBe(false);
  });
  it.each(['hidden', 'wrong-range', 'stale-epoch'])('rejects %s samples', (mode) => {
    const run = healthyRun();
    Object.assign(run.samples[200], mode === 'hidden' ? { visible: false } : mode === 'wrong-range'
      ? { rangeId: 'ttg-lab' } : { presentedEpoch: 0 });
    expect(summarizeScrollPerformance(run).failures).toContain('completeVisibleSampling');
  });
  it('keeps frame pacing, video lag, stopped convergence and paused media independent', () => {
    const run = healthyRun();
    expect(summarizeScrollPerformance({ ...run, samples: run.samples.map(s => ({ ...s, interval: 21 })) }).failures).toContain('rafInterval');
    expect(summarizeScrollPerformance({ ...run, samples: run.samples.map(s => ({ ...s, presented: s.desired - .01 })) }).failures).toContain('poseLag');
    expect(summarizeScrollPerformance({ ...run, convergenceMs: 151 }).failures).toContain('convergence');
    run.samples[200].videos[0].paused = false;
    expect(summarizeScrollPerformance(run).failures).toContain('videosPaused');
  });
  it('requires the final pose to belong to the requested range and current intent', () => {
    for (const patch of [{ desired: { rangeId: 'ttg-lab', progress: .8 } }, { desired: { rangeId: 'hero-pattern', progress: .6 } },
      { presented: { progress: .8, epoch: 0 } },
      { presented: null }, { pending: true }, { view: { status: 'ready', error: 'decoder failed' } }]) {
      const run = healthyRun();
      expect(summarizeScrollPerformance({ ...run, final: { ...run.final, ...patch } }).failures).toContain('finalPose');
    }
  });
});

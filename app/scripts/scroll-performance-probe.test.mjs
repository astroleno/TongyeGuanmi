import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureScrollBaseline, measureScrollSegment } from './scroll-performance-probe.mjs';
import { summarizeScrollPerformance } from './scroll-performance-metrics.mjs';

function installPage({ supported = true, hidden = false } = {}) {
  let now = 20000;
  const range = { id: 'pattern-star-map', start: 1000, end: 6000 };
  const video = { currentTime: 1, readyState: 4, seeking: false, paused: true,
    dataset: { timelineVideoTarget: '1', timelineVideoPresentedTime: '1', timelineVideoSourceTime: '1', timelineVideoFrameEvidence: 'rvfc' } };
  const canvas = { dataset: { packedAlphaMediaTime: '1', packedAlphaGeneration: '2', packedAlphaFrame: '3', packedAlphaFrameReady: 'true' } };
  const window = { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1, scrollY: 2000,
    location: { href: 'about:blank' } };
  window.scrollTo = (_x, y) => { window.scrollY = y; };
  window.__r5ScrollStory = {
    index: () => ({ ranges: [range] }),
    snapshot: () => ({ desired: { rangeId: range.id, progress: (window.scrollY - range.start) / 5000, scroll: window.scrollY },
      presented: { progress: (window.scrollY - range.start) / 5000, epoch: 1 },
      intent: { epoch: 1 }, pending: false, view: { status: 'ready', error: null } })
  };
  const observer = { observe: vi.fn(), takeRecords: vi.fn(() => [{ startTime: 22000, duration: 51 }]), disconnect: vi.fn() };
  class Observer {
    static supportedEntryTypes = supported ? ['longtask'] : [];
    constructor() { return observer; }
  }
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', { hidden, hasFocus: () => true, querySelectorAll: selector => selector === '.story-scroll video' ? [video] : [canvas] });
  vi.stubGlobal('PerformanceObserver', Observer);
  vi.stubGlobal('performance', { now: () => now + 5 });
  vi.stubGlobal('requestAnimationFrame', callback => queueMicrotask(() => { now += 1000 / 60; callback(now); }));
  return { window, observer };
}

afterEach(() => vi.unstubAllGlobals());

describe('shared original scroll performance sampling', () => {
  it('keeps the complete ten-second RAF baseline and capability provenance', async () => {
    installPage({ supported: false });
    const result = await measureScrollBaseline();
    expect(result).toMatchObject({ url: 'about:blank', visible: true, longTasksSupported: false });
    expect(result.intervals.length).toBeGreaterThanOrEqual(600);
    expect(result.intervals[0]).toBe(0);
    expect(result.intervals.reduce((sum, value) => sum + value, 0)).toBeGreaterThanOrEqual(10000);
  });
  it('uses one RAF clock for a reachable integer-pixel 20-to-80-percent sweep', async () => {
    installPage({ supported: false });
    const result = await measureScrollSegment('pattern-star-map');
    expect(result.samples[0]).toMatchObject({ time: 0, interval: 0, documentScroll: 2000, desired: .2 });
    expect(result.samples.at(-1).time).toBeGreaterThanOrEqual(10000);
    expect(result.samples.every(sample => sample.interval >= 0 && Number.isInteger(sample.documentScroll))).toBe(true);
    expect(result.final.desired.progress).toBeCloseTo(.8, 5);
    expect(summarizeScrollPerformance(result)).toMatchObject({ measuredPassed: true, passed: false, unavailable: ['longTasks'] });
  });
  it('retains source-frame, canvas, epoch, viewport and focus evidence', async () => {
    installPage();
    const result = await measureScrollSegment('pattern-star-map');
    expect(result.samples[0]).toMatchObject({ visible: true, epoch: 1, presentedEpoch: 1,
      viewport: { width: 1440, height: 900, dpr: 1, focused: true },
      videos: [{ sourceTime: 1, presentedTime: 1, target: 1, evidence: 'rvfc', paused: true }],
      canvases: [{ time: 1, kind: 'packed-alpha', generation: 2, frame: '3', ready: 'true' }] });
    expect(result.resources).toEqual({ videos: 1, canvases: 1 });
  });
  it('drains and disconnects the actual observer and preserves measured long tasks', async () => {
    const { observer } = installPage();
    const result = await measureScrollSegment('pattern-star-map');
    expect(observer.observe).toHaveBeenCalledWith({ type: 'longtask', buffered: false });
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(result.longTasks).toEqual([{ startTime: 22000, duration: 51 }]);
    expect(summarizeScrollPerformance(result).failures).toContain('longTasks');
  });
  it('does not turn a hidden page into passing visible samples', async () => {
    installPage({ hidden: true });
    const result = await measureScrollSegment('pattern-star-map');
    expect(summarizeScrollPerformance(result).failures).toContain('completeVisibleSampling');
  });
});

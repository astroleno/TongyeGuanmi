// @vitest-environment jsdom
/* global document, window, HTMLCanvasElement */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScrollMemoryTraversal,
  installScrollMemoryProbe,
  isScrollMemoryPoseReady,
  readScrollMemorySnapshot,
  SCROLL_MEMORY_BUDGETS,
  SCROLL_MEMORY_SCENES,
  seekScrollMemoryPose,
  summarizeScrollMemory
} from './r5-scroll-memory.mjs';

function ranges() {
  let cursor = 0;
  return SCROLL_MEMORY_SCENES.flatMap((scene, index) => {
    const start = cursor;
    if (index % 2 === 0) cursor += 100;
    const hold = { id: `hold:${scene}`, kind: 'hold', scene, target: scene, segment: null, start, end: cursor };
    if (index === 15) return [hold];
    const id = `${scene}-${SCROLL_MEMORY_SCENES[index + 1]}`;
    const segment = { id, kind: 'segment', scene, target: SCROLL_MEMORY_SCENES[index + 1],
      segment: id, start: cursor, end: cursor + 200 };
    cursor = segment.end;
    return [hold, segment];
  });
}

function readyState() {
  return { desired: { rangeId: 'hero-pattern', progress: 0.25, scene: 'hero', target: 'pattern' },
    presented: { progress: 0.25, epoch: 2 }, intent: { epoch: 2 }, pending: false,
    view: { status: 'ready', error: null } };
}

function validEvidence() {
  const plan = createScrollMemoryTraversal(ranges());
  const sample = (point) => ({ ...point, usedJsHeapBytes: 100, mountedLayers: 2,
    desired: { kind: point.checkpoint === 'segment' || point.measurementPhase === 'segment-landmark' ? 'segment' : 'hold' },
    webglCanvases: point.checkpoint === 'hold' ? 1 : 2, canvasPixelBytes: 1000,
    videos: [{ paused: true, seeking: false }] });
  const all = [...plan.forward, ...plan.reverse].map(sample);
  const holds = all.filter((point) => point.checkpoint === 'hold');
  holds.splice(16, 0, { ...sample(plan.forward.at(-1)), direction: 'forward-settled', usedJsHeapBytes: 80 });
  holds.push({ ...sample(plan.reverse.at(-1)), direction: 'reverse-settled', usedJsHeapBytes: 80 });
  return { holds, poses: all.filter((point) => point.checkpoint === 'segment'),
    heapSamples: [{ usedJsHeapBytes: 100 }],
    processSamples: [{ totalRssBytes: 1000, gpuRssBytes: 200, rendererRssBytes: 400 }] };
}

describe('continuous-scroll memory traversal', () => {
  it('covers every chapter and three poses of every segment in both directions', () => {
    const plan = createScrollMemoryTraversal(ranges());
    expect(plan.forward).toHaveLength(61);
    expect(plan.reverse).toHaveLength(60);
    expect(plan.forward.filter((point) => point.checkpoint === 'hold').map((point) => point.scene))
      .toEqual(SCROLL_MEMORY_SCENES);
    expect(plan.reverse.filter((point) => point.checkpoint === 'hold').map((point) => point.scene))
      .toEqual([...SCROLL_MEMORY_SCENES].reverse().slice(1));
    expect(plan.forward.filter((point) => point.scene === 'pattern' && point.checkpoint === 'hold'))
      .toEqual([{ checkpoint: 'hold', scene: 'pattern', measurementPhase: 'segment-landmark', rangeId: 'pattern-star-map', progress: 0, direction: 'forward' }]);
    expect(plan.reverse.slice(0, 3).map((point) => point.progress)).toEqual([0.75, 0.5, 0.25]);
    expect(plan.forward.at(-1)).toMatchObject({ rangeId: 'hold:contact', progress: 0 });
  });

  it('fails closed for missing, reordered, discontinuous or invalid ranges', () => {
    expect(() => createScrollMemoryTraversal(ranges().slice(1))).toThrow('16 holds');
    const reordered = ranges(); reordered[2].scene = 'hero';
    expect(() => createScrollMemoryTraversal(reordered)).toThrow('hold:pattern');
    const gap = ranges(); gap[1].start += 1;
    expect(() => createScrollMemoryTraversal(gap)).toThrow('contiguous');
    const zero = ranges(); zero[1].end = zero[1].start;
    expect(() => createScrollMemoryTraversal(zero)).toThrow('invalid scroll range');
    const invalid = ranges(); invalid[0].end = NaN;
    expect(() => createScrollMemoryTraversal(invalid)).toThrow('invalid scroll range');
  });
});

describe('browser memory observation', () => {
  let originalCreateElement;
  let originalCreateElementNS;
  beforeEach(() => {
    originalCreateElement = document.createElement;
    originalCreateElementNS = document.createElementNS;
    document.body.replaceChildren();
  });
  afterEach(() => {
    document.createElement = originalCreateElement;
    document.createElementNS = originalCreateElementNS;
    delete window.__r5MemoryProbe;
    delete window.__r5ScrollStory;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('waits for the actual presented pose and current epoch, not merely view ready', () => {
    const state = readyState();
    window.__r5ScrollStory = { snapshot: () => state };
    const point = { rangeId: 'hero-pattern', progress: 0.25 };
    expect(isScrollMemoryPoseReady(point)).toBe(true);
    state.presented.progress = 0.1;
    expect(isScrollMemoryPoseReady(point)).toBe(false);
    state.presented.progress = 0.25; state.presented.epoch = 1;
    expect(isScrollMemoryPoseReady(point)).toBe(false);
    state.presented.epoch = 2; state.pending = true;
    expect(isScrollMemoryPoseReady(point)).toBe(false);
    state.pending = false; state.view = { status: 'failed', error: 'decoder failed' };
    expect(() => isScrollMemoryPoseReady(point)).toThrow('decoder failed');
  });

  it('uses the live continuous document index for positioning', () => {
    const seek = vi.fn();
    window.__r5ScrollStory = { index: () => ({ ranges: [{ id: 'segment', start: 100, end: 300 }] }), seek };
    seekScrollMemoryPose({ rangeId: 'segment', progress: 0.25 });
    expect(seek).toHaveBeenCalledWith(150);
    expect(() => seekScrollMemoryPose({ rangeId: 'missing', progress: 0.25 })).toThrow('unavailable');
  });

  it('waits for a reachable scroll pixel without loosening the presented-pose tolerance', () => {
    const seek = vi.fn();
    window.__r5ScrollStory = { index: () => ({ ranges: [{ id: 'hero-pattern', start: 450, end: 2475 }] }), seek };
    const goal = seekScrollMemoryPose({ rangeId: 'hero-pattern', progress: 0.25 });
    expect(seek).toHaveBeenCalledWith(956);
    expect(goal.requestedProgress).toBe(0.25);
    expect(goal.progress).toBe((956 - 450) / 2025);
    window.__r5ScrollStory.snapshot = () => ({ ...readyState(), desired: { ...readyState().desired, progress: goal.progress },
      presented: { ...readyState().presented, progress: goal.progress } });
    expect(isScrollMemoryPoseReady(goal)).toBe(true);
    expect(isScrollMemoryPoseReady({ rangeId: 'hero-pattern', progress: 0.25 })).toBe(false);
  });

  it('observes duplicate, retired and off-DOM GL without allocating any extra contexts', () => {
    let lost = false;
    const context = { isContextLost: () => lost };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    class OffscreenProbe {
      width = 4; height = 4;
      getContext() { return { isContextLost: () => false }; }
    }
    vi.stubGlobal('OffscreenCanvas', OffscreenProbe);
    installScrollMemoryProbe();
    expect(window.__r5MemoryProbe.sample().webglContexts).toBe(0);
    expect(getContext).not.toHaveBeenCalled();
    const canvas = document.createElement('canvas');
    canvas.getContext('webgl'); canvas.getContext('webgl');
    const offscreen = new OffscreenProbe(); offscreen.getContext('webgl');
    expect(window.__r5MemoryProbe.sample()).toMatchObject({ webglContexts: 2 });
    expect(window.__r5MemoryProbe.sample().canvases).toHaveLength(2);
    expect(getContext).toHaveBeenCalledTimes(2);
    lost = true;
    expect(window.__r5MemoryProbe.sample().webglContexts).toBe(1);
    expect(getContext).toHaveBeenCalledTimes(2);
  });

  it('counts detached decoders until their source is actually released', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    installScrollMemoryProbe();
    const video = document.createElement('video');
    video.setAttribute('src', '/movie.mp4');
    expect(window.__r5MemoryProbe.sample().videos).toEqual([video]);
    video.removeAttribute('src');
    expect(window.__r5MemoryProbe.sample().videos).toEqual([]);
    document.body.append(video);
    expect(window.__r5MemoryProbe.sample().videos).toEqual([video]);
  });

  it('reports persistent reading DOM separately but includes leaked inactive media owners', () => {
    window.__r5ScrollStory = { snapshot: readyState };
    window.__r5MemoryProbe = { sample: () => ({ canvases: [], videos: [], webglContexts: 2 }) };
    for (const [scene, reading, media] of [
      ['hero', false, true], ['pattern', false, true],
      ['method-top', true, false], ['services', true, false], ['contact', true, true]
    ]) {
      const root = document.createElement('section');
      root.setAttribute('data-scroll-content', scene);
      root.setAttribute('data-scroll-reading', String(reading));
      root.append(document.createElement(media ? 'canvas' : 'p')); document.body.append(root);
    }
    const snapshot = readScrollMemorySnapshot();
    expect(snapshot.layoutSceneRoots).toHaveLength(5);
    expect(snapshot.readingSceneRoots).toEqual(['method-top', 'services', 'contact']);
    expect(snapshot.resourceSceneRoots).toEqual(['hero', 'pattern', 'contact']);
    expect(snapshot.mountedLayers).toBe(3);
    expect(snapshot.webglCanvases).toBe(2);
    expect(snapshot.canvasPixelBytes).toBe(3 * 300 * 150 * 4);
  });

  it('fails closed if the new runtime or instrumentation is absent', () => {
    expect(() => readScrollMemorySnapshot()).toThrow('unavailable');
    expect(isScrollMemoryPoseReady({ rangeId: 'hold:hero', progress: 0.5 })).toBe(false);
  });

  it('includes parser-created videos that never called document.createElement', () => {
    window.__r5ScrollStory = { snapshot: readyState };
    window.__r5MemoryProbe = { sample: () => ({ canvases: [], videos: [], webglContexts: 0 }) };
    document.body.innerHTML = '<video src="/static-video.mp4"></video>';
    expect(readScrollMemorySnapshot().videos).toHaveLength(1);
  });
});

describe('unchanged release memory limits', () => {
  it('passes complete observations and enforces the original numerical budgets', () => {
    expect(SCROLL_MEMORY_BUDGETS).toMatchObject({ peakBrowserTreeRssBytes: 1_500_000_000,
      peakJsHeapBytes: 192 * 1024 * 1024, maxMountedLayers: 3, maxWebglCanvasesAtHold: 1,
      maxWebglCanvasesInTransition: 2, maxVideosAtContact: 4 });
    expect(summarizeScrollMemory(validEvidence())).toMatchObject({ pass: true, reasons: [],
      actual: { maxMountedLayers: 2, maxWebglCanvasesAtHold: 1, maxWebglCanvasesInTransition: 2,
        peakJsHeapBytes: 100, finalJsHeapBytes: 80 } });
  });

  it.each(['totalRssBytes', 'gpuRssBytes', 'rendererRssBytes'])('rejects over-budget process %s', (field) => {
    const evidence = validEvidence(); evidence.processSamples[0][field] = 2_000_000_000;
    expect(summarizeScrollMemory(evidence).pass).toBe(false);
  });

  it.each(['mountedLayers', 'webglCanvases'])('rejects over-budget hold %s', (field) => {
    const evidence = validEvidence(); evidence.holds[0][field] = 4;
    expect(summarizeScrollMemory(evidence).pass).toBe(false);
  });

  it('rejects excess transition GL, excess Contact decoders and non-paused videos', () => {
    const transition = validEvidence(); transition.poses[0].webglCanvases = 3;
    expect(summarizeScrollMemory(transition).pass).toBe(false);
    const contact = validEvidence(); contact.holds.find((hold) => hold.scene === 'contact').videos
      = Array.from({ length: 5 }, () => ({ paused: true, seeking: false }));
    expect(summarizeScrollMemory(contact).pass).toBe(false);
    const playing = validEvidence(); playing.poses[0].videos[0].paused = false;
    expect(summarizeScrollMemory(playing).pass).toBe(false);
    const seeking = validEvidence(); seeking.holds[0].videos[0].seeking = true;
    expect(summarizeScrollMemory(seeking).pass).toBe(false);
  });

  it('measures preparation heap peaks and requires both endpoint heaps to settle', () => {
    const high = validEvidence(); high.heapSamples.push({ usedJsHeapBytes: 192 * 1024 * 1024 + 1 });
    expect(summarizeScrollMemory(high).pass).toBe(false);
    const unsettled = validEvidence(); unsettled.holds.find((hold) => hold.direction === 'forward-settled').usedJsHeapBytes = 95;
    expect(summarizeScrollMemory(unsettled).pass).toBe(false);
  });

  it('applies the unchanged transition cap at actual zero-length segment landmarks, never at a real hold', () => {
    const evidence = validEvidence();
    const landmark = evidence.holds.find((hold) => hold.measurementPhase === 'segment-landmark');
    landmark.webglCanvases = 2;
    expect(summarizeScrollMemory(evidence)).toMatchObject({ pass: true,
      actual: { maxWebglCanvasesAtHold: 1, maxWebglCanvasesAtLandmark: 2, maxWebglCanvasesInTransition: 2 } });
    landmark.webglCanvases = 3;
    expect(summarizeScrollMemory(evidence).pass).toBe(false);
    landmark.webglCanvases = 2; landmark.desired.kind = 'hold';
    expect(summarizeScrollMemory(evidence).pass).toBe(false);
    const hold = validEvidence(); hold.holds[0].webglCanvases = 2;
    expect(summarizeScrollMemory(hold).pass).toBe(false);
  });

  it('fails closed on missing heap, resource measurements, traversal or process samples', () => {
    const noHeap = validEvidence(); noHeap.heapSamples = [];
    expect(summarizeScrollMemory(noHeap).pass).toBe(false);
    const invalid = validEvidence(); delete invalid.holds[0].webglCanvases;
    expect(summarizeScrollMemory(invalid).pass).toBe(false);
    const incomplete = validEvidence(); incomplete.holds.pop(); incomplete.poses.pop();
    expect(summarizeScrollMemory(incomplete).pass).toBe(false);
    const wrongChapter = validEvidence(); wrongChapter.holds[0].scene = 'contact';
    expect(summarizeScrollMemory(wrongChapter).pass).toBe(false);
    const noProcess = validEvidence(); noProcess.processSamples = [];
    expect(summarizeScrollMemory(noProcess).pass).toBe(false);
  });
});

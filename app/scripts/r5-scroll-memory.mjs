/* global document, window, HTMLCanvasElement, OffscreenCanvas */

export const SCROLL_MEMORY_SCENES = Object.freeze([
  'hero', 'pattern', 'star-map', 'aod-animation', 'method-top',
  'figure2-animation', 'figure2-proof', 'brand', 'figure3-animation',
  'services', 'ttg-animation', 'lab', 'ph-animation', 'education',
  'crane-animation', 'contact'
]);

// These are the existing release budgets, not a new continuous-scroll allowance.
export const SCROLL_MEMORY_BUDGETS = Object.freeze({
  peakBrowserTreeRssBytes: 1_500_000_000,
  peakGpuProcessRssBytes: 512 * 1024 * 1024,
  peakRendererRssBytes: 1024 * 1024 * 1024,
  peakJsHeapBytes: 192 * 1024 * 1024,
  settledHeapFractionOfPeak: 0.9,
  maxMountedLayers: 3,
  maxWebglCanvasesAtHold: 1,
  maxWebglCanvasesInTransition: 2,
  maxVideosAtContact: 4
});

/** Zero-length holds are authored landmarks, represented by the outgoing
 * segment's frame zero. Do not invent scroll space or skip those chapters. */
export function createScrollMemoryTraversal(ranges) {
  if (!Array.isArray(ranges) || ranges.length !== 31) {
    throw new Error('memory traversal requires all 16 holds and 15 segments');
  }
  const holds = [];
  const segments = [];
  for (const [index, scene] of SCROLL_MEMORY_SCENES.entries()) {
    const hold = ranges[index * 2];
    const segment = ranges[index * 2 + 1];
    if (hold?.id !== `hold:${scene}` || hold.kind !== 'hold' || hold.scene !== scene
      || hold.target !== scene || hold.segment !== null) {
      throw new Error(`missing or reordered hold:${scene}`);
    }
    if (index < 15) {
      if (segment?.kind !== 'segment' || segment.scene !== scene
        || segment.target !== SCROLL_MEMORY_SCENES[index + 1]
        || typeof segment.id !== 'string' || segment.id !== segment.segment) {
        throw new Error(`missing or reordered segment after ${scene}`);
      }
      segments.push(segment);
    }
    for (const range of segment ? [hold, segment] : [hold]) {
      if (!Number.isFinite(range.start) || !Number.isFinite(range.end)
        || range.start < 0 || range.end < range.start
        || (range.kind === 'segment' && range.start === range.end)) {
        throw new Error(`invalid scroll range ${range.id}`);
      }
    }
    holds.push({
      checkpoint: 'hold', scene,
      measurementPhase: hold.end === hold.start && segment ? 'segment-landmark' : 'hold',
      rangeId: hold.end > hold.start || !segment ? hold.id : segment.id,
      progress: hold.end > hold.start ? 0.5 : 0
    });
  }
  if (ranges[0].start !== 0 || ranges.some((range, index) => (
    index > 0 && range.start !== ranges[index - 1].end
  )) || new Set(ranges.map((range) => range.id)).size !== ranges.length) {
    throw new Error('scroll memory ranges must form one contiguous, uniquely identified document axis');
  }
  const forward = [{ ...holds[0], direction: 'boot' }];
  for (const [index, segment] of segments.entries()) {
    for (const progress of [0.25, 0.5, 0.75]) {
      forward.push({ checkpoint: 'segment', scene: segment.scene,
        rangeId: segment.id, progress, direction: 'forward' });
    }
    forward.push({ ...holds[index + 1], direction: 'forward' });
  }
  const reverse = [];
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    for (const progress of [0.75, 0.5, 0.25]) {
      reverse.push({ checkpoint: 'segment', scene: segment.scene,
        rangeId: segment.id, progress, direction: 'reverse' });
    }
    reverse.push({ ...holds[index], direction: 'reverse' });
  }
  return { forward, reverse };
}

/** Runs before application code. Weak references are important: the observer
 * must not keep retired decoders or canvases alive. Never create a GL context
 * merely to count one; include shared off-DOM contexts as well as DOM output. */
export function installScrollMemoryProbe() {
  const contexts = [];
  const canvases = [];
  const videos = [];
  const seenContexts = new WeakSet();
  const seenCanvases = new WeakSet();
  const rememberCanvas = (canvas, context, kind) => {
    if (!context) return;
    if (!seenCanvases.has(canvas)) {
      seenCanvases.add(canvas); canvases.push(new WeakRef(canvas));
    }
    if (String(kind).includes('webgl') && !seenContexts.has(context)) {
      seenContexts.add(context); contexts.push(new WeakRef(context));
    }
  };
  for (const prototype of [HTMLCanvasElement.prototype,
    ...(typeof OffscreenCanvas === 'undefined' ? [] : [OffscreenCanvas.prototype])]) {
    const original = prototype.getContext;
    prototype.getContext = function (...args) {
      const context = original.apply(this, args);
      rememberCanvas(this, context, args[0]);
      return context;
    };
  }
  for (const method of ['createElement', 'createElementNS']) {
    const original = document[method];
    document[method] = function (...args) {
      const element = original.apply(this, args);
      if (element.localName === 'video') videos.push(new WeakRef(element));
      return element;
    };
  }
  const live = (entries) => {
    const values = [];
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const value = entries[index].deref();
      if (value) values.push(value);
      else entries.splice(index, 1);
    }
    return values;
  };
  window.__r5MemoryProbe = {
    sample: () => ({
      canvases: live(canvases),
      webglContexts: live(contexts).filter((gl) => !gl.isContextLost()).length,
      // currentSrc may retain a historical URL after remove-source + load().
      // Exclude only proven unloaded, detached handles: HAVE_NOTHING plus
      // NETWORK_EMPTY/NO_SOURCE and no attached URL/stream. Loading, decoded,
      // source-owned and unknown states still count against the original cap.
      videos: live(videos).filter((video) => video.isConnected || video.readyState !== 0
        || video.getAttribute('src') || video.srcObject
        || [...video.querySelectorAll('source')].some(source => source.getAttribute('src'))
        || ![0, 3].includes(video.networkState))
    })
  };
}

// Browser callbacks are self-contained for page.evaluate/addInitScript.
export function readScrollMemorySnapshot() {
  const story = window.__r5ScrollStory?.snapshot();
  const probe = window.__r5MemoryProbe?.sample();
  if (!story || !probe) throw new Error('continuous-scroll memory diagnostics are unavailable');
  const active = new Set([story.desired.scene, story.desired.target]);
  const roots = [...document.querySelectorAll('[data-scroll-content]')]
    .filter((root) => root.childElementCount > 0);
  const resourceRoots = roots.filter((root) => (
    root.getAttribute('data-scroll-reading') !== 'true'
    || active.has(root.getAttribute('data-scroll-content'))
    || root.querySelector('video,canvas') !== null
  ));
  const canvases = new Set([...document.querySelectorAll('canvas'), ...probe.canvases]);
  const videos = new Set([...document.querySelectorAll('video'), ...probe.videos]);
  return {
    ...story,
    layoutSceneRoots: roots.map((root) => root.getAttribute('data-scroll-content')),
    readingSceneRoots: roots.filter((root) => root.getAttribute('data-scroll-reading') === 'true')
      .map((root) => root.getAttribute('data-scroll-content')),
    resourceSceneRoots: resourceRoots.map((root) => root.getAttribute('data-scroll-content')),
    // Persistent reading DOM measures document height; it is not a media lease.
    // Unexpected inactive media owners still count against the original cap.
    mountedLayers: resourceRoots.length,
    webglCanvases: probe.webglContexts,
    canvasPixelBytes: [...canvases].reduce((total, canvas) => total + canvas.width * canvas.height * 4, 0),
    videos: [...videos].map((video) => ({
      connected: video.isConnected, paused: video.paused, seeking: video.seeking,
      readyState: video.readyState, time: video.currentTime,
      source: video.currentSrc || video.getAttribute('src') || ''
    }))
  };
}

export function seekScrollMemoryPose(point) {
  const api = window.__r5ScrollStory;
  const range = api?.index().ranges.find((entry) => entry.id === point.rangeId);
  if (!range) throw new Error(`memory checkpoint ${point.rangeId} is unavailable`);
  // Native scroll positions are pixel-quantized. Request a reachable pixel and
  // retain the authored percentage separately; do not relax pose convergence.
  const length = range.end - range.start;
  const scroll = Math.max(Math.ceil(range.start), Math.round(range.start + length * point.progress));
  api.seek(scroll);
  return { ...point, requestedProgress: point.progress, progress: length > 0 ? (scroll - range.start) / length : 0 };
}

export function isScrollMemoryPoseReady(point) {
  const state = window.__r5ScrollStory?.snapshot();
  if (state?.view.status === 'failed') {
    throw new Error(`memory checkpoint failed: ${state.view.error}`);
  }
  return Boolean(state && state.view.status === 'ready' && state.view.error === null
    && !state.pending && state.desired.rangeId === point.rangeId
    && Math.abs(state.desired.progress - point.progress) < 0.0001
    && state.presented?.epoch === state.intent.epoch
    && Math.abs(state.presented.progress - state.desired.progress) < 0.0001);
}

export function summarizeScrollMemory({ poses, holds, processSamples, heapSamples }) {
  const maximum = (rows, field) => Math.max(0, ...rows.map((row) => row[field] ?? 0));
  const allPoses = [...poses, ...holds];
  const settledHolds = holds.filter((hold) => hold.measurementPhase !== 'segment-landmark');
  const landmarks = holds.filter((hold) => hold.measurementPhase === 'segment-landmark');
  const heapValues = [...heapSamples.map((sample) => sample.usedJsHeapBytes),
    ...allPoses.map((pose) => pose.usedJsHeapBytes)];
  const finalJsHeapBytes = holds.at(-1)?.usedJsHeapBytes;
  const actual = {
    peakBrowserTreeRssBytes: maximum(processSamples, 'totalRssBytes'),
    peakGpuProcessRssBytes: maximum(processSamples, 'gpuRssBytes'),
    peakRendererRssBytes: maximum(processSamples, 'rendererRssBytes'),
    peakJsHeapBytes: Math.max(0, ...heapValues),
    finalJsHeapBytes,
    peakCanvasPixelBytes: maximum(allPoses, 'canvasPixelBytes'),
    maxMountedLayers: maximum(holds, 'mountedLayers'),
    maxWebglCanvasesAtHold: maximum(settledHolds, 'webglCanvases'),
    maxWebglCanvasesInTransition: maximum([...poses, ...landmarks], 'webglCanvases'),
    maxWebglCanvasesAtLandmark: maximum(landmarks, 'webglCanvases'),
    maxVideosAtContact: maximum(holds.filter((hold) => hold.scene === 'contact')
      .map((hold) => ({ count: hold.videos.length })), 'count')
  };
  const reasons = [];
  if (holds.some((hold) => hold.desired?.kind !== (hold.measurementPhase === 'segment-landmark' ? 'segment' : 'hold'))) {
    reasons.push('checkpoint resource phase does not match the actual runtime range kind');
  }
  if (processSamples.length === 0) reasons.push('browser process samples are missing');
  if (allPoses.some((pose) => ['canvasPixelBytes', 'mountedLayers', 'webglCanvases']
    .some((field) => !Number.isFinite(pose[field]) || pose[field] < 0))) {
    reasons.push('resource measurements are missing or invalid');
  }
  if (heapSamples.length === 0 || heapValues.some((value) => !Number.isFinite(value) || value <= 0)) {
    reasons.push('JS heap sampling is missing or invalid');
  }
  for (const [field, limit] of Object.entries(SCROLL_MEMORY_BUDGETS)) {
    if (field === 'settledHeapFractionOfPeak') continue;
    if (!Number.isFinite(actual[field]) || actual[field] > limit) reasons.push(`${field} exceeds ${limit}`);
  }
  const settled = holds.filter((hold) => hold.direction.endsWith('-settled'));
  if (settled.length !== 2 || settled.some((hold) => !Number.isFinite(hold.usedJsHeapBytes)
    || hold.usedJsHeapBytes > actual.peakJsHeapBytes * SCROLL_MEMORY_BUDGETS.settledHeapFractionOfPeak)) {
    reasons.push('both settled endpoints must return to 90% of observed peak heap');
  }
  if (allPoses.some((pose) => pose.videos.some((video) => !video.paused || video.seeking))) {
    reasons.push('a parked continuous-scroll decoder is playing or seeking');
  }
  if (holds.length !== 33 || poses.length !== 90) reasons.push('continuous-scroll traversal is incomplete');
  const forwardScenes = holds.filter((hold) => ['boot', 'forward'].includes(hold.direction)).map((hold) => hold.scene);
  const reverseScenes = holds.filter((hold) => hold.direction === 'reverse').map((hold) => hold.scene);
  if (JSON.stringify(forwardScenes) !== JSON.stringify(SCROLL_MEMORY_SCENES)
    || JSON.stringify(reverseScenes) !== JSON.stringify([...SCROLL_MEMORY_SCENES].reverse().slice(1))
    || settled[0]?.scene !== 'contact' || settled[1]?.scene !== 'hero') {
    reasons.push('chapter traversal or settled endpoint coverage is incomplete');
  }
  return { actual, reasons, pass: reasons.length === 0 };
}

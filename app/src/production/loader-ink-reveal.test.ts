import { describe, expect, it, vi } from 'vitest';
import {
  createLoaderInkReveal,
  loaderInkSequenceDuration,
  sampleLoaderInkSequence,
  type LoaderInkEnvironment,
  type LoaderInkFallbackReason
} from './loader-ink-reveal';

const PHRASES = ['同人于野', '观象知幂'] as const;
const TIMINGS = {
  startDelayMs: 180,
  revealMs: 1_150,
  holdMs: 220,
  gapMs: 160
} as const;

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function webGlHarness(options: { webgl?: boolean; font?: Promise<void> } = {}) {
  const loseContext = vi.fn();
  const gl = {
    ARRAY_BUFFER: 1,
    CLAMP_TO_EDGE: 2,
    COLOR_BUFFER_BIT: 3,
    COMPILE_STATUS: 4,
    FLOAT: 5,
    FRAGMENT_SHADER: 6,
    LINEAR: 7,
    LINK_STATUS: 8,
    RGBA: 9,
    STATIC_DRAW: 10,
    TEXTURE0: 11,
    TEXTURE1: 12,
    TEXTURE_2D: 13,
    TEXTURE_MAG_FILTER: 14,
    TEXTURE_MIN_FILTER: 15,
    TEXTURE_WRAP_S: 16,
    TEXTURE_WRAP_T: 17,
    TRIANGLES: 18,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 19,
    UNSIGNED_BYTE: 20,
    VERTEX_SHADER: 21,
    activeTexture: vi.fn(),
    attachShader: vi.fn(),
    bindBuffer: vi.fn(),
    bindTexture: vi.fn(),
    bufferData: vi.fn(),
    clear: vi.fn(),
    clearColor: vi.fn(),
    compileShader: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    createProgram: vi.fn(() => ({})),
    createShader: vi.fn(() => ({})),
    createTexture: vi.fn(() => ({})),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
    deleteShader: vi.fn(),
    deleteTexture: vi.fn(),
    drawArrays: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    getExtension: vi.fn(() => ({ loseContext })),
    getProgramParameter: vi.fn(() => true),
    getShaderParameter: vi.fn(() => true),
    getUniformLocation: vi.fn((_program, name: string) => name),
    linkProgram: vi.fn(),
    pixelStorei: vi.fn(),
    shaderSource: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniform2f: vi.fn(),
    useProgram: vi.fn(),
    vertexAttribPointer: vi.fn(),
    viewport: vi.fn()
  };
  const context2d = {
    clearRect: vi.fn(),
    fillStyle: '',
    fillText: vi.fn(),
    font: '',
    measureText: vi.fn((text: string) => ({
      actualBoundingBoxAscent: 72,
      actualBoundingBoxDescent: 12,
      width: Array.from(text).length * 48
    })),
    textAlign: 'start',
    textBaseline: 'alphabetic'
  };
  const canvasListeners = new Map<string, EventListener>();
  const canvas = {
    addEventListener: vi.fn((type: string, listener: EventListener) => canvasListeners.set(type, listener)),
    dataset: {} as Record<string, string>,
    getBoundingClientRect: () => ({ width: 436, height: 112 }),
    getContext: vi.fn((type: string) => type === 'webgl' && options.webgl !== false ? gl : null),
    height: 0,
    removeEventListener: vi.fn((type: string) => canvasListeners.delete(type)),
    style: { opacity: '', visibility: '' },
    width: 0
  } as unknown as HTMLCanvasElement;
  const createCanvas = vi.fn(() => ({
    getContext: (type: string) => type === '2d' ? context2d : null,
    height: 0,
    width: 0
  }) as unknown as HTMLCanvasElement);
  const resizeListeners = new Set<EventListener>();
  const requestedFrames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  let now = 0;
  const environment: LoaderInkEnvironment = {
    now: () => now,
    requestFrame: vi.fn((callback: FrameRequestCallback) => {
      frameId += 1;
      requestedFrames.set(frameId, callback);
      return frameId;
    }),
    cancelFrame: vi.fn((id: number) => {
      requestedFrames.delete(id);
    }),
    addResizeListener: vi.fn((listener: EventListener) => resizeListeners.add(listener)),
    removeResizeListener: vi.fn((listener: EventListener) => resizeListeners.delete(listener)),
    createCanvas,
    getComputedStyle: vi.fn(() => ({
      fontFamily: '"Tongye Title", sans-serif',
      fontSize: '128px',
      fontWeight: '400'
    }) as CSSStyleDeclaration),
    devicePixelRatio: () => 2,
    loadTitleFont: vi.fn(() => options.font ?? Promise.resolve())
  };
  const host = {} as HTMLElement;
  return {
    canvas,
    canvasListeners,
    context2d,
    environment,
    gl,
    host,
    loseContext,
    requestedFrames,
    resizeListeners,
    setNow(value: number) {
      now = value;
    }
  };
}

describe('loader Ink sequence', () => {
  it('samples the legacy two-phrase reveal, hold, conceal, and gap clock', () => {
    expect(loaderInkSequenceDuration(PHRASES, TIMINGS)).toBe(5_380);
    expect(sampleLoaderInkSequence(0, PHRASES, TIMINGS)).toMatchObject({ phase: 'waiting', progress: 0 });
    expect(sampleLoaderInkSequence(755, PHRASES, TIMINGS)).toMatchObject({
      phraseIndex: 0,
      phase: 'revealing',
      progress: 0.5,
      conceal: false
    });
    expect(sampleLoaderInkSequence(1_330, PHRASES, TIMINGS)).toMatchObject({ phase: 'holding', progress: 1 });
    expect(sampleLoaderInkSequence(2_125, PHRASES, TIMINGS)).toMatchObject({
      phase: 'concealing',
      progress: 0.5,
      conceal: true
    });
    expect(sampleLoaderInkSequence(2_700, PHRASES, TIMINGS)).toMatchObject({ phase: 'gap', phraseIndex: 0 });
    expect(sampleLoaderInkSequence(2_860, PHRASES, TIMINGS)).toMatchObject({
      phase: 'revealing',
      phraseIndex: 1,
      progress: 0
    });
    expect(sampleLoaderInkSequence(5_380, PHRASES, TIMINGS)).toMatchObject({
      phase: 'complete',
      phraseIndex: 1,
      sequenceComplete: true
    });
  });

  it('waits for the canonical title font and starts only one absolute-time sequence', async () => {
    const font = deferred();
    const harness = webGlHarness({ font: font.promise });
    const statuses: string[] = [];
    const controller = createLoaderInkReveal({
      canvas: harness.canvas,
      environment: harness.environment,
      host: harness.host,
      phrases: PHRASES,
      startedAt: 0,
      timings: TIMINGS,
      onStatusChange: (status) => statuses.push(status)
    });

    const firstStart = controller.start();
    const secondStart = controller.start();
    expect(firstStart).toBe(secondStart);
    expect(harness.environment.loadTitleFont).toHaveBeenCalledOnce();
    expect(harness.canvas.getContext).not.toHaveBeenCalled();
    expect(harness.environment.requestFrame).not.toHaveBeenCalled();

    harness.setNow(755);
    font.resolve();
    await firstStart;

    expect(statuses).toEqual(['waiting-font', 'active']);
    expect(harness.canvas.dataset.loaderInkStatus).toBe('active');
    expect(harness.canvas.dataset.loaderInkPhase).toBe('revealing');
    expect(harness.canvas.dataset.loaderInkProgress).toBe('0.5000');
    expect(harness.gl.drawArrays).toHaveBeenCalledOnce();
    expect(harness.environment.requestFrame).toHaveBeenCalledOnce();
    const fragmentSource = harness.gl.shaderSource.mock.calls
      .map(([, source]) => String(source))
      .find((source) => source.includes('precision highp float')) ?? '';
    expect(fragmentSource).toContain('uTextMask');
    expect(fragmentSource).toContain('float fbm');
    expect(fragmentSource).toContain('poreInk');
    expect(fragmentSource).toContain('blobDrop');

    const firstFrame = harness.requestedFrames.entries().next().value as [number, FrameRequestCallback];
    harness.requestedFrames.delete(firstFrame[0]);
    firstFrame[1](2_860);
    expect(harness.canvas.dataset.loaderInkPhrase).toBe('1');
    expect(harness.canvas.dataset.loaderInkPhase).toBe('revealing');

    const finalFrame = harness.requestedFrames.entries().next().value as [number, FrameRequestCallback];
    harness.requestedFrames.delete(finalFrame[0]);
    finalFrame[1](5_380);
    expect(controller.getStatus()).toBe('complete');
    expect(harness.canvas.dataset.loaderInkComplete).toBe('true');
    expect(harness.requestedFrames.size).toBe(0);
    await controller.start();
    expect(harness.environment.loadTitleFont).toHaveBeenCalledOnce();
  });

  it('uses an accessible CSS fallback when WebGL is unavailable', async () => {
    const harness = webGlHarness({ webgl: false });
    const reasons: LoaderInkFallbackReason[] = [];
    const controller = createLoaderInkReveal({
      canvas: harness.canvas,
      environment: harness.environment,
      host: harness.host,
      phrases: PHRASES,
      timings: TIMINGS,
      onStatusChange: (status, reason) => {
        if (status === 'fallback' && reason) reasons.push(reason);
      }
    });

    await controller.start();

    expect(controller.getStatus()).toBe('fallback');
    expect(reasons).toEqual(['webgl-unavailable']);
    expect(harness.canvas.style.visibility).toBe('hidden');
    expect(harness.environment.requestFrame).not.toHaveBeenCalled();
  });

  it('falls back on context loss and stops the active frame loop', async () => {
    const harness = webGlHarness();
    const controller = createLoaderInkReveal({
      canvas: harness.canvas,
      environment: harness.environment,
      host: harness.host,
      phrases: PHRASES,
      timings: TIMINGS
    });
    await controller.start();
    const preventDefault = vi.fn();

    harness.canvasListeners.get('webglcontextlost')?.({ preventDefault } as unknown as Event);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(controller.getStatus()).toBe('fallback');
    expect(harness.environment.cancelFrame).toHaveBeenCalledOnce();
    expect(harness.requestedFrames.size).toBe(0);
    expect(harness.gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(harness.resizeListeners.size).toBe(0);
    expect(harness.canvasListeners.has('webglcontextlost')).toBe(false);
    expect(harness.loseContext).not.toHaveBeenCalled();
  });

  it('disposes every GL resource, listener, and RAF idempotently', async () => {
    const harness = webGlHarness();
    const controller = createLoaderInkReveal({
      canvas: harness.canvas,
      environment: harness.environment,
      host: harness.host,
      phrases: PHRASES,
      timings: TIMINGS
    });
    await controller.start();

    controller.dispose();
    controller.dispose();

    expect(controller.getStatus()).toBe('disposed');
    expect(harness.environment.cancelFrame).toHaveBeenCalledOnce();
    expect(harness.gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(harness.gl.deleteBuffer).toHaveBeenCalledOnce();
    expect(harness.gl.deleteProgram).toHaveBeenCalledOnce();
    expect(harness.gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(harness.loseContext).toHaveBeenCalledOnce();
    expect(harness.resizeListeners.size).toBe(0);
    expect(harness.canvasListeners.size).toBe(0);
  });

  it('never creates a continuous GL loop for reduced motion', async () => {
    const harness = webGlHarness();
    const controller = createLoaderInkReveal({
      canvas: harness.canvas,
      environment: harness.environment,
      host: harness.host,
      phrases: PHRASES,
      reducedMotion: true,
      timings: TIMINGS
    });

    await controller.start();

    expect(controller.getStatus()).toBe('fallback');
    expect(harness.environment.loadTitleFont).not.toHaveBeenCalled();
    expect(harness.canvas.getContext).not.toHaveBeenCalled();
    expect(harness.environment.requestFrame).not.toHaveBeenCalled();
  });
});

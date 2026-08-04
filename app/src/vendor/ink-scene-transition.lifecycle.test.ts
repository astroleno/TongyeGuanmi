import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInkFieldFrame, type InkFieldFrame } from '../transitions/shared/inkField';
import { createHorizontalInkContour } from '../transitions/shared/horizontalInkContour';
import { createInkBoundaryTransition, releaseInkWebGlResources } from './ink-scene-transition.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function webGlHarness() {
  const texture = {} as WebGLTexture;
  const loseContext = vi.fn();
  const gl = {
    ARRAY_BUFFER: 1,
    BLEND: 2,
    CLAMP_TO_EDGE: 3,
    COLOR_BUFFER_BIT: 4,
    COMPILE_STATUS: 5,
    FLOAT: 6,
    FRAGMENT_SHADER: 7,
    LINEAR: 8,
    LINK_STATUS: 9,
    LUMINANCE: 10,
    ONE: 11,
    ONE_MINUS_SRC_ALPHA: 12,
    RGBA: 13,
    SRC_ALPHA: 14,
    STATIC_DRAW: 15,
    TEXTURE0: 16,
    TEXTURE1: 17,
    TEXTURE2: 28,
    TEXTURE_2D: 18,
    TEXTURE_MAG_FILTER: 19,
    TEXTURE_MIN_FILTER: 20,
    TEXTURE_WRAP_S: 21,
    TEXTURE_WRAP_T: 22,
    TRIANGLES: 23,
    UNPACK_ALIGNMENT: 24,
    UNPACK_FLIP_Y_WEBGL: 25,
    UNSIGNED_BYTE: 26,
    VERTEX_SHADER: 27,
    REPEAT: 29,
    activeTexture: vi.fn(),
    attachShader: vi.fn(),
    bindBuffer: vi.fn(),
    bindTexture: vi.fn(),
    blendFunc: vi.fn(),
    blendFuncSeparate: vi.fn(),
    bufferData: vi.fn(),
    clear: vi.fn(),
    clearColor: vi.fn(),
    compileShader: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    createProgram: vi.fn(() => ({})),
    createShader: vi.fn(() => ({})),
    createTexture: vi.fn(() => texture),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
    deleteShader: vi.fn(),
    deleteTexture: vi.fn(),
    drawArrays: vi.fn(),
    enable: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    getExtension: vi.fn(() => ({ loseContext })),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    getUniformLocation: vi.fn((_program, name: string) => name),
    linkProgram: vi.fn(),
    pixelStorei: vi.fn(),
    shaderSource: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniform2f: vi.fn(),
    uniform4f: vi.fn(),
    useProgram: vi.fn(),
    vertexAttribPointer: vi.fn(),
    viewport: vi.fn()
  };
  let width = 320;
  let height = 180;
  const canvas = {
    dataset: {},
    getBoundingClientRect: () => ({ width, height }),
    getContext: () => gl,
    height: 0,
    style: { opacity: '', visibility: '' },
    width: 0
  } as unknown as HTMLCanvasElement;
  vi.stubGlobal('window', { devicePixelRatio: 1, innerHeight: 180, innerWidth: 320 });
  return {
    canvas,
    gl,
    loseContext,
    texture,
    setSize(nextWidth: number, nextHeight: number) {
      width = nextWidth;
      height = nextHeight;
    }
  };
}

describe('ink WebGL resource lifecycle', () => {
  it('recreates an active renderer on the same canvas after StrictMode-style cleanup', () => {
    const { canvas, gl, loseContext } = webGlHarness();
    const frame = createInkFieldFrame(
      { kind: 'radial', origin: { x: 0.5, y: 0.5 }, seed: 'strict-remount' },
      0.5,
      { width: 320, height: 180 }
    );
    const first = createInkBoundaryTransition(canvas, { fieldKind: 'radial' });
    first?.render(frame);
    first?.destroy();
    const second = createInkBoundaryTransition(canvas, { fieldKind: 'radial' });
    second?.render(frame);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    expect(loseContext).not.toHaveBeenCalled();
    second?.destroy();
  });

  it('uploads a decoded Hero target texture during setup and reuses it for radial frames', () => {
    const { canvas, gl } = webGlHarness();
    const targetImage = {
      complete: true,
      naturalWidth: 1600,
      naturalHeight: 900
    } as HTMLImageElement;
    const transition = createInkBoundaryTransition(canvas, {
      fieldKind: 'radial',
      targetImage
    });
    const frame = createInkFieldFrame(
      { kind: 'radial', origin: { x: 0.5, y: 0.5 }, seed: 'hero-target' },
      0.5,
      { width: 320, height: 180 }
    );
    const targetUploadsAtSetup = gl.texImage2D.mock.calls.filter(
      (call) => call.at(-1) === targetImage
    ).length;

    transition?.prewarm(frame);
    const uploadsAfterPrewarm = gl.texImage2D.mock.calls.length;
    transition?.render(frame);

    expect(targetUploadsAtSetup).toBe(1);
    expect(gl.pixelStorei).toHaveBeenCalledWith(gl.UNPACK_FLIP_Y_WEBGL, true);
    expect(gl.texImage2D).toHaveBeenCalledTimes(uploadsAfterPrewarm);
    expect(gl.uniform2f).toHaveBeenCalledWith('J', 1600, 900);
    expect(gl.uniform1f).toHaveBeenCalledWith('X', 1);
    transition?.destroy();
  });

  it('keeps a target-bearing radial canvas opaque until the DOM terminal handoff', () => {
    const { canvas } = webGlHarness();
    const targetImage = {
      complete: true,
      naturalWidth: 1600,
      naturalHeight: 900
    } as HTMLImageElement;
    const transition = createInkBoundaryTransition(canvas, {
      fieldKind: 'radial',
      targetImage
    });
    const opacityAt = (progress: number) => {
      transition?.render(createInkFieldFrame(
        { kind: 'radial', origin: { x: 0.5, y: 0.5 }, seed: 'hero-terminal' },
        progress,
        { width: 320, height: 180 }
      ));
      return canvas.style.opacity;
    };

    expect([0.94, 0.9675, 0.995, 1].map(opacityAt)).toEqual([
      '1.0000',
      '1.0000',
      '1.0000',
      '0'
    ]);
    transition?.destroy();
  });

  it('uploads the configured particle gain to the field shader', () => {
    const { canvas, gl } = webGlHarness();
    const transition = createInkBoundaryTransition(canvas, { particleGain: 1.25 });
    const frame = createInkFieldFrame(
      { kind: 'radial', origin: { x: 0.5, y: 0.5 }, seed: 'particle-gain' },
      0.5,
      { width: 320, height: 180 }
    );

    transition?.render(frame);

    expect(gl.uniform1f).toHaveBeenCalledWith('G', 1.25);
    transition?.destroy();
  });

  it('releases partial resources when renderer initialization fails without losing a reusable context', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { canvas, gl, loseContext } = webGlHarness();
    gl.getShaderParameter
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    const transition = createInkBoundaryTransition(canvas, { fieldKind: 'horizontal' });

    expect(transition).toBeNull();
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(loseContext).not.toHaveBeenCalled();
  });

  it('deletes every owned resource without invalidating a reusable canvas context', () => {
    const loseContext = vi.fn();
    const gl = {
      deleteTexture: vi.fn(),
      deleteBuffer: vi.fn(),
      deleteProgram: vi.fn(),
      deleteShader: vi.fn(),
      getExtension: vi.fn(() => ({ loseContext }))
    } as unknown as WebGLRenderingContext;
    const buffer = {} as WebGLBuffer;
    const program = {} as WebGLProgram;
    const shaders = [{}, {}] as WebGLShader[];
    const textures = [{}, {}, {}] as WebGLTexture[];

    releaseInkWebGlResources(gl, { buffer, program, shaders, textures });

    expect(gl.deleteTexture).toHaveBeenCalledTimes(3);
    expect(gl.deleteBuffer).toHaveBeenCalledWith(buffer);
    expect(gl.deleteProgram).toHaveBeenCalledWith(program);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(gl.getExtension).not.toHaveBeenCalled();
    expect(loseContext).not.toHaveBeenCalled();
  });

  it('uploads one horizontal contour texture per revision and never per progress frame', () => {
    const { canvas, gl, setSize, texture } = webGlHarness();
    const transition = createInkBoundaryTransition(canvas, { fieldKind: 'horizontal' });
    const initializationUploads = gl.texImage2D.mock.calls.length;
    const firstContour = createHorizontalInkContour({
      authoredSeed: 'horizontal-lifecycle',
      variationKey: 'run:1'
    });
    for (const progress of [0.25, 0.5, 0.75]) {
      transition?.render(createInkFieldFrame(
        { kind: 'horizontal', direction: 'bottom-to-top', seed: 'horizontal-lifecycle' },
        progress,
        { width: 320, height: 180 },
        { contour: firstContour }
      ));
    }

    expect(gl.createTexture).toHaveBeenCalledTimes(2);
    expect(gl.texImage2D).toHaveBeenCalledTimes(initializationUploads + 1);
    expect(canvas.dataset.r4InkContourTextureUploads).toBe('1');
    expect(canvas.dataset.r4InkContourRevision).toBe(firstContour.revision);
    expect(gl.uniform1f).toHaveBeenCalledWith('K', firstContour.samples.length);
    expect(gl.uniform1f).toHaveBeenCalledWith('I', 1);

    setSize(640, 360);
    transition?.render(createInkFieldFrame(
      { kind: 'horizontal', direction: 'bottom-to-top', seed: 'horizontal-lifecycle' },
      0.5,
      { width: 640, height: 360 },
      { contour: firstContour }
    ));
    expect(canvas.dataset.r4InkContourTextureUploads).toBe('1');
    expect(canvas.dataset.r4InkContourRevision).toBe(firstContour.revision);
    expect(gl.viewport).toHaveBeenLastCalledWith(0, 0, 640, 360);

    for (const progress of [0.25, 0.5, 0.75]) {
      transition?.render(createInkFieldFrame(
        { kind: 'radial', origin: { x: 0.5, y: 0.5 }, seed: 'radial-lifecycle' },
        progress,
        { width: 320, height: 180 }
      ));
    }

    expect(gl.texImage2D).toHaveBeenCalledTimes(initializationUploads + 1);
    expect(canvas.dataset.r4InkContourTextureUploads).toBe('1');

    const nextContour = createHorizontalInkContour({
      authoredSeed: 'horizontal-lifecycle',
      variationKey: 'run:2'
    });
    transition?.render(createInkFieldFrame(
      { kind: 'horizontal', direction: 'bottom-to-top', seed: 'horizontal-lifecycle' },
      0.5,
      { width: 320, height: 180 },
      { contour: nextContour }
    ));
    expect(gl.texImage2D).toHaveBeenCalledTimes(initializationUploads + 2);
    expect(canvas.dataset.r4InkContourTextureUploads).toBe('2');
    expect(canvas.dataset.r4InkContourRevision).toBe(nextContour.revision);

    transition?.destroy();
    transition?.destroy();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(gl.deleteTexture).toHaveBeenCalledWith(texture);
    expect(canvas.dataset.r4InkContourTextureUploads).toBeUndefined();
    expect(canvas.dataset.r4InkContourRevision).toBeUndefined();
  });

  it('uploads one primary ownership occlusion contract', () => {
    const { canvas, gl } = webGlHarness();
    const transition = createInkBoundaryTransition(canvas, { fieldKind: 'depth' });
    const frame = createInkFieldFrame(
      {
        kind: 'depth',
        depthSrc: '/depth.png',
        seed: 'depth-occlusion-contract',
        transform: {
          viewport: { width: 320, height: 180 },
          cover: { x: 0, y: 0, width: 320, height: 180 },
          camera: { scale: 1, translateX: 0, translateY: 0, originX: 0.5, originY: 0.5 }
        }
      },
      0.5,
      { width: 320, height: 180 }
    );

    transition?.render(frame);

    expect(gl.uniform1f).toHaveBeenCalledWith('B', frame.boundaryRank);
    expect(gl.uniform2f).toHaveBeenCalledWith(
      'E',
      frame.occlusion.coreMin,
      frame.occlusion.coreMax
    );
    expect(gl.uniform1f).toHaveBeenCalledWith('I', 0.92);
    const uniformNames = gl.getUniformLocation.mock.calls.map(([, name]) => name);
    expect(uniformNames).not.toContain('uSecondaryHorizontalGate');
    expect(uniformNames).not.toContain('uSecondaryHorizontalCore');
    expect(gl.uniform4f).not.toHaveBeenCalledWith(
      'uSecondaryHorizontalGate',
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  it('feeds radial rendering the exact boundary rank that owns the DOM mask', () => {
    const { canvas, gl } = webGlHarness();
    const transition = createInkBoundaryTransition(canvas, { fieldKind: 'radial' });
    const frame = createInkFieldFrame(
      { kind: 'radial', origin: { x: 0.5, y: 0.5 }, seed: 'hero-pattern-frontier' },
      0.5,
      { width: 320, height: 180 }
    );

    transition?.render(frame);

    const boundaryRank = (frame as typeof frame & { boundaryRank: number }).boundaryRank;
    expect(boundaryRank).toBeDefined();
    expect(gl.uniform1f).toHaveBeenCalledWith('H', boundaryRank);
    expect(gl.uniform1f).toHaveBeenCalledWith('B', boundaryRank);
    expect(gl.texImage2D).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      expect.any(Number),
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      expect.any(Uint8Array)
    );
  });

  it('keeps the horizontal opaque core centered on the exact shared contour rank', () => {
    const { canvas, gl } = webGlHarness();

    createInkBoundaryTransition(canvas, { fieldKind: 'horizontal' });

    const fragmentSource = gl.shaderSource.mock.calls
      .map(([, source]) => String(source))
      .find((source) => source.includes('precision highp float')) ?? '';
    expect(fragmentSource).toContain('float ho=oo(br,B,E,I,1.0)');
    expect(fragmentSource).toContain('float cu=');
    expect(fragmentSource).toContain('(sc-1.0)+0.5');
    expect(fragmentSource).not.toMatch(/ho[\s\S]*?\*\s*nonHorizontalMode/);
  });

  it('uploads one depth image and reuses it across progress samples', () => {
    const loadedImages: Array<{ onload: (() => void) | null; src: string }> = [];
    class FakeImage {
      crossOrigin = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = '';

      constructor() {
        loadedImages.push(this);
      }
    }
    vi.stubGlobal('Image', FakeImage);
    const { canvas, gl } = webGlHarness();
    const transition = createInkBoundaryTransition(canvas, { fieldKind: 'depth' });
    const initializationUploads = gl.texImage2D.mock.calls.length;
    const transform = {
      viewport: { width: 320, height: 180 },
      cover: { x: 0, y: 0, width: 320, height: 180 },
      camera: { scale: 1, translateX: 0, translateY: 0, originX: 0.5, originY: 0.5 }
    } as const;
    const frame = (progress: number): InkFieldFrame => createInkFieldFrame(
      { kind: 'depth', depthSrc: '/depth.png', seed: 'depth-lifecycle', transform },
      progress,
      { width: 320, height: 180 }
    );

    transition?.render(frame(0.25));
    transition?.render(frame(0.5));
    expect(loadedImages).toHaveLength(1);
    loadedImages[0]?.onload?.();
    expect(gl.pixelStorei).toHaveBeenCalledWith(gl.UNPACK_FLIP_Y_WEBGL, true);
    expect(gl.texImage2D).toHaveBeenCalledTimes(initializationUploads + 1);
    transition?.render(frame(0.75));
    expect(loadedImages).toHaveLength(1);
    expect(gl.texImage2D).toHaveBeenCalledTimes(initializationUploads + 1);
    transition?.destroy();
  });
});

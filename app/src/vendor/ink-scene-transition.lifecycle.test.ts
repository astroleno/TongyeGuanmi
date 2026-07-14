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
  it('uploads the configured particle gain to the field shader', () => {
    const { canvas, gl } = webGlHarness();
    const transition = createInkBoundaryTransition(canvas, { particleGain: 1.25 });
    const frame = createInkFieldFrame(
      { kind: 'radial', origin: { x: 0.5, y: 0.5 }, seed: 'particle-gain' },
      0.5,
      { width: 320, height: 180 }
    );

    transition?.render(frame);

    expect(gl.uniform1f).toHaveBeenCalledWith('uParticleGain', 1.25);
    transition?.destroy();
  });

  it('releases partial resources when renderer initialization fails', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { canvas, gl, loseContext } = webGlHarness();
    gl.getShaderParameter
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    const transition = createInkBoundaryTransition(canvas);

    expect(transition).toBeNull();
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it('deletes every owned resource and explicitly releases the context', () => {
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
    expect(gl.getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it('uploads one horizontal contour texture per revision and never per progress frame', () => {
    const { canvas, gl, setSize, texture } = webGlHarness();
    const transition = createInkBoundaryTransition(canvas);
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
    expect(gl.uniform1f).toHaveBeenCalledWith('uContourSampleCount', firstContour.samples.length);
    expect(gl.uniform1f).toHaveBeenCalledWith('uOcclusionAlphaMin', 1);

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
    const transition = createInkBoundaryTransition(canvas);
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

    expect(gl.uniform1f).toHaveBeenCalledWith('uOwnershipGateRank', frame.occlusion.gateRank);
    expect(gl.uniform2f).toHaveBeenCalledWith(
      'uOwnershipCore',
      frame.occlusion.coreMin,
      frame.occlusion.coreMax
    );
    expect(gl.uniform1f).toHaveBeenCalledWith('uOcclusionAlphaMin', 0.92);
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

  it('keeps the horizontal opaque core centered on the exact shared contour rank', () => {
    const { canvas, gl } = webGlHarness();

    createInkBoundaryTransition(canvas);

    const fragmentSource = gl.shaderSource.mock.calls
      .map(([, source]) => String(source))
      .find((source) => source.includes('precision highp float')) ?? '';
    expect(fragmentSource).toContain('float horizontalCoreOcclusion');
    expect(fragmentSource).toContain('float contourU');
    expect(fragmentSource).toContain('(sampleCount - 1.0) + 0.5');
    expect(fragmentSource).toMatch(/ownershipOcclusion\(\s*horizontal,\s*uOwnershipGateRank,[\s\S]*?1\.0\s*\)/);
    expect(fragmentSource).not.toMatch(/horizontalCoreOcclusion[\s\S]*?\*\s*nonHorizontalMode/);
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
    const transition = createInkBoundaryTransition(canvas);
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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInkFieldFrame, type InkFieldFrame } from '../transitions/shared/inkField';
import { createInkBoundaryTransition, releaseInkWebGlResources } from './ink-scene-transition.js';

afterEach(() => {
  vi.unstubAllGlobals();
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
    TEXTURE_2D: 17,
    TEXTURE_MAG_FILTER: 18,
    TEXTURE_MIN_FILTER: 19,
    TEXTURE_WRAP_S: 20,
    TEXTURE_WRAP_T: 21,
    TRIANGLES: 22,
    UNPACK_ALIGNMENT: 23,
    UNPACK_FLIP_Y_WEBGL: 24,
    UNSIGNED_BYTE: 25,
    VERTEX_SHADER: 26,
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
    uniform4f: vi.fn(),
    useProgram: vi.fn(),
    vertexAttribPointer: vi.fn(),
    viewport: vi.fn()
  };
  const canvas = {
    dataset: {},
    getBoundingClientRect: () => ({ width: 320, height: 180 }),
    getContext: () => gl,
    height: 0,
    style: { opacity: '', visibility: '' },
    width: 0
  } as unknown as HTMLCanvasElement;
  vi.stubGlobal('window', { devicePixelRatio: 1, innerHeight: 180, innerWidth: 320 });
  return { canvas, gl, loseContext, texture };
}

describe('ink WebGL resource lifecycle', () => {
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

  it('does not upload a texture for each horizontal or radial progress frame', () => {
    const { canvas, gl, texture } = webGlHarness();
    const transition = createInkBoundaryTransition(canvas);
    const initializationUploads = gl.texImage2D.mock.calls.length;
    for (const progress of [0.25, 0.5, 0.75]) {
      transition?.render(createInkFieldFrame(
        { kind: 'horizontal', direction: 'bottom-to-top', seed: 'horizontal-lifecycle' },
        progress,
        { width: 320, height: 180 }
      ));
      transition?.render(createInkFieldFrame(
        { kind: 'radial', origin: { x: 0.5, y: 0.5 }, seed: 'radial-lifecycle' },
        progress,
        { width: 320, height: 180 }
      ));
    }

    expect(gl.createTexture).toHaveBeenCalledOnce();
    expect(gl.texImage2D).toHaveBeenCalledTimes(initializationUploads);
    transition?.destroy();
    transition?.destroy();
    expect(gl.deleteTexture).toHaveBeenCalledOnce();
    expect(gl.deleteTexture).toHaveBeenCalledWith(texture);
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

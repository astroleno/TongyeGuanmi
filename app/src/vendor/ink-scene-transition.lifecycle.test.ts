import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InkBoundaryFrame } from '../transitions/shared/inkBoundary';
import { createInkBoundaryTransition, releaseInkWebGlResources } from './ink-scene-transition.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('uploads one boundary profile texture and releases it exactly once', () => {
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
      ONE_MINUS_SRC_ALPHA: 11,
      SRC_ALPHA: 12,
      STATIC_DRAW: 13,
      TEXTURE0: 14,
      TEXTURE_2D: 15,
      TEXTURE_MAG_FILTER: 16,
      TEXTURE_MIN_FILTER: 17,
      TEXTURE_WRAP_S: 18,
      TEXTURE_WRAP_T: 19,
      TRIANGLES: 20,
      UNPACK_ALIGNMENT: 21,
      UNSIGNED_BYTE: 22,
      VERTEX_SHADER: 23,
      activeTexture: vi.fn(),
      attachShader: vi.fn(),
      bindBuffer: vi.fn(),
      bindTexture: vi.fn(),
      blendFunc: vi.fn(),
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
      getUniformLocation: vi.fn(() => ({})),
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
    } as unknown as WebGLRenderingContext;
    const canvas = {
      getBoundingClientRect: () => ({ width: 320, height: 180 }),
      getContext: () => gl,
      height: 0,
      style: { opacity: '', visibility: '' },
      width: 0
    } as unknown as HTMLCanvasElement;
    vi.stubGlobal('window', { devicePixelRatio: 1, innerHeight: 180, innerWidth: 320 });
    const frame: InkBoundaryFrame = {
      kind: 'horizontal',
      origin: { x: 0.5, y: 1 },
      progress: 0.5,
      profile: new Uint8Array([112, 127, 139, 121]),
      revealClipPath: 'polygon(0% 50%, 100% 50%, 100% 100%, 0% 100%)',
      concealClipPath: 'polygon(0% 0%, 100% 0%, 100% 50%, 0% 50%)',
      revision: 'test-boundary-revision'
    };

    const transition = createInkBoundaryTransition(canvas);
    transition?.render(frame);
    transition?.render(frame);

    expect(gl.createTexture).toHaveBeenCalledOnce();
    expect(gl.texImage2D).toHaveBeenCalledOnce();
    transition?.destroy();
    transition?.destroy();
    expect(gl.deleteTexture).toHaveBeenCalledOnce();
    expect(gl.deleteTexture).toHaveBeenCalledWith(texture);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createInkCurtainTransition } from './inkCurtain';

function createWebGlHarness() {
  const resources = {
    vertexShader: { kind: 'vertex' },
    fragmentShader: { kind: 'fragment' },
    program: { kind: 'program' },
    buffer: { kind: 'buffer' },
    texture: { kind: 'texture' }
  };
  let shaderCount = 0;
  const loseContext = vi.fn();
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    TEXTURE0: 7,
    TEXTURE_2D: 8,
    TEXTURE_WRAP_S: 9,
    TEXTURE_WRAP_T: 10,
    CLAMP_TO_EDGE: 11,
    TEXTURE_MIN_FILTER: 12,
    TEXTURE_MAG_FILTER: 13,
    LINEAR: 14,
    RGBA: 15,
    UNSIGNED_BYTE: 16,
    FLOAT: 17,
    BLEND: 18,
    SRC_ALPHA: 19,
    ONE_MINUS_SRC_ALPHA: 20,
    COLOR_BUFFER_BIT: 21,
    UNPACK_FLIP_Y_WEBGL: 22,
    createShader: vi.fn(() => (shaderCount++ === 0 ? resources.vertexShader : resources.fragmentShader)),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => resources.program),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(),
    deleteProgram: vi.fn(),
    createBuffer: vi.fn(() => resources.buffer),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    deleteBuffer: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    getUniformLocation: vi.fn(() => ({})),
    createTexture: vi.fn(() => resources.texture),
    activeTexture: vi.fn(),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(),
    deleteTexture: vi.fn(),
    useProgram: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    enable: vi.fn(),
    blendFunc: vi.fn(),
    clearColor: vi.fn(),
    uniform1i: vi.fn(),
    getExtension: vi.fn(() => ({ loseContext })),
    viewport: vi.fn(),
    clear: vi.fn(),
    uniform2f: vi.fn(),
    uniform1f: vi.fn(),
    pixelStorei: vi.fn(),
    drawArrays: vi.fn()
  };
  return { gl, resources, loseContext };
}

describe('star-map AOD ink curtain lifecycle', () => {
  it('deletes owned WebGL resources and releases its context exactly once', () => {
    const { gl, resources, loseContext } = createWebGlHarness();
    const canvas = {
      style: { visibility: '', opacity: '' },
      getContext: vi.fn(() => gl),
      getBoundingClientRect: vi.fn(() => ({ width: 1280, height: 720 })),
      width: 0,
      height: 0
    } as unknown as HTMLCanvasElement;

    const transition = createInkCurtainTransition(canvas);
    transition?.destroy();
    transition?.destroy();

    expect(gl.deleteBuffer).toHaveBeenCalledOnce();
    expect(gl.deleteBuffer).toHaveBeenCalledWith(resources.buffer);
    expect(gl.deleteTexture).toHaveBeenCalledWith(resources.texture);
    expect(gl.deleteProgram).toHaveBeenCalledWith(resources.program);
    expect(gl.deleteShader).toHaveBeenCalledWith(resources.vertexShader);
    expect(gl.deleteShader).toHaveBeenCalledWith(resources.fragmentShader);
    expect(loseContext).toHaveBeenCalledOnce();
    expect(canvas.style.visibility).toBe('hidden');
    expect(canvas.style.opacity).toBe('0');
  });
});

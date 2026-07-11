import { describe, expect, it, vi } from 'vitest';
import { releaseInkWebGlResources } from './ink-scene-transition.js';

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
});

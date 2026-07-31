import { describe, expect, it, vi } from 'vitest';
import {
  PACKED_ALPHA_SOURCE_TYPE,
  packedAlphaFrameProofSatisfied,
  packedAlphaFrameSize,
  releasePackedAlphaWebGlContext
} from './packed-alpha-video';

describe('packed alpha video', () => {
  it('maps the side-by-side H.264 frame back to the authored dimensions', () => {
    expect(packedAlphaFrameSize(1_440, 1_280)).toEqual({
      width: 720,
      height: 1_280
    });
    expect(packedAlphaFrameSize(3_344, 942)).toEqual({
      width: 1_672,
      height: 942
    });
  });

  it('uses an iPhone-compatible opaque decoder source', () => {
    expect(PACKED_ALPHA_SOURCE_TYPE).toContain('video/mp4');
    expect(PACKED_ALPHA_SOURCE_TYPE).toContain('avc1');
  });

  it('[convergence] accepts a packed frame only after a live no-error WebGL draw', () => {
    const clean = {
      NO_ERROR: 0,
      getError: vi.fn(() => 0),
      isContextLost: vi.fn(() => false)
    } as unknown as WebGLRenderingContext;
    const errored = {
      NO_ERROR: 0,
      getError: vi.fn(() => 0x0502),
      isContextLost: vi.fn(() => false)
    } as unknown as WebGLRenderingContext;
    const lost = {
      NO_ERROR: 0,
      getError: vi.fn(() => 0),
      isContextLost: vi.fn(() => true)
    } as unknown as WebGLRenderingContext;

    expect(packedAlphaFrameProofSatisfied(clean)).toBe(true);
    expect(packedAlphaFrameProofSatisfied(errored)).toBe(false);
    expect(packedAlphaFrameProofSatisfied(lost)).toBe(false);
  });

  it('hard-releases the compositor context when a packed surface retires', () => {
    const loseContext = vi.fn();
    const getExtension = vi.fn(() => ({ loseContext }));

    releasePackedAlphaWebGlContext({
      getExtension
    } as unknown as WebGLRenderingContext);

    expect(getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
    expect(loseContext).toHaveBeenCalledOnce();
  });
});

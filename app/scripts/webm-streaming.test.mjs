import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertStreamingWebm, WEBM_STREAMING_PROOFS } from './webm-streaming.mjs';
import { animationWebmSources, frozenHomepageMedia } from './homepage-media-contract.mjs';

const node = (id, body = Buffer.alloc(0)) => Buffer.concat([Buffer.from(id, 'hex'), Buffer.from([0x80 + body.length]), body]);
const tracks = node('1654ae6b'), cues = node('1c53bb6b', node('bb'));
const cluster = node('1f43b675', Buffer.from('1c53bb6b', 'hex'));
const webm = children => Buffer.concat([node('1a45dfa3'), node('18538067', Buffer.concat(children))]);

describe('native WebM streaming layout and lossless authority', () => {
  it('accepts a real top-level seek index before media', () => {
    expect(assertStreamingWebm(webm([tracks, cues, cluster])).cuesOffset).toBeLessThan(assertStreamingWebm(webm([tracks, cues, cluster])).firstClusterOffset);
  });
  it('rejects the old tail index without mistaking a compressed-frame signature for Cues', () => {
    expect(() => assertStreamingWebm(webm([tracks, cluster, cues]))).toThrow('index must precede');
    expect(() => assertStreamingWebm(webm([tracks, cluster]))).toThrow('index must precede');
  });
  it('rejects a truncated or malformed container', () => {
    expect(() => assertStreamingWebm(webm([tracks, cues, cluster]).subarray(0, -1))).toThrow('Truncated');
    expect(() => assertStreamingWebm(Buffer.from([0]))).toThrow();
  });
  it('retains all eight media authorities and all 631 original color/alpha frames', () => {
    expect(WEBM_STREAMING_PROOFS.map(entry => entry.source)).toEqual(animationWebmSources);
    expect(WEBM_STREAMING_PROOFS.reduce((sum, entry) => sum + entry.frames, 0)).toBe(631);
    for (const proof of WEBM_STREAMING_PROOFS) {
      expect(proof.sha256).toBe(frozenHomepageMedia.find(entry => entry.source === proof.source).sha256);
      expect(proof.previousSha256).not.toBe(proof.sha256);
      expect(proof.rgbaTimingSha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });
  it.each(animationWebmSources)('keeps %s seekable without fetching the file tail', source => {
    assertStreamingWebm(readFileSync(new URL('../../' + source, import.meta.url)));
  });
});

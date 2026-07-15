import { describe, expect, it } from 'vitest';
import { storyManifest } from '../story/manifest';
import {
  createBootRecoveryPlan,
  createSegmentRecoveryPlan,
  firstStaticFallbackScene,
  recoveryTimeouts
} from './recovery';

describe('recovery', () => {
  it('keeps the old MEDIA_READY timeout value', () => {
    expect(recoveryTimeouts.mediaReadyMs).toBe(1800);
  });

  it('falls back to the manifest static hero hold', () => {
    expect(firstStaticFallbackScene()).toBe('hero');
    expect(createBootRecoveryPlan('offline')).toMatchObject({
      scope: 'boot',
      status: 'fallback',
      fallbackScene: 'hero',
      reason: 'boot-failed',
      error: new Error('offline')
    });
  });

  it('keeps segment failures at the last committed endpoint without a global fallback', () => {
    const segment = storyManifest.nodes.find(
      (node) => node.kind === 'segment' && node.id === 'crane-contact'
    );
    if (segment?.kind !== 'segment') {
      throw new Error('missing crane-contact segment');
    }

    expect(
      createSegmentRecoveryPlan('playback-failed', 'contact', segment, -1, 'media timeout')
    ).toMatchObject({
      scope: 'segment',
      status: 'recovering',
      committedScene: 'contact',
      segment: 'crane-contact',
      direction: -1,
      endpoint: 'contact',
      reason: 'playback-failed',
      error: new Error('media timeout')
    });
  });
});

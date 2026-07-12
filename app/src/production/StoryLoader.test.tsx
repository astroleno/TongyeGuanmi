import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LOADER_PHRASES,
  STORY_LOADER_TIMINGS,
  StoryLoader,
  loaderFrameAt,
  loaderSequenceDuration
} from './StoryLoader';

describe('StoryLoader', () => {
  it('keeps the legacy two-phrase 5.38s sequence contract', () => {
    expect(LOADER_PHRASES).toEqual(['同人于野', '观象知幂']);
    expect(loaderSequenceDuration('cold-hero')).toBe(5_380);
    expect(loaderFrameAt(0, 'cold-hero')).toMatchObject({ phraseIndex: 0, phase: 'waiting' });
    expect(loaderFrameAt(180, 'cold-hero')).toMatchObject({ phraseIndex: 0, phase: 'revealing' });
    expect(loaderFrameAt(1_330, 'cold-hero')).toMatchObject({ phraseIndex: 0, phase: 'holding' });
    expect(loaderFrameAt(1_550, 'cold-hero')).toMatchObject({ phraseIndex: 0, phase: 'concealing' });
    expect(loaderFrameAt(2_700, 'cold-hero')).toMatchObject({ phraseIndex: 0, phase: 'gap' });
    expect(loaderFrameAt(2_860, 'cold-hero')).toMatchObject({ phraseIndex: 1, phase: 'revealing' });
    expect(loaderFrameAt(4_010, 'cold-hero')).toMatchObject({ phraseIndex: 1, phase: 'holding' });
    expect(loaderFrameAt(4_230, 'cold-hero')).toMatchObject({ phraseIndex: 1, phase: 'concealing' });
    expect(loaderFrameAt(5_380, 'cold-hero')).toMatchObject({
      phraseIndex: 1,
      phase: 'complete',
      sequenceComplete: true
    });
    expect(STORY_LOADER_TIMINGS.exitMs).toBe(420);
  });

  it('uses an immediate readiness cover for direct and reduced entry', () => {
    for (const mode of ['direct', 'reduced'] as const) {
      expect(loaderSequenceDuration(mode)).toBe(0);
      expect(loaderFrameAt(0, mode)).toMatchObject({
        phrase: '同野观幂',
        phase: 'holding',
        sequenceComplete: true
      });
    }
  });

  it('renders one restrained live announcement and non-focusable visual ink layers', () => {
    const markup = renderToStaticMarkup(createElement(StoryLoader, {
      mode: 'cold-hero',
      ready: false,
      failed: false
    }));

    expect(markup).toContain('data-story-loader="true"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup.match(/aria-live=/g)).toHaveLength(1);
    expect(markup).toContain('story-loader__ink-blur');
    expect(markup).toContain('story-loader__ink-clear');
    expect(markup).toContain('data-loader-ink-canvas="true"');
    expect(markup).toContain('data-loader-ink-status="idle"');
    expect(markup.match(/<canvas/g)).toHaveLength(1);
    expect(markup).not.toContain('tabindex="0"');
  });

  it('provides a pre-hydration loader shell with a no-JS escape before the React root', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const loaderIndex = html.indexOf('data-story-loader-static="true"');
    const rootIndex = html.indexOf('id="root"');
    expect(loaderIndex).toBeGreaterThan(0);
    expect(loaderIndex).toBeLessThan(rootIndex);
    expect(html).toContain('data-loader-ink-fallback="true"');
    expect(html).toContain('<noscript><style>#story-loader-static { display: none !important; }</style></noscript>');
  });
});

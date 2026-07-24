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
  it('reveals the requested two-line eight-character lockup once', () => {
    expect(LOADER_PHRASES).toEqual(['同人于野\n观象知幂']);
    expect(loaderSequenceDuration('cold-hero')).toBe(2_700);
    expect(loaderFrameAt(0, 'cold-hero')).toMatchObject({ phraseIndex: 0, phase: 'waiting' });
    expect(loaderFrameAt(180, 'cold-hero')).toMatchObject({ phraseIndex: 0, phase: 'revealing' });
    expect(loaderFrameAt(1_330, 'cold-hero')).toMatchObject({ phraseIndex: 0, phase: 'holding' });
    expect(loaderFrameAt(1_550, 'cold-hero')).toMatchObject({ phraseIndex: 0, phase: 'concealing' });
    expect(loaderFrameAt(2_700, 'cold-hero')).toMatchObject({
      phraseIndex: 0,
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
    expect(markup).toContain('data-loader-layout="stacked-eight"');
    expect(markup).toContain('同人于野\n观象知幂');
    expect(markup.match(/<canvas/g)).toHaveLength(1);
    expect(markup).not.toContain('tabindex="0"');
  });

  it('provides a pre-hydration loader with a no-JS escape before the React root', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const loaderIndex = html.indexOf('data-story-loader-static="true"');
    const rootIndex = html.indexOf('id="root"');
    expect(loaderIndex).toBeGreaterThan(0);
    expect(loaderIndex).toBeLessThan(rootIndex);
    expect(html).toContain('data-loader-ink-fallback="true"');
    expect(html).not.toContain('mobile-landscape-entry-static');
    expect(html).toContain('#story-loader-static { display: none !important; }');
    expect(html).toContain('sessionStorage');
    expect(html).toContain('portraitLoaderResume');
    expect(html).toContain('hidden-at');
    expect(html).toContain('resume-hash');
    expect(html).toContain('history.replaceState');
    expect(html).toContain('validationNumber >= 16');
    expect(html).toContain('validationNumber <= 40');
    expect(html).toContain('validationNumber === 42');
    expect(html).toContain('validationNumber === 43');
    expect(html).toContain('validationNumber === 44');
    expect(html).toContain('validationNumber === 45');
    expect(html).toContain('validationNumber === 46');
    expect(html).toContain('validationNumber === 47');
    expect(html).not.toContain('validationNumber === 41');
    expect(html).toContain("navigation?.type === 'reload'");
    expect(html).toContain('manuallyReloaded');
    expect(html.indexOf('if (completed && hiddenAt')).toBeLessThan(
      html.indexOf('else if (manuallyReloaded)')
    );
    expect(html).toContain("'__PHONE_STORY_PREBOOT_ENABLED__' === 'true'");
    expect(html).toContain("window.matchMedia('(pointer: coarse)').matches");
    expect(html).toContain("window.matchMedia('(hover: none)').matches");
    expect(html).toContain("documentElement.dataset.portraitEdgeScene = 'hero'");
    expect(html).toContain("documentElement.style.setProperty('--portrait-document-surface', '#07110e')");
    const viteConfig = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
    expect(viteConfig).toContain(
      ".replace('__PHONE_STORY_PREBOOT_ENABLED__', String(phoneStoryPrebootEnabled))"
    );
    const prebootPhoneRouteIndex = html.indexOf(
      "documentElement.dataset.portraitSpike = 'b'"
    );
    expect(prebootPhoneRouteIndex).toBeGreaterThan(0);
    expect(prebootPhoneRouteIndex).toBeLessThan(loaderIndex);
    expect(html).toContain('data-story-loader-static-cover="blank"');
    expect(html).not.toContain('<span>同人于野</span>');
    expect(html).toContain('html[data-portrait-spike="b"] .static-content { display: none !important; }');
    expect(html).toContain('background: var(--portrait-document-surface, #07110e) !important;');
  });
});

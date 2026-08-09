// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOADER_PHRASES,
  STORY_LOADER_TIMINGS,
  StoryLoader,
  loaderFrameAt,
  loaderSequenceDuration
} from './StoryLoader';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

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

  it('keeps an unproven phone target covered after the eight-second safety timer', () => {
    vi.useFakeTimers();
    const onExitStart = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(<StoryLoader
        mode="direct"
        ready={false}
        failed={false}
        allowSafetyExit={false}
        onExitStart={onExitStart}
      />);
    });
    act(() => vi.advanceTimersByTime(STORY_LOADER_TIMINGS.safetyMs + 1_000));
    expect(host.querySelector('[data-story-loader]')?.getAttribute('data-loader-status'))
      .toBe('running');
    expect(onExitStart).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('keeps a terminal phone boot failure covered for the accessible shell retry', () => {
    vi.useFakeTimers();
    const onExitStart = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<StoryLoader
      mode="direct"
      ready={false}
      failed
      allowSafetyExit={false}
      onExitStart={onExitStart}
    />));
    act(() => vi.advanceTimersByTime(STORY_LOADER_TIMINGS.safetyMs + 1_000));
    expect(host.querySelector('[data-story-loader]')?.getAttribute('data-loader-status'))
      .toBe('running');
    expect(onExitStart).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('renders one restrained live announcement and non-focusable visual ink layers', () => {
    const markup = renderToStaticMarkup(createElement(StoryLoader, {
      mode: 'cold-hero',
      ready: false,
      failed: false
    }));

    expect(markup).toContain('data-story-loader="true"');
    expect(markup).toContain('data-phone-loader="true"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup.match(/aria-live=/g)).toHaveLength(1);
    expect(markup).toContain('story-loader__ink-blur');
    expect(markup).toContain('story-loader__ink-clear');
    expect(markup).toContain('data-loader-ink-canvas="true"');
    expect(markup).toContain('data-loader-ink-status="idle"');
    expect(markup.match(/<canvas/g)).toHaveLength(1);
    expect(markup).not.toContain('tabindex="0"');
  });

  it('provides a pre-hydration loader with a no-JS escape before the React root', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const loaderIndex = html.indexOf('data-story-loader-static="true"');
    const rootIndex = html.indexOf('id="root"');
    expect(loaderIndex).toBeGreaterThan(0);
    expect(loaderIndex).toBeLessThan(rootIndex);
    const staticCover = html.slice(loaderIndex, html.indexOf('<noscript>', loaderIndex));
    expect(staticCover).not.toContain('story-loader__word');
    expect(staticCover).not.toMatch(/同人于野|观象知幂/);
    expect(html).toContain('data-loader-ink-fallback="true"');
    expect(html).not.toContain('mobile-landscape-entry-static');
    expect(html).toContain('#story-loader-static { display: none !important; }');
    expect(html).not.toContain('sessionStorage');
    expect(html).not.toContain('validationNumber');
    expect(html).not.toContain('portrait-spike');
    expect(html).toContain("window.matchMedia('(pointer: coarse)').matches");
    expect(html).toContain("window.matchMedia('(hover: none)').matches");
    expect(html).toContain("location.pathname === '/brand-lab'");
    expect(html).toContain("documentElement.dataset.phonePreboot = 'pending'");
    expect(html).toContain("documentElement.style.setProperty('--phone-preboot-surface', '#040807')");
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(viteConfig).not.toContain('__PHONE_STORY_PREBOOT_ENABLED__');
    const prebootPhoneRouteIndex = html.indexOf(
      "documentElement.dataset.phonePreboot = 'pending'"
    );
    expect(prebootPhoneRouteIndex).toBeGreaterThan(0);
    expect(prebootPhoneRouteIndex).toBeLessThan(loaderIndex);
    expect(html).toContain('html[data-phone-preboot] .static-content { display: none !important; }');
    expect(html).toContain('html[data-phone-preboot] :is(.loading-screen, .story-loader)');
    expect(html).toContain('background: var(--phone-preboot-surface, #040807) !important;');
  });
});

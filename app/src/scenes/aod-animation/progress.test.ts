import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AOD_ALPHA_BACKGROUND_HOLD_PROGRESS,
  AOD_FIRST_FULL_ALPHA_PROGRESS,
  AOD_PHONE_TIMELINE_ALPHA_END,
  AOD_PHONE_TIMELINE_ALPHA_START,
  AOD_SOURCE_ALPHA_END,
  AOD_TIMELINE_ALPHA_END,
  aodPlaybackRateForMediaProgress,
  mapAodMediaToTimelineProgress,
  mapAodTimelineToMediaProgress,
  renderAodTransitionProgress
} from './progress';

class FakeStyle {
  private readonly values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? '';
  }
}

class FakeAodSection {
  readonly dataset: Record<string, string> = { aodTransition: '' };
  readonly style = new FakeStyle();

  matches(selector: string): boolean {
    return selector === '[data-aod-transition]';
  }

  querySelector(): null {
    return null;
  }

  setAttribute(name: string, value: string): void {
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      this.dataset[key] = value;
    }
  }
}

const stylesheet = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

describe('AOD alpha compositing', () => {
  it('holds every AOD background layer through the first third and source alpha through 48%', () => {
    expect(AOD_ALPHA_BACKGROUND_HOLD_PROGRESS).toBeCloseTo(1 / 3);
    expect(AOD_TIMELINE_ALPHA_END).toBe(0.48);
    expect(mapAodTimelineToMediaProgress(0)).toBe(0);
    expect(mapAodTimelineToMediaProgress(AOD_TIMELINE_ALPHA_END)).toBeCloseTo(AOD_SOURCE_ALPHA_END, 8);
    expect(mapAodTimelineToMediaProgress(1 / 3)).toBeLessThan(AOD_SOURCE_ALPHA_END);
    expect(mapAodTimelineToMediaProgress(1)).toBe(1);

    const forward = [0, 0.1, 0.2, 1 / 3, 0.36, 0.5, 0.75, 1]
      .map(mapAodTimelineToMediaProgress);
    for (let index = 1; index < forward.length; index += 1) {
      expect(forward[index]).toBeGreaterThan(forward[index - 1] ?? -1);
    }
    expect([...forward].reverse()).toEqual([...forward].sort((a, b) => b - a));

    for (const timelineProgress of [0, 0.1, 0.2, 1 / 3, 0.36, 0.5, 0.75, 1]) {
      expect(
        mapAodMediaToTimelineProgress(mapAodTimelineToMediaProgress(timelineProgress))
      ).toBeCloseTo(timelineProgress, 8);
    }

    const alphaRate = aodPlaybackRateForMediaProgress(AOD_SOURCE_ALPHA_END - 0.0001);
    const opaqueRate = aodPlaybackRateForMediaProgress(AOD_SOURCE_ALPHA_END + 0.0001);
    expect(alphaRate).toBeLessThan(1);
    expect(opaqueRate).toBeGreaterThan(1);
    expect(
      AOD_TIMELINE_ALPHA_END * alphaRate
        + (1 - AOD_TIMELINE_ALPHA_END) * opaqueRate
    ).toBeCloseTo(1, 8);
  });

  it('aligns paper and backdrop ownership to the decoded first-full-alpha frame', () => {
    const section = new FakeAodSection();

    renderAodTransitionProgress(section as unknown as HTMLElement, 0.2);
    expect(section.dataset.aodAlphaComposite).toBe('true');
    expect(section.style.getPropertyValue('--aod-transition-paper-wash-opacity')).toBe('0.0000');
    expect(section.style.getPropertyValue('--aod-transition-bottom-mist-opacity')).toBe('0.0000');
    expect(section.style.getPropertyValue('--aod-transition-paper-solid-opacity')).toBe('0.0000');
    expect(section.style.getPropertyValue('--aod-transition-cloud-opacity')).toBe('0.9800');
    expect(section.style.getPropertyValue('--aod-transition-sun-opacity')).toBe('0.9600');

    renderAodTransitionProgress(
      section as unknown as HTMLElement,
      AOD_ALPHA_BACKGROUND_HOLD_PROGRESS
    );
    expect(section.style.getPropertyValue('--aod-transition-cloud-opacity')).toBe('0.9800');
    expect(section.style.getPropertyValue('--aod-transition-sun-opacity')).toBe('0.9600');

    renderAodTransitionProgress(section as unknown as HTMLElement, AOD_FIRST_FULL_ALPHA_PROGRESS - 0.0001);
    expect(section.dataset.aodAlphaComposite).toBe('true');
    renderAodTransitionProgress(section as unknown as HTMLElement, AOD_FIRST_FULL_ALPHA_PROGRESS);
    expect(section.dataset.aodAlphaComposite).toBe('false');
    expect(Number(section.dataset.aodMediaProgress)).toBeCloseTo(AOD_SOURCE_ALPHA_END, 4);
    expect(section.style.getPropertyValue('--aod-transition-cloud-opacity')).toBe('0.0000');
    expect(section.style.getPropertyValue('--aod-transition-sun-opacity')).toBe('0.0000');
  });

  it('keeps the phone surface/alpha handoff on the canonical 48% boundary', () => {
    expect(AOD_TIMELINE_ALPHA_END).toBe(0.48);
    expect(AOD_PHONE_TIMELINE_ALPHA_START).toBe(AOD_TIMELINE_ALPHA_END);
    expect(AOD_PHONE_TIMELINE_ALPHA_END).toBe(AOD_TIMELINE_ALPHA_END);
    expect(
      mapAodTimelineToMediaProgress(
        AOD_PHONE_TIMELINE_ALPHA_START,
        AOD_PHONE_TIMELINE_ALPHA_END
      )
    ).toBeCloseTo(AOD_SOURCE_ALPHA_END, 8);
    expect(
      mapAodTimelineToMediaProgress(
        AOD_PHONE_TIMELINE_ALPHA_END,
        AOD_PHONE_TIMELINE_ALPHA_END
      )
    ).toBeCloseTo(AOD_SOURCE_ALPHA_END, 8);

    for (const timelineProgress of [0, 0.2, 0.49, 0.54, 0.59, 0.8, 1]) {
      expect(
        mapAodMediaToTimelineProgress(
          mapAodTimelineToMediaProgress(
            timelineProgress,
            AOD_PHONE_TIMELINE_ALPHA_END
          ),
          AOD_PHONE_TIMELINE_ALPHA_END
        )
      ).toBeCloseTo(timelineProgress, 8);
    }

    const section = new FakeAodSection();
    renderAodTransitionProgress(
      section as unknown as HTMLElement,
      AOD_PHONE_TIMELINE_ALPHA_START,
      AOD_PHONE_TIMELINE_ALPHA_END,
      AOD_PHONE_TIMELINE_ALPHA_START
    );
    expect(section.dataset.aodAlphaComposite).toBe('false');
    expect(
      Number(section.style.getPropertyValue('--aod-transition-paper-wash-opacity'))
    ).toBeGreaterThan(0);
    renderAodTransitionProgress(
      section as unknown as HTMLElement,
      AOD_PHONE_TIMELINE_ALPHA_END,
      AOD_PHONE_TIMELINE_ALPHA_END,
      AOD_PHONE_TIMELINE_ALPHA_START
    );
    expect(section.dataset.aodAlphaComposite).toBe('false');
  });

  it('makes root, sticky, field, and reveal backings transparent without fading the whole layer', () => {
    expect(stylesheet).toMatch(
      /\[data-aod-exit-active="true"\][^}]*\[data-aod-alpha-composite="true"\][^}]*background:\s*transparent/s
    );
    expect(stylesheet).not.toMatch(
      /\[data-aod-exit-active="true"\][^}]*\[data-aod-alpha-composite="true"\][^}]*opacity:\s*0\./s
    );
  });

  it('keeps scene presentation pure and leaves media time to the presented-frame driver', () => {
    const section = new FakeAodSection();
    const video = { currentTime: 1.25, duration: 5.03 } as HTMLVideoElement;

    renderAodTransitionProgress(section as unknown as HTMLElement, 0.7);

    expect(video.currentTime).toBe(1.25);
  });
});

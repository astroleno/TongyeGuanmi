import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderAodTransitionProgress } from './progress';

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
  it('keeps every non-authored paper backing transparent through the first third', () => {
    const section = new FakeAodSection();

    renderAodTransitionProgress(section as unknown as HTMLElement, 0.2);
    expect(section.dataset.aodAlphaComposite).toBe('true');
    expect(section.style.getPropertyValue('--aod-transition-paper-wash-opacity')).toBe('0.0000');
    expect(section.style.getPropertyValue('--aod-transition-bottom-mist-opacity')).toBe('0.0000');
    expect(section.style.getPropertyValue('--aod-transition-paper-solid-opacity')).toBe('0.0000');

    renderAodTransitionProgress(section as unknown as HTMLElement, 1 / 3);
    expect(section.dataset.aodAlphaComposite).toBe('true');
    renderAodTransitionProgress(section as unknown as HTMLElement, 0.34);
    expect(section.dataset.aodAlphaComposite).toBe('false');
  });

  it('makes root, sticky, field, and reveal backings transparent without fading the whole layer', () => {
    expect(stylesheet).toMatch(
      /\[data-r3-transition="aod-method-top"\][^}]*\[data-aod-alpha-composite="true"\][^}]*background:\s*transparent/s
    );
    expect(stylesheet).not.toMatch(
      /\[data-r3-transition="aod-method-top"\][^}]*\[data-aod-alpha-composite="true"\][^}]*opacity:\s*0\./s
    );
  });

  it('keeps scene presentation pure and leaves media time to the presented-frame driver', () => {
    const section = new FakeAodSection();
    const video = { currentTime: 1.25, duration: 5.03 } as HTMLVideoElement;

    renderAodTransitionProgress(section as unknown as HTMLElement, 0.7, { video });

    expect(video.currentTime).toBe(1.25);
  });
});

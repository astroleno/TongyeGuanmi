import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hashForScene, sceneFromHash } from '../../../production/navigation';
import {
  PHONE_EDUCATION_INPUT_POLICY,
  PhoneEducation
} from './PhoneEducation';

describe('PhoneEducation', () => {
  it('keeps one canonical Education article in native document flow', () => {
    const markup = renderToStaticMarkup(createElement(PhoneEducation, {
      active: true,
      reducedMotion: false
    }));

    expect(markup).toContain('id="education"');
    expect(markup.match(/data-r4-scene="education"/g)).toHaveLength(1);
    expect(markup.match(/data-reading-scrollport="true"/g)).toHaveLength(1);
    expect(markup).toContain('data-phone-input-owner="native-document"');
    expect(markup).not.toContain('tabindex="-1"');
  });

  it('keeps wheel, touch, keyboard, and focus with the reading document', () => {
    expect(PHONE_EDUCATION_INPUT_POLICY).toEqual({
      wheel: 'native',
      touch: 'native',
      keyboard: 'native',
      focus: 'native'
    });
  });

  it('uses the shared Education hash rather than a phone-only navigation map', () => {
    expect(hashForScene('education')).toBe('#education');
    expect(sceneFromHash('#education')).toBe('education');
  });

  it('keeps the authored intro and programme as two native full-viewport acts', () => {
    const stylesheet = readFileSync(new URL('./PhoneEducation.css', import.meta.url), 'utf8');

    expect(stylesheet).toContain('min-height: 200svh');
    expect(stylesheet).toContain('min-height: 100svh');
    expect(stylesheet).toContain('overflow: visible');
    expect(stylesheet).not.toContain('overflow-y: auto');
  });
});

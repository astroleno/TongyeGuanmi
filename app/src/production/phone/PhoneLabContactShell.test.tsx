import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  PhoneLabContactShell,
  phoneLabContactEntryScene,
  phoneLabContactInitialAdapterPlan
} from './PhoneLabContactShell';

describe('PhoneLabContactShell', () => {
  it('cuts the validation journey at Lab without mounting the Grade A shell', () => {
    const markup = renderToStaticMarkup(createElement(PhoneLabContactShell, {
      validationMode: 'v36'
    }));

    expect(markup).toContain('data-phone-acceptance-route="lab-contact"');
    expect(markup).toContain('data-phone-acceptance-chapter="lab"');
    expect(markup).toContain('data-phone-acceptance-chapter="contact"');
    expect(markup).not.toContain('portrait-scroll-spike');
    expect(markup).not.toContain('PhoneGradeAStory');
  });

  it('keeps direct target hashes inside the Lab → Contact acceptance set', () => {
    expect(phoneLabContactEntryScene('#ph-animation')).toBe('ph-animation');
    expect(phoneLabContactEntryScene('#education')).toBe('education');
    expect(phoneLabContactEntryScene('#crane-animation')).toBe('crane-animation');
    expect(phoneLabContactEntryScene('#contact')).toBe('contact');
    expect(phoneLabContactEntryScene('#services')).toBe('lab');
  });

  it('loads only Contact for direct Contact entry', () => {
    expect(phoneLabContactInitialAdapterPlan('contact')).toEqual({
      scenes: ['contact'],
      transitions: []
    });
    expect(phoneLabContactInitialAdapterPlan('lab')).toEqual({
      scenes: ['lab', 'ph-animation'],
      transitions: ['lab-ph']
    });
  });
});

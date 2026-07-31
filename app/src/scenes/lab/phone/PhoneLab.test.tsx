import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LAB_COPY } from '..';
import {
  PhoneLab,
  phoneLabFrame,
  phoneLabStaticPresentationFrame
} from './PhoneLab';

describe('PhoneLab', () => {
  it('is directly hash-addressable and exposes the stable Lab → PH input', () => {
    const markup = renderToStaticMarkup(createElement(PhoneLab, {
      active: true,
      reducedMotion: false
    }));

    expect(markup).toContain('id="lab"');
    expect(markup).toContain('data-phone-reading="native-document"');
    expect(markup).toContain('data-phone-lab-stable-input="lab-ph"');
    expect(markup).toContain(LAB_COPY[10]);
    expect(markup.match(/phone-lab__screen--intro/g)).toHaveLength(1);
    expect(markup.match(/phone-lab__screen--scenarios/g)).toHaveLength(1);
    expect(markup.match(/phone-lab__row/g)).toHaveLength(6);
    expect(markup).not.toContain('<video');
    expect(markup).not.toContain('ttg-figure-motion');
  });

  it('has reversible local entrance frames and a reduced-motion endpoint', () => {
    expect(phoneLabFrame(0)).toEqual({
      progress: 0,
      opacity: 0.98,
      y: 10
    });
    expect(phoneLabFrame(1)).toEqual({
      progress: 1,
      opacity: 1,
      y: 0
    });
    expect(phoneLabFrame(0.2, true)).toEqual(phoneLabFrame(1));
  });

  it('[Services↔TTG hard cutover] returns a raw static poster with the leaf\'s original immutable token', () => {
    const token = {
      authorityId: 'brand-lab-authority',
      sessionId: 'services-lab-reduced',
      generation: 9,
      leg: 1,
      revision: 14,
      subject: 'native:lab',
      kind: 'static-poster'
    } as const;

    const frame = phoneLabStaticPresentationFrame(token, 1, 42);

    expect(frame).toEqual({
      token,
      frameSequence: 1,
      observedAt: 42,
      origin: 'leaf-static-poster'
    });
    expect(frame.token).toBe(token);
  });
});

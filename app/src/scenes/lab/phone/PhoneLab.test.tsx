import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PhoneLeafReportPort } from '../../../production/phone-story/presentation';
import { LAB_COPY } from '..';
import {
  PhoneLab,
  phoneLabFrame,
  phoneLabReceiverLanding,
  phoneLabReceiverOffset
} from './PhoneLab';

const reports = {
  registerMount() {}, reportPrepared() {}, reportFrame() {}, reportProgress() {},
  reportComplete() {}, reportFailure() {}
} satisfies PhoneLeafReportPort;

describe('PhoneLab', () => {
  it('is directly hash-addressable and exposes the stable Lab → PH input', () => {
    const markup = renderToStaticMarkup(createElement(PhoneLab, {
      reports
    }));

    expect(markup).toContain('id="lab"');
    expect(markup).not.toContain('data-phone-reading=');
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

  it('maps incoming receiver direction to the same native reading edge', () => {
    expect(phoneLabReceiverLanding('ttg-lab', 'forward', 'target')).toBe('top');
    expect(phoneLabReceiverLanding('lab-ph', 'reverse', 'target')).toBe('bottom');
    expect(phoneLabReceiverLanding('lab-ph', 'forward', 'source')).toBe('captured');
    expect(phoneLabReceiverOffset('top', 2_100, 844)).toBe(0);
    expect(phoneLabReceiverOffset('bottom', 2_100, 844)).toBe(-1_256);
    expect(phoneLabReceiverOffset('captured', 2_100, 844)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  PHONE_STAGE_SCROLL_VIEWPORTS,
  phoneStageCoverageHeight,
  phoneStageGeometry,
  phoneViewportCoverageBottom
} from './phone-viewport';

describe('phone stage viewport geometry', () => {
  it('keeps rail distance deterministic from the live visual viewport', () => {
    expect(phoneStageGeometry({ width: 390, height: 844 })).toEqual({
      width: 390,
      height: 844,
      railHeight: Math.round(844 * PHONE_STAGE_SCROLL_VIEWPORTS),
      orientation: 'portrait'
    });
  });

  it('updates geometry in place for landscape without choosing another shell', () => {
    expect(phoneStageGeometry({ width: 844, height: 390 })).toMatchObject({
      orientation: 'landscape',
      railHeight: Math.round(390 * PHONE_STAGE_SCROLL_VIEWPORTS)
    });
  });

  it('retains fixed-stage coverage while the iOS browser chrome collapses', () => {
    expect(phoneStageCoverageHeight(724, 844)).toBe(844);
    expect(phoneStageCoverageHeight(844, 724)).toBe(844);
    expect(phoneStageCoverageHeight(844, 390, true)).toBe(390);
  });

  it('covers the visual viewport bottom in layout-viewport coordinates', () => {
    expect(phoneViewportCoverageBottom(714, 0)).toBe(714);
    expect(phoneViewportCoverageBottom(714, 10)).toBe(724);
    expect(phoneViewportCoverageBottom(713.4, 10.2)).toBe(724);
  });

  it('ignores negative toolbar offsets and keeps one full CSS pixel', () => {
    expect(phoneViewportCoverageBottom(714, -12)).toBe(714);
    expect(phoneViewportCoverageBottom(0, 0)).toBe(1);
  });
});

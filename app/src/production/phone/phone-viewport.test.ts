import { describe, expect, it } from 'vitest';
import {
  PHONE_STAGE_SCROLL_VIEWPORTS,
  phoneStageGeometry
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
});

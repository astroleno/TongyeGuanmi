import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { phoneSurfaceRoleZIndex } from './phone-surface-roles';

const stageStyles = readFileSync(
  new URL('./PhoneStageRail.css', import.meta.url),
  'utf8'
);

describe('phone surface role contract', () => {
  it('keeps layer mapping pure so only the projector writes surface datasets', () => {
    expect(phoneSurfaceRoleZIndex('retained-under-stage')).toBe(9);
    expect(phoneSurfaceRoleZIndex('retired')).toBe(9);
    expect(phoneSurfaceRoleZIndex('fixed-current')).toBe(10);
    expect(phoneSurfaceRoleZIndex('stable')).toBe(11);
    expect(phoneSurfaceRoleZIndex('candidate-stable')).toBe(11);
    expect(phoneSurfaceRoleZIndex('transition-source')).toBe(12);
    expect(phoneSurfaceRoleZIndex('transition-receiver')).toBe(12);
  });

  it('maps projector roles above the edge fallback and fixed stage', () => {
    expect(stageStyles).toMatch(
      /phone-surface-role="retained-under-stage"[^}]*z-index:\s*9/s
    );
    expect(stageStyles).toMatch(
      /phone-surface-role="fixed-current"[^}]*z-index:\s*10/s
    );
    expect(stageStyles).toMatch(
      /phone-surface-role="stable"[^}]*z-index:\s*11/s
    );
    expect(stageStyles).toMatch(
      /phone-surface-role="transition-source"[^}]*z-index:\s*12/s
    );
  });
});

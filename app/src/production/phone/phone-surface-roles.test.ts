import { describe, expect, it } from 'vitest';
import { phoneSurfaceRoleZIndex } from './phone-surface-roles';

describe('phone surface role contract', () => {
  it('keeps layer mapping pure so only the projector writes surface datasets', () => {
    expect(phoneSurfaceRoleZIndex('retained-under-stage')).toBeLessThan(
      phoneSurfaceRoleZIndex('fixed-current')
    );
    expect(phoneSurfaceRoleZIndex('fixed-current')).toBeLessThan(
      phoneSurfaceRoleZIndex('stable')
    );
    expect(phoneSurfaceRoleZIndex('stable')).toBeLessThan(
      phoneSurfaceRoleZIndex('transition-source')
    );
    expect(phoneSurfaceRoleZIndex('transition-source')).toBeLessThan(
      phoneSurfaceRoleZIndex('transition-receiver')
    );
  });
});

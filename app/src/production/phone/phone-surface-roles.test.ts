import { describe, expect, it } from 'vitest';
import { phoneSurfaceRoleLocalLayerOrder } from './phone-story/presentation';

describe('phone surface role contract', () => {
  it('keeps layer mapping pure so only the projector writes surface datasets', () => {
    expect(phoneSurfaceRoleLocalLayerOrder('retained-under-stage')).toBeLessThan(
      phoneSurfaceRoleLocalLayerOrder('fixed-current')
    );
    expect(phoneSurfaceRoleLocalLayerOrder('fixed-current')).toBeLessThan(
      phoneSurfaceRoleLocalLayerOrder('stable')
    );
    expect(phoneSurfaceRoleLocalLayerOrder('stable')).toBeLessThan(
      phoneSurfaceRoleLocalLayerOrder('transition-source')
    );
    expect(phoneSurfaceRoleLocalLayerOrder('transition-source')).toBeLessThan(
      phoneSurfaceRoleLocalLayerOrder('transition-receiver')
    );
  });
});

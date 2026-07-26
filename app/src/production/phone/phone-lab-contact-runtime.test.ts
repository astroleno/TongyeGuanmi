import { describe, expect, it } from 'vitest';
import { phoneLabContactRunForVisual } from './phone-lab-contact-runtime';

describe('canonical Lab through Contact runtime projection', () => {
  it('maps PH and Crane to their complete composite runs', () => {
    expect(phoneLabContactRunForVisual('ph-animation')).toBe('lab-education');
    expect(phoneLabContactRunForVisual('crane-animation')).toBe(
      'education-contact'
    );
  });
});

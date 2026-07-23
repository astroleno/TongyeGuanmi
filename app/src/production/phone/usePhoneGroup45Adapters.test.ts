import { describe, expect, it } from 'vitest';
import { group45AdapterPlanForEntry } from './usePhoneGroup45Adapters';

describe('Unit 5 phone adapter loading plan', () => {
  it('keeps reading geometry and prewarms only Brand adjacent media', () => {
    expect(group45AdapterPlanForEntry('brand')).toEqual({
      scenes: ['brand', 'services', 'lab', 'figure3-animation'],
      transitions: ['brand-figure3', 'figure3-services']
    });
  });

  it('does not fetch or replay previous visual scenes for direct entry', () => {
    expect(group45AdapterPlanForEntry('services')).toEqual({
      scenes: ['services', 'lab', 'ttg-animation'],
      transitions: ['services-ttg', 'ttg-lab']
    });
    expect(group45AdapterPlanForEntry('lab')).toEqual({
      scenes: ['lab'],
      transitions: []
    });
  });

  it('keeps both sides of an active visual when a newer prewarm plan wins', () => {
    expect(group45AdapterPlanForEntry('brand', 'figure3-animation')).toEqual({
      scenes: ['brand', 'services', 'lab', 'figure3-animation'],
      transitions: ['brand-figure3', 'figure3-services']
    });
    expect(group45AdapterPlanForEntry('brand', 'services')).toEqual({
      scenes: ['brand', 'services', 'lab', 'ttg-animation'],
      transitions: ['services-ttg', 'ttg-lab']
    });
    expect(group45AdapterPlanForEntry('brand', 'ttg-animation')).toEqual({
      scenes: ['brand', 'services', 'lab', 'ttg-animation'],
      transitions: ['services-ttg', 'ttg-lab']
    });
  });

  it('stops at Lab without adding the Unit 6 Lab to PH boundary', () => {
    expect(group45AdapterPlanForEntry('brand', 'lab')).toEqual({
      scenes: ['brand', 'services', 'lab'],
      transitions: []
    });
  });
});

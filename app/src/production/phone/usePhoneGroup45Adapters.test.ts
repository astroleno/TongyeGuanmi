import { describe, expect, it } from 'vitest';
import { group45AdapterPlanForEntry } from './usePhoneGroup45Adapters';

describe('Unit 5 phone adapter loading plan', () => {
  it('loads the complete independently split Brand → Lab batch from its stable receiver', () => {
    expect(group45AdapterPlanForEntry('brand')).toEqual({
      scenes: ['brand', 'figure3-animation', 'services', 'ttg-animation', 'lab'],
      transitions: ['brand-figure3', 'figure3-services', 'services-ttg', 'ttg-lab']
    });
  });

  it('does not fetch or replay previous visual scenes for a Services or Lab hash', () => {
    expect(group45AdapterPlanForEntry('services')).toEqual({
      scenes: ['services', 'ttg-animation', 'lab'],
      transitions: ['services-ttg', 'ttg-lab']
    });
    expect(group45AdapterPlanForEntry('lab')).toEqual({
      scenes: ['lab'],
      transitions: []
    });
  });
});

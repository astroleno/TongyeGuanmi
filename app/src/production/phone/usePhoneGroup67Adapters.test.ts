import { describe, expect, it } from 'vitest';
import { group67AdapterPlanForFocus } from './usePhoneGroup67Adapters';

describe('Group6–7 adjacent adapter planning', () => {
  it('prepares the complete Lab→PH→Education closure at the Lab boundary', () => {
    expect(group67AdapterPlanForFocus('lab')).toEqual({
      scenes: ['ph-animation', 'education'],
      transitions: ['lab-ph', 'ph-education']
    });
  });

  it('keeps the complete remaining composite closure in each active plan', () => {
    expect(group67AdapterPlanForFocus('ph-animation')).toEqual({
      scenes: ['ph-animation', 'education'],
      transitions: ['ph-education']
    });
    expect(group67AdapterPlanForFocus('education')).toEqual({
      scenes: ['education', 'crane-animation', 'contact'],
      transitions: ['education-crane', 'crane-contact']
    });
    expect(group67AdapterPlanForFocus('crane-animation')).toEqual({
      scenes: ['crane-animation', 'contact'],
      transitions: ['crane-contact']
    });
  });

  it('keeps direct Contact cold and terminal', () => {
    expect(group67AdapterPlanForFocus('contact')).toEqual({
      scenes: ['contact'],
      transitions: []
    });
  });
});

import { describe, expect, it } from 'vitest';
import { group67AdapterPlanForFocus } from './usePhoneGroup67Adapters';

describe('Group6–7 adjacent adapter planning', () => {
  it('prepares the complete Lab→PH→Education closure at the Lab boundary', () => {
    expect(group67AdapterPlanForFocus('lab')).toEqual({
      scenes: ['ph-animation', 'education'],
      transitions: ['lab-ph', 'ph-education']
    });
  });

  it('prepares every immediate inbound and outbound composite closure', () => {
    expect(group67AdapterPlanForFocus('ph-animation')).toEqual({
      scenes: ['ph-animation', 'education'],
      transitions: ['lab-ph', 'ph-education']
    });
    expect(group67AdapterPlanForFocus('education')).toEqual({
      scenes: ['ph-animation', 'education', 'crane-animation', 'contact'],
      transitions: [
        'lab-ph',
        'ph-education',
        'education-crane',
        'crane-contact'
      ]
    });
    expect(group67AdapterPlanForFocus('crane-animation')).toEqual({
      scenes: ['education', 'crane-animation', 'contact'],
      transitions: ['education-crane', 'crane-contact']
    });
  });

  it('keeps a direct Contact reverse-ready before its first user input', () => {
    expect(group67AdapterPlanForFocus('contact')).toEqual({
      scenes: ['education', 'crane-animation', 'contact'],
      transitions: ['education-crane', 'crane-contact']
    });
  });
});

import { describe, expect, it } from 'vitest';
import { semanticBoolean } from './semantic-data-attribute';

describe('semanticBoolean', () => {
  it('keeps CSS boolean data attributes textual under production minification', () => {
    expect(semanticBoolean(true)).toBe('true');
    expect(semanticBoolean(false)).toBe('false');
  });
});

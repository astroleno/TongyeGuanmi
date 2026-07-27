import { describe, expect, it } from 'vitest';
import { phoneRouteScopeForPathname } from './phone-route-scope';

describe('phone route scope', () => {
  it('admits only the normalized brand-lab pathname to the QA scope', () => {
    expect(phoneRouteScopeForPathname('/')).toBe('formal');
    expect(phoneRouteScopeForPathname('/brand-lab')).toBe('brand-lab');
    expect(phoneRouteScopeForPathname('/brand-lab/')).toBe('brand-lab');
    expect(phoneRouteScopeForPathname('/brand-lab////')).toBe('brand-lab');
    expect(phoneRouteScopeForPathname('/index.html')).toBe('formal');
  });
});

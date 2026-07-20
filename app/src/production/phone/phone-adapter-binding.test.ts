import { describe, expect, it } from 'vitest';
import { phoneAdapterHandleChanged } from './phone-adapter-binding';

describe('phone adapter binding', () => {
  it('publishes a render revision when a lazy adapter handle arrives', () => {
    const handle = {};
    expect(phoneAdapterHandleChanged(null, handle)).toBe(true);
  });

  it('does not republish unchanged handles', () => {
    const handle = {};
    expect(phoneAdapterHandleChanged(handle, handle)).toBe(false);
  });
});

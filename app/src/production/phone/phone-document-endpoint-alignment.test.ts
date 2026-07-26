import { describe, expect, it } from 'vitest';
import {
  acquirePhoneDocumentEndpointAlignment
} from './phone-document-endpoint-alignment';

function endpoint(
  bottom: number,
  top: number | (() => number) = 0
) {
  const properties = new Map<string, string>();
  return {
    dataset: {} as DOMStringMap,
    style: {
      setProperty(name: string, value: string) {
        properties.set(name, value);
      },
      removeProperty(name: string) {
        properties.delete(name);
      },
      getPropertyValue(name: string) {
        return properties.get(name) ?? '';
      }
    },
    getBoundingClientRect: () => ({
      bottom,
      top: typeof top === 'function' ? top() : top
    }),
    closest: () => null
  } as unknown as HTMLElement;
}

describe('phone native document endpoint alignment', () => {
  it('aligns the real document tail with the fixed viewport', () => {
    const element = endpoint(812.5);
    const lease = acquirePhoneDocumentEndpointAlignment(
      element,
      { sessionId: 'session-1', generation: 2 },
      844
    );

    expect(element.dataset.phoneDocumentEndpointAligned).toBe('true');
    expect(element.dataset.phoneBoundarySession).toBe('session-1');
    expect(element.style.getPropertyValue(
      '--phone-document-endpoint-align-y'
    )).toBe('31.500px');

    lease.release();
    expect(element.dataset.phoneDocumentEndpointAligned).toBeUndefined();
    expect(element.style.getPropertyValue(
      '--phone-document-endpoint-align-y'
    )).toBe('');
  });

  it('ignores a stale release after a newer run owns the endpoint', () => {
    const element = endpoint(844);
    const stale = acquirePhoneDocumentEndpointAlignment(
      element,
      { sessionId: 'session-1', generation: 1 },
      844
    );
    const current = acquirePhoneDocumentEndpointAlignment(
      element,
      { sessionId: 'session-2', generation: 2 },
      844
    );

    stale.release();
    expect(element.dataset.phoneBoundarySession).toBe('session-2');
    current.release();
    expect(element.dataset.phoneBoundarySession).toBeUndefined();
  });
});

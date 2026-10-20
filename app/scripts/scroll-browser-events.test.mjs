import { describe, expect, it } from 'vitest';
import { collectScrollBrowserEvents } from './scroll-browser-events.mjs';

const context = (id, origin, isDefault) => ({ method: 'Runtime.executionContextCreated',
  params: { context: { id, origin, auxData: { isDefault } } } });
const exception = id => ({ method: 'Runtime.exceptionThrown',
  params: { exceptionDetails: { executionContextId: id, text: 'Access to storage is not allowed from this context.' } } });

describe('Ego browser event provenance', () => {
  it('keeps page exceptions even when their wording resembles extension noise', () => {
    const state = collectScrollBrowserEvents(undefined, [context(1, 'https://tongye.me', true), exception(1)]);
    expect(state.errors).toHaveLength(1);
    expect(state.externalBrowserErrors).toEqual([]);
  });
  it('records proven isolated extension exceptions separately without discarding them', () => {
    const state = collectScrollBrowserEvents(undefined, [context(2, 'chrome-extension://test', false), exception(2)]);
    expect(state.errors).toEqual([]);
    expect(state.externalBrowserErrors).toHaveLength(1);
    expect(state.externalBrowserErrors[0].error.details.text).toContain('storage');
  });
  it('does not trust an extension-looking origin alone or an arbitrary isolated world', () => {
    for (const [origin, isDefault] of [['chrome-extension://test', true], ['https://tongye.me', false], ['chrome-extension://test', undefined]]) {
      expect(collectScrollBrowserEvents(undefined, [context(2, origin, isDefault), exception(2)]).errors).toHaveLength(1);
    }
  });
  it('fails closed when the world is unknown or has already been destroyed', () => {
    expect(collectScrollBrowserEvents(undefined, [exception(2)]).errors).toHaveLength(1);
    const state = collectScrollBrowserEvents(undefined, [context(2, 'chrome-extension://test', false),
      { method: 'Runtime.executionContextDestroyed', params: { executionContextId: 2 } }, exception(2)]);
    expect(state.errors).toHaveLength(1);
  });
  it('classifies in event order when navigation recycles a context id', () => {
    const state = collectScrollBrowserEvents(undefined, [context(2, 'chrome-extension://test', false), exception(2),
      { method: 'Runtime.executionContextsCleared' }, context(2, 'https://tongye.me', true), exception(2)]);
    expect(state.externalBrowserErrors).toHaveLength(1);
    expect(state.errors).toHaveLength(1);
    expect(state.contexts).toEqual([{ id: 2, origin: 'https://tongye.me', isDefault: true }]);
  });
  it('preserves context and failure state across buffered-event rounds', () => {
    const first = collectScrollBrowserEvents(undefined, [context(2, 'chrome-extension://test', false), exception(2)]);
    const second = collectScrollBrowserEvents(first, [exception(2), exception(9)]);
    expect(second.externalBrowserErrors).toHaveLength(2);
    expect(second.errors).toHaveLength(1);
    expect(first.externalBrowserErrors).toHaveLength(1);
  });
  it('retains console errors, WebGL warnings and unclassified protocol log errors', () => {
    const events = [context(1, 'https://tongye.me', true),
      { method: 'Runtime.consoleAPICalled', params: { executionContextId: 1, type: 'error', args: [{ value: 'app error' }] } },
      { method: 'Runtime.consoleAPICalled', params: { executionContextId: 1, type: 'warning', args: [{ description: 'GL_INVALID_OPERATION' }] } },
      { method: 'Log.entryAdded', params: { entry: { level: 'error', url: 'chrome-extension://test', text: 'unknown world' } } }];
    expect(collectScrollBrowserEvents(undefined, events).errors).toHaveLength(3);
  });
  it('does not classify ordinary logs as failures', () => {
    const state = collectScrollBrowserEvents(undefined, [{ method: 'Runtime.consoleAPICalled', params: { type: 'log', args: [{ value: 'ready' }] } }]);
    expect(state.errors).toEqual([]);
    expect(state.externalBrowserErrors).toEqual([]);
  });
});

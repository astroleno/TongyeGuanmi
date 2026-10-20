// Classify only proven isolated extension worlds separately. A page URL, an
// error's wording, or a missing context is never sufficient to ignore it.
export function collectScrollBrowserEvents(previous = {}, events = []) {
  const contexts = new Map((previous.contexts ?? []).map(context => [context.id, context]));
  const errors = [...(previous.errors ?? [])];
  const externalBrowserErrors = [...(previous.externalBrowserErrors ?? [])];
  for (const { method, params = {} } of events) {
    if (method === 'Runtime.executionContextsCleared') contexts.clear();
    if (method === 'Runtime.executionContextDestroyed') contexts.delete(params.executionContextId);
    if (method === 'Runtime.executionContextCreated') {
      const context = params.context;
      contexts.set(context.id, {
        id: context.id, origin: context.origin,
        isDefault: context.auxData?.isDefault
      });
    }
    let error;
    let contextId;
    if (method === 'Runtime.exceptionThrown') {
      error = { method, details: params.exceptionDetails };
      contextId = params.exceptionDetails?.executionContextId;
    } else if (method === 'Runtime.consoleAPICalled') {
      const text = (params.args ?? []).map(arg => arg.value ?? arg.description ?? '').join(' ');
      if (params.type === 'error' || /GL_INVALID|WebGL.*(lost|failed)/i.test(text)) {
        error = { method, type: params.type, text };
        contextId = params.executionContextId;
      }
    } else if (method === 'Log.entryAdded' && params.entry?.level === 'error') {
      error = { method, details: params.entry };
    }
    if (!error) continue;
    const context = contexts.get(contextId);
    if (context?.isDefault === false && context.origin?.startsWith('chrome-extension://')) {
      externalBrowserErrors.push({ error, context, classification: 'proven isolated extension world' });
    } else errors.push(error);
  }
  return { contexts: [...contexts.values()], errors, externalBrowserErrors };
}

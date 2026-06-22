export { createHandoffReceiver } from './handoff-receiver.js';

export function createHandoffPreview(options) {
  console.warn('createHandoffPreview is deprecated; use createHandoffReceiver for single-DOM handoffs.', options);
  return null;
}

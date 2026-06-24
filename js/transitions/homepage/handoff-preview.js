export { createHandoffReceiver } from './handoff-receiver.js';

export function createHandoffPreview(options) {
  console.warn('createHandoffPreview is deprecated; use the homepage scene timeline for handoffs.', options);
  return null;
}

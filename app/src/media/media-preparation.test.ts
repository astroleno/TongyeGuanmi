import { describe, expect, it } from 'vitest';

import {
  createLinkedAbortController,
  MediaPreparationError
} from './media-preparation';

describe('media preparation lifecycle', () => {
  it('propagates the parent abort reason exactly once', () => {
    const parent = new AbortController();
    const linked = createLinkedAbortController(parent.signal);
    const reason = new MediaPreparationError(
      'MEDIA_PREPARATION_ABORTED',
      'parent preparation was superseded'
    );

    parent.abort(reason);
    linked.dispose();
    linked.dispose();

    expect(linked.controller.signal.aborted).toBe(true);
    expect(linked.controller.signal.reason).toBe(reason);
  });

  it('detaches from a live parent without aborting the child', () => {
    const parent = new AbortController();
    const linked = createLinkedAbortController(parent.signal);

    linked.dispose();
    parent.abort(new Error('late parent abort'));

    expect(linked.controller.signal.aborted).toBe(false);
  });

  it('links an already-aborted parent synchronously', () => {
    const parent = new AbortController();
    const reason = new MediaPreparationError(
      'MEDIA_PREPARATION_TIMEOUT',
      'preparation timed out'
    );
    parent.abort(reason);

    const linked = createLinkedAbortController(parent.signal);

    expect(linked.controller.signal.aborted).toBe(true);
    expect(linked.controller.signal.reason).toBe(reason);
  });
});

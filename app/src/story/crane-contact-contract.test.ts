import { describe, expect, it } from 'vitest';
import { CRANE_CONTACT_COPY_CUE } from './crane-contact-contract';
import { storyManifest } from './manifest';

describe('Crane→Contact runtime projection', () => {
  it('stays equal to the canonical manifest copy cue', () => {
    const segment = storyManifest.nodes.find(
      (node) => node.kind === 'segment' && node.id === 'crane-contact'
    );

    expect(CRANE_CONTACT_COPY_CUE).toEqual(
      segment?.kind === 'segment' ? segment.copyCue : undefined
    );
  });
});

import { describe, expect, it } from 'vitest';
import { inventoryManifestSeed } from '../../story/manifest';
import { METHOD_TOP_COPY } from './index';

describe('method-top copy baseline', () => {
  it('uses the R-1 method top split verbatim', () => {
    const method = inventoryManifestSeed.copySections.find((section) => section.sectionId === 'method');
    expect(method?.normalizedText.slice(0, METHOD_TOP_COPY.length)).toEqual([...METHOD_TOP_COPY]);
  });
});

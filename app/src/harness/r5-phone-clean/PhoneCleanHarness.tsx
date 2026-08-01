import { PhoneStoryShell } from '../../production/phone-story/PhoneStoryShell';

const harnessChunkRecovery = Object.freeze({
  reportRejectedChunk: async () => 'fail-closed' as const,
  markStable: () => undefined
});

export function PhoneCleanHarness() {
  return (
    <PhoneStoryShell
      scope="harness"
      diagnostics
      chunkRecovery={harnessChunkRecovery}
    />
  );
}

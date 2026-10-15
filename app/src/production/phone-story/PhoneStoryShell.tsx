import { StoryScrollShell } from '../StoryScrollShell';
import { createPhoneScrollPlatform } from './scroll-platform';
import type { PhoneEntryRequest } from './protocol';
import type { PhoneChunkRecoveryPort } from './runtime';
import './styles.css';

export type PhoneStoryShellProps = Readonly<{
  scope?: 'formal' | 'brand-lab' | 'harness';
  initialEntry?: PhoneEntryRequest;
  diagnostics?: boolean;
  chunkRecovery: PhoneChunkRecoveryPort;
}>;

export function PhoneStoryShell({ scope = 'formal', initialEntry, chunkRecovery }: PhoneStoryShellProps) {
  return <StoryScrollShell platform="phone" createPlatform={createPhoneScrollPlatform}
    scope={scope} chunkRecovery={chunkRecovery} {...(initialEntry ? { initialHash: initialEntry.hash } : {})} />;
}

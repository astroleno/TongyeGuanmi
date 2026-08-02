import {
  PhoneStoryShell,
  type PhoneStoryShellProps
} from './PhoneStoryShell';

export function PhoneBrandLabStory({
  chunkRecovery
}: Pick<PhoneStoryShellProps, 'chunkRecovery'>) {
  return (
    <PhoneStoryShell
      scope="brand-lab"
      initialEntry={{
        pathname: '/brand-lab',
        hash: '#brand',
        origin: 'initial'
      }}
      diagnostics
      chunkRecovery={chunkRecovery}
    />
  );
}

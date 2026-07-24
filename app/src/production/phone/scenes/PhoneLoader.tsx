import { StoryLoader } from '../../StoryLoader';
import type { PhoneLoaderAdapterProps } from '../types';

/**
 * Loader is a presentation adapter, not shell markup. StoryLoader keeps the
 * frozen ink sequence and lifecycle; this boundary only assigns ownership to
 * the phone front-half adapter group.
 */
export function PhoneLoader({
  mode,
  ready,
  failed,
  startedAt,
  onHidden
}: PhoneLoaderAdapterProps) {
  return (
    <StoryLoader
      mode={mode}
      ready={ready}
      failed={failed}
      startedAt={startedAt}
      onHidden={onHidden}
    />
  );
}

export default PhoneLoader;

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import {
  STORY_LOADER_TIMINGS,
  StoryLoader,
  type StoryLoaderExitReason
} from '../StoryLoader';
import { revealStaticPhoneStoryFallback } from '../phone-story-fallback';
import { phoneGroup67EntryPlanFromHash } from './phone-entry-plan';
import { phoneLoaderCompletedInDocument } from './phone-loader-lifecycle';
import type { PhoneStoryShellProps } from './PhoneStoryShell';

const PhoneStoryShell = lazy(() => import('./PhoneStoryShell').then((module) => ({
  default: module.PhoneStoryShell
})));

const BOOTSTRAP_SAFETY_MS = STORY_LOADER_TIMINGS.safetyMs;

function coldLoaderRequired(): boolean {
  if (typeof window === 'undefined') return false;
  return phoneGroup67EntryPlanFromHash(window.location.hash) === undefined
    && !phoneLoaderCompletedInDocument();
}

function startupLoaderMode(): 'cold-hero' | 'reduced' {
  if (typeof window === 'undefined') return 'reduced';
  return new URLSearchParams(window.location.search)
    .get('portrait-spike-motion') === 'reduce'
    ? 'reduced'
    : 'cold-hero';
}

function releaseResumePreboot(): void {
  const documentElement = document.documentElement;
  document.getElementById('story-loader-static')?.remove();
  delete documentElement.dataset.portraitSpike;
  delete documentElement.dataset.portraitSpikePreboot;
  documentElement.style.removeProperty('--portrait-document-surface');
}

/**
 * Lightweight startup owner. It starts the authored Loader before the GSAP,
 * media, and scene graph chunk, then hands the same clock to the one formal
 * PhoneStoryShell without replaying the sequence.
 */
export function PhoneStoryBootstrap(props: PhoneStoryShellProps = {}) {
  const [needsColdLoader] = useState(coldLoaderRequired);
  const [loaderMode] = useState(startupLoaderMode);
  const [shellPrepared, setShellPrepared] = useState(false);
  const [shellFailed, setShellFailed] = useState(false);
  const [loaderExitReason, setLoaderExitReason] =
    useState<StoryLoaderExitReason>();
  const [abandoned, setAbandoned] = useState(false);
  const loaderStartedAtRef = useRef(
    typeof performance === 'undefined' ? 0 : performance.now()
  );
  const markShellPrepared = useCallback((failed: boolean) => {
    setShellFailed(failed);
    setShellPrepared(true);
  }, []);
  const markLoaderHidden = useCallback((reason: StoryLoaderExitReason) => {
    setLoaderExitReason(reason);
  }, []);

  useLayoutEffect(() => {
    if (!needsColdLoader) releaseResumePreboot();
  }, [needsColdLoader]);

  useEffect(() => {
    if (!needsColdLoader || shellPrepared) return;
    const timer = window.setTimeout(() => {
      setAbandoned(true);
      revealStaticPhoneStoryFallback('startup-timeout');
    }, BOOTSTRAP_SAFETY_MS);
    return () => window.clearTimeout(timer);
  }, [needsColdLoader, shellPrepared]);

  if (abandoned) return null;

  return (
    <>
      {needsColdLoader && loaderExitReason === undefined && (
        <StoryLoader
          mode={loaderMode}
          ready={shellPrepared}
          failed={shellFailed}
          startedAt={loaderStartedAtRef.current}
          onHidden={markLoaderHidden}
        />
      )}
      <Suspense fallback={null}>
        <PhoneStoryShell
          {...props}
          {...(loaderExitReason === undefined
            ? {}
            : { startupLoaderExitReason: loaderExitReason })}
          onStartupPrepared={markShellPrepared}
        />
      </Suspense>
    </>
  );
}

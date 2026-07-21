import { useLayoutEffect, type RefObject } from 'react';
import { refreshPhoneScrollStage } from './usePhoneStageRuntime';

const STAGE_SCROLL_VIEWPORTS = 4.8;

/** Stable-width viewport sampling; height-only Safari toolbar motion is CSS-owned. */
export function usePhoneViewportGeometry(
  rootRef: RefObject<HTMLElement | null>,
  motionEnabled: boolean
): void {
  useLayoutEffect(() => {
    const documentElement = document.documentElement;
    const root = rootRef.current;
    documentElement.dataset.portraitSpike = 'b';
    documentElement.dataset.portraitSpikeMotion = motionEnabled
      ? 'force'
      : 'reduce';
    delete documentElement.dataset.storyHydrated;
    delete documentElement.dataset.portraitLoaderResume;
    if (!root) {
      return () => {
        delete documentElement.dataset.portraitSpike;
        delete documentElement.dataset.portraitSpikeMotion;
      };
    }

    let viewportTimer: number | undefined;
    let lastViewport = '';
    let lastViewportWidth = 0;
    let forceNextViewportSync = false;
    const readViewport = () => {
      const viewport = window.visualViewport;
      return {
        height: Math.max(
          1,
          Math.round(viewport?.height || window.innerHeight || 1)
        ),
        width: Math.max(
          1,
          Math.round(viewport?.width || window.innerWidth || 1)
        )
      };
    };
    const syncViewport = (forceHeight = false) => {
      const { height, width } = readViewport();
      const nextViewport = `${width}x${height}`;
      if (nextViewport === lastViewport) {
        delete root.dataset.portraitTransientViewport;
        return;
      }
      const widthChanged = lastViewportWidth === 0
        || Math.abs(width - lastViewportWidth) > 1;
      if (!forceHeight && !widthChanged) {
        root.dataset.portraitTransientViewport = nextViewport;
        return;
      }
      lastViewport = nextViewport;
      lastViewportWidth = width;
      delete root.dataset.portraitTransientViewport;
      root.style.setProperty('--portrait-live-height', `${height}px`);
      root.style.setProperty('--portrait-live-width', `${width}px`);
      root.style.setProperty('--portrait-stage-coverage-height', `${height}px`);
      root.dataset.portraitStageCoverage = `${height}px`;
      root.style.setProperty(
        '--portrait-stage-scroll-distance',
        `${Math.round(height * STAGE_SCROLL_VIEWPORTS)}px`
      );
      root.dataset.portraitLiveViewport = nextViewport;
      refreshPhoneScrollStage();
    };
    const scheduleViewportSync = () => {
      if (viewportTimer) window.clearTimeout(viewportTimer);
      viewportTimer = window.setTimeout(() => {
        const forceHeight = forceNextViewportSync;
        forceNextViewportSync = false;
        syncViewport(forceHeight);
      }, 180);
    };
    const scheduleForcedViewportSync = () => {
      forceNextViewportSync = true;
      scheduleViewportSync();
    };

    syncViewport(true);
    window.visualViewport?.addEventListener('resize', scheduleViewportSync);
    window.addEventListener('resize', scheduleViewportSync);
    window.addEventListener('orientationchange', scheduleForcedViewportSync);
    document.addEventListener('fullscreenchange', scheduleForcedViewportSync);

    return () => {
      if (viewportTimer) window.clearTimeout(viewportTimer);
      window.visualViewport?.removeEventListener('resize', scheduleViewportSync);
      window.removeEventListener('resize', scheduleViewportSync);
      window.removeEventListener(
        'orientationchange',
        scheduleForcedViewportSync
      );
      document.removeEventListener(
        'fullscreenchange',
        scheduleForcedViewportSync
      );
      root.style.removeProperty('--portrait-live-height');
      root.style.removeProperty('--portrait-live-width');
      root.style.removeProperty('--portrait-stage-scroll-distance');
      root.style.removeProperty('--portrait-stage-coverage-height');
      delete root.dataset.portraitLiveViewport;
      delete root.dataset.portraitStageCoverage;
      delete root.dataset.portraitTransientViewport;
      delete root.dataset.portraitCheckpoint;
      delete root.dataset.portraitCheckpointTrace;
      delete documentElement.dataset.portraitSpike;
      delete documentElement.dataset.portraitSpikeMotion;
      delete documentElement.dataset.portraitCheckpoint;
    };
  }, [motionEnabled, rootRef]);
}

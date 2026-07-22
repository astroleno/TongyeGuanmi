import { useLayoutEffect, type RefObject } from 'react';
import {
  PHONE_STAGE_SCROLL_VIEWPORTS,
  phoneStageCoverageHeight,
  phoneViewportCoverageBottom
} from './phone-viewport';
import { refreshPhoneScrollStage } from './usePhoneStageRuntime';

/** Stable-width layout sampling; Safari chrome may only grow paint coverage. */
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
    let coverageFrame: number | undefined;
    let lastObservedViewport = '';
    let lastLayoutViewport = '';
    let lastViewportWidth = 0;
    let lastCoverageViewportWidth = 0;
    let stageCoverageHeight = 0;
    let forceNextViewportSync = false;
    let forceNextCoverageReset = false;
    const readViewport = () => {
      const viewport = window.visualViewport;
      const rawHeight = viewport?.height || window.innerHeight || 1;
      const rawWidth = viewport?.width || window.innerWidth || 1;
      const rawOffsetTop = viewport?.offsetTop ?? 0;
      const offsetTop = Number.isFinite(rawOffsetTop)
        ? Math.max(0, rawOffsetTop)
        : 0;
      return {
        height: Math.max(1, Math.round(rawHeight)),
        width: Math.max(1, Math.round(rawWidth)),
        offsetTop,
        viewportBottom: phoneViewportCoverageBottom(rawHeight, offsetTop)
      };
    };
    const syncCoverage = (reset = false) => {
      const { offsetTop, viewportBottom, width } = readViewport();
      const widthChanged = lastCoverageViewportWidth === 0
        || Math.abs(width - lastCoverageViewportWidth) > 1;
      const nextCoverageHeight = phoneStageCoverageHeight(
        stageCoverageHeight || viewportBottom,
        viewportBottom,
        reset || widthChanged
      );
      lastCoverageViewportWidth = width;
      root.dataset.portraitViewportOffsetTop = `${Math.ceil(offsetTop)}px`;
      root.dataset.portraitViewportBottom = `${viewportBottom}px`;
      if (nextCoverageHeight === stageCoverageHeight) return;
      stageCoverageHeight = nextCoverageHeight;
      root.style.setProperty(
        '--portrait-stage-coverage-height',
        `${stageCoverageHeight}px`
      );
      root.dataset.portraitStageCoverage = `${stageCoverageHeight}px`;
    };
    const scheduleCoverageSync = () => {
      if (coverageFrame !== undefined) return;
      coverageFrame = window.requestAnimationFrame(() => {
        coverageFrame = undefined;
        const reset = forceNextCoverageReset;
        forceNextCoverageReset = false;
        syncCoverage(reset);
      });
    };
    const scheduleForcedCoverageSync = () => {
      forceNextCoverageReset = true;
      scheduleCoverageSync();
    };
    const syncViewport = (forceHeight = false) => {
      const { height, width } = readViewport();
      const nextViewport = `${width}x${height}`;
      if (nextViewport === lastObservedViewport && !forceHeight) return;
      lastObservedViewport = nextViewport;
      root.dataset.portraitLiveViewport = nextViewport;
      const widthChanged = lastViewportWidth === 0
        || Math.abs(width - lastViewportWidth) > 1;
      if (!forceHeight && !widthChanged) {
        if (nextViewport === lastLayoutViewport) {
          delete root.dataset.portraitTransientViewport;
        } else {
          root.dataset.portraitTransientViewport = nextViewport;
        }
        // Safari toolbar motion must not resize the stage or refresh its clock.
        return;
      }
      lastLayoutViewport = nextViewport;
      lastViewportWidth = width;
      delete root.dataset.portraitTransientViewport;
      root.style.setProperty('--portrait-live-height', `${height}px`);
      root.style.setProperty('--portrait-live-width', `${width}px`);
      root.style.setProperty(
        '--portrait-stage-scroll-distance',
        `${Math.round(height * PHONE_STAGE_SCROLL_VIEWPORTS)}px`
      );
      root.dataset.portraitLayoutViewport = lastLayoutViewport;
      refreshPhoneScrollStage();
    };
    const scheduleViewportSync = () => {
      if (viewportTimer !== undefined) window.clearTimeout(viewportTimer);
      viewportTimer = window.setTimeout(() => {
        viewportTimer = undefined;
        const forceHeight = forceNextViewportSync;
        forceNextViewportSync = false;
        syncViewport(forceHeight);
      }, 180);
    };
    const handleViewportResize = () => {
      scheduleCoverageSync();
      scheduleViewportSync();
    };
    const scheduleForcedViewportSync = () => {
      scheduleForcedCoverageSync();
      forceNextViewportSync = true;
      scheduleViewportSync();
    };

    syncCoverage(true);
    syncViewport(true);
    window.visualViewport?.addEventListener('resize', handleViewportResize);
    window.visualViewport?.addEventListener('scroll', scheduleCoverageSync);
    window.addEventListener('resize', handleViewportResize);
    window.addEventListener('orientationchange', scheduleForcedViewportSync);
    document.addEventListener('fullscreenchange', scheduleForcedViewportSync);

    return () => {
      if (viewportTimer !== undefined) window.clearTimeout(viewportTimer);
      if (coverageFrame !== undefined) {
        window.cancelAnimationFrame(coverageFrame);
      }
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      window.visualViewport?.removeEventListener('scroll', scheduleCoverageSync);
      window.removeEventListener('resize', handleViewportResize);
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
      delete root.dataset.portraitLayoutViewport;
      delete root.dataset.portraitStageCoverage;
      delete root.dataset.portraitViewportOffsetTop;
      delete root.dataset.portraitViewportBottom;
      delete root.dataset.portraitTransientViewport;
      delete root.dataset.portraitCheckpoint;
      delete root.dataset.portraitCheckpointTrace;
      delete documentElement.dataset.portraitSpike;
      delete documentElement.dataset.portraitSpikeMotion;
      delete documentElement.dataset.portraitCheckpoint;
    };
  }, [motionEnabled, rootRef]);
}

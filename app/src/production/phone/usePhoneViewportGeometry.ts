import { useLayoutEffect, type RefObject } from 'react';
import { PHONE_STAGE_SCROLL_VIEWPORTS } from './phone-viewport';
import { refreshPhoneScrollStage } from './usePhoneStageRuntime';

/** Freeze height-only Safari toolbar motion while retaining diagnostics. */
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
    let lastObservedViewport = '';
    let lastLayoutViewport = '';
    let lastViewportWidth = 0;
    let forceNextViewportSync = false;
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
        viewportBottom: Math.max(1, Math.ceil(offsetTop + rawHeight))
      };
    };
    const syncViewport = (forceHeight = false) => {
      const { height, offsetTop, viewportBottom, width } = readViewport();
      if (import.meta.env.DEV) {
        root.dataset.portraitViewportOffsetTop = `${Math.ceil(offsetTop)}px`;
        root.dataset.portraitViewportBottom = `${viewportBottom}px`;
      }
      const nextViewport = `${width}x${height}`;
      if (nextViewport === lastObservedViewport && !forceHeight) return;
      lastObservedViewport = nextViewport;
      if (import.meta.env.DEV) {
        root.dataset.portraitLiveViewport = nextViewport;
      }
      const widthChanged = lastViewportWidth === 0
        || Math.abs(width - lastViewportWidth) > 1;
      if (!forceHeight && !widthChanged) {
        if (import.meta.env.DEV) {
          if (nextViewport === lastLayoutViewport) {
            delete root.dataset.portraitTransientViewport;
          } else {
            root.dataset.portraitTransientViewport = nextViewport;
          }
        }
        // Safari toolbar motion must not resize the stage or refresh its clock.
        return;
      }
      lastLayoutViewport = nextViewport;
      lastViewportWidth = width;
      if (import.meta.env.DEV) {
        delete root.dataset.portraitTransientViewport;
      }
      root.style.setProperty('--portrait-live-height', `${height}px`);
      root.style.setProperty('--portrait-live-width', `${width}px`);
      root.style.setProperty(
        '--portrait-stage-scroll-distance',
        `${Math.round(height * PHONE_STAGE_SCROLL_VIEWPORTS)}px`
      );
      if (import.meta.env.DEV) {
        root.dataset.portraitLayoutViewport = lastLayoutViewport;
      }
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
    const handleViewportResize = () => scheduleViewportSync();
    const scheduleForcedViewportSync = () => {
      forceNextViewportSync = true;
      scheduleViewportSync();
    };

    syncViewport(true);
    window.visualViewport?.addEventListener('resize', handleViewportResize);
    window.visualViewport?.addEventListener('scroll', scheduleViewportSync);
    window.addEventListener('resize', handleViewportResize);
    window.addEventListener('orientationchange', scheduleForcedViewportSync);
    document.addEventListener('fullscreenchange', scheduleForcedViewportSync);

    return () => {
      if (viewportTimer !== undefined) window.clearTimeout(viewportTimer);
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      window.visualViewport?.removeEventListener('scroll', scheduleViewportSync);
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
      if (import.meta.env.DEV) {
        delete root.dataset.portraitLiveViewport;
        delete root.dataset.portraitLayoutViewport;
        delete root.dataset.portraitViewportOffsetTop;
        delete root.dataset.portraitViewportBottom;
        delete root.dataset.portraitTransientViewport;
      }
      delete documentElement.dataset.portraitSpike;
      delete documentElement.dataset.portraitSpikeMotion;
    };
  }, [motionEnabled, rootRef]);
}

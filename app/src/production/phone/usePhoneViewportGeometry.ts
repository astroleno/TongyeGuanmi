import { useCallback, useLayoutEffect, type RefObject } from 'react';
import { PHONE_STAGE_SCROLL_VIEWPORTS } from './phone-viewport';
import {
  usePhoneViewportCoverage,
  type PhoneLayoutViewport
} from './phone-story/presentation';
import { refreshPhoneScrollStage } from './usePhoneStageRuntime';

/**
 * Layout geometry is frozen across toolbar-only motion; the separate coverage
 * hook still repaints all four live visualViewport edges each animation frame.
 */
export function usePhoneViewportGeometry(
  rootRef: RefObject<HTMLElement | null>,
  motionEnabled: boolean
): void {
  const applyLayout = useCallback((root: HTMLElement, viewport: PhoneLayoutViewport) => {
    root.style.setProperty('--portrait-live-height', `${viewport.height}px`);
    root.style.setProperty('--portrait-live-width', `${viewport.width}px`);
    root.style.setProperty(
      '--portrait-stage-scroll-distance',
      `${Math.round(viewport.height * PHONE_STAGE_SCROLL_VIEWPORTS)}px`
    );
    if (import.meta.env.DEV) {
      root.dataset.portraitLayoutViewport = `${viewport.width}x${viewport.height}`;
    }
    // A coverage-only update never reaches this callback, so ScrollTrigger's
    // layout clock is insulated from Safari toolbar animation.
    refreshPhoneScrollStage();
  }, []);

  usePhoneViewportCoverage(rootRef, applyLayout);

  useLayoutEffect(() => {
    const documentElement = document.documentElement;
    const root = rootRef.current;
    documentElement.dataset.portraitSpike = 'b';
    documentElement.dataset.portraitSpikeMotion = motionEnabled
      ? 'force'
      : 'reduce';
    delete documentElement.dataset.storyHydrated;
    return () => {
      root?.style.removeProperty('--portrait-live-height');
      root?.style.removeProperty('--portrait-live-width');
      root?.style.removeProperty('--portrait-stage-scroll-distance');
      if (import.meta.env.DEV) {
        delete root?.dataset.portraitLayoutViewport;
      }
      delete documentElement.dataset.portraitSpike;
      delete documentElement.dataset.portraitSpikeMotion;
    };
  }, [motionEnabled, rootRef]);
}

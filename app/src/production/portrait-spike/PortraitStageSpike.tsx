import { useEffect } from 'react';
import { StoryApp } from '../StoryApp';

/**
 * Route A: the real Stage/Director stack with only the smallest input/readiness
 * corrections needed for a fair physical-device comparison.
 */
export function PortraitStageSpike() {
  useEffect(() => {
    document.documentElement.dataset.portraitSpike = 'a';
    return () => {
      delete document.documentElement.dataset.portraitSpike;
    };
  }, []);

  return <StoryApp spikeRoute="a" />;
}

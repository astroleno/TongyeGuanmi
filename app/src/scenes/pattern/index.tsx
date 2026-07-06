import { useEffect, useRef } from 'react';
import type { SceneComponentProps, SceneModule } from '../../story/types';
import { STAR_MAP_COPY } from '../star-map';

const PATTERN_BACKGROUND = new URL('../../../../assets/patterns/backgrounds/aged-mottled-background-16x9-4k.png', import.meta.url).href;
const PATTERN_LAYERS = [
  new URL('../../../../assets/patterns/alpha-layers/pattern-layer-alpha-06.png', import.meta.url).href,
  new URL('../../../../assets/patterns/alpha-layers/pattern-layer-alpha-05.png', import.meta.url).href,
  new URL('../../../../assets/patterns/alpha-layers/pattern-layer-alpha-04.png', import.meta.url).href,
  new URL('../../../../assets/patterns/alpha-layers/pattern-layer-alpha-03.png', import.meta.url).href,
  new URL('../../../../assets/patterns/alpha-layers/pattern-layer-alpha-02.png', import.meta.url).href
] as const;

export const PATTERN_COPY = [STAR_MAP_COPY] as const;

export type PatternRenderState = {
  progress: number;
  opacity: number;
  bloomScale: number;
  rotationDegrees: number;
  washOpacity: number;
};

export function renderPatternProgress(root: HTMLElement | null, progress: number): PatternRenderState {
  const clamped = Math.min(1, Math.max(0, progress));
  const eased = clamped * clamped * (3 - 2 * clamped);
  const opacity = eased;
  const bloomScale = 1.34 - eased * 0.34;
  const rotationDegrees = 72 - eased * 72;
  const washOpacity = 0.64 + eased * 0.22;

  root?.style.setProperty('--r4-pattern-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-pattern-opacity', opacity.toFixed(4));
  root?.style.setProperty('--r4-pattern-bloom-scale', bloomScale.toFixed(4));
  root?.style.setProperty('--r4-pattern-rotation', `${rotationDegrees.toFixed(2)}deg`);
  root?.style.setProperty('--r4-pattern-wash-opacity', washOpacity.toFixed(4));
  root?.setAttribute('data-pattern-progress', clamped.toFixed(4));

  return { progress: clamped, opacity, bloomScale, rotationDegrees, washOpacity };
}

function PatternScene({ hidden, registerHandle }: SceneComponentProps) {
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    renderPatternProgress(rootRef.current, hidden ? 0 : 1);
  }, [hidden]);

  return (
    <article ref={rootRef} className="r4-pattern-scene" data-r4-scene="pattern">
      <img className="r4-pattern-scene__background" src={PATTERN_BACKGROUND} alt="" aria-hidden="true" />
      <div ref={(element) => registerHandle?.('flower', element)} className="r4-pattern-scene__flower" aria-hidden="true">
        {PATTERN_LAYERS.map((src, index) => (
          <img
            key={src}
            className="r4-pattern-scene__layer"
            data-pattern-layer={String(6 - index).padStart(2, '0')}
            src={src}
            alt=""
          />
        ))}
      </div>
      <div className="r4-pattern-scene__wash" aria-hidden="true" />
      <p ref={(element) => registerHandle?.('copy', element)} className="r4-visually-hidden">
        {PATTERN_COPY[0]}
      </p>
    </article>
  );
}

export const patternScene: SceneModule = {
  id: 'pattern',
  Component: PatternScene,
  requiredHandles: ['flower', 'copy'],
  staticFallback: {
    sectionIds: ['belief'],
    text: PATTERN_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};

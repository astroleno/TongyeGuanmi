import type { Ref } from 'react';
import type { LayerVisibilityState, SceneId } from '../story/types';
import { semanticBoolean } from '../runtime/semantic-data-attribute';

export const FIGURE2_NEAR_ARCH_SRC = new URL('../../../assets/figure2-near-arch.webp', import.meta.url).href;

export const RETAINED_FIGURE2_ARCH_SCENES = new Set<SceneId>([
  'figure2-animation',
  'figure2-proof'
]);

export type RetainedFigure2ArchMember = Readonly<{
  scene: SceneId;
  current: boolean;
}>;

export function retainedFigure2ArchState(
  members: readonly RetainedFigure2ArchMember[],
  visibilityByScene: Partial<Record<SceneId, LayerVisibilityState>>
): Readonly<{ mounted: boolean; visible: boolean }> {
  const owners = members.filter((member) => RETAINED_FIGURE2_ARCH_SCENES.has(member.scene));
  return {
    mounted: owners.length > 0,
    visible: owners.some((member) => {
      const visibility = visibilityByScene[member.scene];
      return visibility
        ? visibility.visible && visibility.opacity > 0.001
        : member.current;
    })
  };
}

export function RetainedFigure2Arch({
  mounted,
  visible,
  src = FIGURE2_NEAR_ARCH_SRC,
  className = '',
  motion = 'depth',
  imageRef
}: {
  mounted: boolean;
  visible: boolean;
  src?: string;
  className?: string;
  motion?: 'depth' | 'fixed';
  imageRef?: Ref<HTMLImageElement>;
}) {
  if (!mounted) {
    return null;
  }
  return (
    <img
      ref={imageRef}
      className={`stage-proof-retained-arch ${className}`.trim()}
      data-stage-retained-figure2-arch="true"
      data-figure2-arch-motion={motion}
      data-visible={semanticBoolean(visible)}
      src={src}
      alt=""
      aria-hidden="true"
    />
  );
}

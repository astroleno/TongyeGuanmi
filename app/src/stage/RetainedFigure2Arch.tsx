import type { LayerVisibilityState, SceneId } from '../story/types';

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

export function RetainedFigure2Arch({ mounted, visible }: { mounted: boolean; visible: boolean }) {
  if (!mounted) {
    return null;
  }
  return (
    <img
      className="stage-proof-retained-arch"
      data-stage-retained-figure2-arch="true"
      data-visible={String(visible)}
      src={FIGURE2_NEAR_ARCH_SRC}
      alt=""
      aria-hidden="true"
    />
  );
}

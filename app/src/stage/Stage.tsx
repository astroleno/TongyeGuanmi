import { useMemo } from 'react';
import { assertLayerWindowInvariants, type LayerWindowSnapshot } from './LayerWindow';
import { SceneLayer } from './SceneLayer';
import type { HandleRegistry } from '../story/registry';
import type { LayerVisibilityState, SceneId, SceneModule, StageLayerRole } from '../story/types';
import { canonicalSpine } from '../story/canonical-spine';
import { RetainedFigure2Arch, retainedFigure2ArchState } from './RetainedFigure2Arch';

const PROOF_SCENES = new Set<SceneId>(['figure2-proof-opening', 'figure2-proof-cards', 'figure2-proof-closing']);
const READING_SCENES = new Set(
  canonicalSpine.flatMap((node) => node.kind === 'hold' && node.reading ? [node.scene] : [])
);

export type StageProps = {
  window: LayerWindowSnapshot;
  modules: Partial<Record<SceneId, SceneModule>>;
  registry: HandleRegistry;
  visibilityByScene?: Partial<Record<SceneId, LayerVisibilityState>>;
  copyCueScene?: SceneId | undefined;
  onLayerElement?: (scene: SceneId, element: HTMLElement | null) => void;
};

type StageMember = {
  scene: SceneId;
  role: StageLayerRole;
};

function membersForWindow(snapshot: LayerWindowSnapshot): StageMember[] {
  const members: StageMember[] = [];
  if (snapshot.prev) {
    members.push({ scene: snapshot.prev, role: 'prev' });
  }
  members.push({ scene: snapshot.current, role: 'current' });
  if (snapshot.next) {
    members.push({ scene: snapshot.next, role: 'next' });
  }
  for (const scene of snapshot.retiring) {
    members.push({ scene, role: 'retiring' });
  }
  return members;
}

function zIndexFor(role: StageLayerRole): number {
  switch (role) {
    case 'current':
      return 30;
    case 'next':
      return 20;
    case 'prev':
      return 10;
    case 'retiring':
      return 0;
  }
}

function proofGroundState(
  members: readonly StageMember[],
  visibilityByScene: Partial<Record<SceneId, LayerVisibilityState>>
): Readonly<{ mounted: boolean; visible: boolean }> {
  const owners = members.filter((member) => PROOF_SCENES.has(member.scene));
  return {
    mounted: owners.length > 0,
    visible: owners.some((member) => {
      const visibility = visibilityByScene[member.scene];
      return visibility
        ? visibility.visible && visibility.opacity > 0.001
        : member.role === 'current';
    })
  };
}

export function Stage({ window, modules, registry, visibilityByScene = {}, copyCueScene, onLayerElement }: StageProps) {
  assertLayerWindowInvariants(window);
  const members = useMemo(() => membersForWindow(window), [window]);
  const proofGround = proofGroundState(members, visibilityByScene);
  const retainedArch = retainedFigure2ArchState(
    members.map((member) => ({ scene: member.scene, current: member.role === 'current' })),
    visibilityByScene
  );

  return (
    <main
      className="stage"
      data-testid="r2-stage"
      data-active-layer-count={members.filter((member) => member.role !== 'retiring').length}
      data-mounted-layer-count={members.length}
    >
      {proofGround.mounted ? (
        <div
          className="stage-proof-retained-ground"
          aria-hidden="true"
          data-figure2-retained-ground="true"
          data-visible={String(proofGround.visible)}
        />
      ) : null}
      <RetainedFigure2Arch mounted={retainedArch.mounted} visible={retainedArch.visible} />
      {members.map((member) => {
        const module = modules[member.scene];
        if (!module) {
          return null;
        }
        return (
          <SceneLayer
            key={member.scene}
            module={module}
            role={member.role}
            registry={registry}
            visibility={visibilityByScene[member.scene]}
            reading={READING_SCENES.has(member.scene)}
            copyCueActive={copyCueScene === member.scene}
            zIndex={zIndexFor(member.role)}
            onElement={onLayerElement}
          />
        );
      })}
    </main>
  );
}

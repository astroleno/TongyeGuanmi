import { useMemo } from 'react';
import { assertLayerWindowInvariants, type LayerWindowSnapshot } from './LayerWindow';
import { SceneLayer } from './SceneLayer';
import type { HandleRegistry } from '../story/registry';
import type { LayerVisibilityState, SceneId, SceneModule, StageLayerRole } from '../story/types';

const PROOF_ARCH_IMAGE = new URL('../../../assets/arch2d-alpha.png', import.meta.url).href;
const PROOF_SCENES = new Set<SceneId>(['figure2-proof-opening', 'figure2-proof-cards', 'figure2-proof-closing']);

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

function proofArchIsActive(members: readonly StageMember[], visibilityByScene: Partial<Record<SceneId, LayerVisibilityState>>): boolean {
  return members.some((member) => {
    if (!PROOF_SCENES.has(member.scene)) {
      return false;
    }
    const visibility = visibilityByScene[member.scene];
    if (visibility) {
      return visibility.visible && visibility.opacity > 0.001;
    }
    return member.role === 'current';
  });
}

export function Stage({ window, modules, registry, visibilityByScene = {}, copyCueScene, onLayerElement }: StageProps) {
  assertLayerWindowInvariants(window);
  const members = useMemo(() => membersForWindow(window), [window]);
  const showProofArch = proofArchIsActive(members, visibilityByScene);

  return (
    <main
      className="stage"
      data-testid="r2-stage"
      data-active-layer-count={members.filter((member) => member.role !== 'retiring').length}
      data-mounted-layer-count={members.length}
    >
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
            copyCueActive={copyCueScene === member.scene}
            zIndex={zIndexFor(member.role)}
            onElement={onLayerElement}
          />
        );
      })}
      {showProofArch ? (
        <img className="stage-proof-retained-arch" src={PROOF_ARCH_IMAGE} alt="" aria-hidden="true" data-figure2-retained-arch="true" />
      ) : null}
    </main>
  );
}

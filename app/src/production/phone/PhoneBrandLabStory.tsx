import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import type { SceneId } from '../../story/types';
import { semanticBoolean } from '../../runtime/semantic-data-attribute';
import { StoryNav } from '../StoryNav';
import {
  publicMenuItems,
  sceneFromHash
} from '../navigation';
import { PhoneBrandLabContinuation } from './PhoneBrandLabContinuation';
import {
  group45PhoneSceneIds,
  type Group45PhoneSceneId
} from './adapter-groups/group4-5';
import { PhoneStageRail } from './PhoneStageRail';
import {
  PhoneStoryOrchestratorProvider
} from './PhoneStoryOrchestratorContext';
import {
  usePhoneStoryOrchestratorRuntime
} from './usePhoneStoryOrchestratorRuntime';
import {
  usePhoneStoryNavigationRuntime
} from './usePhoneStoryNavigationRuntime';
import './PhoneBrandLabStory.css';

export * from './PhoneBrandLabContinuation';

export type PhoneBrandLabStoryProps = Readonly<{
  reducedMotion: boolean;
  validationMode?: string | undefined;
}>;

const GROUP45_SCENES = new Set<Group45PhoneSceneId>(group45PhoneSceneIds);
const GROUP45_NAV_ITEMS = publicMenuItems.filter(
  (item) => item.scene === 'services'
);

function isGroup45Scene(scene: SceneId): scene is Group45PhoneSceneId {
  return GROUP45_SCENES.has(scene as Group45PhoneSceneId);
}

export function phoneGroup45EntryFromHash(hash: string): Group45PhoneSceneId {
  const scene = sceneFromHash(hash);
  return scene && isGroup45Scene(scene) ? scene : 'brand';
}

export function phoneGroup45DocumentFlags(
  reducedMotion: boolean
): Readonly<{
  portraitSpike: 'b';
  portraitSpikeMotion: 'force' | 'reduce';
}> {
  return {
    portraitSpike: 'b',
    portraitSpikeMotion: reducedMotion ? 'reduce' : 'force'
  };
}

/** Standalone QA composition using the same route-local authority as formal /. */
export function PhoneBrandLabStory({
  reducedMotion,
  validationMode
}: PhoneBrandLabStoryProps) {
  const initialSceneRef = useRef<Group45PhoneSceneId>(
    typeof window === 'undefined'
      ? 'brand'
      : phoneGroup45EntryFromHash(window.location.hash)
  );
  const initialScene = initialSceneRef.current;
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const stageRailRef = useRef<HTMLElement | null>(null);
  const stageViewportRef = useRef<HTMLElement | null>(null);
  const stageCanvasRef = useRef<HTMLDivElement | null>(null);
  const [stageHost, setStageHost] = useState<HTMLElement | null>(null);
  const authority = usePhoneStoryOrchestratorRuntime({
    scope: 'brand-lab',
    initialScene,
    rootRef
  });
  const navigation = usePhoneStoryNavigationRuntime(
    authority.port,
    true,
    phoneGroup45EntryFromHash
  );

  const bindStageHost = useCallback((host: HTMLDivElement | null) => {
    if (stageCanvasRef.current === host) return;
    stageCanvasRef.current = host;
    setStageHost(host);
  }, []);

  useLayoutEffect(() => {
    const documentElement = document.documentElement;
    const previousSpike = documentElement.dataset.portraitSpike;
    const previousMotion = documentElement.dataset.portraitSpikeMotion;
    const previousHydrated = documentElement.dataset.storyHydrated;
    const previousScope = documentElement.dataset.phoneGroup45Scope;
    const flags = phoneGroup45DocumentFlags(reducedMotion);
    documentElement.dataset.portraitSpike = flags.portraitSpike;
    documentElement.dataset.portraitSpikeMotion = flags.portraitSpikeMotion;
    documentElement.dataset.storyHydrated = 'true';
    documentElement.dataset.phoneGroup45Scope = 'brand-lab';
    return () => {
      if (previousSpike) documentElement.dataset.portraitSpike = previousSpike;
      else delete documentElement.dataset.portraitSpike;
      if (previousMotion) documentElement.dataset.portraitSpikeMotion = previousMotion;
      else delete documentElement.dataset.portraitSpikeMotion;
      if (previousHydrated) {
        documentElement.dataset.storyHydrated = semanticBoolean(previousHydrated === 'true');
      } else {
        delete documentElement.dataset.storyHydrated;
      }
      if (previousScope) documentElement.dataset.phoneGroup45Scope = previousScope;
      else delete documentElement.dataset.phoneGroup45Scope;
    };
  }, [reducedMotion]);

  const navigate = useCallback((scene: SceneId) => {
    navigation.navigate(isGroup45Scene(scene) ? scene : 'brand');
  }, [navigation]);

  return (
    <PhoneStoryOrchestratorProvider authority={authority}>
      <main
        ref={rootRef}
        className="portrait-scroll-spike phone-brand-lab phone-brand-lab--shell"
        data-phone-validation-scope="brand-lab"
        data-phone-validation-mode={validationMode}
        data-phone-group45-state="ready"
        data-phone-group45-layout="shared-boundary-stage"
        data-portrait-loader-ready="true"
      >
        <PhoneStageRail
          railRef={stageRailRef}
          viewportRef={stageViewportRef}
          stageRef={bindStageHost}
        >
          {null}
        </PhoneStageRail>
        <PhoneBrandLabContinuation
          reducedMotion={reducedMotion}
          stageHost={stageHost}
          entryScene={initialScene}
          validationMode={validationMode}
        />
        <StoryNav
          currentScene={navigation.scene}
          visible
          menuOpen={menuOpen}
          menuItems={GROUP45_NAV_ITEMS}
          showCta={false}
          onToggleMenu={() => setMenuOpen((open) => !open)}
          onNavigate={navigate}
        />
      </main>
    </PhoneStoryOrchestratorProvider>
  );
}

export default PhoneBrandLabStory;

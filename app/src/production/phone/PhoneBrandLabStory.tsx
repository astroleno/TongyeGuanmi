import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import type { SceneId } from '../../story/types';
import { StoryNav } from '../StoryNav';
import { hashForScene, publicMenuItems } from '../navigation';
import {
  PhoneBrandLabContinuation,
  phoneGroup45DocumentFlags,
  phoneGroup45EntryFromHash,
  type Group45VisualScene
} from './PhoneBrandLabContinuation';
import {
  group45PhoneSceneIds,
  type Group45PhoneSceneId
} from './adapter-groups/group4-5';
import { PhoneStageRail } from './PhoneStageRail';
import { usePhoneEdgeSurface } from './usePhoneEdgeSurface';
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

/**
 * Standalone Unit 5 QA shell. Production never embeds this component; it
 * embeds only PhoneBrandLabContinuation into PhoneStoryShell's existing host.
 */
export function PhoneBrandLabStory({
  reducedMotion,
  validationMode
}: PhoneBrandLabStoryProps) {
  const [entryScene, setEntryScene] = useState<Group45PhoneSceneId>(() => (
    typeof window === 'undefined'
      ? 'brand'
      : phoneGroup45EntryFromHash(window.location.hash)
  ));
  const [currentScene, setCurrentScene] = useState<Group45PhoneSceneId>(
    entryScene
  );
  const [stageScene, setStageScene] = useState<Group45VisualScene | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const stageRailRef = useRef<HTMLElement | null>(null);
  const stageViewportRef = useRef<HTMLElement | null>(null);
  const stageCanvasRef = useRef<HTMLDivElement | null>(null);
  const [stageHost, setStageHost] = useState<HTMLElement | null>(null);
  const publishEdgeScene = usePhoneEdgeSurface(rootRef, stageViewportRef);

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
      if (previousMotion) {
        documentElement.dataset.portraitSpikeMotion = previousMotion;
      } else {
        delete documentElement.dataset.portraitSpikeMotion;
      }
      if (previousHydrated) {
        documentElement.dataset.storyHydrated = previousHydrated;
      } else {
        delete documentElement.dataset.storyHydrated;
      }
      if (previousScope) {
        documentElement.dataset.phoneGroup45Scope = previousScope;
      } else {
        delete documentElement.dataset.phoneGroup45Scope;
      }
    };
  }, [reducedMotion]);

  useEffect(() => {
    const onHashChange = () => {
      setEntryScene(phoneGroup45EntryFromHash(window.location.hash));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((scene: SceneId) => {
    const target = isGroup45Scene(scene) ? scene : 'brand';
    setMenuOpen(false);
    window.history.pushState(
      null,
      '',
      `${window.location.pathname}${window.location.search}${hashForScene(target)}`
    );
    setEntryScene(target);
  }, []);

  return (
    <main
      ref={rootRef}
      className="portrait-scroll-spike phone-brand-lab phone-brand-lab--shell"
      data-phone-validation-scope="brand-lab"
      data-phone-validation-mode={validationMode}
      data-phone-group45-state="ready"
      data-phone-group45-layout="shared-boundary-stage"
      data-phone-group45-stage-active={String(stageScene !== null)}
      data-phone-group45-stage-scene={stageScene ?? 'none'}
      data-portrait-stage-active={String(stageScene !== null)}
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
        entryScene={entryScene}
        validationMode={validationMode}
        onEdgeScene={publishEdgeScene}
        onSceneChange={setCurrentScene}
        onStageSceneChange={setStageScene}
      />
      <StoryNav
        currentScene={currentScene}
        visible
        menuOpen={menuOpen}
        menuItems={GROUP45_NAV_ITEMS}
        showCta={false}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        onNavigate={navigate}
      />
    </main>
  );
}

export default PhoneBrandLabStory;

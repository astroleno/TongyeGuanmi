import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import type { ScenePresentationAdapterHandle, TransitionPresentationAdapterHandle } from '../../story/presentation';
import type { SceneId } from '../../story/types';
import { StoryNav } from '../StoryNav';
import { hashForScene, publicMenuItems, sceneFromHash } from '../navigation';
import {
  group45PhoneSceneIds,
  type Group45PhoneSceneId
} from './adapter-groups/group4-5';
import { usePhoneGroup45Adapters } from './usePhoneGroup45Adapters';
import './PhoneBrandLabStory.css';

type PhoneBrandLabStoryProps = Readonly<{
  reducedMotion: boolean;
  validationMode?: string | undefined;
}>;

type VisualActivity = Readonly<{
  figure3: Readonly<{ active: boolean; prewarm: boolean }>;
  ttg: Readonly<{ active: boolean; prewarm: boolean }>;
}>;

const GROUP45_SCENES = new Set<Group45PhoneSceneId>(group45PhoneSceneIds);
const GROUP45_NAV_ITEMS = publicMenuItems.filter((item) => item.scene === 'services');

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isGroup45Scene(scene: SceneId | undefined): scene is Group45PhoneSceneId {
  return Boolean(scene && GROUP45_SCENES.has(scene as Group45PhoneSceneId));
}

/** Unknown hashes begin at the stable Proof → Brand receiver. */
export function phoneGroup45EntryFromHash(hash: string): Group45PhoneSceneId {
  const scene = sceneFromHash(hash);
  return isGroup45Scene(scene) ? scene : 'brand';
}

export function phoneGroup45TrackProgress(
  trackTop: number,
  trackHeight: number,
  viewportHeight: number
): number {
  return clamp((viewportHeight - trackTop) / Math.max(1, trackHeight));
}

export function phoneGroup45BoundaryProgress(
  targetTop: number,
  targetHeight: number,
  viewportHeight: number
): number {
  const span = Math.max(1, Math.min(viewportHeight * .24, targetHeight * .35));
  return clamp((viewportHeight - targetTop) / span);
}

function sceneIndex(scene: Group45PhoneSceneId): number {
  return group45PhoneSceneIds.indexOf(scene);
}

export function phoneGroup45TrackActivity(
  trackTop: number,
  trackHeight: number,
  viewportHeight: number
) {
  const trackBottom = trackTop + trackHeight;
  return {
    // Decode the next visual just before its chapter enters, but do not start
    // its authored autoplay under the previous reading chapter.
    prewarm: trackTop < viewportHeight * 1.2 && trackBottom > -viewportHeight * .2,
    active: trackTop <= viewportHeight * .1 && trackBottom > viewportHeight * .1,
    progress: phoneGroup45TrackProgress(trackTop, trackHeight, viewportHeight)
  };
}

function frameForTrack(element: HTMLElement | null, viewportHeight: number) {
  if (!element) return { active: false, prewarm: false, progress: 0 };
  const rect = element.getBoundingClientRect();
  return phoneGroup45TrackActivity(rect.top, rect.height, viewportHeight);
}

/**
 * Dedicated physical-device scope. It starts at Brand's stable receiver and
 * deliberately does not mount Loader → Proof; the normal phone shell remains
 * untouched outside `?scope=brand-lab`.
 */
export function PhoneBrandLabStory({
  reducedMotion,
  validationMode
}: PhoneBrandLabStoryProps) {
  const [entryScene, setEntryScene] = useState<Group45PhoneSceneId>(() => (
    typeof window === 'undefined' ? 'brand' : phoneGroup45EntryFromHash(window.location.hash)
  ));
  const adapters = usePhoneGroup45Adapters(entryScene);
  const [currentScene, setCurrentScene] = useState<Group45PhoneSceneId>(entryScene);
  const [menuOpen, setMenuOpen] = useState(false);
  const [adapterRevision, setAdapterRevision] = useState(0);
  const [visualActivity, setVisualActivity] = useState<VisualActivity>({
    figure3: { active: false, prewarm: false },
    ttg: { active: false, prewarm: false }
  });
  const [brandFigure3Host, setBrandFigure3Host] = useState<HTMLElement | null>(null);
  const [figure3ServicesHost, setFigure3ServicesHost] = useState<HTMLElement | null>(null);
  const [servicesTtgHost, setServicesTtgHost] = useState<HTMLElement | null>(null);
  const [ttgLabHost, setTtgLabHost] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const figure3TrackRef = useRef<HTMLDivElement | null>(null);
  const ttgTrackRef = useRef<HTMLDivElement | null>(null);
  const brandRef = useRef<ScenePresentationAdapterHandle | null>(null);
  const figure3Ref = useRef<ScenePresentationAdapterHandle | null>(null);
  const servicesRef = useRef<ScenePresentationAdapterHandle | null>(null);
  const ttgRef = useRef<ScenePresentationAdapterHandle | null>(null);
  const labRef = useRef<ScenePresentationAdapterHandle | null>(null);
  const brandFigure3Ref = useRef<TransitionPresentationAdapterHandle | null>(null);
  const figure3ServicesRef = useRef<TransitionPresentationAdapterHandle | null>(null);
  const servicesTtgRef = useRef<TransitionPresentationAdapterHandle | null>(null);
  const ttgLabRef = useRef<TransitionPresentationAdapterHandle | null>(null);
  const pendingNavigationRef = useRef<Group45PhoneSceneId>(entryScene);
  const entryIndex = sceneIndex(entryScene);

  // This focused route bypasses the full PhoneStoryShell geometry hook. Mark
  // the document as a live phone route here so the server-rendered static
  // fallback is removed from both the visible and accessible trees.
  useLayoutEffect(() => {
    const documentElement = document.documentElement;
    documentElement.dataset.portraitSpike = 'b';
    documentElement.dataset.portraitSpikeMotion = reducedMotion ? 'reduce' : 'force';
    documentElement.dataset.storyHydrated = 'true';
    return () => {
      delete documentElement.dataset.portraitSpike;
      delete documentElement.dataset.portraitSpikeMotion;
      delete documentElement.dataset.storyHydrated;
    };
  }, [reducedMotion]);

  const publishAdapter = useCallback(() => {
    setAdapterRevision((revision) => revision + 1);
  }, []);
  const bindBrand = useCallback((handle: ScenePresentationAdapterHandle | null) => {
    if (brandRef.current === handle) return;
    brandRef.current = handle;
    publishAdapter();
  }, [publishAdapter]);
  const bindFigure3 = useCallback((handle: ScenePresentationAdapterHandle | null) => {
    if (figure3Ref.current === handle) return;
    figure3Ref.current = handle;
    publishAdapter();
  }, [publishAdapter]);
  const bindServices = useCallback((handle: ScenePresentationAdapterHandle | null) => {
    if (servicesRef.current === handle) return;
    servicesRef.current = handle;
    publishAdapter();
  }, [publishAdapter]);
  const bindTtg = useCallback((handle: ScenePresentationAdapterHandle | null) => {
    if (ttgRef.current === handle) return;
    ttgRef.current = handle;
    publishAdapter();
  }, [publishAdapter]);
  const bindLab = useCallback((handle: ScenePresentationAdapterHandle | null) => {
    if (labRef.current === handle) return;
    labRef.current = handle;
    publishAdapter();
  }, [publishAdapter]);
  const bindBrandFigure3 = useCallback((handle: TransitionPresentationAdapterHandle | null) => {
    if (brandFigure3Ref.current === handle) return;
    brandFigure3Ref.current = handle;
    publishAdapter();
  }, [publishAdapter]);
  const bindFigure3Services = useCallback((handle: TransitionPresentationAdapterHandle | null) => {
    if (figure3ServicesRef.current === handle) return;
    figure3ServicesRef.current = handle;
    publishAdapter();
  }, [publishAdapter]);
  const bindServicesTtg = useCallback((handle: TransitionPresentationAdapterHandle | null) => {
    if (servicesTtgRef.current === handle) return;
    servicesTtgRef.current = handle;
    publishAdapter();
  }, [publishAdapter]);
  const bindTtgLab = useCallback((handle: TransitionPresentationAdapterHandle | null) => {
    if (ttgLabRef.current === handle) return;
    ttgLabRef.current = handle;
    publishAdapter();
  }, [publishAdapter]);

  const navigate = useCallback((scene: SceneId) => {
    const target = isGroup45Scene(scene) ? scene : 'brand';
    pendingNavigationRef.current = target;
    setMenuOpen(false);
    const hash = hashForScene(target);
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
    setEntryScene(target);
  }, []);

  const onMediaError = useCallback((scene: Group45PhoneSceneId) => {
    const target = scene === 'figure3-animation' ? 'services' : 'lab';
    rootRef.current?.setAttribute('data-phone-group45-media-fallback', target);
    if (scene === 'figure3-animation') {
      figure3ServicesRef.current?.render(1);
    }
    if (scene === 'ttg-animation') {
      ttgLabRef.current?.render(1);
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const target = phoneGroup45EntryFromHash(window.location.hash);
      pendingNavigationRef.current = target;
      setEntryScene(target);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    setCurrentScene(entryScene);
  }, [entryScene]);

  useEffect(() => {
    if (!adapters.ready) return;
    const target = pendingNavigationRef.current;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({ block: 'start' });
      pendingNavigationRef.current = target;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [adapters.ready, entryScene]);

  useLayoutEffect(() => {
    if (!adapters.ready) return;
    let frame = 0;
    const render = () => {
      frame = 0;
      const viewportHeight = Math.max(1, window.innerHeight);
      const figure3Frame = frameForTrack(figure3TrackRef.current, viewportHeight);
      const ttgFrame = frameForTrack(ttgTrackRef.current, viewportHeight);
      setVisualActivity((current) => (
        current.figure3.active === figure3Frame.active
          && current.figure3.prewarm === figure3Frame.prewarm
          && current.ttg.active === ttgFrame.active
          && current.ttg.prewarm === ttgFrame.prewarm
          ? current
          : {
              figure3: { active: figure3Frame.active, prewarm: figure3Frame.prewarm },
              ttg: { active: ttgFrame.active, prewarm: ttgFrame.prewarm }
            }
      ));

      brandRef.current?.update(1);
      figure3Ref.current?.update(figure3Frame.progress);
      servicesRef.current?.update(1);
      ttgRef.current?.update(ttgFrame.progress);
      labRef.current?.update(1);

      const brandElement = brandRef.current?.root() ?? null;
      const figure3Element = figure3TrackRef.current;
      const servicesElement = servicesRef.current?.root() ?? null;
      const ttgElement = ttgTrackRef.current;
      const labElement = labRef.current?.root() ?? null;
      brandFigure3Ref.current?.render(phoneGroup45BoundaryProgress(
        figure3Element?.getBoundingClientRect().top ?? viewportHeight,
        figure3Element?.getBoundingClientRect().height ?? viewportHeight,
        viewportHeight
      ));
      figure3ServicesRef.current?.render(phoneGroup45BoundaryProgress(
        servicesElement?.getBoundingClientRect().top ?? viewportHeight,
        servicesElement?.getBoundingClientRect().height ?? viewportHeight,
        viewportHeight
      ));
      servicesTtgRef.current?.render(phoneGroup45BoundaryProgress(
        ttgElement?.getBoundingClientRect().top ?? viewportHeight,
        ttgElement?.getBoundingClientRect().height ?? viewportHeight,
        viewportHeight
      ));
      ttgLabRef.current?.render(phoneGroup45BoundaryProgress(
        labElement?.getBoundingClientRect().top ?? viewportHeight,
        labElement?.getBoundingClientRect().height ?? viewportHeight,
        viewportHeight
      ));

      const sceneNodes: readonly [Group45PhoneSceneId, HTMLElement | null][] = [
        ['brand', brandElement],
        ['figure3-animation', figure3Element],
        ['services', servicesElement],
        ['ttg-animation', ttgElement],
        ['lab', labElement]
      ];
      const viewportMid = viewportHeight * .5;
      const active = sceneNodes.find(([, element]) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return rect.top <= viewportMid && rect.bottom >= viewportMid;
      })?.[0] ?? entryScene;
      setCurrentScene((current) => current === active ? current : active);
      rootRef.current?.setAttribute('data-phone-group45-active-scene', active);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(render);
    };
    render();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
    };
  }, [adapterRevision, adapters.ready, entryScene]);

  useEffect(() => () => {
    brandFigure3Ref.current?.dispose?.();
    figure3ServicesRef.current?.dispose?.();
    servicesTtgRef.current?.dispose?.();
    ttgLabRef.current?.dispose?.();
    brandRef.current?.dispose?.();
    figure3Ref.current?.dispose?.();
    servicesRef.current?.dispose?.();
    ttgRef.current?.dispose?.();
    labRef.current?.dispose?.();
  }, []);

  if (adapters.failed) {
    return (
      <main className="phone-brand-lab phone-brand-lab--fallback" data-phone-group45-state="fallback">
        <p>Brand → Lab 内容暂时无法载入，请刷新后重试。</p>
      </main>
    );
  }

  if (!adapters.ready) {
    return (
      <main className="phone-brand-lab phone-brand-lab--loading" data-phone-group45-state="loading">
        <p>正在准备 Brand → Lab…</p>
      </main>
    );
  }

  const Brand = adapters.scenes.brand;
  const Figure3 = adapters.scenes['figure3-animation'];
  const Services = adapters.scenes.services;
  const Ttg = adapters.scenes['ttg-animation'];
  const Lab = adapters.scenes.lab;
  const BrandFigure3 = adapters.transitions['brand-figure3'];
  const Figure3Services = adapters.transitions['figure3-services'];
  const ServicesTtg = adapters.transitions['services-ttg'];
  const TtgLab = adapters.transitions['ttg-lab'];

  return (
    <main
      ref={rootRef}
      className="phone-brand-lab"
      data-phone-validation-scope="brand-lab"
      data-phone-validation-mode={validationMode}
      data-phone-group45-state="ready"
      data-phone-proof-brand-input="stable-receiver"
      data-phone-motion={reducedMotion ? 'reduce' : 'full'}
    >
      {entryIndex <= sceneIndex('brand') && Brand && (
        <Brand ref={bindBrand} active reducedMotion={reducedMotion} />
      )}
      {entryIndex <= sceneIndex('figure3-animation') && Figure3 && (
        <div
          id="figure3-animation"
          ref={figure3TrackRef}
          className="phone-brand-lab__visual-track phone-brand-lab__visual-track--figure3"
          aria-hidden="true"
        >
          <div className="phone-brand-lab__visual-sticky">
            <Figure3
              ref={bindFigure3}
              active={visualActivity.figure3.active}
              prewarm={visualActivity.figure3.prewarm}
              reducedMotion={reducedMotion}
              onMediaError={onMediaError}
            />
          </div>
        </div>
      )}
      {entryIndex <= sceneIndex('services') && Services && (
        <Services ref={bindServices} active reducedMotion={reducedMotion} />
      )}
      {entryIndex <= sceneIndex('ttg-animation') && Ttg && (
        <div
          id="ttg-animation"
          ref={ttgTrackRef}
          className="phone-brand-lab__visual-track phone-brand-lab__visual-track--ttg"
          aria-hidden="true"
        >
          <div className="phone-brand-lab__visual-sticky">
            <Ttg
              ref={bindTtg}
              active={visualActivity.ttg.active}
              prewarm={visualActivity.ttg.prewarm}
              reducedMotion={reducedMotion}
              onMediaError={onMediaError}
            />
          </div>
        </div>
      )}
      {entryIndex <= sceneIndex('lab') && Lab && (
        <Lab ref={bindLab} active reducedMotion={reducedMotion} />
      )}

      {entryIndex <= sceneIndex('brand') && BrandFigure3 && (
        <div ref={setBrandFigure3Host} className="phone-brand-lab__transition-host" aria-hidden="true">
          <BrandFigure3
            ref={bindBrandFigure3}
            host={brandFigure3Host}
            from={brandRef.current?.root() ?? null}
            to={figure3Ref.current?.root() ?? null}
            reducedMotion={reducedMotion}
            documentFlow
          />
        </div>
      )}
      {entryIndex <= sceneIndex('figure3-animation') && Figure3Services && (
        <div ref={setFigure3ServicesHost} className="phone-brand-lab__transition-host" aria-hidden="true">
          <Figure3Services
            ref={bindFigure3Services}
            host={figure3ServicesHost}
            from={figure3Ref.current?.root() ?? null}
            to={servicesRef.current?.root() ?? null}
            reducedMotion={reducedMotion}
            documentFlow
          />
        </div>
      )}
      {entryIndex <= sceneIndex('services') && ServicesTtg && (
        <div ref={setServicesTtgHost} className="phone-brand-lab__transition-host" aria-hidden="true">
          <ServicesTtg
            ref={bindServicesTtg}
            host={servicesTtgHost}
            from={servicesRef.current?.root() ?? null}
            to={ttgRef.current?.root() ?? null}
            reducedMotion={reducedMotion}
            documentFlow
          />
        </div>
      )}
      {entryIndex <= sceneIndex('ttg-animation') && TtgLab && (
        <div ref={setTtgLabHost} className="phone-brand-lab__transition-host" aria-hidden="true">
          <TtgLab
            ref={bindTtgLab}
            host={ttgLabHost}
            from={ttgRef.current?.root() ?? null}
            to={labRef.current?.root() ?? null}
            reducedMotion={reducedMotion}
            documentFlow
          />
        </div>
      )}
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

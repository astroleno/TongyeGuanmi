import {
  type ComponentType,
  createElement,
  forwardRef,
  lazy,
  Suspense,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef
} from 'react';
import {
  frontHalfPhoneSceneIds,
  frontHalfPhoneTransitionIds
} from './adapter-groups/front-half';
import {
  gradeAPhoneSceneIds,
  gradeAPhoneTransitionIds
} from './adapter-groups/grade-a';
import {
  group45PhoneSceneIds,
  group45PhoneTransitionIds
} from './adapter-groups/group4-5';
import type {
  PhoneAodAdapterComponent,
  PhoneAodAdapterHandle,
  PhoneHeroAdapterHandle,
  PhoneHeroAdapterProps,
  PhoneLoaderAdapterModule,
  PhoneMethodAdapterComponent,
  PhoneMethodAdapterProps,
  PhonePatternAdapterComponent,
  PhonePatternAdapterProps,
  PhoneSceneAdapterId,
  PhoneSceneAdapterComponent,
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterModule,
  PhoneSceneAdapterProps,
  PhoneStarMapAdapterComponent,
  PhoneTransitionAdapterId,
  PhoneTransitionAdapterComponent,
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps,
  PhoneTransitionAdapterModule
} from './types';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../phone-story/presentation';
import type { PhoneHeroMigrationCommands } from '../../scenes/hero/phone/PhoneHero';
import type { PhonePatternMigrationCommands } from '../../scenes/pattern/phone/PhonePattern';
import type { PhoneAodMigrationCommands } from '../../scenes/aod-animation/phone/PhoneAod';
import type { PhoneStarMapMigrationCommands } from '../../scenes/star-map/phone/PhoneStarMap';

const LegacyPhoneGradeAStory = lazy(() => import('./PhoneGradeAStory').then((module) => ({
  default: module.PhoneGradeAStory
})));

type PhoneCleanLeaf = ComponentType<Readonly<{ reports: PhoneLeafReportPort }>>;

function usePhoneMigrationMount(onReady: (() => void) | undefined, label: string) {
  const registrationRef = useRef<PhoneLeafMountRegistration | null>(null);
  const readyRef = useRef(onReady);
  const generationRef = useRef(0);
  readyRef.current = onReady;
  const reports = useMemo<PhoneLeafReportPort>(() => Object.freeze({
    registerMount(registration) {
      registrationRef.current = registration;
      registration.commands.rebind({
        reports,
        frameToken: `${label}:frame:${++generationRef.current}`
      });
      readyRef.current?.();
    },
    reportPrepared: () => undefined,
    reportFrame: () => undefined,
    reportProgress: () => undefined,
    reportComplete: () => undefined,
    reportFailure: () => undefined
  }), [label]);
  return { registrationRef, reports };
}

function createPhoneSceneMigrationBridge(
  Leaf: PhoneCleanLeaf,
  label: string,
  activationSurfaceIds: readonly string[] = []
): PhoneSceneAdapterComponent {
  return forwardRef<PhoneSceneAdapterHandle, PhoneSceneAdapterProps>(
    function PhoneSceneMigrationBridge(props, forwardedRef) {
      const { registrationRef, reports } = usePhoneMigrationMount(props.onReady, label);
      const enter = () => {
        const commands = registrationRef.current?.commands;
        commands?.settle(1);
        if (!commands || activationSurfaceIds.length === 0) return;
        const result = commands.activate({
          invocationId: `${label}:activate`,
          surfaceIds: activationSurfaceIds,
          credit: 'physical-epoch'
        });
        for (const settlement of result.settlements) {
          if (settlement.status === 'pending') void settlement.settled.catch(() => undefined);
        }
      };
      useLayoutEffect(() => {
        if (props.active) enter();
        else registrationRef.current?.commands.pause('hidden');
      }, [props.active]);
      useImperativeHandle(forwardedRef, () => ({
        root: () => registrationRef.current?.root ?? null,
        update: (progress) => registrationRef.current?.commands.render(progress),
        enter,
        leave: () => registrationRef.current?.commands.pause('outside-closure'),
        reverse: enter,
        dispose: () => registrationRef.current?.commands.dispose('closure-retired')
      }), []);
      return createElement(Leaf, { reports });
    }
  );
}

function createPhoneTransitionMigrationBridge(
  Leaf: PhoneCleanLeaf,
  label: string
): PhoneTransitionAdapterComponent {
  return forwardRef<PhoneTransitionAdapterHandle, PhoneTransitionAdapterProps>(
    function PhoneTransitionMigrationBridge(props, forwardedRef) {
      const { registrationRef, reports } = usePhoneMigrationMount(props.onReady, label);
      void props.host; void props.from; void props.to; void props.reducedMotion;
      useImperativeHandle(forwardedRef, () => ({
        render: (progress) => registrationRef.current?.commands.render(progress),
        enter: () => registrationRef.current?.commands.render(0),
        leave: () => registrationRef.current?.commands.settle(1),
        reverse: () => registrationRef.current?.commands.render(1),
        dispose: () => registrationRef.current?.commands.dispose('closure-retired')
      }), []);
      return createElement(Leaf, { reports });
    }
  );
}

let loaderCache: Promise<PhoneLoaderAdapterModule> | undefined;
let resolvedLoaderCache: PhoneLoaderAdapterModule | undefined;
const sceneCache = new Map<PhoneSceneAdapterId, Promise<PhoneSceneAdapterModule>>();
const resolvedSceneCache = new Map<PhoneSceneAdapterId, PhoneSceneAdapterModule>();
const transitionCache = new Map<PhoneTransitionAdapterId, Promise<PhoneTransitionAdapterModule>>();
const resolvedTransitionCache = new Map<
  PhoneTransitionAdapterId,
  PhoneTransitionAdapterModule
>();

export const initialPhoneSceneAdapterIds = frontHalfPhoneSceneIds;
export const initialPhoneTransitionAdapterIds = frontHalfPhoneTransitionIds;
export const phoneSceneAdapterIds = [
  ...frontHalfPhoneSceneIds,
  ...gradeAPhoneSceneIds,
  ...group45PhoneSceneIds
] as const;
export const phoneTransitionAdapterIds = [
  ...frontHalfPhoneTransitionIds,
  ...gradeAPhoneTransitionIds,
  ...group45PhoneTransitionIds
] as const;

function importPhoneLoaderAdapter(): Promise<PhoneLoaderAdapterModule> {
  return import('./scenes/PhoneLoader').then(({ PhoneLoader: Component }) => ({
    id: 'loader',
    Component
  }));
}

function importPhoneSceneAdapter(id: PhoneSceneAdapterId): Promise<PhoneSceneAdapterModule> {
  switch (id) {
    case 'hero':
      return import('../../scenes/hero/phone/PhoneHero').then((module) => {
        const Component = forwardRef<PhoneHeroAdapterHandle, PhoneHeroAdapterProps>(
          function PhoneHeroMigrationBridge(props, forwardedRef) {
            const registrationRef = useRef<PhoneLeafMountRegistration | null>(null);
            const readyRef = useRef(props.onReady);
            const generationRef = useRef(0);
            readyRef.current = props.onReady;
            const reports = useMemo<PhoneLeafReportPort>(() => Object.freeze({
              registerMount(registration) {
                registrationRef.current = registration;
                registration.commands.rebind({
                  reports,
                  frameToken: `legacy-hero:frame:${++generationRef.current}`
                });
                readyRef.current?.();
              },
              reportPrepared: () => undefined,
              reportFrame: () => undefined,
              reportProgress: () => undefined,
              reportComplete: () => undefined,
              reportFailure: () => undefined
            }), []);
            const migration = () => {
              const commands = registrationRef.current?.commands as
                | PhoneHeroMigrationCommands
                | undefined;
              return commands?.[module.PHONE_HERO_MIGRATION_CONTROL];
            };
            useLayoutEffect(() => {
              void props.motionDriver;
              if (props.active && !props.reducedMotion) migration()?.enter();
              else registrationRef.current?.commands.pause('hidden');
            }, [props.active, props.motionDriver, props.reducedMotion]);
            useImperativeHandle(forwardedRef, () => ({
              root: () => registrationRef.current?.root ?? null,
              update: (progress) => registrationRef.current?.commands.render(progress),
              enter: () => migration()?.enter(),
              leave: () => migration()?.leave(),
              reverse: () => migration()?.enter(),
              startEntrance: () => {
                const commands = registrationRef.current?.commands as
                  | PhoneHeroMigrationCommands
                  | undefined;
                commands?.[module.PHONE_HERO_MIGRATION_CONTROL].startEntrance();
              },
              completeEntrance: () => {
                const commands = registrationRef.current?.commands as
                  | PhoneHeroMigrationCommands
                  | undefined;
                commands?.[module.PHONE_HERO_MIGRATION_CONTROL].completeEntrance();
              },
              cancelEntrance: () => {
                const commands = registrationRef.current?.commands as
                  | PhoneHeroMigrationCommands
                  | undefined;
                commands?.[module.PHONE_HERO_MIGRATION_CONTROL].cancelEntrance();
              },
              unlockFromGesture: () => {
                const commands = registrationRef.current?.commands as
                  | PhoneHeroMigrationCommands
                  | undefined;
                commands?.[module.PHONE_HERO_MIGRATION_CONTROL].unlockFromGesture();
              },
              dispose: () => registrationRef.current?.commands.dispose('closure-retired')
            }), []);
            return createElement(module.PhoneHero, { reports });
          }
        );
        return { id, Component: Component as unknown as PhoneSceneAdapterComponent };
      });
    case 'pattern':
      return import('../../scenes/pattern/phone/PhonePattern').then((module) => {
        const Component = forwardRef<PhoneSceneAdapterHandle, PhonePatternAdapterProps>(
          function PhonePatternMigrationBridge(props, forwardedRef) {
            const registrationRef = useRef<PhoneLeafMountRegistration | null>(null);
            const readyRef = useRef(props.onReady);
            const generationRef = useRef(0);
            readyRef.current = props.onReady;
            const reports = useMemo<PhoneLeafReportPort>(() => Object.freeze({
              registerMount(registration) {
                registrationRef.current = registration;
                registration.commands.rebind({
                  reports,
                  frameToken: `legacy-pattern:frame:${++generationRef.current}`
                });
              },
              reportPrepared(surfaceId, report) {
                if (surfaceId === 'pattern-image' && report.kind === 'image-decoded') {
                  readyRef.current?.();
                }
              },
              reportFrame: () => undefined,
              reportProgress: () => undefined,
              reportComplete: () => undefined,
              reportFailure: () => undefined
            }), []);
            const migration = () => {
              const commands = registrationRef.current?.commands as
                | PhonePatternMigrationCommands
                | undefined;
              return commands?.[module.PHONE_PATTERN_MIGRATION_CONTROL];
            };
            useLayoutEffect(() => {
              void props.motionDriver;
              if (props.active) migration()?.enter(!props.reducedMotion);
              else registrationRef.current?.commands.pause('hidden');
            }, [props.active, props.motionDriver, props.reducedMotion]);
            useImperativeHandle(forwardedRef, () => ({
              root: () => registrationRef.current?.root ?? null,
              update: (progress) => registrationRef.current?.commands.render(progress),
              enter: () => migration()?.enter(!props.reducedMotion),
              leave: () => migration()?.leave(),
              reverse: () => migration()?.reverse(!props.reducedMotion),
              dispose: () => registrationRef.current?.commands.dispose('closure-retired')
            }), [props.reducedMotion]);
            return createElement(module.PhonePattern, { reports });
          }
        );
        return { id, Component: Component as PhonePatternAdapterComponent };
      });
    case 'star-map':
      return import('../../scenes/star-map/phone/PhoneStarMap').then((module) => {
        const Component = forwardRef<PhoneSceneAdapterHandle, PhonePatternAdapterProps>(
          function PhoneStarMapMigrationBridge(props, forwardedRef) {
            const registrationRef = useRef<PhoneLeafMountRegistration | null>(null);
            const readyRef = useRef(props.onReady);
            const generationRef = useRef(0);
            readyRef.current = props.onReady;
            const reports = useMemo<PhoneLeafReportPort>(() => Object.freeze({
              registerMount(registration) {
                registrationRef.current = registration;
                registration.commands.rebind({
                  reports,
                  frameToken: `legacy-star-map:frame:${++generationRef.current}`
                });
              },
              reportPrepared: () => undefined,
              reportFrame(surfaceId) {
                if (surfaceId === 'star-map-canvas') readyRef.current?.();
              },
              reportProgress: () => undefined,
              reportComplete: () => undefined,
              reportFailure: () => undefined
            }), []);
            const migration = () => {
              const commands = registrationRef.current?.commands as
                | PhoneStarMapMigrationCommands
                | undefined;
              return commands?.[module.PHONE_STAR_MAP_MIGRATION_CONTROL];
            };
            useLayoutEffect(() => {
              void props.motionDriver;
              if (props.active) migration()?.enter();
              else registrationRef.current?.commands.pause('hidden');
            }, [props.active, props.motionDriver, props.reducedMotion]);
            useImperativeHandle(forwardedRef, () => ({
              root: () => registrationRef.current?.root ?? null,
              update: (progress) => registrationRef.current?.commands.render(progress),
              enter: () => migration()?.enter(),
              leave: () => migration()?.leave(),
              reverse: () => migration()?.reverse(),
              dispose: () => registrationRef.current?.commands.dispose('closure-retired')
            }), []);
            return createElement(module.PhoneStarMap, { reports });
          }
        );
        return { id, Component: Component as PhoneStarMapAdapterComponent };
      });
    case 'aod-animation':
      return import('../../scenes/aod-animation/phone/PhoneAod').then((module) => {
        const Component = forwardRef<PhoneAodAdapterHandle, PhoneSceneAdapterProps>(
          function PhoneAodMigrationBridge(props, forwardedRef) {
            const registrationRef = useRef<PhoneLeafMountRegistration | null>(null);
            const readyRef = useRef(props.onReady);
            const progressRef = useRef(props.onAodProgress);
            const completeRef = useRef(props.onAodComplete);
            const generationRef = useRef(0);
            readyRef.current = props.onReady;
            progressRef.current = props.onAodProgress;
            completeRef.current = props.onAodComplete;
            const reports = useMemo<PhoneLeafReportPort>(() => Object.freeze({
              registerMount(registration) {
                registrationRef.current = registration;
                registration.commands.rebind({
                  reports,
                  frameToken: `legacy-aod:frame:${++generationRef.current}`
                });
                readyRef.current?.();
              },
              reportPrepared: () => undefined,
              reportFrame: () => undefined,
              reportProgress: (progress) => progressRef.current?.(progress, 1),
              reportComplete: () => completeRef.current?.(1),
              reportFailure: () => undefined
            }), []);
            const migration = () => {
              const commands = registrationRef.current?.commands as
                | PhoneAodMigrationCommands
                | undefined;
              return commands?.[module.PHONE_AOD_MIGRATION_CONTROL];
            };
            const video = () => registrationRef.current?.root.querySelector<HTMLVideoElement>(
              '[data-aod-figure-video]'
            ) ?? null;
            const clearAutoplayCompletion = () => { const media = video(); if (media) media.onended = null; };
            useLayoutEffect(() => {
              if (props.active) migration()?.enter();
              else registrationRef.current?.commands.pause('hidden');
            }, [props.active]);
            useImperativeHandle(forwardedRef, () => ({
              root: () => registrationRef.current?.root ?? null,
              update(progress) {
                registrationRef.current?.commands.render(progress);
                progressRef.current?.(progress, 1);
              },
              startAutoplay(direction) {
                clearAutoplayCompletion();
                const completion = migration()?.startAutoplay(direction);
                if (!completion) return;
                if (direction === 1) {
                  const media = video();
                  if (!media) return;
                  const finish = () => {
                    if (media.onended !== finish) return;
                    media.onended = null;
                    void completion.then(() => {
                      registrationRef.current?.commands.render(1);
                      progressRef.current?.(1, 1);
                      completeRef.current?.(1);
                    }).catch(() => undefined);
                  };
                  media.onended = finish;
                  return;
                }
                void completion.then(() => {
                  progressRef.current?.(0, -1);
                  completeRef.current?.(-1);
                }).catch(() => undefined);
              },
              resetAutoplay: () => { clearAutoplayCompletion(); migration()?.resetAutoplay(); },
              enter: () => migration()?.enter(),
              leave: () => { clearAutoplayCompletion(); migration()?.leave(); },
              reverse: () => undefined,
              dispose: () => {
                clearAutoplayCompletion();
                registrationRef.current?.commands.dispose('closure-retired');
              }
            }), []);
            return createElement(module.PhoneAod, { reports });
          }
        );
        return {
          id,
          Component: Component as PhoneAodAdapterComponent,
          aodAlphaStartProgress: module.PHONE_AOD_ALPHA_START_PROGRESS,
          aodAlphaEndProgress: module.PHONE_AOD_ALPHA_END_PROGRESS
        };
      });
    case 'method-top':
      return import('./scenes/PhoneMethodTop').then((module) => {
        const Component = forwardRef<PhoneSceneAdapterHandle, PhoneMethodAdapterProps>(
          function PhoneMethodMigrationBridge(props, forwardedRef) {
            const { registrationRef, reports } = usePhoneMigrationMount(
              props.onReady, 'legacy-method'
            );
            const gradeARequested = props.active;
            void props.motionDriver;
            useLayoutEffect(() => {
              if (props.active) registrationRef.current?.commands.settle(1);
              else registrationRef.current?.commands.pause('hidden');
            }, [props.active]);
            useImperativeHandle(forwardedRef, () => ({
              root: () => registrationRef.current?.root ?? null,
              update: (progress) => registrationRef.current?.commands.render(progress),
              enter: () => registrationRef.current?.commands.settle(1),
              leave: () => registrationRef.current?.commands.pause('outside-closure'),
              reverse: () => registrationRef.current?.commands.settle(1),
              dispose: () => registrationRef.current?.commands.dispose('closure-retired')
            }), []);
            return createElement('div', { className: 'phone-method-migration' },
              createElement(module.PhoneMethodTop, { reports }),
              createElement('div', {
                className: 'phone-grade-a-slot',
                'data-phone-grade-a-requested': String(gradeARequested)
              }, gradeARequested && createElement(Suspense, { fallback: null },
                  createElement(LegacyPhoneGradeAStory, {
                    reducedMotion: props.reducedMotion,
                    stageHost: props.stageHost,
                    ...(props.onGradeACheckpoint
                      ? { onCheckpoint: props.onGradeACheckpoint } : {}),
                    ...(props.onGradeASceneChange
                      ? { onSceneChange: props.onGradeASceneChange } : {}),
                    ...(props.onGradeAEdgeScene
                      ? { onEdgeScene: props.onGradeAEdgeScene } : {})
                  }))
              )
            );
          }
        );
        return { id, Component: Component as PhoneMethodAdapterComponent };
      });
    case 'figure2-animation':
      return import('./scenes/PhoneFigure2').then(({
        PhoneFigure2
      }) => ({
        id,
        Component: createPhoneSceneMigrationBridge(
          PhoneFigure2, 'legacy-figure2', ['figure2-pair-video']
        )
      }));
    case 'figure2-proof':
      return import('./scenes/PhoneFigure2Proof').then(({
        PhoneFigure2Proof
      }) => ({
        id,
        Component: createPhoneSceneMigrationBridge(
          PhoneFigure2Proof, 'legacy-figure2-proof'
        )
      }));
    case 'brand':
      return import('../../scenes/brand/phone/PhoneBrand').then(({
        PhoneBrand
      }) => ({
        id,
        Component: createPhoneSceneMigrationBridge(PhoneBrand, 'legacy-brand')
      }));
    case 'figure3-animation':
      return import('./scenes/PhoneFigure3').then(({
        PhoneFigure3
      }) => ({
        id,
        Component: createPhoneSceneMigrationBridge(
          PhoneFigure3, 'legacy-figure3', ['figure3-video']
        )
      }));
    case 'services':
      return import('./scenes/PhoneServices').then(({
        PhoneServices
      }) => ({
        id,
        Component: createPhoneSceneMigrationBridge(PhoneServices, 'legacy-services')
      }));
    case 'ttg-animation':
      return import('./scenes/PhoneTtg').then(({
        PhoneTtg
      }) => ({
        id,
        Component: createPhoneSceneMigrationBridge(
          PhoneTtg, 'legacy-ttg', ['ttg-figure-video']
        )
      }));
    case 'lab':
      return import('./scenes/PhoneLab').then(({
        PhoneLab
      }) => ({
        id,
        Component: createPhoneSceneMigrationBridge(PhoneLab, 'legacy-lab')
      }));
  }
}

function importPhoneTransitionAdapter(id: PhoneTransitionAdapterId): Promise<PhoneTransitionAdapterModule> {
  switch (id) {
    case 'hero-pattern':
      return import('./transitions/hero-pattern').then(({ PhoneHeroPatternTransition: Component }) => ({ id, Component }));
    case 'pattern-star-map':
      return import('./transitions/pattern-star-map').then(({ PhonePatternStarMapTransition: Component }) => ({ id, Component }));
    case 'star-map-aod':
      return import('./transitions/star-map-aod').then(({ PhoneStarMapAodTransition: Component }) => ({ id, Component }));
    case 'aod-method-top':
      return import('./transitions/aod-method-top').then(({ phoneAodMethodTopTransition }) => phoneAodMethodTopTransition);
    case 'method-bottom-figure2':
      return import('./transitions/method-bottom-figure2').then(({
        PhoneMethodBottomFigure2Transition
      }) => ({ id, Component: createPhoneTransitionMigrationBridge(
        PhoneMethodBottomFigure2Transition, 'legacy-method-figure2'
      ) }));
    case 'figure2-distance-expand':
      return import('./transitions/figure2-distance-expand').then(({
        PhoneFigure2DistanceExpandTransition
      }) => ({ id, Component: createPhoneTransitionMigrationBridge(
        PhoneFigure2DistanceExpandTransition, 'legacy-figure2-proof'
      ) }));
    case 'figure2-proof-brand':
      return import('./transitions/figure2-proof-brand').then(({
        PhoneFigure2ProofBrandTransition
      }) => ({ id, Component: createPhoneTransitionMigrationBridge(
        PhoneFigure2ProofBrandTransition, 'legacy-proof-brand'
      ) }));
    case 'brand-figure3':
      return import('./transitions/brand-figure3').then(({
        PhoneBrandFigure3Transition
      }) => ({
        id,
        Component: createPhoneTransitionMigrationBridge(
          PhoneBrandFigure3Transition, 'legacy-brand-figure3'
        )
      }));
    case 'figure3-services':
      return import('./transitions/figure3-services').then(({
        PhoneFigure3ServicesTransition
      }) => ({
        id,
        Component: createPhoneTransitionMigrationBridge(
          PhoneFigure3ServicesTransition, 'legacy-figure3-services'
        )
      }));
    case 'services-ttg':
      return import('./transitions/services-ttg').then(({
        PhoneServicesTtgTransition
      }) => ({
        id,
        Component: createPhoneTransitionMigrationBridge(
          PhoneServicesTtgTransition, 'legacy-services-ttg'
        )
      }));
    case 'ttg-lab':
      return import('./transitions/ttg-lab').then(({
        PhoneTtgLabTransition
      }) => ({
        id,
        Component: createPhoneTransitionMigrationBridge(
          PhoneTtgLabTransition, 'legacy-ttg-lab'
        )
      }));
  }
}

export function loadPhoneSceneAdapter(id: PhoneSceneAdapterId): Promise<PhoneSceneAdapterModule> {
  const cached = sceneCache.get(id);
  if (cached) return cached;
  const promise = importPhoneSceneAdapter(id).then((adapter) => {
    if (adapter.id !== id) throw new Error(`Phone scene adapter returned ${adapter.id} for ${id}`);
    resolvedSceneCache.set(id, adapter);
    return adapter;
  });
  sceneCache.set(id, promise);
  void promise.catch(() => {
    if (sceneCache.get(id) === promise) sceneCache.delete(id);
  });
  return promise;
}

export function loadPhoneLoaderAdapter(): Promise<PhoneLoaderAdapterModule> {
  if (loaderCache) return loaderCache;
  const promise = importPhoneLoaderAdapter().then((adapter) => {
    resolvedLoaderCache = adapter;
    return adapter;
  });
  loaderCache = promise;
  void promise.catch(() => {
    if (loaderCache === promise) loaderCache = undefined;
  });
  return promise;
}

export function resolvedPhoneLoaderAdapter(): PhoneLoaderAdapterModule | undefined {
  return resolvedLoaderCache;
}

export function resolvedPhoneSceneAdapter(
  id: PhoneSceneAdapterId
): PhoneSceneAdapterModule | undefined {
  return resolvedSceneCache.get(id);
}

export function loadPhoneTransitionAdapter(id: PhoneTransitionAdapterId): Promise<PhoneTransitionAdapterModule> {
  const cached = transitionCache.get(id);
  if (cached) return cached;
  const promise = importPhoneTransitionAdapter(id).then((adapter) => {
    if (adapter.id !== id) throw new Error(`Phone transition adapter returned ${adapter.id} for ${id}`);
    resolvedTransitionCache.set(id, adapter);
    return adapter;
  });
  transitionCache.set(id, promise);
  void promise.catch(() => {
    if (transitionCache.get(id) === promise) transitionCache.delete(id);
  });
  return promise;
}

export function resolvedPhoneTransitionAdapter(
  id: PhoneTransitionAdapterId
): PhoneTransitionAdapterModule | undefined {
  return resolvedTransitionCache.get(id);
}

export function loadedPhoneAdapters(): Readonly<{
  loader: boolean;
  scenes: readonly PhoneSceneAdapterId[];
  transitions: readonly PhoneTransitionAdapterId[];
}> {
  return {
    loader: Boolean(loaderCache),
    scenes: [...sceneCache.keys()],
    transitions: [...transitionCache.keys()]
  };
}

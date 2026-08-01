import {
  Component,
  Suspense,
  use,
  type ComponentType,
  type ReactNode
} from 'react';
import type { PhoneLeafReportPort } from './presentation';

export type PhoneSceneLeafProps = Readonly<{ reports: PhoneLeafReportPort }>;
export type PhoneSceneReadingProps = Readonly<{ sceneId: string }>;
export type PhoneSceneModule = Readonly<{
  default: ComponentType<PhoneSceneLeafProps>;
  Reading?: ComponentType<PhoneSceneReadingProps>;
}>;
export type PhoneSceneLoader = () => Promise<PhoneSceneModule>;
export type PhonePlaneBuffer = 'a' | 'b';
export type PhoneSceneRenderSlot<SceneId extends string = string> = Readonly<{
  sceneId: SceneId;
  buffer: PhonePlaneBuffer;
  reports: PhoneLeafReportPort;
}>;

export function createPhoneSceneTopology<SceneId extends string>() {
  const retained = new Map<SceneId, PhoneSceneRenderSlot<SceneId>>();
  let pair: readonly [SceneId, SceneId] | null = null;
  return Object.freeze({
    retain(
      sceneId: SceneId,
      buffer: PhonePlaneBuffer,
      createReports: () => PhoneLeafReportPort
    ): PhoneSceneRenderSlot<SceneId> {
      const current = retained.get(sceneId);
      const slot = current ? { ...current, buffer }
        : { sceneId, buffer, reports: createReports() };
      retained.set(sceneId, slot);
      return slot;
    },
    setPair(next: readonly [SceneId, SceneId] | null): void {
      pair = next;
    },
    stable(
      sceneId: SceneId,
      source: PhonePlaneBuffer,
      receiver: PhonePlaneBuffer
    ): readonly PhoneSceneRenderSlot<SceneId>[] {
      const stable = retained.get(sceneId);
      if (!stable) return [];
      const result: PhoneSceneRenderSlot<SceneId>[] = [];
      if (pair?.includes(sceneId)) {
        const partnerId = pair[0] === sceneId ? pair[1] : pair[0];
        const partner = retained.get(partnerId);
        if (partner) result.push({ ...partner, buffer: receiver });
      }
      result.push({ ...stable, buffer: source });
      return result;
    },
    prune(entries: readonly PhoneSceneRenderSlot<SceneId>[]): void {
      const active = new Set(entries.map(({ sceneId }) => sceneId));
      for (const sceneId of retained.keys()) if (!active.has(sceneId)) retained.delete(sceneId);
    },
    clear(): void {
      pair = null;
      retained.clear();
    }
  });
}

export type PhoneSceneRegistry<SceneId extends string = string> = Readonly<{
  load(sceneId: SceneId): Promise<PhoneSceneModule>;
}>;

class PhoneSceneLoadError extends Error {
  readonly code: 'phone-scene-leaf-missing' | 'phone-scene-leaf-rejected';

  constructor(
    code: PhoneSceneLoadError['code'],
    message: string
  ) {
    super(message);
    this.name = 'PhoneSceneLoadError';
    this.code = code;
  }
}

export function createPhoneSceneRegistry<SceneId extends string = string>(
  loaders: Partial<Record<SceneId, PhoneSceneLoader>>
): PhoneSceneRegistry<SceneId> {
  const fulfilled = new Map<SceneId, Promise<PhoneSceneModule>>();
  const pending = new Map<SceneId, Promise<PhoneSceneModule>>();
  const rejected = new Set<SceneId>();
  return Object.freeze({
    load: (sceneId: SceneId) => {
      const cached = fulfilled.get(sceneId) ?? pending.get(sceneId);
      if (cached) return cached;
      if (rejected.has(sceneId)) throw new PhoneSceneLoadError(
        'phone-scene-leaf-rejected',
        `Scene ${sceneId} was rejected and cannot be retried in the same Document`
      );
      const loader = loaders[sceneId];
      if (!loader) throw new PhoneSceneLoadError(
        'phone-scene-leaf-missing', `Scene ${sceneId} has no clean lazy leaf`
      );
      const promise = loader().then((module) => {
        pending.delete(sceneId);
        fulfilled.set(sceneId, promise);
        return module;
      }, (cause: unknown) => {
        pending.delete(sceneId);
        rejected.add(sceneId);
        throw new PhoneSceneLoadError(
          'phone-scene-leaf-rejected',
          cause instanceof Error ? cause.message : String(cause)
        );
      });
      pending.set(sceneId, promise);
      return promise;
    }
  });
}

const sceneLoaders = Object.freeze({
  hero: () => import('../../scenes/hero/phone/PhoneHero'),
  pattern: () => import('../../scenes/pattern/phone/PhonePattern'),
  'star-map': () => import('../../scenes/star-map/phone/PhoneStarMap'),
  'aod-animation': () => import('../../scenes/aod-animation/phone/PhoneAod'),
  'method-top': () => import('../../scenes/method-top/phone/PhoneMethodTop'),
  'figure2-animation': () => import('../../scenes/figure2-animation/phone/PhoneFigure2'),
  'figure2-proof': () => import('../../scenes/figure2-proof/phone/PhoneFigure2Proof'),
  brand: () => import('../../scenes/brand/phone/PhoneBrand'),
  'figure3-animation': () => import('../../scenes/figure3-animation/phone/PhoneFigure3'),
  services: () => import('../../scenes/services/phone/PhoneServices'),
  'ttg-animation': () => import('../../scenes/ttg-animation/phone/PhoneTtg'),
  lab: () => import('../../scenes/lab/phone/PhoneLab'),
  'ph-animation': () => import('../../scenes/ph-animation/phone/PhonePh'),
  education: () => import('../../scenes/education/phone/PhoneEducation')
}) satisfies Partial<Record<string, PhoneSceneLoader>>;
const defaultSceneRegistry = createPhoneSceneRegistry<string>(sceneLoaders);

type PhoneSceneFailureBoundaryProps = Readonly<{
  children: ReactNode;
  reports?: PhoneLeafReportPort;
}>;

class PhoneSceneFailureBoundary extends Component<
  PhoneSceneFailureBoundaryProps,
  Readonly<{ failed: boolean }>
> {
  state = { failed: false };

  static getDerivedStateFromError(): Readonly<{ failed: boolean }> {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    const failure = error instanceof PhoneSceneLoadError ? error : new PhoneSceneLoadError(
      'phone-scene-leaf-rejected',
      error instanceof Error ? error.message : String(error)
    );
    this.props.reports?.reportFailure({
      code: failure.code,
      message: failure.message,
      recoverable: true
    });
  }

  render(): ReactNode {
    return this.state.failed ? <PhoneSceneCover /> : this.props.children;
  }
}

function PhoneSceneCover() {
  return (
    <div data-phone-leaf-cover="scene" role="status" aria-live="polite">
      正在保持已验证画面
    </div>
  );
}

function PhoneSceneModuleView<SceneId extends string>({
  registry,
  sceneId,
  reports
}: Readonly<{
  registry: PhoneSceneRegistry<SceneId>;
  sceneId: SceneId;
  reports: PhoneLeafReportPort;
}>) {
  const module = use(registry.load(sceneId));
  const Leaf = module.default;
  return <Leaf reports={reports} />;
}

export function PhoneSceneLeaf<SceneId extends string>({
  registry = defaultSceneRegistry,
  sceneId,
  reports
}: Readonly<{
  registry?: PhoneSceneRegistry<SceneId>;
  sceneId: SceneId;
  reports: PhoneLeafReportPort;
}>) {
  return (
    <PhoneSceneFailureBoundary key={sceneId} reports={reports}>
      <Suspense fallback={<PhoneSceneCover />}>
        <PhoneSceneModuleView registry={registry} sceneId={sceneId} reports={reports} />
      </Suspense>
    </PhoneSceneFailureBoundary>
  );
}

function PhoneSceneReadingView<SceneId extends string>({
  registry,
  sceneId
}: Readonly<{ registry: PhoneSceneRegistry<SceneId>; sceneId: SceneId }>) {
  const module = use(registry.load(sceneId));
  const Reading = module.Reading;
  return Reading
    ? <Reading sceneId={sceneId} />
    : <div data-phone-reading-unavailable={sceneId} />;
}

export function PhoneSceneReading<SceneId extends string>({
  registry = defaultSceneRegistry,
  sceneId
}: Readonly<{ registry?: PhoneSceneRegistry<SceneId>; sceneId: SceneId }>) {
  return (
    <PhoneSceneFailureBoundary key={`reading:${sceneId}`}>
      <Suspense fallback={<PhoneSceneCover />}>
        <PhoneSceneReadingView registry={registry} sceneId={sceneId} />
      </Suspense>
    </PhoneSceneFailureBoundary>
  );
}

export function loadPhoneSceneModule(sceneId: string): Promise<PhoneSceneModule> {
  return defaultSceneRegistry.load(sceneId);
}

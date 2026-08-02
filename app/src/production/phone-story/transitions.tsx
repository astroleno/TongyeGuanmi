import {
  Component,
  Suspense,
  use,
  type ComponentType,
  type ReactNode
} from 'react';
import type { PhoneLeafReportPort } from './presentation';
import type { PhoneSegmentId } from './manifest';

export type PhoneTransitionLeafProps = Readonly<{ reports: PhoneLeafReportPort }>;
export type PhoneTransitionModule<SegmentId extends string = string> = Readonly<{
  phoneSegmentId: SegmentId;
  default: ComponentType<PhoneTransitionLeafProps>;
}>;
export type PhoneTransitionLoader<SegmentId extends string = string> =
  () => Promise<PhoneTransitionModule<SegmentId>>;
export type PhoneTransitionLoaderMap = {
  readonly [SegmentId in PhoneSegmentId]: PhoneTransitionLoader<SegmentId>;
};
export type PhoneEffectRenderSlot<SegmentId extends string = string> = Readonly<{
  attemptId: string;
  segmentId: SegmentId;
  reports: PhoneLeafReportPort;
  retainAfterStable: boolean;
}>;

export function createPhoneEffectTopology<SegmentId extends string>() {
  let current: PhoneEffectRenderSlot<SegmentId> | null = null;
  return Object.freeze({
    retain(
      attemptId: string,
      segmentId: SegmentId,
      retainAfterStable: boolean,
      createReports: () => PhoneLeafReportPort
    ): PhoneEffectRenderSlot<SegmentId> {
      current = current?.segmentId === segmentId
        ? { ...current, attemptId, retainAfterStable }
        : { attemptId, segmentId, retainAfterStable, reports: createReports() };
      return current;
    },
    finish(): PhoneEffectRenderSlot<SegmentId> | null {
      if (!current?.retainAfterStable) current = null;
      return current;
    },
    clear(): null {
      current = null;
      return null;
    }
  });
}

export type PhoneTransitionRegistry<SegmentId extends string = string> = Readonly<{
  load(segmentId: SegmentId): Promise<PhoneTransitionModule>;
}>;

class PhoneTransitionLoadError extends Error {
  readonly code: 'phone-transition-leaf-missing' | 'phone-transition-leaf-rejected'
    | 'phone-transition-leaf-mismatch';

  constructor(
    code: PhoneTransitionLoadError['code'],
    message: string
  ) {
    super(message);
    this.name = 'PhoneTransitionLoadError';
    this.code = code;
  }
}

export function createPhoneTransitionRegistry<SegmentId extends string = string>(
  loaders: Partial<Record<SegmentId, PhoneTransitionLoader>>
): PhoneTransitionRegistry<SegmentId> {
  const fulfilled = new Map<SegmentId, Promise<PhoneTransitionModule>>();
  const pending = new Map<SegmentId, Promise<PhoneTransitionModule>>();
  const rejected = new Set<SegmentId>();
  return Object.freeze({
    load: (segmentId: SegmentId) => {
      const cached = fulfilled.get(segmentId) ?? pending.get(segmentId);
      if (cached) return cached;
      if (rejected.has(segmentId)) throw new PhoneTransitionLoadError(
        'phone-transition-leaf-rejected',
        `Transition ${segmentId} was rejected and cannot be retried in the same Document`
      );
      const loader = loaders[segmentId];
      if (!loader) throw new PhoneTransitionLoadError(
        'phone-transition-leaf-missing', `Transition ${segmentId} has no clean lazy leaf`
      );
      const promise = loader().then((module) => {
        if (module.phoneSegmentId !== segmentId) throw new PhoneTransitionLoadError(
          'phone-transition-leaf-mismatch',
          `Transition ${segmentId} resolved module ${module.phoneSegmentId}`
        );
        pending.delete(segmentId);
        fulfilled.set(segmentId, promise);
        return module;
      }).catch((cause: unknown) => {
        pending.delete(segmentId);
        rejected.add(segmentId);
        if (cause instanceof PhoneTransitionLoadError) throw cause;
        throw new PhoneTransitionLoadError(
          'phone-transition-leaf-rejected',
          cause instanceof Error ? cause.message : String(cause)
        );
      });
      pending.set(segmentId, promise);
      return promise;
    }
  });
}

export function defineExhaustivePhoneTransitionLoaders(
  loaders: PhoneTransitionLoaderMap
): PhoneTransitionLoaderMap {
  return Object.freeze(loaders);
}

const transitionLoaders: Record<PhoneSegmentId, PhoneTransitionLoader> =
defineExhaustivePhoneTransitionLoaders({
  'hero-pattern': () => import('../../transitions/hero-pattern/phone'),
  'pattern-star-map': () => import('../../transitions/pattern-star-map/phone'),
  'star-map-aod': () => import('../../transitions/star-map-aod/phone'),
  'aod-method-top': () => import('../../transitions/aod-method-top/phone'),
  'method-bottom-figure2': () => import('../../transitions/method-bottom-figure2/phone'),
  'figure2-distance-expand': () => import('../../transitions/figure2-distance-expand/phone'),
  'figure2-proof-brand': () => import('../../transitions/figure2-proof-brand/phone'),
  'brand-figure3': () => import('../../transitions/brand-figure3/phone'),
  'figure3-services': () => import('../../transitions/figure3-services/phone'),
  'services-ttg': () => import('../../transitions/services-ttg/phone'),
  'ttg-lab': () => import('../../transitions/ttg-lab/phone'),
  'lab-ph': () => import('../../transitions/lab-ph/phone'),
  'ph-education': () => import('../../transitions/ph-education/phone'),
  'education-crane': () => import('../../transitions/education-crane/phone'),
  'crane-contact': () => import('../../transitions/crane-contact/phone')
});
const defaultTransitionRegistry = createPhoneTransitionRegistry<string>(
  transitionLoaders
);

type PhoneTransitionFailureBoundaryProps = Readonly<{
  children: ReactNode;
  reports: PhoneLeafReportPort;
}>;

class PhoneTransitionFailureBoundary extends Component<
  PhoneTransitionFailureBoundaryProps,
  Readonly<{ failed: boolean }>
> {
  state = { failed: false };

  static getDerivedStateFromError(): Readonly<{ failed: boolean }> {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    const failure = error instanceof PhoneTransitionLoadError ? error
      : new PhoneTransitionLoadError(
          'phone-transition-leaf-rejected',
          error instanceof Error ? error.message : String(error)
        );
    this.props.reports.reportFailure({
      code: failure.code,
      message: failure.message,
      recoverable: true
    });
  }

  render(): ReactNode {
    return this.state.failed ? <PhoneTransitionCover /> : this.props.children;
  }
}

function PhoneTransitionCover() {
  return (
    <div data-phone-leaf-cover="transition" role="status" aria-live="polite">
      正在保持已验证画面
    </div>
  );
}

function PhoneTransitionModuleView<SegmentId extends string>({
  registry,
  segmentId,
  reports
}: Readonly<{
  registry: PhoneTransitionRegistry<SegmentId>;
  segmentId: SegmentId;
  reports: PhoneLeafReportPort;
}>) {
  const module = use(registry.load(segmentId));
  const Leaf = module.default;
  return <Leaf reports={reports} />;
}

export function PhoneTransitionLeaf<SegmentId extends string>({
  registry = defaultTransitionRegistry,
  segmentId,
  reports
}: Readonly<{
  registry?: PhoneTransitionRegistry<SegmentId>;
  segmentId: SegmentId;
  reports: PhoneLeafReportPort;
}>) {
  return (
    <PhoneTransitionFailureBoundary key={segmentId} reports={reports}>
      <Suspense fallback={<PhoneTransitionCover />}>
        <PhoneTransitionModuleView
          registry={registry}
          segmentId={segmentId}
          reports={reports}
        />
      </Suspense>
    </PhoneTransitionFailureBoundary>
  );
}

export function loadPhoneTransitionModule(
  segmentId: string
): Promise<PhoneTransitionModule> {
  return defaultTransitionRegistry.load(segmentId);
}

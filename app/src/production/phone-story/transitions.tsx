import {
  Component,
  Suspense,
  use,
  type ComponentType,
  type ReactNode
} from 'react';
import type { PhoneLeafReportPort } from './presentation';

export type PhoneTransitionLeafProps = Readonly<{ reports: PhoneLeafReportPort }>;
export type PhoneTransitionModule = Readonly<{
  default: ComponentType<PhoneTransitionLeafProps>;
}>;
export type PhoneTransitionLoader = () => Promise<PhoneTransitionModule>;
export type PhoneTransitionRegistry<SegmentId extends string = string> = Readonly<{
  load(segmentId: SegmentId): Promise<PhoneTransitionModule>;
}>;

class PhoneTransitionLoadError extends Error {
  readonly code: 'phone-transition-leaf-missing' | 'phone-transition-leaf-rejected';

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
        pending.delete(segmentId);
        fulfilled.set(segmentId, promise);
        return module;
      }, (cause: unknown) => {
        pending.delete(segmentId);
        rejected.add(segmentId);
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

const transitionLoaders = Object.freeze({}) satisfies Partial<
  Record<string, PhoneTransitionLoader>
>;
const defaultTransitionRegistry = createPhoneTransitionRegistry<string>(transitionLoaders);

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

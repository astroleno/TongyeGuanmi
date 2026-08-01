import type {
  PhoneAttemptKey,
  PhoneEvidenceRecord,
  PhoneEvidenceKind,
  PhoneFinalEvidenceKind,
  PhoneFrameReport,
  PhoneFrameToken,
  PhoneLeafActivationCommand,
  PhoneLeafDisposeReason,
  PhoneLeafPauseReason,
  PhonePreparedReport,
  PhoneRuntimeResourceCounts,
  PhoneSurfaceId,
  PhoneTransactionLeg,
  PhoneFailure
} from './protocol';
import { phoneManifest, type PhoneSceneId, type PhoneSegmentId } from './manifest';

export type PhoneSurfaceKind =
  | 'dom'
  | 'image'
  | 'video'
  | 'canvas-2d'
  | 'canvas-webgl';

export type PhoneLeafSurfaceRegistration = Readonly<{
  id: PhoneSurfaceId;
  element: HTMLElement;
  kind: PhoneSurfaceKind;
}>;

export type PhoneActivationSettlement = Readonly<{
  surfaceId: PhoneSurfaceId;
}> & (
  | Readonly<{ status: 'fulfilled' | 'rejected' }>
  | Readonly<{ status: 'pending'; settled: Promise<void> }>
);

export type PhoneActivationInvocation = Readonly<{
  invocationId: string;
  surfaceIds: readonly PhoneSurfaceId[];
  invoked: boolean;
  settlements: readonly PhoneActivationSettlement[];
}>;

export type PhoneActivationTarget<Owner> = Readonly<{
  owner: Owner;
  commands: PhoneLeafCommandHandle;
  surfaceIds: readonly PhoneSurfaceId[];
}>;

export type PhoneActivationBatch<Owner> = Readonly<{
  invoked: boolean;
  targets: readonly PhoneActivationTarget<Owner>[];
  surfaceIds: readonly PhoneSurfaceId[];
  pending: readonly Promise<void>[];
}>;

export type PhoneLeafReportPort = Readonly<{
  registerMount(registration: PhoneLeafMountRegistration): void;
  reportPrepared(
    surfaceId: PhoneSurfaceId,
    result: PhonePreparedReport
  ): void;
  reportFrame(surfaceId: PhoneSurfaceId, result: PhoneFrameReport): void;
  reportProgress(progress: number): void;
  reportComplete(): void;
  reportFailure(failure: PhoneFailure): void;
}>;

export type PhoneLeafGenerationBinding = Readonly<{
  reports: PhoneLeafReportPort;
  frameToken: PhoneFrameToken;
}>;

export type PhoneLeafCommandHandle = Readonly<{
  rebind(binding: PhoneLeafGenerationBinding): void;
  activate(command: PhoneLeafActivationCommand): PhoneActivationInvocation;
  render(progress: number): void;
  settle(endpoint: 0 | 1): void;
  pause(reason: PhoneLeafPauseReason): void;
  dispose(reason: PhoneLeafDisposeReason): void;
}>;

export type PhoneLeafMountRegistration = Readonly<{
  root: HTMLElement;
  surfaces: readonly PhoneLeafSurfaceRegistration[];
  commands: PhoneLeafCommandHandle;
}>;

export type PhoneLeafReportBinding = Readonly<{
  attempt: PhoneAttemptKey<PhoneSceneId, PhoneSegmentId>;
  stageIndex: number;
  leg: PhoneTransactionLeg;
  allowedReports: readonly PhoneEvidenceKind[];
  allowedSurfaceIds: readonly PhoneSurfaceId[];
  planeRevision: number | null;
}>;

export function closePhoneLeafReportBinding(
  binding: PhoneLeafReportBinding
): PhoneLeafReportBinding {
  const { attempt, allowedReports, allowedSurfaceIds, ...identity } = binding;
  return Object.freeze({
    ...identity,
    attempt: Object.freeze({ ...attempt }),
    allowedReports: Object.freeze([...allowedReports]),
    allowedSurfaceIds: Object.freeze([...allowedSurfaceIds])
  });
}

export function phoneLeafMountKey(binding: PhoneLeafReportBinding): string {
  return [binding.leg, binding.stageIndex,
    [...binding.allowedSurfaceIds].sort().join(',')].join('|');
}

export function invokePhoneActivationBatch<Owner>(
  invocationId: string,
  credit: PhoneLeafActivationCommand['credit'],
  requested: readonly PhoneSurfaceId[] | undefined,
  targets: readonly PhoneActivationTarget<Owner>[],
  authorize: (targets: readonly PhoneActivationTarget<Owner>[]) => void
): PhoneActivationBatch<Owner> {
  const activeTargets = targets.filter(({ surfaceIds }) => surfaceIds.length > 0);
  const required = [...new Set(requested ?? activeTargets.flatMap(({ surfaceIds }) => surfaceIds))];
  const covered = [...new Set(activeTargets.flatMap(({ surfaceIds }) => surfaceIds))];
  if (required.length === 0
    || required.slice().sort().join('|') !== covered.sort().join('|')) {
    return { invoked: false, targets: activeTargets, surfaceIds: required, pending: [] };
  }
  authorize(activeTargets);
  const invocations: readonly PhoneActivationInvocation[] | null = (() => {
    try {
      return activeTargets.map(({ commands, surfaceIds }) => commands.activate({
        invocationId, surfaceIds, credit
      }));
    } catch { return null; }
  })();
  if (!invocations) return {
    invoked: false, targets: activeTargets, surfaceIds: required, pending: []
  };
  const valid = invocations.every((result, index) => {
    const expected = [...(activeTargets[index]?.surfaceIds ?? [])].sort().join('|');
    return result.invoked && result.invocationId === invocationId
      && [...result.surfaceIds].sort().join('|') === expected
      && [...result.settlements.map(({ surfaceId }) => surfaceId)].sort().join('|') === expected
      && result.settlements.every(({ status }) => status !== 'rejected');
  });
  return {
    invoked: valid,
    targets: activeTargets,
    surfaceIds: required,
    pending: valid ? invocations.flatMap(({ settlements }) => settlements.flatMap(
      (settlement) => settlement.status === 'pending' ? [settlement.settled] : []
    )) : []
  };
}

export type PhoneLeafMountRequest = Readonly<{
  binding: PhoneLeafReportBinding;
  registration: PhoneLeafMountRegistration;
}>;

export type PhoneLeafMountDescriptor = Readonly<{
  surfaceIds: readonly PhoneSurfaceId[];
  activationSurfaceIds: readonly PhoneSurfaceId[];
  resources: PhoneRuntimeResourceCounts;
}>;

export type PhoneLeafMountLease = Readonly<PhoneLeafMountDescriptor & {
  registrationKey: string;
  commands: PhoneLeafCommandHandle;
  rebind(binding: PhoneLeafReportBinding): void;
  release(): void;
}>;

export function phoneActivationSurfaceIds(
  lease: PhoneLeafMountLease,
  requested?: readonly PhoneSurfaceId[]
): readonly PhoneSurfaceId[] {
  return lease.activationSurfaceIds.filter((id) => !requested || requested.includes(id));
}

export type PhonePreparedLeafFact = Readonly<{
  surfaceId: PhoneSurfaceId;
  report: PhonePreparedReport | PhoneFrameReport;
}>;

export type PhonePreparedProofRequest = Readonly<{
  binding: PhoneLeafReportBinding;
  lease: PhoneLeafMountLease;
  fact: PhonePreparedLeafFact | null;
}>;

export type PhonePreparedProof = Readonly<{
  records: readonly PhoneEvidenceRecord[];
}>;

export type PhonePresentation = Readonly<{
  registerLeafMount(request: PhoneLeafMountRequest): PhoneLeafMountLease;
  verifyPrepared(request: PhonePreparedProofRequest): PhonePreparedProof;
}>;

export type PhoneLeafReportPortBuilder = Readonly<{
  create(binding: PhoneLeafReportBinding): PhoneLeafReportPort;
}>;

export type PhonePresentationProofRequest = Readonly<{
  sceneId: PhoneSceneId;
  planeRevision: number;
  required: readonly PhoneFinalEvidenceKind[];
}>;

export function describePhoneLeafMount(
  request: PhoneLeafMountRequest
): PhoneLeafMountDescriptor {
  const allowed = [...request.binding.allowedSurfaceIds].sort();
  const surfaces = request.registration.surfaces;
  const actual = surfaces.map(({ id }) => id).sort();
  if (new Set(actual).size !== actual.length || actual.join('|') !== allowed.join('|')) {
    throw new Error('Phone leaf surfaces differ from the closed presentation binding');
  }
  if (surfaces.some(({ id, kind }) => (
    id.includes('video') && kind !== 'video'
      || id.includes('canvas') && !kind.startsWith('canvas')
  ))) throw new Error('Phone leaf surface kind differs from the presentation contract');
  const videos = surfaces.filter(({ kind }) => kind === 'video').length;
  const canvases = surfaces.filter(({ kind }) => kind.startsWith('canvas')).length;
  const webglContexts = surfaces.filter(({ kind }) => kind === 'canvas-webgl').length;
  const scene = phoneManifest.scenes.find((candidate) => (
    [...candidate.surfaces].sort().join('|') === allowed.join('|')
  ));
  const expected = scene?.directEntry.closure.resourceBudget;
  if (expected && (videos !== expected.videos || canvases !== expected.canvases
    || webglContexts !== expected.webglContexts)) {
    throw new Error('Phone leaf surfaces differ from the presentation resource contract');
  }
  return Object.freeze({
    surfaceIds: Object.freeze(surfaces.map(({ id }) => id)),
    activationSurfaceIds: Object.freeze(surfaces.filter(({ kind }) => kind === 'video')
      .map(({ id }) => id)),
    resources: Object.freeze({
      videos, activeDecoders: 0, canvases,
      webglContexts
    })
  });
}

function unboundReport(label: string, operation: string): never {
  throw new Error(`${label}: phone leaf report port is unbound (${operation})`);
}

export function createThrowingPhoneLeafReportPort(
  label = 'unbound-phone-leaf'
): PhoneLeafReportPort {
  return Object.freeze({
    registerMount: () => unboundReport(label, 'registerMount'),
    reportPrepared: () => unboundReport(label, 'reportPrepared'),
    reportFrame: () => unboundReport(label, 'reportFrame'),
    reportProgress: () => unboundReport(label, 'reportProgress'),
    reportComplete: () => unboundReport(label, 'reportComplete'),
    reportFailure: () => unboundReport(label, 'reportFailure')
  });
}

export function createNoopPhoneLeafCommandHandle(): PhoneLeafCommandHandle {
  return Object.freeze({
    rebind: () => undefined,
    activate: (command) => Object.freeze({
      invocationId: command.invocationId,
      surfaceIds: Object.freeze([...command.surfaceIds]),
      invoked: true,
      settlements: Object.freeze(command.surfaceIds.map((surfaceId) => Object.freeze({
        surfaceId,
        status: 'fulfilled' as const
      })))
    }),
    render: () => undefined,
    settle: () => undefined,
    pause: () => undefined,
    dispose: () => undefined
  });
}

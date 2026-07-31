import type {
  PhoneActivationInvocation,
  PhoneAttemptKey,
  PhoneEvidenceKind,
  PhoneFinalEvidenceKind,
  PhoneFrameReport,
  PhoneFrameToken,
  PhoneLeafActivationCommand,
  PhoneLeafDisposeReason,
  PhoneLeafPauseReason,
  PhonePreparedReport,
  PhoneSurfaceId,
  PhoneTransactionLeg,
  PhoneFailure
} from './protocol';
import type { PhoneSceneId, PhoneSegmentId } from './manifest';

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

export type PhoneLeafReportPortBuilder = Readonly<{
  create(binding: PhoneLeafReportBinding): PhoneLeafReportPort;
}>;

export type PhonePresentationProofRequest = Readonly<{
  sceneId: PhoneSceneId;
  planeRevision: number;
  required: readonly PhoneFinalEvidenceKind[];
}>;

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
      invoked: true
    }),
    render: () => undefined,
    settle: () => undefined,
    pause: () => undefined,
    dispose: () => undefined
  });
}

import type {
  PhoneAttemptKey, PhoneEvidenceRecord, PhoneEvidenceSlot, PhoneEvidenceKind,
  PhoneFinalEvidenceKind, PhoneFrameReport, PhoneFrameToken,
  PhoneLeafActivationCommand, PhoneLeafDisposeReason, PhoneLeafPauseReason,
  PhoneMediaPhaseCommand,
  PhoneLayoutViewport, PhonePreparedReport, PhoneDependencyClosure,
  PhoneRuntimeResourceCounts, PhoneSurfaceId, PhoneTransaction,
  PhoneTransactionLeg, PhoneViewportSnapshot, PhoneVisualViewport, PhoneFailure,
  PhoneStableCommit
} from './protocol';
import { samePhoneAttempt } from './protocol';
import { phoneManifest, phonePreparedSurfaceIds, phoneRetainedFigure2ArchOwner, phoneSceneById,
  phoneEntryForLocation, type PhoneInkOwnership, type PhoneSceneId, type PhoneSegmentId,
  type PhoneTransitionProjection } from './manifest';

export type PhoneSurfaceKind = 'dom' | 'image' | 'video' | 'canvas-2d' | 'canvas-webgl';

export type PhoneLeafSurfaceRegistration = Readonly<{ id: PhoneSurfaceId; element: HTMLElement; kind: PhoneSurfaceKind }>;

export type PhoneActivationSettlement = Readonly<{
  surfaceId: PhoneSurfaceId;
}> & (
  | Readonly<{ status: 'fulfilled' | 'rejected' }>
  | Readonly<{ status: 'pending'; settled: Promise<void> }>
);

export type PhoneActivationInvocation = Readonly<{
  invocationId: string; surfaceIds: readonly PhoneSurfaceId[];
  invoked: boolean; settlements: readonly PhoneActivationSettlement[];
}>;

export type PhoneActivationTarget<Owner> = Readonly<{
  owner: Owner; commands: PhoneLeafCommandHandle; surfaceIds: readonly PhoneSurfaceId[];
  /** @deprecated Retained for fixture compatibility; runtime no longer reads it. */
  playback?: boolean;
}>;

export type PhoneActivationBatch<Owner> = Readonly<{
  invoked: boolean; targets: readonly PhoneActivationTarget<Owner>[];
  surfaceIds: readonly PhoneSurfaceId[]; pending: readonly Promise<void>[];
}>;

export type PhoneActivationBatchCallbacks<Owner> = Readonly<{
  activated(targets: readonly PhoneActivationTarget<Owner>[]): void; fulfilled(): void;
  rejected(targets: readonly PhoneActivationTarget<Owner>[]): void;
}>;

export function settlePhoneActivationBatch<Owner>(
  batch: PhoneActivationBatch<Owner>,
  callbacks: PhoneActivationBatchCallbacks<Owner>
): void {
  if (!batch.invoked) {
    callbacks.rejected(batch.targets);
    return;
  }
  callbacks.activated(batch.targets);
  if (batch.pending.length === 0) {
    callbacks.fulfilled();
    return;
  }
  void Promise.all(batch.pending).then(
    () => callbacks.fulfilled(),
    () => callbacks.rejected(batch.targets)
  );
}

export function claimPhoneActivationDecoders<Owner extends { activeDecoders: number }>(
  targets: readonly PhoneActivationTarget<Owner>[]
): number {
  return targets.reduce((total, { owner, surfaceIds }) => {
    const activated = Math.max(0, surfaceIds.length - owner.activeDecoders);
    owner.activeDecoders = surfaceIds.length;
    return total + activated;
  }, 0);
}

export type PhoneLeafReportPort = Readonly<{
  rebind?(binding: PhoneLeafReportBinding): void;
  registerMount(registration: PhoneLeafMountRegistration): void;
  reportPrepared(surfaceId: PhoneSurfaceId, result: PhonePreparedReport): void;
  reportFrame(surfaceId: PhoneSurfaceId, result: PhoneFrameReport): void;
  reportProgress(progress: number): void; reportComplete(): void;
  reportFailure(failure: PhoneFailure): void;
}>;

export type PhoneLeafGenerationBinding = Readonly<{ reports: PhoneLeafReportPort; frameToken: PhoneFrameToken; transactionId?: string; segmentId?: string | null; stageIndex?: number; direction?: 'forward' | 'reverse' | null }>;

export function createPhoneLeafGenerationBinding(
  reports: PhoneLeafReportPort,
  transactionId: string, sequence: number, segmentId: string | null = null,
  stageIndex?: number, direction?: 'forward' | 'reverse' | null
): PhoneLeafGenerationBinding {
  return Object.freeze({
    reports, frameToken: `${transactionId}:frame:${sequence}`, transactionId, segmentId,
    ...(stageIndex === undefined ? {} : { stageIndex }), ...(direction === undefined ? {} : { direction })
  });
}

export function bindPhoneLeafGeneration(
  mount: PhoneLeafMountLease,
  binding: PhoneLeafReportBinding,
  reports: PhoneLeafReportPort,
  sequence: number,
  rebindMount: boolean,
  beforeRebind?: (token: PhoneFrameToken) => void
): PhoneFrameToken {
  const generation = createPhoneLeafGenerationBinding(
    reports, binding.attempt.transactionId, sequence, binding.attempt.segmentId,
    binding.stageIndex, binding.attempt.direction
  );
  beforeRebind?.(generation.frameToken);
  if (rebindMount) mount.rebind(binding);
  mount.commands.rebind(generation);
  return generation.frameToken;
}

export type PhoneLeafCommandHandle = Readonly<{
  rebind(binding: PhoneLeafGenerationBinding): void;
  activate(command: PhoneLeafActivationCommand): PhoneActivationInvocation;
  setMediaPhase?(command: PhoneMediaPhaseCommand): void;
  render(progress: number): Readonly<{ ownership: PhoneInkOwnership }> | void;
  settle(endpoint: 0 | 1): Readonly<{ prewarmReusable?: boolean }> | void;
  pause(reason: PhoneLeafPauseReason): void; dispose(reason: PhoneLeafDisposeReason): void;
}>;

export type PhoneLeafMountRegistration = Readonly<{
  root: HTMLElement; surfaces: readonly PhoneLeafSurfaceRegistration[];
  commands: PhoneLeafCommandHandle;
}>;

export type PhoneLeafReportBinding = Readonly<{
  attempt: PhoneAttemptKey<PhoneSceneId, PhoneSegmentId>; stageIndex: number;
  leg: PhoneTransactionLeg; allowedReports: readonly PhoneEvidenceKind[];
  allowedSurfaceIds: readonly PhoneSurfaceId[]; planeRevision: number | null;
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
    phoneIdentitySignature(binding.allowedSurfaceIds, ',')].join('|');
}

export const phoneIdentitySignature = (
  values: readonly string[], separator = '|'
): string => [...values].sort().join(separator);

export function invokePhoneActivationBatch<Owner>(
  invocationId: string,
  credit: PhoneLeafActivationCommand['credit'],
  requested: readonly PhoneSurfaceId[] | undefined,
  targets: readonly PhoneActivationTarget<Owner>[],
  authorize: (targets: readonly PhoneActivationTarget<Owner>[]) => void,
  runToken = invocationId,
  direction: 'forward' | 'reverse' = 'forward',
  stageIndex = 0
): PhoneActivationBatch<Owner> {
  const activeTargets = targets.filter(({ surfaceIds }) => surfaceIds.length > 0);
  const required = [...new Set(requested ?? activeTargets.flatMap(({ surfaceIds }) => surfaceIds))];
  const covered = [...new Set(activeTargets.flatMap(({ surfaceIds }) => surfaceIds))];
  if (required.length === 0
    || phoneIdentitySignature(required) !== phoneIdentitySignature(covered)) {
    return { invoked: false, targets: activeTargets, surfaceIds: required, pending: [] };
  }
  authorize(activeTargets);
  const invocations: readonly PhoneActivationInvocation[] | null = (() => {
    try {
      return activeTargets.map(({ commands, surfaceIds }) => commands.activate({
        invocationId, surfaceIds, credit, runToken, direction, stageIndex
      }));
    } catch { return null; }
  })();
  if (!invocations) return {
    invoked: false, targets: activeTargets, surfaceIds: required, pending: []
  };
  const valid = invocations.every((result, index) => {
    const expected = phoneIdentitySignature(activeTargets[index]?.surfaceIds ?? []);
    return result.invoked && result.invocationId === invocationId
      && phoneIdentitySignature(result.surfaceIds) === expected
      && phoneIdentitySignature(result.settlements.map(({ surfaceId }) => surfaceId)) === expected
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
  surfaceIds: readonly PhoneSurfaceId[]; activationSurfaceIds: readonly PhoneSurfaceId[];
  resources: PhoneRuntimeResourceCounts;
}>;

export type PhoneLeafMountLease = Readonly<PhoneLeafMountDescriptor & {
  registrationKey: string; commands: PhoneLeafCommandHandle;
  isAttached(): boolean; rebind(binding: PhoneLeafReportBinding): void; release(): void;
}>;

export function phoneActivationSurfaceIds(
  lease: PhoneLeafMountLease,
  requested?: readonly PhoneSurfaceId[]
): readonly PhoneSurfaceId[] {
  return lease.activationSurfaceIds.filter((id) => !requested || requested.includes(id));
}

export function phoneRetainedMountLeg(
  closure: PhoneDependencyClosure,
  mode: PhoneAttemptKey['mode'],
  surfaceIds: readonly PhoneSurfaceId[]
): PhoneTransactionLeg | null {
  const idsFor = (role: 'source' | 'effect' | 'receiver') => new Set(
    closure.mount.filter((mount) => (
      mount.startsWith(`${role}:`) && !mount.startsWith(`${role}:root:`)
    )).map((mount) => mount.slice(mount.indexOf(':') + 1))
  );
  const matches = (role: 'source' | 'effect' | 'receiver') => {
    const ids = idsFor(role);
    return surfaceIds.length > 0 && surfaceIds.every((id) => ids.has(id));
  };
  return matches('source') ? 'source'
    : matches('effect') ? 'effect'
      : matches('receiver') ? mode === 'rollback' ? 'rollback' : 'target'
        : null;
}

export function createPhoneRetainedLeafBinding(
  transaction: PhoneTransaction<PhoneSceneId, PhoneSegmentId>,
  leg: PhoneTransactionLeg,
  surfaceIds: readonly PhoneSurfaceId[]
): PhoneLeafReportBinding {
  return closePhoneLeafReportBinding({
    attempt: transaction.attempt,
    stageIndex: transaction.stageIndex,
    leg,
    allowedReports: transaction.requiredPrepared.filter(({ leg: slotLeg }) => (
      slotLeg === leg
    )).map(({ kind }) => kind),
    allowedSurfaceIds: surfaceIds,
    planeRevision: transaction.planeRevision
  });
}

export function createPhoneSupersedingLeafBinding(
  transaction: PhoneTransaction<PhoneSceneId, PhoneSegmentId>,
  stale: PhoneLeafReportBinding
): PhoneLeafReportBinding | null {
  if (stale.attempt.authorityId !== transaction.attempt.authorityId
    || stale.attempt.transactionGeneration >= transaction.attempt.transactionGeneration) {
    return null;
  }
  const leg = phoneRetainedMountLeg(
    transaction.closure, transaction.mode, stale.allowedSurfaceIds
  );
  const ownerMatches = leg === 'source'
    ? transaction.sourceSceneId === stale.attempt.sceneId
    : leg === 'effect'
      ? transaction.attempt.segmentId === stale.attempt.segmentId
        && transaction.attempt.direction === stale.attempt.direction
      : leg !== null && transaction.candidateSceneId === stale.attempt.sceneId;
  if (!leg || !ownerMatches) return null;
  const binding = createPhoneRetainedLeafBinding(
    transaction, leg, stale.allowedSurfaceIds
  );
  assertPhoneLeafReportBindingContract(binding, transaction);
  return binding;
}

export function assertPhoneLeafReportBindingContract(
  binding: PhoneLeafReportBinding,
  transaction: PhoneTransaction<PhoneSceneId, PhoneSegmentId>
): void {
  const expectedKinds = [...transaction.requiredPrepared,
    ...transaction.requiredFinal].filter(({ leg }) => leg === binding.leg)
    .map(({ kind }) => kind);
  if (binding.allowedReports.some((kind) => !expectedKinds.includes(kind))) {
    throw new Error('Phone leaf report binding exceeds the active evidence contract');
  }
  const segment = transaction.attempt.segmentId
    ? phoneManifest.segments.find(({ id }) => id === transaction.attempt.segmentId)
    : null;
  const sceneId = binding.leg === 'source'
    ? transaction.sourceSceneId : transaction.candidateSceneId;
  const expectedSurfaces = binding.leg === 'effect'
    ? segment && transaction.attempt.direction
      ? [segment[transaction.attempt.direction].effectSurface] : []
    : sceneId ? [...phoneSceneById(sceneId).surfaces] : [];
  if (phoneIdentitySignature(expectedSurfaces)
    !== phoneIdentitySignature(binding.allowedSurfaceIds)) {
    throw new Error('Phone leaf report binding differs from manifest surfaces');
  }
}

export type PhonePreparedLeafFact = Readonly<{
  surfaceId: PhoneSurfaceId; report: PhonePreparedReport | PhoneFrameReport;
}>;

export type PhonePreparedProofRequest = Readonly<{
  binding: PhoneLeafReportBinding; lease: PhoneLeafMountLease;
  fact: PhonePreparedLeafFact | null;
}>;

export type PhonePreparedProof = Readonly<{ records: readonly PhoneEvidenceRecord[] }>;

export type PhonePlaneRequest = Readonly<{
  attempt: PhoneAttemptKey<PhoneSceneId, PhoneSegmentId>; stageIndex: number;
  leg: 'source' | 'target' | 'rollback'; sceneId: PhoneSceneId; planeRevision: number;
  viewport: PhoneViewportSnapshot; required: readonly PhoneEvidenceSlot[];
  progress: number; loaderCovered: boolean; landingAlias?: 'opening' | 'cards' | 'closing' | null;
}>;

export type PhonePlaneApplyResult = Readonly<{ records: readonly PhoneEvidenceRecord[]; failure: PhoneFailure | null }>;

export type PhoneVisibleCandidateProofRequest = PhonePlaneRequest;
export type PhoneReprojectProofRequest = PhonePlaneRequest;
export type PhoneRollbackProofRequest = PhonePlaneRequest;
export type PhoneRollbackProof = PhonePlaneApplyResult;

export type PhonePresentationDependencies = Readonly<{
  sampleLayoutViewport(): PhoneLayoutViewport; sampleVisualViewport(): PhoneVisualViewport;
  getComputedStyle(element: HTMLElement, pseudo?: '::before' | '::after'): CSSStyleDeclaration;
  elementsFromPoint(x: number, y: number): readonly HTMLElement[];
}>;

export type PhonePresentation = Readonly<{
  attachRoot(root: HTMLElement): () => void; sampleLayoutViewport(): PhoneLayoutViewport;
  sampleVisualViewport(): PhoneVisualViewport; verifyPrepared(request: PhonePreparedProofRequest): PhonePreparedProof;
  applyTransitionFrame(frame: PhoneTransitionProjection | null): void; commitStablePlane(sourceBuffer: 'a' | 'b'): void;
  registerLeafMount(request: PhoneLeafMountRequest): PhoneLeafMountLease; applyPlane(request: PhonePlaneRequest): PhonePlaneApplyResult;
  refreshStableViewport(viewport: PhoneViewportSnapshot): void;
  verifyVisibleCandidate(request: PhoneVisibleCandidateProofRequest): PhonePlaneApplyResult;
  verifyReproject(request: PhoneReprojectProofRequest): PhonePlaneApplyResult;
  verifyRollback(request: PhoneRollbackProofRequest): PhoneRollbackProof;
}>;

export function createPhonePlaneRequest(
  transaction: PhoneTransaction<PhoneSceneId, PhoneSegmentId>,
  viewport: PhoneViewportSnapshot,
  hasStableCommit: boolean,
  stableCommit: PhoneStableCommit<PhoneSceneId> | null = null
): PhonePlaneRequest | null {
  const required = transaction.requiredFinal;
  const first = required[0];
  if (!first || first.leg === 'effect'
    || required.some((slot) => slot.leg !== first.leg
      || slot.planeRevision !== transaction.planeRevision)) return null;
  const sceneId = first.leg === 'source'
    ? transaction.sourceSceneId : transaction.candidateSceneId;
  const entryAlias = transaction.mode === 'segment' ? null : phoneEntryForLocation(transaction.requestedEntry.pathname, transaction.requestedEntry.hash).landingAlias;
  const landingAlias = transaction.mode === 'segment' && first.leg === 'source' && sceneId === 'figure2-proof' && transaction.attempt.direction === 'reverse' || transaction.mode === 'rollback' && first.leg === 'rollback' && sceneId === 'figure2-proof' && transaction.attempt.direction === 'reverse' ? 'closing' : stableCommit?.sceneId === sceneId ? stableCommit.landingAlias ?? (stableCommit.direction === 'reverse' ? 'closing' : 'opening') : entryAlias ?? (transaction.attempt.direction === 'reverse' ? 'closing' : 'opening');
  return sceneId && transaction.planeRevision !== null ? Object.freeze({
    attempt: transaction.attempt, stageIndex: transaction.stageIndex,
    leg: first.leg, sceneId, planeRevision: transaction.planeRevision,
    viewport, required, progress: transaction.progress,
    loaderCovered: transaction.mode === 'boot' && !hasStableCommit, landingAlias
  }) : null;
}

export function phonePlaneResultIsExact(
  request: PhonePlaneRequest,
  result: PhonePlaneApplyResult
): boolean {
  return result.records.length === request.required.length
    && new Set(result.records.map(({ slot }) => slot)).size === request.required.length
    && request.required.every((slot) => (
      result.records.filter((record) => record.slot === slot).length === 1
    ));
}

export function describePhoneLeafMount(
  request: PhoneLeafMountRequest
): PhoneLeafMountDescriptor {
  const allowed = phoneIdentitySignature(request.binding.allowedSurfaceIds);
  const surfaces = request.registration.surfaces;
  const actual = surfaces.map(({ id }) => id);
  if (new Set(actual).size !== actual.length || phoneIdentitySignature(actual) !== allowed) {
    throw new Error('Phone leaf surfaces differ from the closed presentation binding');
  }
  if (surfaces.some(({ id, kind }) => (
    id.includes('video') && kind !== 'video'
      || id.includes('canvas') && !kind.startsWith('canvas')
      || (/(?:image|poster|arch)/.test(id) && kind !== 'image')
  ))) throw new Error('Phone leaf surface kind differs from the presentation contract');
  const videos = surfaces.filter(({ kind }) => kind === 'video').length;
  const canvases = surfaces.filter(({ kind }) => kind.startsWith('canvas')).length;
  const webglContexts = surfaces.filter(({ kind }) => kind === 'canvas-webgl').length;
  const scene = phoneSceneForSurfaces(request.binding.allowedSurfaceIds);
  const segment = request.binding.attempt.segmentId
    ? phoneManifest.segments.find(({ id }) => id === request.binding.attempt.segmentId)
    : null;
  const declaredEffect = request.binding.leg === 'effect'
    && request.binding.attempt.direction !== null
    && segment?.[request.binding.attempt.direction].effectSurface
      === request.binding.allowedSurfaceIds[0]
    && request.binding.allowedSurfaceIds.length === 1;
  if (!scene && !declaredEffect) {
    throw new Error('Phone leaf surfaces are not declared by the manifest');
  }
  if (scene && ['target', 'rollback'].includes(request.binding.leg)
    && scene.id !== request.binding.attempt.sceneId) {
    throw new Error('Phone leaf scene differs from the closed presentation binding');
  }
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

type PhoneMountRecord = {
  ownerKey: string; registrationKey: string; binding: PhoneLeafReportBinding;
  root: HTMLElement | null; surfaces: Map<PhoneSurfaceId, PhoneLeafSurfaceRegistration>;
  facts: Map<PhoneSurfaceId, Set<string>>; descriptor: PhoneLeafMountDescriptor;
  commands: PhoneLeafCommandHandle; lease: PhoneLeafMountLease | null; released: boolean;
};

type PhoneProjectorTopology = Readonly<{
  viewport: HTMLElement; coverage: HTMLElement; planes: HTMLElement;
  source: HTMLElement; effect: HTMLElement; receiver: HTMLElement; reading: HTMLElement;
}>;

const finalEvidenceKinds: readonly PhoneFinalEvidenceKind[] = [
  'plane-acknowledged', 'content-visible', 'frame-visible',
  'coverage-visible', 'landing-confirmed', 'scroll-confirmed'
];
const phonePseudoElements: readonly ('::before' | '::after')[] = ['::before', '::after'];

export function samePhoneLeafReportBinding(left: PhoneLeafReportBinding, right: PhoneLeafReportBinding): boolean {
  return samePhoneAttempt(left.attempt, right.attempt)
    && left.stageIndex === right.stageIndex && left.leg === right.leg
    && left.planeRevision === right.planeRevision
    && phoneIdentitySignature(left.allowedReports) === phoneIdentitySignature(right.allowedReports)
    && phoneIdentitySignature(left.allowedSurfaceIds)
      === phoneIdentitySignature(right.allowedSurfaceIds);
}

function phoneSceneForSurfaces(surfaceIds: readonly PhoneSurfaceId[]) {
  const signature = phoneIdentitySignature(surfaceIds);
  return phoneManifest.scenes.find((scene) => (
    phoneIdentitySignature(scene.surfaces) === signature
  )) ?? null;
}

function nonEmptyRect(element: HTMLElement): boolean {
  const bounds = element.getBoundingClientRect();
  return bounds.width > 0 && bounds.height > 0
    && bounds.right > bounds.left && bounds.bottom > bounds.top;
}

function intersectsVisualViewport(
  element: HTMLElement,
  viewport: PhoneVisualViewport
): boolean {
  if (!nonEmptyRect(element)) return false;
  const bounds = element.getBoundingClientRect();
  return bounds.right > 0 && bounds.left < viewport.width
    && bounds.bottom > 0 && bounds.top < viewport.height;
}

function containsPoint(element: HTMLElement, x: number, y: number): boolean {
  const bounds = element.getBoundingClientRect();
  return x >= bounds.left && x <= bounds.right
    && y >= bounds.top && y <= bounds.bottom;
}

function visibleStyle(style: CSSStyleDeclaration): boolean {
  return style.display !== 'none' && !['hidden', 'collapse'].includes(style.visibility)
    && Number.parseFloat(style.opacity || '1') > 0
    && !/inset\(\s*50%\s*\)/i.test(style.clipPath)
    && !/rect\(\s*0(?:px)?[, ]+0(?:px)?[, ]+0(?:px)?[, ]+0(?:px)?\s*\)/i.test(style.clip);
}

function opaqueStyle(style: CSSStyleDeclaration): boolean {
  if (!visibleStyle(style)) return false;
  const background = style.backgroundColor.replace(/\s/g, '').toLowerCase();
  const alpha = background.match(/^rgba\([^,]+,[^,]+,[^,]+,([\d.]+)\)$/)?.[1];
  return background !== '' && background !== 'transparent'
    && (alpha === undefined || Number.parseFloat(alpha) > 0);
}

function visibleThroughAncestors(
  element: HTMLElement, root: HTMLElement,
  getStyle: PhonePresentationDependencies['getComputedStyle'], includeSelf = true
): boolean {
  return (!includeSelf || visibleStyle(getStyle(element))) && (element === root
    || !!element.parentElement && visibleThroughAncestors(element.parentElement, root, getStyle));
}

function presentationFailure(code: string, message: string): PhonePlaneApplyResult {
  return Object.freeze({
    records: Object.freeze([]),
    failure: Object.freeze({ code, message, recoverable: true })
  });
}

function presentationTopology(root: HTMLElement): PhoneProjectorTopology | null {
  const viewport = root.querySelector<HTMLElement>('.phone-story__viewport');
  const coverage = root.querySelector<HTMLElement>('.phone-story__coverage');
  const planes = root.querySelector<HTMLElement>('.phone-story__planes');
  const source = root.querySelector<HTMLElement>('[data-phone-plane="source"]');
  const effect = root.querySelector<HTMLElement>('[data-phone-plane="effect"]');
  const receiver = root.querySelector<HTMLElement>('[data-phone-plane="receiver"]');
  const reading = root.querySelector<HTMLElement>('.phone-story__reading-flow');
  return viewport && coverage && planes && source && effect && receiver && reading
    ? { viewport, coverage, planes, source, effect, receiver, reading } : null;
}

function requiredIdentityIsValid(request: PhonePlaneRequest): boolean {
  return request.required.length > 0
    && new Set(request.required.map(({ kind }) => kind)).size === request.required.length
    && request.required.every((slot) => samePhoneAttempt(slot.attempt, request.attempt)
      && slot.stageIndex === request.stageIndex && slot.leg === request.leg
      && slot.planeRevision === request.planeRevision && slot.surfaceId === null
      && finalEvidenceKinds.some((kind) => kind === slot.kind));
}

export function createPhonePresentation(
  dependencies: PhonePresentationDependencies
): PhonePresentation {
  const getStyle = dependencies.getComputedStyle;
  const state: {
    root: HTMLElement | null;
    mountSequence: number;
    proofSequence: number;
    mounts: Map<string, PhoneMountRecord>;
    surfaceOwners: Map<PhoneSurfaceId, PhoneMountRecord>;
  } = {
    root: null, mountSequence: 0, proofSequence: 0,
    mounts: new Map(), surfaceOwners: new Map()
  };

  const releaseRecord = (record: PhoneMountRecord): void => {
    if (record.released) return;
    record.released = true;
    state.mounts.delete(record.ownerKey);
    for (const surfaceId of record.surfaces.keys()) {
      if (state.surfaceOwners.get(surfaceId) === record) state.surfaceOwners.delete(surfaceId);
    }
    record.surfaces.clear();
    record.facts.clear();
    record.root = null;
    record.lease = null;
  };

  const recordForLease = (lease: PhoneLeafMountLease): PhoneMountRecord | null => (
    [...state.mounts.values()].find((record) => record.lease === lease && !record.released) ?? null
  );

  const registerLeafMount = (request: PhoneLeafMountRequest): PhoneLeafMountLease => {
    if (!state.root || !state.root.contains(request.registration.root)) {
      throw new Error('Phone leaf root is outside the attached presentation root');
    }
    if (request.registration.surfaces.some(({ element }) => (
      !request.registration.root.contains(element)
    ))) throw new Error('Phone leaf surface is outside its registered root');
    const descriptor = describePhoneLeafMount(request);
    const ownerKey = phoneLeafMountKey(request.binding);
    if (state.mounts.has(ownerKey)) {
      throw new Error(`Phone leaf mount already registered: ${ownerKey}`);
    }
    for (const surfaceId of descriptor.surfaceIds) {
      if (state.surfaceOwners.has(surfaceId)) {
        throw new Error(`Phone leaf surface already registered: ${surfaceId}`);
      }
    }
    const record: PhoneMountRecord = {
      ownerKey,
      registrationKey: `phone-presentation:${++state.mountSequence}`,
      binding: closePhoneLeafReportBinding(request.binding),
      root: request.registration.root,
      surfaces: new Map(request.registration.surfaces.map((surface) => [surface.id, surface])),
      facts: new Map(), descriptor, commands: request.registration.commands,
      lease: null, released: false
    };
    const lease: PhoneLeafMountLease = Object.freeze({
      ...descriptor,
      registrationKey: record.registrationKey,
      commands: record.commands,
      isAttached: () => Boolean(!record.released && record.root && state.root?.contains(record.root)),
      rebind: (binding: PhoneLeafReportBinding) => {
        if (record.released) throw new Error('Phone leaf mount lease is released');
        if (phoneIdentitySignature(binding.allowedSurfaceIds)
          !== phoneIdentitySignature(record.descriptor.surfaceIds)) {
          throw new Error('Phone leaf rebind differs from registered surfaces');
        }
        const nextKey = phoneLeafMountKey(binding);
        const collision = state.mounts.get(nextKey);
        if (collision && collision !== record) {
          throw new Error(`Phone leaf mount already registered: ${nextKey}`);
        }
        state.mounts.delete(record.ownerKey);
        record.ownerKey = nextKey;
        record.binding = closePhoneLeafReportBinding(binding);
        state.mounts.set(nextKey, record);
      },
      release: () => releaseRecord(record)
    });
    record.lease = lease;
    state.mounts.set(ownerKey, record);
    for (const surface of request.registration.surfaces) {
      surface.element.setAttribute('data-phone-surface', surface.id);
      state.surfaceOwners.set(surface.id, record);
    }
    request.registration.root.setAttribute('aria-hidden', 'true');
    request.registration.root.toggleAttribute('inert', true);
    return lease;
  };

  const evidenceRecord = (
    binding: PhoneLeafReportBinding,
    kind: PhoneEvidenceKind,
    surfaceId: PhoneSurfaceId | null,
    token: string
  ): PhoneEvidenceRecord => Object.freeze({
    slot: Object.freeze({
      attempt: binding.attempt, stageIndex: binding.stageIndex, leg: binding.leg,
      kind, surfaceId, planeRevision: null
    }),
    token
  });

  const verifyPrepared = (request: PhonePreparedProofRequest): PhonePreparedProof => {
    const record = recordForLease(request.lease);
    if (!record || !samePhoneLeafReportBinding(record.binding, request.binding) || !record.root) {
      return Object.freeze({ records: Object.freeze([]) });
    }
    const root = record.root;
    if (request.fact) {
      const surface = record.surfaces.get(request.fact.surfaceId);
      if (!surface) return Object.freeze({ records: Object.freeze([]) });
      const facts = record.facts.get(request.fact.surfaceId) ?? new Set<string>();
      facts.add(request.fact.report.kind);
      record.facts.set(request.fact.surfaceId, facts);
      const kind = request.fact.report.kind === 'frame'
        ? request.binding.allowedReports.includes('canvas-drawn') ? 'canvas-drawn' : null
        : request.fact.report.kind;
      const scene = phoneSceneForSurfaces(record.descriptor.surfaceIds);
      const expected = kind && (scene ? phonePreparedSurfaceIds(scene.id, kind).includes(request.fact.surfaceId)
        : record.binding.leg === 'effect' && record.descriptor.surfaceIds.length === 1 && record.descriptor.surfaceIds[0] === request.fact.surfaceId);
      if (!kind || !request.binding.allowedReports.includes(kind) || !expected) {
        return Object.freeze({ records: Object.freeze([]) });
      }
      facts.add(kind);
      return Object.freeze({ records: Object.freeze([
        evidenceRecord(request.binding, kind, request.fact.surfaceId, request.fact.report.token)
      ]) });
    }
    const scene = phoneSceneForSurfaces(record.descriptor.surfaceIds);
    const rootSurfaceId = scene ? `root:${scene.id}` : record.descriptor.surfaceIds[0] ?? null;
    const connected = record.root.isConnected && !!state.root?.contains(record.root);
    const records = request.binding.allowedReports.flatMap((kind) => {
      const accepted = kind === 'root-connected' ? connected
        : kind === 'layout-measurable' ? connected && nonEmptyRect(root)
          : kind === 'resource-budget-valid';
      if (!accepted) return [];
      const surfaceId = kind === 'resource-budget-valid' ? null : rootSurfaceId;
      return [evidenceRecord(request.binding, kind, surfaceId,
        `${request.binding.attempt.transactionId}:prepared:${kind}`)];
    });
    return Object.freeze({ records: Object.freeze(records) });
  };

  const findPlaneMount = (request: PhonePlaneRequest): PhoneMountRecord | null => {
    const scene = phoneSceneById(request.sceneId);
    const signature = phoneIdentitySignature(scene.surfaces);
    return [...state.mounts.values()].find((record) => (
      !record.released && record.root && samePhoneAttempt(record.binding.attempt, request.attempt)
      && record.binding.leg === request.leg
      && phoneIdentitySignature(record.descriptor.surfaceIds) === signature
    )) ?? null;
  };

  const validateStack = (
    request: PhonePlaneRequest,
    topology: PhoneProjectorTopology
  ): boolean => {
    const segment = request.attempt.segmentId
      ? phoneManifest.segments.find(({ id }) => id === request.attempt.segmentId) : null;
    const expectedEffect = segment?.effectPlacement === 'above-both' ? 40 : 20;
    const archOwner = segment && request.attempt.direction ? phoneRetainedFigure2ArchOwner(segment.id, request.attempt.direction) : 'none';
    const archLayer = state.root?.querySelector<HTMLElement>('.phone-story__retained-figure2-arch-layer') ?? null;
    const expectedArch = segment?.id === 'figure2-distance-expand' ? 45 : 35;
    const foreground = state.root?.getAttribute('data-phone-transition-foreground');
    const expectedSource = foreground === 'source' ? 30 : 10;
    const expectedReceiver = foreground === 'source' ? 10 : 30;
    topology.effect.style.setProperty('--phone-plane-z', String(expectedEffect));
    return topology.viewport.parentElement === state.root
      && topology.coverage.parentElement === topology.viewport
      && topology.planes.parentElement === topology.viewport
      && topology.source.parentElement === topology.planes
      && topology.effect.parentElement === topology.planes
      && topology.receiver.parentElement === topology.planes
      && getStyle(topology.viewport).position === 'fixed'
      && getStyle(topology.viewport).isolation === 'isolate'
      && Number.parseInt(getStyle(topology.source).zIndex, 10) === expectedSource
      && Number.parseInt(getStyle(topology.effect).zIndex, 10) === expectedEffect
      && Number.parseInt(getStyle(topology.receiver).zIndex, 10) === expectedReceiver
      && (archOwner === 'none' || !!archLayer && Number.parseInt(getStyle(archLayer).zIndex, 10) === expectedArch);
  };

  const transitionVariables = ['--phone-source-opacity', '--phone-target-opacity', '--phone-source-clip', '--phone-target-clip', '--phone-source-mask', '--phone-target-mask', '--phone-transition-mask-size', '--phone-transition-mask-repeat', '--phone-transition-mask-mode'] as const;

  const clearTransitionVariables = (root: HTMLElement): void => {
    for (const attribute of ['data-phone-transition-live', 'data-phone-transition-direction', 'data-phone-transition-foreground'] as const) root.removeAttribute(attribute);
    for (const variable of transitionVariables) root.style.removeProperty(variable);
  };

  const applyTransitionFrame: PhonePresentation['applyTransitionFrame'] = (frame) => {
    const root = state.root, topology = root ? presentationTopology(root) : null;
    if (!root || !topology) return;
    if (!frame) { clearTransitionVariables(root); return; }
    const reverse = frame.direction === 'reverse';
    root.setAttribute('data-phone-transition-live', 'true');
    root.setAttribute('data-phone-transition-direction', frame.direction);
    root.setAttribute('data-phone-transition-foreground', frame.foregroundOwner);
    topology.source.setAttribute('data-phone-exposed', 'true');
    topology.receiver.setAttribute('data-phone-exposed', 'true');
    const values = [frame.sourceOpacity, frame.targetOpacity, reverse ? frame.ownership?.revealClip : frame.ownership?.concealClip, reverse ? frame.ownership?.concealClip : frame.ownership?.revealClip, reverse ? frame.ownership?.revealMask : frame.ownership?.concealMask, reverse ? frame.ownership?.concealMask : frame.ownership?.revealMask, frame.ownership?.maskSize, frame.ownership?.maskRepeat, frame.ownership?.maskMode];
    transitionVariables.forEach((variable, index) => root.style.setProperty(variable, String(values[index] ?? 'none')));
  };

  const commitStablePlane: PhonePresentation['commitStablePlane'] = (sourceBuffer) => {
    const root = state.root; if (!root) return; const source = root.querySelector<HTMLElement>(`[data-phone-buffer="${sourceBuffer}"]`); const receiver = root.querySelector<HTMLElement>(`[data-phone-buffer="${sourceBuffer === 'a' ? 'b' : 'a'}"]`); if (!source || !receiver) return;
    // Make the new buffer the exposed plane before clearing the transition;
    source.setAttribute('data-phone-exposed', 'true');
    receiver.setAttribute('data-phone-exposed', 'false');
    source.style.setProperty('--phone-plane-z', '10');
    receiver.style.setProperty('--phone-plane-z', '30');
    clearTransitionVariables(root);
    root.setAttribute('data-phone-stable-buffer', sourceBuffer);
  };

  const applyVariables = (
    request: PhonePlaneRequest,
    topology: PhoneProjectorTopology
  ): void => {
    const { layout, visual } = request.viewport;
    const variables: readonly [string, string][] = [
      ['--phone-visual-offset-left', `${visual.offsetLeft}px`],
      ['--phone-visual-offset-top', `${visual.offsetTop}px`],
      ['--phone-visual-width', `${visual.width}px`],
      ['--phone-visual-height', `${visual.height}px`],
      ['--phone-visual-scale', String(visual.scale)],
      ['--phone-layout-width', `${layout.width}px`],
      ['--phone-layout-height', `${layout.height}px`],
      ['--phone-story-progress', String(request.progress)]
    ];
    for (const [property, value] of variables) state.root?.style.setProperty(property, value);
    state.root?.style.setProperty('--phone-story-coverage', phoneSceneById(request.sceneId).edgeSurface);
    state.root?.setAttribute('data-phone-orientation', layout.orientation);
    topology.source.setAttribute('data-phone-retained', 'true');
    if (!state.root?.hasAttribute('data-phone-transition-live')) {
      topology.source.style.setProperty('--phone-plane-z', '10');
      topology.receiver.style.setProperty('--phone-plane-z', '30');
      if (request.leg !== 'target') {
        topology.source.setAttribute('data-phone-exposed', 'true');
        topology.receiver.setAttribute('data-phone-exposed', 'false');
      } else {
        topology.source.setAttribute('data-phone-exposed', 'false');
        topology.receiver.setAttribute('data-phone-exposed', 'true');
      }
    }
    for (const record of state.mounts.values()) {
      record.root?.setAttribute('aria-hidden', 'true');
      record.root?.toggleAttribute('inert', true);
    }
    if (request.sceneId === 'hero') {
      state.root?.style.setProperty('--phone-hero-motion-progress', String(request.progress));
      state.root?.style.setProperty('--phone-hero-authored-progress', String(request.progress));
    }
  };

  const refreshStableViewport: PhonePresentation['refreshStableViewport'] = (viewport) => {
    const root = state.root;
    if (!root) return;
    const { layout, visual } = viewport;
    const variables: readonly [string, string][] = [
      ['--phone-visual-offset-left', `${visual.offsetLeft}px`],
      ['--phone-visual-offset-top', `${visual.offsetTop}px`],
      ['--phone-visual-width', `${visual.width}px`],
      ['--phone-visual-height', `${visual.height}px`],
      ['--phone-visual-scale', String(visual.scale)],
      ['--phone-layout-width', `${layout.width}px`],
      ['--phone-layout-height', `${layout.height}px`]
    ];
    for (const [property, value] of variables) root.style.setProperty(property, value);
    root.setAttribute('data-phone-orientation', layout.orientation);
  };

  const contentFailure = (
    request: PhonePlaneRequest,
    record: PhoneMountRecord,
    topology: PhoneProjectorTopology
  ): PhonePlaneApplyResult | null => {
    if (!record.root) return presentationFailure(
      'presentation-mount-missing', 'The current scene mount is unavailable'
    );
    const visual = request.viewport.visual;
    const scene = phoneSceneById(request.sceneId);
    const authoredComposite = scene.frame.surfaceIds.length > 1;
    const nativeReading = scene.plane === 'native';
    const selectors = scene.id === 'figure2-proof' ? [`[data-r4-proof-panel="${request.landingAlias ?? 'opening'}"]`] : scene.content.selectors;
    const elements = selectors.map((selector) => (
      record.root?.querySelector<HTMLElement>(selector) ?? null
    ));
    if (elements.some((element) => !element)) return presentationFailure(
      'presentation-content-missing', 'A required scene selector is absent from its registered root'
    );
    const active = request.leg !== 'target' ? topology.source : topology.receiver;
    const activeZ = request.leg !== 'target' ? 10 : 30;
    const layers = Array.from(topology.planes.children) as HTMLElement[];
    for (const element of elements) {
      if (!element || (!nativeReading && !intersectsVisualViewport(element, visual))
        || !visibleThroughAncestors(element, record.root, getStyle, !authoredComposite)) {
        return presentationFailure(
          'presentation-content-invisible', nativeReading
            ? 'Required native scene content is missing or hidden'
            : 'Required scene content is not visibly intersecting'
        );
      }
      const bounds = element.getBoundingClientRect();
      const hits = dependencies.elementsFromPoint(
        bounds.left + bounds.width / 2, bounds.top + bounds.height / 2
      );
      const targetIndex = hits.findIndex((hit) => hit === element || element.contains(hit));
      const hitOccluder = targetIndex < 0 ? null : hits.slice(0, targetIndex).find((hit) => (
        !(request.loaderCovered && hit.hasAttribute('data-phone-loader'))
          && opaqueStyle(getStyle(hit))
      ));
      const layerOccluder = layers.find((layer) => {
        const style = getStyle(layer);
        return layer !== active && !layer.contains(element) && !element.contains(layer)
          && Number.parseInt(style.zIndex, 10) > activeZ && opaqueStyle(style)
          && containsPoint(layer, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      });
      if (hitOccluder || layerOccluder) return presentationFailure(
        'presentation-content-occluded', 'Required scene content is occluded in the story stack'
      );
    }
    if (authoredComposite && !elements.some((element) => (
      !!element && visibleStyle(getStyle(element))
    ))) return presentationFailure('presentation-content-invisible',
      'No authored compositor layer is visibly participating');
    const pseudoOccludes = layers
      .some((element) => phonePseudoElements.some((pseudo) => {
        const style = getStyle(element, pseudo);
        return style.content !== 'none' && opaqueStyle(style)
          && Number.parseInt(style.zIndex, 10) > activeZ;
      }));
    return pseudoOccludes ? presentationFailure(
      'presentation-content-occluded', 'A pseudo-element occludes the active scene plane'
    ) : null;
  };

  const frameIsVisible = (request: PhonePlaneRequest, record: PhoneMountRecord): boolean => {
    const scene = phoneSceneById(request.sceneId);
    const requiredSurfaces = scene.id === 'figure2-animation' || scene.id === 'figure2-proof' || scene.frame.kind === 'packed-canvas-draw' ? scene.frame.surfaceIds : scene.frame.surfaceIds.slice(0, 1);
    const surfaces = requiredSurfaces.map((id) => id === 'figure2-foreground-arch' ? state.root?.querySelector<HTMLElement>('[data-stage-retained-figure2-arch="true"]') : scene.frame.kind === 'content-post-paint' ? record.root : record.surfaces.get(id)?.element);
    const expectedFact = (id: string): string => id === 'figure2-foreground-arch' || scene.frame.kind === 'image-decode-composite-paint' || scene.frame.kind === 'canvas-or-static-post-paint' ? 'image-decoded' : scene.frame.kind === 'content-post-paint' ? 'static-ready' : scene.frame.kind === 'decoded-composited-frame' && scene.directEntry.closure.resourceBudget.canvases === 0 ? 'video-decoded' : 'canvas-drawn';
    return surfaces.length > 0 && surfaces.every((surface, index) => {
      const id = requiredSurfaces[index]!;
      const ownerRoot = id === 'figure2-foreground-arch' ? state.root : record.root;
      const fact = id === 'figure2-foreground-arch'
        ? surface?.getAttribute('data-phone-figure2-arch-ready') === 'true'
        : record.facts.get(id)?.has(expectedFact(id)) === true;
      return !!surface && !!ownerRoot && fact
        && intersectsVisualViewport(surface, request.viewport.visual)
        && visibleThroughAncestors(surface, ownerRoot, getStyle, surfaces.length === 1);
    })
      && (surfaces.length === 1 || surfaces.some((surface) =>
        !!surface && visibleStyle(getStyle(surface))));
  };

  const coverageIsVisible = (
    request: PhonePlaneRequest,
    topology: PhoneProjectorTopology
  ): boolean => {
    const visual = request.viewport.visual;
    const points: readonly [number, number][] = [
      [0.25, 0.25],
      [visual.width - 0.25, 0.25],
      [0.25, visual.height - 0.25],
      [visual.width - 0.25, visual.height - 0.25]
    ];
    const active = request.leg !== 'target' ? topology.source : topology.receiver;
    return points.every(([x, y]) => containsPoint(topology.coverage, x, y)
      && containsPoint(active, x, y));
  };

  const landingIsVisible = (request: PhonePlaneRequest, record: PhoneMountRecord): boolean => {
    if (!record.root) return false;
    const anchor = phoneSceneById(request.sceneId).landing.anchor;
    const selector = request.sceneId === 'figure2-proof' ? `[data-r4-proof-panel="${request.landingAlias ?? 'opening'}"]` : anchor.startsWith('#') || anchor.startsWith('[')
      ? anchor : `[data-phone-landing="${anchor}"]`;
    const element = record.root.matches(selector) ? record.root : record.root.querySelector<HTMLElement>(selector);
    return !!element && intersectsVisualViewport(element, request.viewport.visual)
      && visibleThroughAncestors(element, record.root, getStyle);
  };

  const provePlane = (
    request: PhonePlaneRequest,
    fullProof: boolean
  ): PhonePlaneApplyResult => {
    if (!requiredIdentityIsValid(request)) return presentationFailure(
      'presentation-proof-identity-invalid', 'Final proof slots do not share one exact plane identity'
    );
    if (!state.root) return presentationFailure(
      'presentation-root-missing', 'The route-local presentation root is not attached'
    );
    const topology = presentationTopology(state.root);
    if (!topology || !validateStack(request, topology)) return presentationFailure(
      'presentation-stack-invalid', 'The fixed story stacking topology is invalid'
    );
    const record = findPlaneMount(request);
    if (!record) return presentationFailure(
      'presentation-mount-missing', 'No current registered mount matches the requested proof leg'
    );
    const readingRoot = state.root.getAttribute('data-phone-reading') === 'enabled' ? topology.reading : null;
    const visibleRecord = readingRoot ? { ...record, root: readingRoot } : record;
    applyVariables(request, topology); if (request.sceneId === 'figure2-proof' && record.root && record.root.parentElement?.getAttribute('data-phone-native-handoff') !== 'active') record.root.style.setProperty('--phone-proof-translate-y', `${(request.landingAlias === 'closing' ? -2 * request.viewport.visual.height : request.landingAlias === 'cards' ? -request.viewport.visual.height : 0).toFixed(2)}px`);
    if (fullProof || request.required.some(({ kind }) => kind === 'content-visible')) {
      const failure = contentFailure(request, visibleRecord, topology);
      if (failure) return failure;
    }
    if ((fullProof || request.required.some(({ kind }) => kind === 'frame-visible'))
      && !frameIsVisible(request, visibleRecord)) return presentationFailure(
      'presentation-frame-invalid', 'The required prepared frame is not visible in the current plane'
    );
    if ((fullProof || request.required.some(({ kind }) => kind === 'coverage-visible'))
      && !coverageIsVisible(request, topology)) return presentationFailure(
      'presentation-coverage-invalid', 'The coverage and active plane do not cover all viewport edges'
    );
    if ((fullProof || request.required.some(({ kind }) => (
      kind === 'landing-confirmed' || kind === 'scroll-confirmed'
    ))) && !landingIsVisible(request, visibleRecord)) return presentationFailure(
      'presentation-landing-invalid', 'The requested landing is not visibly aligned'
    );
    const records = request.required.map((slot) => Object.freeze({
      slot,
      token: `${request.attempt.transactionId}:plane:${request.planeRevision}:${slot.kind}:${++state.proofSequence}`
    }));
    return Object.freeze({ records: Object.freeze(records), failure: null });
  };

  const attachRoot = (root: HTMLElement): (() => void) => {
    if (state.root) throw new Error('Phone presentation already has an attached root');
    state.root = root;
    const topology = presentationTopology(root);
    topology?.source.setAttribute('data-phone-exposed', 'false');
    topology?.receiver.setAttribute('data-phone-exposed', 'false');
    const attachment = { active: true };
    return () => {
      if (!attachment.active) return;
      attachment.active = false;
      for (const record of [...state.mounts.values()]) releaseRecord(record);
      state.mounts.clear();
      state.surfaceOwners.clear();
      state.root = null;
    };
  };

  return Object.freeze({
    attachRoot,
    registerLeafMount,
    applyTransitionFrame,
    commitStablePlane,
    sampleLayoutViewport: dependencies.sampleLayoutViewport,
    sampleVisualViewport: dependencies.sampleVisualViewport,
    verifyPrepared,
    refreshStableViewport,
    applyPlane: (request: PhonePlaneRequest) => provePlane(request, false),
    verifyVisibleCandidate: (request: PhoneVisibleCandidateProofRequest) => (
      provePlane(request, true)
    ),
    verifyReproject: (request: PhoneReprojectProofRequest) => provePlane(request, true),
    verifyRollback: (request: PhoneRollbackProofRequest) => provePlane(request, true)
  });
}

export function runPhoneCleanupSteps(
  label: string,
  steps: readonly (() => void)[]
): void {
  const errors: unknown[] = [];
  for (const step of steps) {
    try {
      step();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, label);
}

export type PhoneLeafRetirementCallbacks = Readonly<{
  invalidate(): void; pause(): void; dispose(): void; markDisposed(): void;
  unregister(): void; releaseMount(): void; releaseResources(): void; released(): void;
}>;

export function runPhoneLeafRetirement(
  callbacks: PhoneLeafRetirementCallbacks,
  alreadyPaused: boolean
): void {
  runPhoneCleanupSteps('Phone leaf retirement failed', [
    callbacks.invalidate,
    ...(!alreadyPaused ? [callbacks.pause] : []),
    callbacks.dispose,
    callbacks.markDisposed,
    callbacks.unregister,
    callbacks.releaseMount,
    callbacks.releaseResources,
    callbacks.released
  ]);
}

export function clearPhoneOwnershipRegistries(
  registries: readonly Readonly<{ clear(): void }>[]
): void {
  for (const registry of registries) registry.clear();
}

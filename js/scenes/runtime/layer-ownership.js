export const LAYER_OWNERS = {
  'visual-stage': 'SegmentPlayer',
  'ink-mask': 'SegmentPlayer',
  media: 'MediaPlayer',
  copy: 'Presentation',
  'scene-state': 'Presentation',
  'nav/hash/focus': 'Presentation',
  'read-boundary': 'ReadMonitor',
  'site-ui': 'SiteRuntime'
};

export class LayerOwnershipConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'LayerOwnershipConflictError';
    this.details = details;
  }
}

export function createLayerOwnershipRegistry({
  mode = 'development',
  recovery = null,
  onConflict = null
} = {}) {
  const claims = new Map();
  let frameId = 0;

  function beginFrame(nextFrameId = frameId + 1) {
    frameId = nextFrameId;
    claims.clear();
  }

  function claim({ layer, owner, token = null, segmentId = null } = {}) {
    if (!layer || !owner) throw new Error('Layer claim requires layer and owner');
    const existing = claims.get(layer);
    const details = { layer, owner, token, segmentId, existing, frameId };

    if (existing && existing.owner !== owner) {
      recovery?.recover?.({
        recoveryReason: 'layer-owner-conflict',
        targetScene: null,
        lastSafeScene: null
      });
      onConflict?.(details);
      if (mode === 'development') {
        throw new LayerOwnershipConflictError(`Layer ${layer} already claimed by ${existing.owner}`, details);
      }
      return { ok: false, recovered: true, conflict: details };
    }

    const claimRecord = { layer, owner, token, segmentId, frameId };
    claims.set(layer, claimRecord);
    return { ok: true, claim: claimRecord };
  }

  function release(layer, token = null) {
    const existing = claims.get(layer);
    if (!existing) return false;
    if (token && existing.token !== token) return false;
    claims.delete(layer);
    return true;
  }

  return {
    beginFrame,
    claim,
    release,
    getOwner: (layer) => claims.get(layer)?.owner || null,
    getClaims: () => [...claims.values()]
  };
}

export class LayerOwnership {
  constructor({ dev = true } = {}) {
    this.dev = dev;
    this.owners = new Map();
    this.trace = [];
  }

  claim(layer, owner, detail = {}) {
    const existing = this.owners.get(layer);
    if (existing && existing.owner !== owner) {
      const error = new Error(`Layer ${layer} already owned by ${existing.owner}`);
      this.trace.push({
        type: 'conflict',
        layer,
        owner,
        existing: existing.owner
      });
      if (this.dev) throw error;
    }
    this.owners.set(layer, { owner, detail });
    this.trace.push({ type: 'claim', layer, owner, detail });
    return this.snapshot();
  }

  release(layer, owner, reason = 'release') {
    const existing = this.owners.get(layer);
    if (!existing) return this.snapshot();
    if (owner && existing.owner !== owner) {
      const error = new Error(`Layer ${layer} owned by ${existing.owner}, not ${owner}`);
      this.trace.push({
        type: 'release-conflict',
        layer,
        owner,
        existing: existing.owner
      });
      if (this.dev) throw error;
    }
    this.owners.delete(layer);
    this.trace.push({ type: 'release', layer, owner: existing.owner, reason });
    return this.snapshot();
  }

  check(layer) {
    return this.owners.get(layer) || null;
  }

  releaseOwner(owner, reason = 'release-owner') {
    for (const [layer, entry] of [...this.owners.entries()]) {
      if (entry.owner === owner) this.release(layer, owner, reason);
    }
  }

  snapshot() {
    return {
      owners: Object.fromEntries([...this.owners.entries()].map(([layer, entry]) => [
        layer,
        { owner: entry.owner, detail: entry.detail }
      ])),
      trace: this.trace.slice()
    };
  }
}

export function createLayerOwnership(options = {}) {
  return new LayerOwnership(options);
}

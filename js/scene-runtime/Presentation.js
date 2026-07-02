export class Presentation {
  constructor({ initial = null } = {}) {
    this.current = initial;
    this.visible = new Set(initial ? [initial] : []);
    this.earlyCopies = new Set();
    this.reveals = [];
    this.trace = [];
  }

  present(sceneId, reason = 'present') {
    this.current = sceneId;
    this.visible = new Set(sceneId ? [sceneId] : []);
    this.trace.push({
      type: 'present',
      sceneId,
      reason
    });
    return this.snapshot();
  }

  presentEarlyCopy(sceneId, reason = 'early-copy') {
    this.earlyCopies.add(sceneId);
    this.visible.add(sceneId);
    const reveal = { sceneId, reason };
    if (!this.reveals.some((entry) => entry.sceneId === sceneId)) {
      this.reveals.push(reveal);
    }
    this.trace.push({
      type: 'early-copy',
      sceneId,
      reason
    });
    return this.snapshot();
  }

  clearEarlyCopy(reason = 'clear-early-copy') {
    const cleared = [...this.earlyCopies];
    this.earlyCopies.clear();
    this.reveals = this.reveals.filter((entry) => !cleared.includes(entry.sceneId));
    this.visible = new Set(this.current ? [this.current] : []);
    this.trace.push({
      type: 'clear-early-copy',
      reason,
      cleared
    });
    return this.snapshot();
  }

  snapshot() {
    return {
      current: this.current,
      visible: [...this.visible],
      earlyCopies: [...this.earlyCopies],
      reveals: this.reveals.slice(),
      trace: this.trace.slice()
    };
  }
}

export function createPresentation(options = {}) {
  return new Presentation(options);
}

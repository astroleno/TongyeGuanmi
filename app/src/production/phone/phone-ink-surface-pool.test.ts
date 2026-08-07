import { describe, expect, it, vi } from 'vitest';
import { claimPhoneInkSurface } from './phone-ink-surface-pool';

class FakeCanvas {
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly remove = vi.fn(() => {
    if (this.parentElement) {
      const index = this.parentElement.children.indexOf(this);
      if (index >= 0) this.parentElement.children.splice(index, 1);
      this.parentElement = null;
    }
  });
  className = '';
  parentElement: FakeHost | null = null;
  setAttribute() {}
  removeAttribute() {}
}

class FakeHost {
  readonly children: FakeCanvas[] = [];

  constructor(readonly ownerDocument: FakeDocument) {}

  append(canvas: FakeCanvas) {
    canvas.parentElement = this;
    for (const host of this.ownerDocument.hosts) {
      const index = host.children.indexOf(canvas);
      if (index >= 0) host.children.splice(index, 1);
    }
    this.children.push(canvas);
  }
}

class FakeDocument {
  readonly hosts: FakeHost[] = [];
  readonly createElement = vi.fn(() => new FakeCanvas());

  host() {
    const host = new FakeHost(this);
    this.hosts.push(host);
    return host;
  }
}

describe('phone ink surface pool', () => {
  it('retires the old surface before a new fixed-stage owner acquires one', () => {
    const document = new FakeDocument();
    const firstHost = document.host();
    const secondHost = document.host();
    const revokeFirst = vi.fn();

    const first = claimPhoneInkSurface(document as unknown as Document, {
      host: firstHost as unknown as HTMLElement,
      className: 'proof-brand-ink',
      portraitInk: 'proof-brand',
      onRevoke: revokeFirst
    });
    const second = claimPhoneInkSurface(document as unknown as Document, {
      host: secondHost as unknown as HTMLElement,
      className: 'lab-ph-ink',
      portraitInk: 'lab-ph',
      onRevoke: vi.fn()
    });

    expect(first.canvas).not.toBe(second.canvas);
    expect(document.createElement).toHaveBeenCalledTimes(2);
    expect(revokeFirst).toHaveBeenCalledOnce();
    expect(firstHost.children).toHaveLength(0);
    expect(secondHost.children).toEqual([second.canvas]);
    expect(second.canvas.dataset.portraitInk).toBe('lab-ph');
    expect(first.canvas.remove).toHaveBeenCalledOnce();

    first.release();
    second.release();
    expect(second.canvas.remove).toHaveBeenCalledOnce();
  });

  it('releases only the matching lease and retires its canvas', () => {
    const document = new FakeDocument();
    const revoke = vi.fn();
    const lease = claimPhoneInkSurface(document as unknown as Document, {
      host: document.host() as unknown as HTMLElement,
      className: 'method-ink',
      onRevoke: revoke
    });

    lease.release();

    expect(revoke).toHaveBeenCalledOnce();
    expect(lease.canvas.remove).toHaveBeenCalledOnce();
  });
});

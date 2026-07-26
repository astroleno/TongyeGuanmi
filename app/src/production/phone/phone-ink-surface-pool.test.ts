import { describe, expect, it, vi } from 'vitest';
import { claimPhoneInkSurface } from './phone-ink-surface-pool';

class FakeCanvas {
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly remove = vi.fn();
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
  readonly canvas = new FakeCanvas();
  readonly hosts: FakeHost[] = [];
  readonly createElement = vi.fn(() => this.canvas);

  host() {
    const host = new FakeHost(this);
    this.hosts.push(host);
    return host;
  }
}

describe('phone ink surface pool', () => {
  it('moves one document canvas between fixed-stage owners and revokes the old run', () => {
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

    expect(first.canvas).toBe(second.canvas);
    expect(document.createElement).toHaveBeenCalledOnce();
    expect(revokeFirst).toHaveBeenCalledOnce();
    expect(firstHost.children).toHaveLength(0);
    expect(secondHost.children).toEqual([document.canvas]);
    expect(document.canvas.dataset.portraitInk).toBe('lab-ph');

    first.release();
    second.release();
    expect(document.canvas.remove).not.toHaveBeenCalled();
  });

  it('releases only the matching lease without removing the reusable canvas', () => {
    const document = new FakeDocument();
    const revoke = vi.fn();
    const lease = claimPhoneInkSurface(document as unknown as Document, {
      host: document.host() as unknown as HTMLElement,
      className: 'method-ink',
      onRevoke: revoke
    });

    lease.release();

    expect(revoke).toHaveBeenCalledOnce();
    expect(document.canvas.remove).not.toHaveBeenCalled();
  });
});

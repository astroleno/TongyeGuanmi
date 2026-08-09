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
  removeAttribute(name: string) {
    if (name !== 'style') return;
    for (const key of Object.keys(this.style)) delete this.style[key];
  }
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
  it('reuses one route-level surface while changing the active fixed-stage owner', () => {
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
    expect(document.createElement).toHaveBeenCalledTimes(1);
    expect(revokeFirst).toHaveBeenCalledOnce();
    expect(firstHost.children).toHaveLength(0);
    expect(secondHost.children).toEqual([second.canvas]);
    expect(second.canvas.dataset.portraitInk).toBe('lab-ph');
    expect(first.canvas.remove).not.toHaveBeenCalled();
    expect(first.canvas.style.visibility).toBeFalsy();

    first.release();
    second.release();
    expect(second.canvas.remove).not.toHaveBeenCalled();
    expect(second.canvas.style.visibility).toBe('hidden');
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
    expect(lease.canvas.remove).not.toHaveBeenCalled();
    expect(lease.canvas.style.visibility).toBe('hidden');
  });

  it('[P0 physical lease] clears stale presentation evidence and visual residue before reuse', () => {
    const document = new FakeDocument();
    const first = claimPhoneInkSurface(document as unknown as Document, {
      host: document.host() as unknown as HTMLElement,
      className: 'figure2-depth-a',
      onRevoke: vi.fn()
    });
    first.canvas.dataset.phonePresentationEffectFrame = 'ready';
    first.canvas.dataset.phonePresentationEffectToken = 'authority:a';
    first.canvas.style.visibility = 'visible';
    first.canvas.style.opacity = '1';
    first.canvas.style.clipPath = 'circle(20%)';
    first.canvas.style.maskImage = 'linear-gradient(#000,#000)';
    first.canvas.style.transform = 'scale(2)';

    const second = claimPhoneInkSurface(document as unknown as Document, {
      host: document.host() as unknown as HTMLElement,
      className: 'figure2-depth-b',
      onRevoke: vi.fn()
    });
    const firstGeneration = (first as unknown as { generation?: number }).generation;
    const secondGeneration = (second as unknown as { generation?: number }).generation;

    expect(second.canvas).toBe(first.canvas);
    expect(second.canvas.dataset.phonePresentationEffectFrame).toBeUndefined();
    expect(second.canvas.dataset.phonePresentationEffectToken).toBeUndefined();
    expect(second.canvas.style.visibility).toBeFalsy();
    expect(second.canvas.style.opacity).toBeFalsy();
    expect(second.canvas.style.clipPath).toBeFalsy();
    expect(second.canvas.style.maskImage).toBeFalsy();
    expect(second.canvas.style.transform).toBeFalsy();
    expect(firstGeneration).toBeTypeOf('number');
    expect(secondGeneration).toBeGreaterThan(firstGeneration!);
  });
});

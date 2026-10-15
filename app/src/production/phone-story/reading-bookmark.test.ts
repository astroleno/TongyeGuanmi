// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureReadingBookmark, restoreReadingBookmark } from './presentation';

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

function fixture(scrollTop = 400) {
  const root = document.createElement('article');
  const node = document.createElement('p'); root.append(node); document.body.append(root);
  const owner = document.documentElement;
  Object.defineProperties(owner, {
    scrollHeight: { configurable: true, value: 2000 },
    clientHeight: { configurable: true, value: 800 }
  });
  owner.scrollTop = scrollTop;
  let documentY = scrollTop + 50;
  vi.spyOn(node, 'getBoundingClientRect').mockImplementation(() => ({
    top: documentY - owner.scrollTop, bottom: documentY - owner.scrollTop + 100,
    height: 100, width: 300, left: 0, right: 300, x: 0, y: documentY - owner.scrollTop,
    toJSON: () => ({})
  }));
  return { root, node, owner, reflow: (delta: number) => { documentY += delta; } };
}

describe('phone reading bookmark', () => {
  it('preserves a visible block after width reflow, independently of total page height', () => {
    const f = fixture(); const bookmark = captureReadingBookmark(f.root, 'lab', 4, f.owner, 800);
    f.reflow(120);
    expect(restoreReadingBookmark(bookmark, f.root, 'lab', 4, f.owner)).toBe(true);
    expect(f.owner.scrollTop).toBe(520);
    expect(f.node.getBoundingClientRect().top).toBe(50);
    expect(restoreReadingBookmark(bookmark, f.root, 'lab', 4, f.owner)).toBe(true);
    expect(f.owner.scrollTop).toBe(520);
  });
  it.each([0, 1200])('preserves a settled document edge at %i', (y) => {
    const f = fixture(y); const bookmark = captureReadingBookmark(f.root, 'lab', 4, f.owner, 800);
    f.reflow(120);
    expect(restoreReadingBookmark(bookmark, f.root, 'lab', 4, f.owner)).toBe(true);
    expect(f.owner.scrollTop).toBe(y);
  });
  it('rejects a different scene, semantic commit, detached node or replacement reading copy', () => {
    const f = fixture(); const bookmark = captureReadingBookmark(f.root, 'lab', 4, f.owner, 800);
    expect(restoreReadingBookmark(bookmark, f.root, 'brand', 4, f.owner)).toBe(false);
    expect(restoreReadingBookmark(bookmark, f.root, 'lab', 5, f.owner)).toBe(false);
    expect(restoreReadingBookmark(bookmark, document.createElement('article'), 'lab', 4, f.owner)).toBe(false);
    f.node.remove();
    expect(restoreReadingBookmark(bookmark, f.root, 'lab', 4, f.owner)).toBe(false);
    expect(f.owner.scrollTop).toBe(400);
  });
  it('rejects an empty, invisible or unwritable bookmark instead of issuing proof', () => {
    const f = fixture(); const bookmark = captureReadingBookmark(f.root, 'lab', 4, f.owner, 800);
    f.reflow(100);
    Object.defineProperty(f.owner, 'scrollTop', { configurable: true, get: () => 400, set: () => {} });
    expect(restoreReadingBookmark(bookmark, f.root, 'lab', 4, f.owner)).toBe(false);
    delete (f.owner as Partial<HTMLElement>).scrollTop;
    f.root.replaceChildren();
    expect(captureReadingBookmark(f.root, 'lab', 4, f.owner, 800)).toBeNull();
  });
});

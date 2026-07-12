import { describe, expect, it, vi } from 'vitest';
import {
  acquireSceneMotionLease,
  bindSceneMotion,
  createSceneMotionLeaseGroup,
  sceneMotionSnapshot
} from './scene-motion';

class FakeRoot {
  readonly dataset: Record<string, string> = {};
}

function root(): HTMLElement {
  return new FakeRoot() as unknown as HTMLElement;
}

describe('scene motion ownership', () => {
  it('deduplicates one run owner while keeping independent releases safe', () => {
    const sceneRoot = root();
    const first = acquireSceneMotionLease(sceneRoot, 'run:1:pattern');
    const second = acquireSceneMotionLease(sceneRoot, 'run:1:pattern');

    expect(sceneMotionSnapshot(sceneRoot)).toMatchObject({
      active: true,
      baseActive: false,
      leaseCount: 1,
      leaseOwners: ['run:1:pattern']
    });

    first.release();
    first.release();
    expect(sceneMotionSnapshot(sceneRoot).active).toBe(true);

    second.release();
    expect(sceneMotionSnapshot(sceneRoot)).toMatchObject({ active: false, leaseCount: 0 });
  });

  it('moves a keyed run lease to a remounted root and disposes idempotently', () => {
    const firstRoot = root();
    const remountedRoot = root();
    const group = createSceneMotionLeaseGroup('run:2');

    group.sync([{ key: 'pattern', root: firstRoot, active: true }]);
    group.sync([{ key: 'pattern', root: firstRoot, active: true }]);
    expect(sceneMotionSnapshot(firstRoot).leaseCount).toBe(1);

    group.sync([{ key: 'pattern', root: remountedRoot, active: true }]);
    expect(sceneMotionSnapshot(firstRoot).active).toBe(false);
    expect(sceneMotionSnapshot(remountedRoot)).toMatchObject({ active: true, leaseCount: 1 });

    group.dispose();
    group.dispose();
    expect(sceneMotionSnapshot(remountedRoot)).toMatchObject({ active: false, leaseCount: 0 });
  });

  it('transfers base and lease ownership across a StrictMode-style binding remount', () => {
    const sceneRoot = root();
    const listener = vi.fn();
    const lease = acquireSceneMotionLease(sceneRoot, 'run:3:star-map');
    const firstBinding = bindSceneMotion(sceneRoot, listener);

    expect(listener).toHaveBeenLastCalledWith(true);
    firstBinding.dispose();
    expect(listener).toHaveBeenLastCalledWith(false);

    const remountedListener = vi.fn();
    const secondBinding = bindSceneMotion(sceneRoot, remountedListener);
    expect(remountedListener).toHaveBeenLastCalledWith(true);

    secondBinding.setBaseActive(true);
    lease.release();
    expect(remountedListener).toHaveBeenLastCalledWith(true);

    secondBinding.setBaseActive(false);
    expect(remountedListener).toHaveBeenLastCalledWith(false);
    secondBinding.dispose();
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  createPhoneChunkRecoveryController,
  loadDesktopStoryShell,
  loadPhoneBrandLabStory,
  loadPhoneStoryShell,
  type PhoneChunkRecoveryEnvironment,
  type PhoneChunkRecoveryLineage
} from './presentation-shell-loaders';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function recoveryFixture(options: Readonly<{
  storage?: PhoneChunkRecoveryEnvironment['storage'];
  currentBuildId?: string;
  deployedBuildId?: string;
  online?: boolean;
}> = {}) {
  const storage = options.storage === undefined ? new MemoryStorage() : options.storage;
  let online = options.online ?? true;
  let releaseOnline: () => void = () => undefined;
  let onlinePromise = new Promise<void>((resolve) => { releaseOnline = resolve; });
  const reload = vi.fn();
  const fetchReleaseManifest = vi.fn(async (): Promise<unknown> => ({
    sourceCommit: options.deployedBuildId ?? 'build-deployed'
  }));
  const environment: PhoneChunkRecoveryEnvironment = {
    currentBuildId: options.currentBuildId ?? 'build-document',
    entryUrl: 'https://tongye.test/#figure3-animation',
    storage,
    isOnline: () => online,
    waitForOnline: () => onlinePromise,
    fetchReleaseManifest,
    reload,
    createLineageId: () => 'lineage-1'
  };
  return {
    environment,
    fetchReleaseManifest,
    reload,
    storage,
    setOnline(next: boolean) {
      online = next;
      if (next) releaseOnline();
    },
    resetOnlineWait() {
      onlinePromise = new Promise<void>((resolve) => { releaseOnline = resolve; });
    }
  };
}

function storedLineage(storage: MemoryStorage): PhoneChunkRecoveryLineage {
  const values = [...storage.values.values()];
  expect(values).toHaveLength(1);
  return JSON.parse(values[0]!) as PhoneChunkRecoveryLineage;
}

describe('presentation shell loaders', () => {
  it('loads desktop, formal phone, and QA wrappers without preloading legacy adapters', async () => {
    const desktop = await loadDesktopStoryShell();
    const formal = await loadPhoneStoryShell();
    const qa = await loadPhoneBrandLabStory();

    expect(desktop.default).toBeTypeOf('function');
    expect(formal.default).toBeTypeOf('function');
    expect(qa.default).toBeTypeOf('function');
  });

  it('classifies one native core rejection and persists one cross-reload lineage before reload', async () => {
    const fixture = recoveryFixture();
    const controller = createPhoneChunkRecoveryController(fixture.environment);

    await expect(controller.reportPhoneCoreRejection(
      new TypeError('Failed to fetch dynamically imported module'),
      '/assets/PhoneStoryShell-deadbeef.js'
    )).resolves.toBe('reloading');

    expect(fixture.fetchReleaseManifest).toHaveBeenCalledWith(
      '/r5-release-manifest.json',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fixture.reload).toHaveBeenCalledWith(
      'https://tongye.test/#figure3-animation'
    );
    expect(storedLineage(fixture.storage as MemoryStorage)).toMatchObject({
      lineageId: 'lineage-1',
      entryUrl: 'https://tongye.test/#figure3-animation',
      firstDocumentBuildId: 'build-document',
      currentDocumentBuildId: 'build-document',
      deployedBuildId: 'build-deployed',
      failedModuleUrl: '/assets/PhoneStoryShell-deadbeef.js',
      failedModuleClass: 'phone-core',
      automaticReloadCount: 1,
      status: 'reloaded'
    });
  });

  it('does not forward a React click event into the optional recovery entry URL', () => {
    const fixture = recoveryFixture();
    const controller = createPhoneChunkRecoveryController(fixture.environment);

    (controller.manualReload as (event: unknown) => void)({ type: 'click' });

    expect(fixture.reload).toHaveBeenCalledWith();
  });

  it('does not mint another reload when build IDs and hashed URLs change', async () => {
    const sharedStorage = new MemoryStorage();
    const first = recoveryFixture({ storage: sharedStorage, currentBuildId: 'build-a' });
    await createPhoneChunkRecoveryController(first.environment)
      .reportPhoneCoreRejection(new Error('first'), '/assets/core-a.js');

    const second = recoveryFixture({
      storage: sharedStorage,
      currentBuildId: 'build-b',
      deployedBuildId: 'build-c'
    });
    const result = await createPhoneChunkRecoveryController(second.environment).port
      .reportRejectedChunk({
        authorityId: 'authority-2',
        transactionId: 'transaction-2',
        moduleUrl: '/assets/scene-b.js',
        dependencies: ['scene:brand'],
        reason: 'second rejection'
      });

    expect(result).toBe('fail-closed');
    expect(second.reload).not.toHaveBeenCalled();
    expect(storedLineage(sharedStorage)).toMatchObject({
      lineageId: 'lineage-1',
      automaticReloadCount: 1,
      status: 'fail-closed'
    });
  });

  it('waits online without spending the reload allowance', async () => {
    const fixture = recoveryFixture({ online: false });
    const controller = createPhoneChunkRecoveryController(fixture.environment);
    const recovery = controller.port.reportRejectedChunk({
      authorityId: 'authority-1',
      transactionId: 'transaction-1',
      moduleUrl: '/assets/transition.js',
      dependencies: ['transition:brand-figure3'],
      reason: 'offline rejection'
    });

    await vi.waitFor(() => expect(controller.getSnapshot().status).toBe('waiting-online'));
    expect(fixture.fetchReleaseManifest).not.toHaveBeenCalled();
    expect(storedLineage(fixture.storage as MemoryStorage)).toMatchObject({
      automaticReloadCount: 0,
      status: 'waiting-online'
    });

    fixture.setOnline(true);
    await expect(recovery).resolves.toBe('reloading');
    expect(fixture.reload).toHaveBeenCalledTimes(1);
  });

  it('fails closed when sessionStorage is unavailable or release identity cannot be classified', async () => {
    const unavailable = recoveryFixture({ storage: null });
    const unavailableController = createPhoneChunkRecoveryController(unavailable.environment);
    await expect(unavailableController.reportPhoneCoreRejection(
      new Error('core failed'), '/assets/core.js'
    )).resolves.toBe('fail-closed');
    expect(unavailable.reload).not.toHaveBeenCalled();

    const invalidManifest = recoveryFixture();
    invalidManifest.fetchReleaseManifest.mockResolvedValueOnce({ schemaVersion: 3 });
    const invalidController = createPhoneChunkRecoveryController(invalidManifest.environment);
    await expect(invalidController.reportPhoneCoreRejection(
      new Error('core failed'), '/assets/core.js'
    )).resolves.toBe('fail-closed');
    expect(invalidController.getSnapshot()).toMatchObject({ status: 'fail-closed' });
    expect(invalidManifest.reload).not.toHaveBeenCalled();
  });

  it('does not classify the same Document again after recovery is fail-closed', async () => {
    const fixture = recoveryFixture();
    fixture.fetchReleaseManifest.mockResolvedValue({ schemaVersion: 3 });
    const controller = createPhoneChunkRecoveryController(fixture.environment);

    await expect(controller.reportPhoneCoreRejection(
      new Error('first core failure'), '/assets/core.js'
    )).resolves.toBe('fail-closed');
    await expect(controller.reportPhoneCoreRejection(
      new Error('duplicate boundary report'), '/assets/core.js'
    )).resolves.toBe('fail-closed');

    expect(fixture.fetchReleaseManifest).toHaveBeenCalledTimes(1);
    expect(fixture.reload).not.toHaveBeenCalled();
  });

  it('routes vite:preloadError through the same bounded policy and prevents the default', async () => {
    const fixture = recoveryFixture();
    const controller = createPhoneChunkRecoveryController(fixture.environment);
    const preventDefault = vi.fn();
    const event = Object.assign(new Event('vite:preloadError'), {
      payload: { url: '/assets/preload.js' },
      preventDefault
    });

    controller.handlePreloadError(event);
    await vi.waitFor(() => expect(fixture.reload).toHaveBeenCalledTimes(1));

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(storedLineage(fixture.storage as MemoryStorage)).toMatchObject({
      failedModuleUrl: '/assets/preload.js',
      failedModuleClass: 'phone-core'
    });
  });

  it('clears lineage only through the stable recovery port and stores no story state', async () => {
    const fixture = recoveryFixture();
    const controller = createPhoneChunkRecoveryController(fixture.environment);
    await controller.port.reportRejectedChunk({
      authorityId: 'authority-1',
      transactionId: 'transaction-1',
      moduleUrl: '/assets/scene.js',
      dependencies: ['scene:hero'],
      reason: 'scene failed'
    });

    controller.port.markStable({
      authorityId: 'authority-2',
      sceneId: 'hero',
      commitSequence: 1
    });

    expect((fixture.storage as MemoryStorage).values.size).toBe(0);
    expect(controller.getSnapshot()).toEqual({ status: 'idle' });
    const serializedController = JSON.stringify(controller.getSnapshot());
    for (const forbidden of [
      'sceneId', 'transactionId', 'checkpoint', 'presentation', 'input', 'media'
    ]) {
      expect(serializedController).not.toContain(forbidden);
    }
  });
});

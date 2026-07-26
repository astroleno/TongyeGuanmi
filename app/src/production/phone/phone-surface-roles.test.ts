import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  beginPhoneSurfaceRoleTransaction,
  type PhoneSurfaceRoleElement
} from './phone-surface-roles';

const stageStyles = readFileSync(
  new URL('./PhoneStageRail.css', import.meta.url),
  'utf8'
);

function endpoint(): PhoneSurfaceRoleElement {
  return { dataset: {} };
}

describe('phone surface role transactions', () => {
  it('publishes both real endpoints before transition progress begins', () => {
    const source = endpoint();
    const receiver = endpoint();
    beginPhoneSurfaceRoleTransaction({
      source,
      receiver,
      sessionId: 'phone-session-1',
      generation: 1
    });

    expect(source.dataset).toMatchObject({
      phoneSurfaceRole: 'transition-endpoint',
      phoneBoundarySession: 'phone-session-1',
      phoneBoundaryEndpoint: 'source'
    });
    expect(receiver.dataset).toMatchObject({
      phoneSurfaceRole: 'transition-endpoint',
      phoneBoundarySession: 'phone-session-1',
      phoneBoundaryEndpoint: 'receiver'
    });
  });

  it('commits receiver roles atomically and ignores stale rollback', () => {
    const source = endpoint();
    const receiver = endpoint();
    const stale = beginPhoneSurfaceRoleTransaction({
      source,
      receiver,
      sessionId: 'phone-session-1',
      generation: 1
    });
    const current = beginPhoneSurfaceRoleTransaction({
      source,
      receiver,
      sessionId: 'phone-session-2',
      generation: 2
    });

    stale.rollback();
    expect(receiver.dataset.phoneBoundarySession).toBe('phone-session-2');

    current.commit('receiver');
    expect(source.dataset).toEqual({
      phoneSurfaceRole: 'native-under-stage'
    });
    expect(receiver.dataset).toEqual({
      phoneSurfaceRole: 'native-stable'
    });
  });

  it('restores the exact source roles on current-run rollback', () => {
    const source = endpoint();
    const receiver = endpoint();
    const transaction = beginPhoneSurfaceRoleTransaction({
      source,
      receiver,
      sessionId: 'phone-session-3',
      generation: 5
    });

    transaction.rollback();

    expect(source.dataset).toEqual({
      phoneSurfaceRole: 'native-stable'
    });
    expect(receiver.dataset).toEqual({
      phoneSurfaceRole: 'native-under-stage'
    });
  });

  it('maps semantic roles above the persistent edge owner and fixed stage', () => {
    expect(stageStyles).toMatch(
      /phone-surface-role="native-under-stage"[^}]*z-index:\s*9/s
    );
    expect(stageStyles).toMatch(
      /phone-surface-role="native-stable"[^}]*z-index:\s*11/s
    );
    expect(stageStyles).toMatch(
      /phone-surface-role="transition-endpoint"[^}]*z-index:\s*12/s
    );
  });
});

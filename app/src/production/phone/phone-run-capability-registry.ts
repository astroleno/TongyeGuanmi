import type { PhoneRunId } from './phone-story-runs';
import type {
  PhoneCapabilityLease,
  PhoneRunCapability
} from './phone-story-orchestrator.types';

type Registration = Readonly<{
  ownerId: string;
  capability: PhoneRunCapability;
}>;

export function createPhoneRunCapabilityRegistry() {
  const registrations = new Map<PhoneRunId, Registration>();

  return {
    get: (run: PhoneRunId) => registrations.get(run)?.capability,
    register(
      run: PhoneRunId,
      ownerId: string,
      capability: PhoneRunCapability
    ): PhoneCapabilityLease {
      const current = registrations.get(run);
      if (current && current.ownerId !== ownerId) {
        throw new Error(`Duplicate phone run: ${run}`);
      }
      const registration = { ownerId, capability };
      registrations.set(run, registration);
      return {
        dispose() {
          if (registrations.get(run) === registration) {
            registrations.delete(run);
          }
        }
      };
    },
    clear: () => registrations.clear()
  };
}

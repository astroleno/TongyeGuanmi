import {
  createContext,
  useContext,
  type ReactNode
} from 'react';
import type { PhoneStoryOrchestrator } from './phone-story-orchestrator';

const PhoneStoryOrchestratorContext =
  createContext<PhoneStoryOrchestrator | null>(null);

export function PhoneStoryOrchestratorProvider({
  orchestrator,
  children
}: Readonly<{
  orchestrator: PhoneStoryOrchestrator;
  children: ReactNode;
}>) {
  return (
    <PhoneStoryOrchestratorContext.Provider value={orchestrator}>
      {children}
    </PhoneStoryOrchestratorContext.Provider>
  );
}

export function usePhoneStoryOrchestrator(): PhoneStoryOrchestrator {
  const orchestrator = useContext(PhoneStoryOrchestratorContext);
  if (!orchestrator) {
    throw new Error('Phone story orchestrator is unavailable');
  }
  return orchestrator;
}

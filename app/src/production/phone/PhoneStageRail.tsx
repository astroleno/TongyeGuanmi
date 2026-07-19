import type { ReactNode, RefObject } from 'react';

export type PhoneStageRailProps = Readonly<{
  railRef: RefObject<HTMLElement | null>;
  stageRef: RefObject<HTMLElement | null>;
  stageActive: boolean;
  children: ReactNode;
}>;

/** Generic rail/stage geometry only; scene markup belongs to adapters. */
export function PhoneStageRail({ railRef, stageRef, stageActive, children }: PhoneStageRailProps) {
  return (
    <section ref={railRef} className="phone-story-shell__stage-rail">
      <section
        ref={stageRef}
        className="phone-story-shell__stage"
        aria-label="同野观幂移动端视觉叙事"
        aria-hidden={stageActive ? undefined : 'true'}
      >
        {children}
      </section>
    </section>
  );
}

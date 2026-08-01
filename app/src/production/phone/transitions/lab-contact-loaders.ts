import {
  createElement,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  type ComponentType
} from 'react';
import type {
  LabContactPhoneTransitionAdapterModule,
  LabContactTransitionId
} from '../lab-contact-types';
import type {
  PhoneTransitionAdapterComponent,
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
} from '../types';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../phone-story/presentation';

type PhoneCleanLeaf = ComponentType<Readonly<{ reports: PhoneLeafReportPort }>>;
type LegacyProjection = Readonly<{
  render(
    props: PhoneTransitionAdapterProps,
    direction: 1 | -1,
    progress: number
  ): void;
  enter?(props: PhoneTransitionAdapterProps): void;
  leave?(props: PhoneTransitionAdapterProps, direction: 1 | -1): void;
  reverse?(props: PhoneTransitionAdapterProps): void;
  dispose?(props: PhoneTransitionAdapterProps): void;
}>;

function createLabContactTransitionMigrationBridge(
  Leaf: PhoneCleanLeaf,
  label: string,
  projection: LegacyProjection
): PhoneTransitionAdapterComponent {
  return forwardRef<PhoneTransitionAdapterHandle, PhoneTransitionAdapterProps>(
    function LabContactTransitionMigrationBridge(props, forwardedRef) {
      const registrationRef = useRef<PhoneLeafMountRegistration | null>(null);
      const readyRef = useRef(props.onReady);
      const generationRef = useRef(0);
      const directionRef = useRef<1 | -1>(1);
      readyRef.current = props.onReady;
      const reports = useMemo<PhoneLeafReportPort>(() => Object.freeze({
        registerMount(registration) {
          registrationRef.current = registration;
          registration.commands.rebind({
            reports,
            frameToken: `${label}:frame:${++generationRef.current}`
          });
          readyRef.current?.();
        },
        reportPrepared: () => undefined,
        reportFrame: () => undefined,
        reportProgress: () => undefined,
        reportComplete: () => undefined,
        reportFailure: () => undefined
      }), [label]);
      const render = (progress: number) => {
        registrationRef.current?.commands.render(progress);
        projection.render(props, directionRef.current, progress);
      };
      useImperativeHandle(forwardedRef, () => ({
        render,
        enter() {
          directionRef.current = 1;
          projection.enter?.(props);
          render(0);
        },
        leave() {
          const direction = directionRef.current;
          const endpoint = direction === 1 ? 1 : 0;
          registrationRef.current?.commands.settle(endpoint);
          projection.render(props, direction, endpoint);
          projection.leave?.(props, direction);
          directionRef.current = 1;
        },
        reverse() {
          directionRef.current = -1;
          projection.reverse?.(props);
          render(1);
        },
        dispose() {
          projection.dispose?.(props);
          registrationRef.current?.commands.dispose('closure-retired');
        }
      }), [props]);
      return createElement(Leaf, { reports });
    }
  );
}

function setEducationDocumentLayer(
  target: HTMLElement | null,
  active: boolean
): void {
  const slot = target?.closest<HTMLElement>(
    '[data-phone-acceptance-chapter="education"]'
  );
  if (active) slot?.setAttribute('data-phone-ph-education-layer', 'true');
  else slot?.removeAttribute('data-phone-ph-education-layer');
}

/**
 * Transition-side boundary for the Lab → Contact acceptance adapters.
 *
 * This keeps the shell registry independent of concrete story transitions
 * while preserving one lazy chunk per adapter.
 */
export function loadLabContactPhoneTransitionAdapter(
  id: LabContactTransitionId
): Promise<LabContactPhoneTransitionAdapterModule> {
  switch (id) {
    case 'lab-ph':
      return import('../../../transitions/lab-ph/phone').then((module) => ({
        id,
        Component: createLabContactTransitionMigrationBridge(
          module.PhoneLabPhTransition,
          'legacy-lab-contact-lab-ph',
          {
            render: (props, _direction, progress) => {
              module.applyPhoneLabPhFrame(
                props.from, props.to, progress, props.reducedMotion
              );
            }
          }
        )
      }));
    case 'ph-education':
      return import('../../../transitions/ph-education/phone').then((module) => ({
        id,
        Component: createLabContactTransitionMigrationBridge(
          module.PhonePhEducationTransition,
          'legacy-lab-contact-ph-education',
          {
            render: (props, direction, progress) => {
              if (direction === -1) {
                module.applyPhonePhEducationReverseFrame(
                  props.to, progress, props.reducedMotion
                );
              } else {
                module.applyPhonePhEducationFrame(
                  props.from, props.to, progress,
                  { reducedMotion: props.reducedMotion }
                );
              }
            },
            enter: (props) => setEducationDocumentLayer(props.to, true),
            reverse: (props) => setEducationDocumentLayer(props.to, true),
            leave: (props, direction) => {
              if (direction === 1) {
                module.settlePhonePhEducationDocumentFlow(props.from, props.to);
              }
              setEducationDocumentLayer(props.to, false);
            },
            dispose: (props) => setEducationDocumentLayer(props.to, false)
          }
        )
      }));
    case 'education-crane':
      return import('../../../transitions/education-crane/phone').then(({
        PhoneEducationCraneTransition: Component
      }) => ({ id, Component: Component as unknown as PhoneTransitionAdapterComponent }));
    case 'crane-contact':
      return import('../../../transitions/crane-contact/phone').then(({
        PhoneCraneContactTransition: Component
      }) => ({ id, Component: Component as unknown as PhoneTransitionAdapterComponent }));
  }
}

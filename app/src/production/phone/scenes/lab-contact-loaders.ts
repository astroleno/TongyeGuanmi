import {
  createElement,
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type ComponentType
} from 'react';
import type {
  LabContactPhoneSceneAdapterModule,
  LabContactSceneId
} from '../lab-contact-types';
import type {
  PhoneSceneAdapterComponent,
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
} from '../types';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../phone-story/presentation';

type PhoneCleanLeaf = ComponentType<Readonly<{ reports: PhoneLeafReportPort }>>;

function createLabContactSceneMigrationBridge(
  Leaf: PhoneCleanLeaf,
  label: string,
  activationSurfaceIds: readonly string[] = []
): PhoneSceneAdapterComponent {
  return forwardRef<PhoneSceneAdapterHandle, PhoneSceneAdapterProps>(
    function LabContactSceneMigrationBridge(props, forwardedRef) {
      const registrationRef = useRef<PhoneLeafMountRegistration | null>(null);
      const readyRef = useRef(props.onReady);
      const generationRef = useRef(0);
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
      const enter = () => {
        const commands = registrationRef.current?.commands;
        commands?.settle(1);
        if (!commands || activationSurfaceIds.length === 0) return;
        const invocation = commands.activate({
          invocationId: `${label}:activate`,
          surfaceIds: activationSurfaceIds,
          credit: 'physical-epoch'
        });
        for (const settlement of invocation.settlements) {
          if (settlement.status === 'pending') {
            void settlement.settled.catch(() => undefined);
          }
        }
      };
      useLayoutEffect(() => {
        if (props.active) enter();
        else registrationRef.current?.commands.pause('hidden');
      }, [props.active]);
      useImperativeHandle(forwardedRef, () => ({
        root: () => registrationRef.current?.root ?? null,
        update: (progress) => registrationRef.current?.commands.render(progress),
        enter,
        leave: () => registrationRef.current?.commands.pause('outside-closure'),
        reverse: enter,
        dispose: () => registrationRef.current?.commands.dispose('closure-retired')
      }), []);
      return createElement(Leaf, { reports });
    }
  );
}

/**
 * Scene-side boundary for the Lab → Contact acceptance adapters.
 *
 * `module-loaders.ts` remains a shell registry: scene chunks live behind this
 * adapter boundary so neither the desktop entry nor the phone shell imports
 * any of these production scene implementations eagerly.
 */
export function loadLabContactPhoneSceneAdapter(
  id: LabContactSceneId
): Promise<LabContactPhoneSceneAdapterModule> {
  switch (id) {
    case 'lab':
      return import('../../../scenes/lab/phone/PhoneLab').then(({ PhoneLab: Component }) => ({
        id,
        Component: createLabContactSceneMigrationBridge(Component, 'legacy-lab-contact-lab')
      }));
    case 'ph-animation':
      return import('../../../scenes/ph-animation/phone/PhonePh').then(({ PhonePh: Component }) => ({
        id,
        Component: createLabContactSceneMigrationBridge(
          Component, 'legacy-lab-contact-ph', ['ph-figure-video']
        )
      }));
    case 'education':
      return import('../../../scenes/education/phone/PhoneEducation').then(({
        PhoneEducation: Component
      }) => ({
        id,
        Component: createLabContactSceneMigrationBridge(
          Component, 'legacy-lab-contact-education'
        )
      }));
    case 'crane-animation':
      return import('../../../scenes/crane-animation/phone/PhoneCrane').then(({
        PhoneCrane: Component
      }) => ({
        id,
        Component: createLabContactSceneMigrationBridge(
          Component,
          'legacy-lab-contact-crane',
          ['crane-figure-video', 'crane-flock-video']
        )
      }));
    case 'contact':
      return import('../../../scenes/contact/phone/PhoneContact').then(({
        PhoneContact: Component
      }) => ({
        id,
        Component: createLabContactSceneMigrationBridge(
          Component, 'legacy-lab-contact-contact'
        )
      }));
  }
}

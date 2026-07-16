type InputControllerModule = typeof import('./input-controller');
type InputControllerImporter = () => Promise<InputControllerModule>;

export function createInputControllerLoader(
  importModule: InputControllerImporter = () => import('./input-controller')
) {
  let cached: Promise<InputControllerModule> | undefined;

  const load = (): Promise<InputControllerModule> => {
    if (cached) {
      return cached;
    }
    const promise = importModule();
    cached = promise;
    void promise.catch(() => {
      if (cached === promise) {
        cached = undefined;
      }
    });
    return promise;
  };

  return {
    load,
    prewarm(): void {
      void load().catch(() => undefined);
    }
  };
}

const inputControllerLoader = createInputControllerLoader();

export const loadInputController = inputControllerLoader.load;
export const prewarmInputController = inputControllerLoader.prewarm;

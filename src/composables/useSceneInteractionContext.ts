import { computed, inject, provide, type ComputedRef } from 'vue'

export interface SceneInteractionContext {
  pretextInteractive: ComputedRef<boolean>
}

const sceneInteractionKey = Symbol('scene-interaction-context')

export const provideSceneInteractionContext = (context: SceneInteractionContext) => {
  provide(sceneInteractionKey, context)
}

export const useSceneInteractionContext = (): SceneInteractionContext =>
  inject(sceneInteractionKey, {
    pretextInteractive: computed(() => true),
  })

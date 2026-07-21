import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import {
  phoneEdgeSurfaceForScene,
  type PhoneEdgeScene
} from './phone-edge-surface';

/** One publisher owns the document, persistent host, and Safari theme edge. */
export function usePhoneEdgeSurface(
  rootRef: RefObject<HTMLElement | null>,
  viewportHostRef: RefObject<HTMLElement | null>
): (scene: PhoneEdgeScene) => void {
  const edgeSceneRef = useRef<PhoneEdgeScene>('hero');
  const publish = useCallback((scene: PhoneEdgeScene) => {
    const documentElement = document.documentElement;
    const root = rootRef.current;
    const viewportHost = viewportHostRef.current;
    if (
      edgeSceneRef.current === scene
      && root?.dataset.portraitEdgeScene === scene
      && documentElement.dataset.portraitEdgeScene === scene
      && viewportHost?.dataset.portraitEdgeScene === scene
    ) {
      return;
    }
    edgeSceneRef.current = scene;
    const surface = phoneEdgeSurfaceForScene(scene);
    const themeColorMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );
    documentElement.style.setProperty('--portrait-document-surface', surface);
    documentElement.dataset.portraitEdgeScene = scene;
    if (root) {
      root.style.setProperty('--portrait-edge-surface', surface);
      root.dataset.portraitEdgeSurface = surface;
      root.dataset.portraitEdgeScene = scene;
    }
    if (viewportHost) viewportHost.dataset.portraitEdgeScene = scene;
    if (themeColorMeta) themeColorMeta.content = surface;
  }, [rootRef, viewportHostRef]);

  useLayoutEffect(() => {
    const documentElement = document.documentElement;
    const themeColorMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );
    const previousDocumentSurface = documentElement.style.getPropertyValue(
      '--portrait-document-surface'
    );
    const previousDocumentEdgeScene = documentElement.dataset.portraitEdgeScene;
    const previousThemeColor = themeColorMeta?.content;
    publish(edgeSceneRef.current);
    return () => {
      if (previousDocumentSurface) {
        documentElement.style.setProperty(
          '--portrait-document-surface',
          previousDocumentSurface
        );
      } else {
        documentElement.style.removeProperty('--portrait-document-surface');
      }
      if (previousDocumentEdgeScene) {
        documentElement.dataset.portraitEdgeScene = previousDocumentEdgeScene;
      } else {
        delete documentElement.dataset.portraitEdgeScene;
      }
      if (themeColorMeta && previousThemeColor !== undefined) {
        themeColorMeta.content = previousThemeColor;
      }
    };
  }, [publish]);

  return publish;
}

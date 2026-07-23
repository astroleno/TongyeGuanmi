import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import {
  phoneEdgeSurfaceForScene,
  type PhoneEdgeScene,
  type PhoneEdgeSurfaceProfile
} from './phone-edge-surface';

/** One publisher owns the document, persistent host, and Safari theme edge. */
export function usePhoneEdgeSurface(
  rootRef: RefObject<HTMLElement | null>,
  viewportHostRef: RefObject<HTMLElement | null>,
  profile: PhoneEdgeSurfaceProfile = 'baseline'
): (scene: PhoneEdgeScene) => void {
  const edgeSceneRef = useRef<PhoneEdgeScene>('hero');
  const publish = useCallback((scene: PhoneEdgeScene) => {
    const documentElement = document.documentElement;
    const root = rootRef.current;
    const viewportHost = viewportHostRef.current;
    const surface = phoneEdgeSurfaceForScene(scene, profile);
    const themeColorMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );
    if (
      edgeSceneRef.current === scene
      && root?.dataset.portraitEdgeScene === scene
      && root?.dataset.portraitEdgeSurface === surface
      && documentElement.dataset.portraitEdgeScene === scene
      && documentElement.style.getPropertyValue('--portrait-document-surface') === surface
      && viewportHost?.dataset.portraitEdgeScene === scene
      && (!themeColorMeta || themeColorMeta.content === surface)
    ) {
      return;
    }
    edgeSceneRef.current = scene;
    documentElement.style.setProperty('--portrait-document-surface', surface);
    documentElement.dataset.portraitEdgeScene = scene;
    if (root) {
      root.style.setProperty('--portrait-edge-surface', surface);
      root.dataset.portraitEdgeSurface = surface;
      root.dataset.portraitEdgeScene = scene;
    }
    if (viewportHost) viewportHost.dataset.portraitEdgeScene = scene;
    if (themeColorMeta) themeColorMeta.content = surface;
  }, [profile, rootRef, viewportHostRef]);

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

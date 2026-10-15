import { StoryScrollShell } from '../StoryScrollShell';
import { createDesktopScrollPlatform } from './scroll-platform';

export function DesktopStoryShell() {
  return <StoryScrollShell platform="desktop" createPlatform={createDesktopScrollPlatform} />;
}

import { homepageAliases } from '../src/homepage/homepage.aliases.mjs';
import { homepageAssets } from '../src/homepage/homepage.assets.mjs';
import { figure2InternalSteps, homepageSceneOrder, homepageScenes } from '../src/homepage/homepage.scenes.mjs';
import { homepageSegmentOrder, homepageSegments } from '../src/homepage/homepage.segments.mjs';
import { validateHomepageContract } from '../src/homepage/homepage.schema.mjs';

const { errors, warnings } = validateHomepageContract({
  scenes: homepageScenes,
  sceneOrder: homepageSceneOrder,
  segments: homepageSegments,
  segmentOrder: homepageSegmentOrder,
  aliases: homepageAliases,
  figure2InternalSteps,
  assets: homepageAssets
});

for (const warning of warnings) {
  console.warn(`Warning: ${warning}`);
}

if (errors.length) {
  console.error('SceneRuntime PR1 contract check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('SceneRuntime PR1 contract looks good.');

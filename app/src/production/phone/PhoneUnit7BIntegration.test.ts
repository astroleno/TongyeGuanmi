import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  phoneGroup67RunIsReady,
  phoneGroup67RunTarget,
  phoneGroup67VisibleFallbackEndpoint,
  type PhoneGroup67RunReadiness
} from './PhoneLabContactContinuation';

const shellSource = readFileSync(
  new URL('./PhoneStoryShell.tsx', import.meta.url),
  'utf8'
);
const gradeASource = readFileSync(
  new URL('./PhoneGradeAStory.tsx', import.meta.url),
  'utf8'
);
const continuationSource = readFileSync(
  new URL('./PhoneLabContactContinuation.tsx', import.meta.url),
  'utf8'
);
const stageRailSource = readFileSync(
  new URL('./PhoneStageRail.tsx', import.meta.url),
  'utf8'
);
const methodSource = readFileSync(
  new URL('./scenes/PhoneMethodTop.tsx', import.meta.url),
  'utf8'
);
const inkAdapterSource = readFileSync(
  new URL('./transitions/PhoneInkTransition.tsx', import.meta.url),
  'utf8'
);

const ALL_READY: PhoneGroup67RunReadiness = {
  labBoundary: true,
  ph: true,
  education: true,
  crane: true,
  contact: true,
  labPh: true,
  phEducation: true,
  educationCrane: true,
  craneContact: true
};

describe('formal Unit7-B phone integration', () => {
  it('embeds the continuation without nesting the Unit6 acceptance shell', () => {
    expect(gradeASource).toContain('<PhoneLabContactContinuation');
    expect(gradeASource).not.toContain('PhoneLabContactShell');
    expect(continuationSource).not.toMatch(/<main\b/);
    expect(continuationSource).not.toContain('StoryNav');
    expect(continuationSource).not.toContain('usePhoneViewportGeometry');
    expect(continuationSource).not.toContain('usePhoneEdgeSurface');
  });

  it('keeps one formal main, persistent stage and navigation owner', () => {
    expect(shellSource.match(/<main\b/g)).toHaveLength(1);
    expect(shellSource.match(/<StoryNav\b/g)).toHaveLength(1);
    expect(stageRailSource.match(/data-portrait-stage-host="persistent"/g))
      .toHaveLength(1);
    expect(continuationSource).not.toContain(
      'data-portrait-stage-host="persistent"'
    );
    expect(continuationSource).toContain(
      'createPortal(stageSurfaces, stageHost)'
    );
  });

  it('reuses the exact Unit7-A Lab root and adapter for Lab → PH', () => {
    expect(gradeASource).toContain(
      'onLabBoundaryChange={setLabBoundary}'
    );
    expect(gradeASource).toContain('labBoundary={labBoundary}');
    expect(continuationSource).toContain('from={labBoundary.root}');
    expect(continuationSource).toContain(
      'labBoundaryRef.current?.adapter'
    );
  });

  it('conceals Method document copy with the same Method → Figure2 field', () => {
    expect(methodSource).toContain('methodCopySource={stepsRef.current}');
    expect(gradeASource).toContain('additionalFrom={methodCopySource}');
    expect(inkAdapterSource).toContain('additionalFrom');
  });

  it('claims a visual boundary before waiting for every real receiver', () => {
    const missingEducation = { ...ALL_READY, education: false };
    const missingLab = {
      ...ALL_READY,
      labBoundary: false,
      labPh: false
    };
    expect(phoneGroup67RunIsReady(
      'ph-animation',
      false,
      missingEducation
    )).toBe(false);
    expect(phoneGroup67RunIsReady(
      'ph-animation',
      false,
      missingLab
    )).toBe(false);
    expect(phoneGroup67RunIsReady(
      'ph-animation',
      true,
      missingLab
    )).toBe(true);

    const missingContact = { ...ALL_READY, contact: false };
    expect(phoneGroup67RunIsReady(
      'crane-animation',
      false,
      missingContact
    )).toBe(false);
    expect(continuationSource).toMatch(
      /if \(!runIsReady\(run\)\)[\s\S]*requestAnimationFrame/
    );
  });

  it('commits visible media endpoints and the strict reverse target chain', () => {
    expect(phoneGroup67VisibleFallbackEndpoint(1)).toBe(1);
    expect(phoneGroup67VisibleFallbackEndpoint(-1)).toBe(0);
    expect(phoneGroup67RunTarget('ph-animation', 1)).toBe('education');
    expect(phoneGroup67RunTarget('crane-animation', 1)).toBe('contact');
    expect(phoneGroup67RunTarget('crane-animation', -1)).toBe('education');
    expect(phoneGroup67RunTarget('ph-animation', -1)).toBe('lab');
    expect(continuationSource).toContain(
      'phoneGroup67VisibleFallbackEndpoint(run.direction)'
    );
  });

  it('uses the same completion latch for reduced motion and stable Contact', () => {
    expect(continuationSource).toMatch(
      /if \(reducedMotion\) \{\s*commitReducedRun\(run\)/
    );
    expect(continuationSource).toContain(
      "return direction === 1 ? 'contact' : 'education'"
    );
    expect(continuationSource).toContain(
      "data-phone-group67-run=\"idle\""
    );
  });

  it('does not republish Lab while PH or Crane owns an active run', () => {
    expect(continuationSource).not.toMatch(
      /if \(fromLabBoundary\) \{\s*publishScene\('lab'\)/
    );
    expect(continuationSource).toContain(
      'interruptedRun.session.abort('
    );
  });
});

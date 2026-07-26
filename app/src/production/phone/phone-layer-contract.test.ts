import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stageStyles = readFileSync(
  new URL('./PhoneStageRail.css', import.meta.url),
  'utf8'
);
const brandLabStyles = readFileSync(
  new URL('./PhoneBrandLabStory.css', import.meta.url),
  'utf8'
);

describe('phone layer ownership contract', () => {
  it('keeps one fixed edge owner, stage, and semantic endpoint ladder', () => {
    expect(stageStyles).toMatch(
      /stage-rail::before[^}]*z-index:\s*8/s
    );
    expect(stageStyles).toMatch(
      /portrait-scroll-spike__stage\s*\{[^}]*z-index:\s*10/s
    );
    expect(stageStyles).toMatch(
      /phone-surface-role="native-under-stage"[^}]*z-index:\s*9/s
    );
    expect(stageStyles).toMatch(
      /phone-surface-role="native-stable"[^}]*z-index:\s*11/s
    );
    expect(stageStyles).toMatch(
      /phone-surface-role="transition-endpoint"[^}]*z-index:\s*12/s
    );
  });

  it('does not suppress Brand, Services, or Lab behind Grade A', () => {
    expect(brandLabStyles).not.toMatch(
      /\.phone-grade-a[\s\S]*?>\s*\.phone-brand-lab[\s\S]*?z-index:\s*0/
    );
  });
});

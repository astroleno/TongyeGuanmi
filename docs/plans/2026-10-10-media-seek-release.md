# 2026-10-10 media handoff and loading release

## Production identity

- Live site: https://tongye.me/
- Release: `r5-ef69e06`.
- Source: `ef69e06a3c9f6e6624c7beb0acf903afae55e32e`.
- Annotated candidate: `react-refactor-r5-parity-repair-candidate-v55`.
- Tag object: `7f3353dceacfeb838ad41c4e8d25fb25af515f51`.
- Qualified manifest SHA-256: `46609b35907e855e6be6bd8763a9a9b589be1910801e5cd106e537cd3aa67c4f`.
- Artifact tree SHA-256: `ca370e8057000fca50cff9cc6deac63c7984b565c70a0589bcecf128b76e663c`.
- Two-run memory evidence SHA-256: `10f1752dc480180e58bff6bf78c88bcc6c0be27c2923f9e1cc38ae4cb4b54aae`.
- Public manifest bytes matched the packaged manifest after the atomic Alibaba switch. The deployment script's public HTTP/SEO/CDN smoke checks passed.

## Changes

- Shared video timeline preparation and frame ownership fixes prevent stalled handoffs and stale decoded-frame acknowledgements. Late frame callbacks now preserve the latest queued seek, with forward and reverse regression tests.
- Explicit phone retry recreates terminally retired scene resources; normal stable scenes and ordinary rollback retain their existing ownership.
- Loading no longer displays the top navigation or bottom progress/labels. The ink animation, accessibility behavior, and recovery actions remain.

## Validation

- Type checking and lint passed; 185 test files / 1,490 tests passed.
- Clean identity-bound release preparation, architecture/media/build budgets, finalization, and packaging passed.
- All 63 immutable CDN objects uploaded and passed HTTPS/CORS/cache/MIME/Range checks.
- Two isolated desktop Chrome runs completed Hero → Contact → Hero. Maximum browser-tree RSS: 1,274,068,992 bytes; GPU: 320,012,288 bytes; renderer: 665,583,616 bytes. Both runs passed qualification.
- Public Chromium phone emulation, 390 × 844, touch enabled: natural forward scrolling reached Contact from Hero without recorded runtime errors, transaction failures, or recovery. Reverse Contact → Crane → Education → PH → Lab also passed.
- Public desktop Chromium, 1470 × 900: Lab → PH → Lab passed with no recorded runtime errors. Rendered PH and phone Contact screenshots were inspected; pages were nonblank and had no framework error overlays.
- Public loading check: navigation absent, loader `::before`/`::after` content both `none`. The initial loading screenshot precedes visible ink and is not used as evidence of ink-animation appearance.
- Local phone fault injection deliberately failed both a transition and rollback. Clicking the real retry control restored stable Crane with both videos ready; a subsequent Crane → Contact → Crane cycle passed. Node replacement is covered by the component regression test.

## Withdrawn v54 attempt

Candidate v54 (`d30efd2825f2c80b7ed672be38aecd3075ca4fd3`) passed release gates but failed additional public phone testing at the Education/Crane portion of the sequence. The site was immediately rolled back to `r5-a4ba76c`; v54 was not accepted as the final delivery.

The subsequent investigation proved two independent bugs (obsolete seek replacement and reuse of retired resources on retry). The original intermittent public failure was not conclusively attributed to either bug. v55's clean public forward/reverse checks passed after both fixes. No readiness assertion, architecture boundary, or performance limit was relaxed.

## Remaining limits

- Browser phone emulation is not a physical iPhone Safari/Chrome pass. A real-device checkpoint remains unverified.
- Phone shell JavaScript is 665,226 / 665,600 bytes (374 bytes remaining); initial CSS is 76,767 / 76,800 bytes (33 bytes remaining). Both hard gates pass, but headroom is very small.
- v54 and v55 packages and versioned media are retained. The prior production release remains available for rollback.

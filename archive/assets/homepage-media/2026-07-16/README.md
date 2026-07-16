# Homepage media archive — 2026-07-16

## Figure2 four-surface replacement

The four former production Figure2 WebM files were moved here when the accepted single-surface bidirectional asset became canonical:

| Archived file | Bytes | SHA-256 |
| --- | ---: | --- |
| `replaced/figure2-left-motion.webm` | 4,063,470 | `9e58707c959d9111af1f1ea2420855292a0449862dc68c93298efc48866597a4` |
| `replaced/figure2-right-motion.webm` | 3,578,198 | `7dbd981ccdda04a2ca0d598fdcc878151ec0c9b6a375249f38cc0ca30d2be737` |
| `replaced/figure2-left-motion-reverse.webm` | 4,366,640 | `cab4465ae951700382d1930dc47ddb39d801b8f38479cf6d8a5a225b91de4f32` |
| `replaced/figure2-right-motion-reverse.webm` | 3,918,503 | `fd0c874c1483024c9d446d7339599bde9e0b5e63e36985b7c75240f6933e35d9` |

The archived set totals 15,926,811 bytes. Production now uses `assets/figure2-pair-motion.webm`: 4,940,268 bytes, SHA-256 `a87db407fd39f6977aa0b663ffd16e54929259e6651728997f7c072a33ffaa80`, with forward frames 0–77 and reverse frames 78–155. To restore the old layout, copy all four files back to `assets/` and revert the Figure2 scene, manifest, media contracts, and tests in the same commit; restoring only the files is not a valid runtime rollback.

## PH edge-spill replacement

- `replaced/ph-figure-motion-original.webm` is the original PH animation retained before the active same-name replacement.
- SHA-256: `49e23297a26fa0d6cc3862d6c4123e8090c521bafb3fe718de2ca4fc130169d6`; size: 2,646,001 bytes; 1672×942, 30fps, 46 frames, 1.533s.
- The active `assets/ph-figure-motion.webm` applies luma-preserving green-spill desaturation to the keyed edge while retaining alpha. Its SHA-256 is `678f76a40ccffe6cc2f337bfaa6fa66d4af4f6c70b2860695491cc5003147ab1`.

To restore the original PH asset, copy the archived file back to `assets/ph-figure-motion.webm` and update the media contract hash accordingly.

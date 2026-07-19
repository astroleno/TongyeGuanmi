# Homepage media archive — 2026-07-19

## Pre-compression R5 presentation WebP baseline

This directory preserves the exact 15 production WebP files that existed
before the approved Q95/Alpha-100 presentation-image replacement.

- Baseline branch: `codex/react-refactor-r5-parity-cutover`
- Baseline commit: `f3da79b5d788772bab53def8a0164c6b121ae3a3`
- Baseline asset tree: `6921f3431bb76da89faf4df145e2b7b9eb275aa3`
- Archived files: 15
- Archived bytes: 15,081,218
- Archive root: `pre-compression-r5/assets/`
- Copy verification before replacement: byte-for-byte `cmp`, 15/15 passed
- Post-replacement isolated restore drill: 15/15 files and 15,081,218 bytes
  matched the immutable baseline commit by SHA-256

The production-relative path below `assets/` is preserved. To restore one
file, copy its archived counterpart back to the same `assets/**` path and
update the frozen media contract to the archived SHA and byte count. Restoring
all 15 files returns the presentation WebP family to the exact pre-compression
R5 baseline.

No WebM or HEVC Alpha file is part of this replacement. Those production bytes
remain unchanged.

The post-replacement drill copied the entire archive to a fresh
`/tmp/tongye-webp-restore.*` directory, then compared every restored file with
`f3da79b5d788772bab53def8a0164c6b121ae3a3:<production-path>`. It did not write
the archived bytes back into production `assets/`.

| Production path | Bytes | SHA-256 |
| --- | ---: | --- |
| `assets/hero-figure-poster.webp` | 561678 | `3fd1ceb4011892932a941c05f0d2d04c2859898256f0f97c8523046258c183df` |
| `assets/back2.webp` | 2264544 | `6689995f21cdd1cc2165e4b5b2f23d851c8ddff0a2f96caaf1adf2fe9f8c01e7` |
| `assets/ph_background.webp` | 2305060 | `0ea983a861a30f82b76ad8584ed8999846313c4f85620b84d9eed9640a646c6d` |
| `assets/ph_front-alpha.webp` | 1240376 | `9ad9c64f92e6389d9a0b7505be0d34704ed3492937e25589e67afaa9357d8c16` |
| `assets/aod_cloud-alpha.webp` | 1541418 | `c3028a045131af107cc9576ac326fc470a88c4fb2e5d3896120ad901d9509e20` |
| `assets/aod_sun-alpha.webp` | 1452854 | `676d24ccaa0bdaafe29638d73230b4059409909fa32fd4a2650616b1869c823f` |
| `assets/crane1_arch-alpha.webp` | 467798 | `cb3e0bb348bb7c33e1b5dbd11184fa5415c64765c0d0f8bcb0adcce099ffeda2` |
| `assets/crane1_cloud-front2-alpha.webp` | 437396 | `8bc4ec9467f3ca0fa5806dd7d4d7ee870dd3211759d8c8b431d9d0c89e553462` |
| `assets/crane1_cloud1-alpha.webp` | 557270 | `606a225a301fd51673b43ed81fbe314ea460ee10bc8f4cf9e4fd0a139dfb8432` |
| `assets/crane1_cloud2-alpha.webp` | 421534 | `f7d9d1147aea5651559f9f042cb4f1caa0d7b1cf0b54f10c0b2ee98bd0182b64` |
| `assets/patterns/alpha-layers/pattern-layer-alpha-02.webp` | 627728 | `cf73b8e2dc523c17b5c6b19fe4d5d45cc09ca6ae766ecf8be2f3202a8c8f2575` |
| `assets/patterns/alpha-layers/pattern-layer-alpha-03.webp` | 798910 | `495fa3702a952356da1de6f4ecec7869375208605d10dde91acad992478df02b` |
| `assets/patterns/alpha-layers/pattern-layer-alpha-04.webp` | 1219762 | `fd43a74d726c42d360c3c831609ae150eb9095ca5b173f586779741c87fc18d7` |
| `assets/patterns/alpha-layers/pattern-layer-alpha-05.webp` | 489920 | `c26f5115d925e86fc9ba8e450df9a04a6a75f52766dfe987a7053e252e1d0ad9` |
| `assets/patterns/alpha-layers/pattern-layer-alpha-06.webp` | 694970 | `d50ddd8702d4ee90cecd8bf6d9f76a7ca74238c507101d195b58be6f568ebf06` |

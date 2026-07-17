# R5 production release: Alibaba site + Tencent COS/CDN

The production boundary is fixed:

- `tongye.me` and `www.tongye.me` are served by Alibaba Cloud Nginx from `/www/wwwroot/tongye.me/current`.
- `assets.tongye.me` serves versioned images, fonts, SVG, and posters through Tencent CDN backed by COS.
- `media.tongye.me` serves versioned video through Tencent CDN backed by COS.
- The Tencent CVM does not host the Tongye website.

## Current production state

- Active release: `r5-bf355cf`.
- Source commit: `bf355cf06e459cb7da307f87aba8fcd12c189df8`.
- Candidate tag: `react-refactor-r5-parity-repair-candidate-v18`; annotated tag object: `edd4dc24ef23d0a3a05d7f6b4b1a5f7c17feaa71`.
- Qualified release manifest SHA-256: `23857c52e807c725a511008a4c006c734435d1a8e5bc384a696bd046f0363418`; artifact tree SHA-256: `8111681d0263f34100da5b0b86b289818b37388704f7fe501eab30dd8764e1a7`.
- Alibaba symlink: `/www/wwwroot/tongye.me/current -> /www/wwwroot/tongye.me/releases/r5-bf355cf`.
- Tencent CDN inventory: 48 objects and 78,098,690 bytes.
- The eight transparent animations have paired immutable sources: VP9 Alpha WebM remains first on desktop and Android, while iPhone/iPad put `hvc1` HEVC-with-alpha MP4 first and retain WebM as fallback.
- Both CDN domains set `Access-Control-Allow-Origin: *` at the edge. These are public, uncredentialed, content-hashed objects; the edge override prevents cached origin-header variants from tainting Canvas.
- All eight MP4s report `AVMediaCharacteristic.containsAlphaChannel`, preserve at most eight-frame GOPs, and pass the frozen media inventory/deep verifier. The CDN Hero MP4 decoded in iPhone WebKit with alpha extrema `0..255`, 79% fully transparent sampled pixels, and live partial-alpha pixels.
- CDN CORS/cache/MIME/Range, iPhone WebKit source selection and alpha decode, and two-run memory evidence passed. Qualification peaks were 1,365,901,312 bytes for the browser process tree, 341,278,720 bytes for GPU, and 655,867,904 bytes for renderer RSS.
- v18 aligns each segment's target/build readiness budget with its declared media preparation timeout. The public iPhone WebKit Brand → Proof → Figure2 reverse stress path passed 8/8 cold contexts, and the public Hero → Contact → Hero touch spine passed 3/3 cold contexts without `PREPARE_TIMEOUT` or recovery.
- Public `https://tongye.me/`, the qualified release identity, and the `www` redirect pass after the Alibaba atomic switch. A physical iPhone Safari/Chrome pass remains the manual real-device checkpoint; Playwright WebKit is engine-level coverage rather than a claim about a specific handset.

## Release flow

1. When transparent video authorities change, run `pnpm -C app rebuild:media:hevc-alpha` on the frozen macOS/FFmpeg 8.1 toolchain, then run `pnpm -C app verify:media:deep`.
2. Freeze a clean, annotated R5 candidate tag.
3. Set `R5_CANDIDATE_TAG`, `R5_SOURCE_COMMIT`, and `R5_RELEASE_ID=r5-<short-sha>`.
4. Run `pnpm run deploy:prepare`. Vite routes emitted binary assets to versioned CDN URLs at build time; no post-build JavaScript/CSS replacement is allowed.
5. Upload the generated CDN objects and verify CDN HTTPS/CORS/cache/MIME/Range.
6. Run `pnpm run deploy:evidence`, followed by `pnpm run deploy:finalize`, with the same release identity environment.
7. Run `pnpm run deploy:package`.
8. Run `node scripts/deploy-r5-release.mjs --package .release/<release-id>`.
9. The deploy script uploads immutable COS objects first, verifies both CDN domains, stages the site on Alibaba, atomically switches `current`, and rolls back the symlink if the public smoke test fails.

Required server configuration:

```text
/etc/tongye-cdn-cert/secrets.env
  TENCENTCLOUD_SECRET_ID
  TENCENTCLOUD_SECRET_KEY

/etc/tongye-release.env
  TONGYE_ASSETS_COS_BUCKET
  TONGYE_MEDIA_COS_BUCKET
  TONGYE_ASSETS_COS_REGION=ap-shanghai
  TONGYE_MEDIA_COS_REGION=ap-shanghai
```

The Tencent credential must have the minimum object permissions for the two configured bucket prefixes. Certificate-only permission is insufficient.

After a release, remove temporary broad COS/CDN policies and retain only the object-prefix, domain-read/update, and certificate-deployment permissions required by the automation.

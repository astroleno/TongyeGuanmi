# R5 production release: Alibaba site + Tencent COS/CDN

The production boundary is fixed:

- `tongye.me` and `www.tongye.me` are served by Alibaba Cloud Nginx from `/www/wwwroot/tongye.me/current`.
- `assets.tongye.me` serves versioned images, fonts, SVG, and posters through Tencent CDN backed by COS.
- `media.tongye.me` serves versioned video through Tencent CDN backed by COS.
- The Tencent CVM does not host the Tongye website.

## Current production state

- Active release: `r5-06f6e3c`.
- Source commit: `06f6e3cd433fb6817575c79393011fc6ae24eb0f`.
- Candidate tag: `react-refactor-r5-parity-repair-candidate-v16`; annotated tag object: `19d1031ecd51ade10ab03a1c1787e91567fb33d0`.
- Qualified release manifest SHA-256: `24a130c16c188ec2136c414626f46a26cba2bd8a0b540d1837303ac7df314a5b`; artifact tree SHA-256: `f38a19a1c0b0281daf49705000517bf12862af76b0bc8b642380c1ce38feaf09`.
- Alibaba symlink: `/www/wwwroot/tongye.me/current -> /www/wwwroot/tongye.me/releases/r5-06f6e3c`.
- Tencent CDN inventory: 48 objects and 78,098,690 bytes.
- The eight transparent animations have paired immutable sources: VP9 Alpha WebM remains first on desktop and Android, while iPhone/iPad put `hvc1` HEVC-with-alpha MP4 first and retain WebM as fallback.
- Both CDN domains set `Access-Control-Allow-Origin: *` at the edge. These are public, uncredentialed, content-hashed objects; the edge override prevents cached origin-header variants from tainting Canvas.
- All eight MP4s report `AVMediaCharacteristic.containsAlphaChannel`, preserve at most eight-frame GOPs, and pass the frozen media inventory/deep verifier. The CDN Hero MP4 decoded in iPhone WebKit with alpha extrema `0..255`, 79% fully transparent sampled pixels, and live partial-alpha pixels.
- CDN CORS/cache/MIME/Range, iPhone WebKit source selection and alpha decode, two-run memory evidence, and the public Chrome Hero → Contact → Hero traversal passed. Qualification peaks were 1,329,790,976 bytes for the browser process tree, 343,752,704 bytes for GPU, and 649,117,696 bytes for renderer RSS.
- Alibaba still intercepts public HTTP with `403 Server: Beaver / Non-compliance ICP Filing`, and may reset public TLS 1.2 before Nginx. Local origin checks pass HTTP redirect plus TLS 1.2/1.3, so Alibaba access filing for `tongye.me` is the remaining external checkpoint.

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

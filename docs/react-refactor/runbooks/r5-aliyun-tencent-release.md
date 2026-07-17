# R5 production release: Alibaba site + Tencent COS/CDN

The production boundary is fixed:

- `tongye.me` and `www.tongye.me` are served by Alibaba Cloud Nginx from `/www/wwwroot/tongye.me/current`.
- `assets.tongye.me` serves versioned images, fonts, SVG, and posters through Tencent CDN backed by COS.
- `media.tongye.me` serves versioned video through Tencent CDN backed by COS.
- The Tencent CVM does not host the Tongye website.

## Current production state

- Active release: `r5-22ea938`.
- Source commit: `22ea938be33b8031918b188204a1ecf4571616e3`.
- Candidate tag: `react-refactor-r5-parity-repair-candidate-v15`.
- Alibaba symlink: `/www/wwwroot/tongye.me/current -> /www/wwwroot/tongye.me/releases/r5-22ea938`.
- Tencent CDN inventory: 40 objects and 44,619,863 bytes.
- Both CDN domains set `Access-Control-Allow-Origin: *` at the edge. These are public, uncredentialed, content-hashed objects; the edge override prevents cached origin-header variants from tainting Canvas.
- Public HTTPS over TLS 1.3, CDN CORS/cache/MIME/Range, two-run memory evidence, candidate-local iPhone WebKit media-unlock/full-touch traversal, and the public mobile Chromium Hero → Contact path passed.
- Alibaba still intercepts public HTTP with `403 Server: Beaver / Non-compliance ICP Filing`, and may reset public TLS 1.2 before Nginx. Local origin checks pass HTTP redirect plus TLS 1.2/1.3, so Alibaba access filing for `tongye.me` is the remaining external checkpoint.

## Release flow

1. Freeze a clean, annotated R5 candidate tag.
2. Set `R5_CANDIDATE_TAG`, `R5_SOURCE_COMMIT`, and `R5_RELEASE_ID=r5-<short-sha>`.
3. Run `pnpm run deploy:prepare`. Vite routes emitted binary assets to versioned CDN URLs at build time; no post-build JavaScript/CSS replacement is allowed.
4. Upload the generated CDN objects and verify CDN HTTPS/CORS/cache/MIME/Range.
5. Run `pnpm run deploy:evidence`, followed by `pnpm run deploy:finalize`, with the same release identity environment.
6. Run `pnpm run deploy:package`.
7. Run `node scripts/deploy-r5-release.mjs --package .release/<release-id>`.
8. The deploy script uploads immutable COS objects first, verifies both CDN domains, stages the site on Alibaba, atomically switches `current`, and rolls back the symlink if the public smoke test fails.

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

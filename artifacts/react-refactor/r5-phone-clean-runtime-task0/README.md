# R5 phone clean runtime Task 0 evidence archive

This directory preserves the Task 0 donor evidence before later Playwright
runs replace `app/test-results` or the operating system clears `/private/tmp`.

- `raw/` is a local, ignored binary archive. It must remain present through
  final handoff; it is intentionally not committed because it is about 200 MB.
- `manifest.json` maps the 44 report-referenced artifacts from their original
  paths to persistent archive paths and records commit/tool provenance.
- `SHA256SUMS` covers every archived raw file and every preserved source file.
- `sources/` contains the provenance script, formal and v36 recorders/configs,
  the R4 specs/config/helper, and the frozen formal release spec/config.

Verify the archive without rerunning either donor:

```bash
node artifacts/react-refactor/r5-phone-clean-runtime-task0/verify-evidence.mjs
```

Regenerate the inventory only after first verifying that the 44 immutable
report hashes still match:

```bash
node artifacts/react-refactor/r5-phone-clean-runtime-task0/verify-evidence.mjs --write
```

# DICE Berlin Reference

Checked on 2026-05-27.

## Current status

- `https://dice.berlin/` currently redirects to a hosting provider "Account Suspended" page.
- Search indexes still show `https://dice.berlin/?p=1160` as "DICE Archive 2018-2022", but the live host no longer serves the page normally.

## Best available reference

- Case study: https://andrevv.com/work/dice/
- The case study describes the DICE site as WordPress + Three.js + WebGL, with a sculptural fluid identity and an in-browser tool for high-resolution shape exports/recordings.

## Local files

- `DICE-source.mp4`: original case-study video from Contentful.
- `frames/`: extracted still frames from the video.
- `dice-contact-sheet.jpg`: quick contact sheet for reviewing the deformation + typography composition.

## Download command

```bash
curl --fail --location \
  --output reference/dice-berlin/DICE-source.mp4 \
  'https://videos.ctfassets.net/d5ayvrj0vsak/1i1AqeKIWB345PJECsuXr5/3524d8838b578eee711e27c44f05a32a/DICE.mp4'
```

## Archive routes to try

- Wayback calendar: https://web.archive.org/web/*/https://dice.berlin/*
- CDX listing, if Web Archive is reachable from your network:

```bash
curl 'https://web.archive.org/cdx?url=dice.berlin/*&output=json&fl=timestamp,original,statuscode,mimetype&filter=statuscode:200&collapse=urlkey'
```


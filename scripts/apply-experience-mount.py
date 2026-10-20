#!/usr/bin/env python3
"""Atomically mount the immutable qualified v55 donor; never promote main."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import tempfile

SITE = Path('/www/wwwroot/tongye.me')
VHOST = Path('/www/server/panel/vhost/nginx/html_tongye.me.conf')
INCLUDE = Path('/www/server/panel/vhost/nginx/tongye-experience-routes.inc')
BASE_ID = 'r5-ef69e06'
MOUNT_ID = 'experience-v55-20261019-02'
BASE_SHA = '46609b35907e855e6be6bd8763a9a9b589be1910801e5cd106e537cd3aa67c4f'
SOURCE = 'ef69e06a3c9f6e6624c7beb0acf903afae55e32e'
SEO_INCLUDE = '    include /www/server/panel/vhost/nginx/tongye-seo-routes.inc;'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe_name(name):
    value = PurePosixPath(name)
    if value.is_absolute() or '..' in value.parts or str(value) != name or name == '.' or not re.fullmatch(r'[A-Za-z0-9_.\-/]+', name):
        raise ValueError(f'unsafe mount filename: {name}')
    return name


def headers(cache='no-cache', content_type=None):
    content = f'        default_type {content_type};\n' if content_type else ''
    return content + f'''        add_header Cache-Control "{cache}" always;
        add_header Strict-Transport-Security "max-age=31536000" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Tongye-Experience-Mount "{MOUNT_ID}" always;
        add_header X-Tongye-Mount-Manifest "/experience/mount-manifest.json" always;
'''


def exact_file(url, filename, content_type, noindex=False):
    extra = '        add_header X-Robots-Tag "noindex, nofollow" always;\n' if noindex else ''
    # A literal file alias on a slash-ending URI invokes nginx's index module,
    # which appends index.html to the alias filename. Resolve the file through
    # try_files instead; a found file is served in-place, without an internal
    # redirect to our canonical /experience/index.html -> /experience/ handler.
    source = (f'        root {filename.parent};\n        try_files /{filename.name} =404;\n'
              if url.endswith('/') else f'        alias {filename};\n')
    return f'    location = {url} {{\n{source}{headers(content_type=content_type)}{extra}    }}\n'


def render_include(manifest, site=None):
    site = SITE if site is None else site
    mount = site / 'mounts' / MOUNT_ID
    base = site / 'releases' / BASE_ID
    text = '# Routing-only overlay. The qualified donor and CDN objects are immutable.\n'
    # Existing opt-in preview cookies must keep their original document root.
    # Only public traffic takes the temporary homepage redirect. A return-only
    # nginx `if` does not change location processing or create rewrite loops.
    for old in ['/', '/index.html']:
        text += f'''    location = {old} {{
{headers('no-store')}        add_header X-Robots-Tag $tongye_preview_robots always;
        if ($tongye_preview_robots = "") {{ return 302 /experience/$is_args$args; }}
        try_files /index.html =404;
    }}
'''
    for old, code, target in [('/experience', 301, '/experience/'), ('/experience/index.html', 301, '/experience/'),
                              ('/experience/brand-lab/', 301, '/experience/brand-lab')]:
        text += f'    location = {old} {{\n{headers("no-store")}        return {code} {target}$is_args$args;\n    }}\n'
    text += exact_file('/experience/', mount / 'index.html', 'text/html')
    text += exact_file('/experience/brand-lab', mount / 'index.html', 'text/html', True)
    for item in manifest['assetOverrides']:
        name = safe_name(item['path'])
        text += exact_file('/experience/' + name, mount / name, 'application/javascript')
    for name in ['manifest.webmanifest', 'manifest.json', 'site.webmanifest']:
        text += exact_file('/experience/' + name, mount / name, 'application/manifest+json')
    text += exact_file('/experience/mount-manifest.json', mount / 'mount-manifest.json', 'application/json')
    # This is deliberately the unmodified donor identity used by its recovery
    # controller. The separate mount manifest describes every routing override.
    text += exact_file('/experience/r5-release-manifest.json', base / 'r5-release-manifest.json', 'application/json')
    text += exact_file('/experience/release-id.txt', base / 'release-id.txt', 'text/plain')
    for name in ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']:
        content_type = 'image/svg+xml' if name.endswith('.svg') else 'image/png' if name.endswith('.png') else 'image/x-icon'
        text += exact_file('/experience/' + name, base / name, content_type)
    text += f'''    location ^~ /experience/assets/ {{
        alias {base}/assets/;
{headers('public, max-age=31536000, immutable')}    }}
    location ^~ /experience/ {{
        return 404;
    }}
'''
    return text


def adapt_vhost(source, include=None):
    include = INCLUDE if include is None else include
    if source.count(SEO_INCLUDE) != 1 or 'tongye-experience-routes.inc' in source:
        raise ValueError('unexpected or already migrated vhost')
    # Preserve TLS, preview cookies, public service/FAQ routes and root assets.
    pattern = r'    location = /index\.html \{[^{}]*\n    \}\n'
    matches = list(re.finditer(pattern, source))
    if len(matches) != 1 or 'try_files $uri =404;' not in matches[0].group():
        raise ValueError('unexpected original index handler')
    source = source[:matches[0].start()] + source[matches[0].end():]
    return source.replace(SEO_INCLUDE, f'    include {include};\n{SEO_INCLUDE}')


def atomic_write(filename, data, owner=None):
    filename.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix='.' + filename.name + '-', dir=filename.parent)
    try:
        with os.fdopen(handle, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, stat.S_IMODE(owner.st_mode) if owner else 0o644)
        if owner:
            os.chown(temporary, owner.st_uid, owner.st_gid)
        os.replace(temporary, filename)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def command(args):
    subprocess.run(args, check=True, timeout=45)


def apply(staging, expected_vhost_sha):
    current = (SITE / 'current').resolve()
    base = SITE / 'releases' / BASE_ID
    if current != base or digest((base / 'r5-release-manifest.json').read_bytes()) != BASE_SHA:
        raise ValueError('production is no longer the inspected v55 donor')
    original = VHOST.read_bytes()
    if digest(original) != expected_vhost_sha:
        raise ValueError('vhost changed since inspection; refusing to overwrite')
    if INCLUDE.exists():
        raise ValueError('existing mount include requires explicit inspection')
    manifest_bytes = (staging / 'mount-manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    if (manifest['mountId'], manifest['baseRelease'], manifest['baseSourceCommit'], manifest['baseManifestSha256']) != (MOUNT_ID, BASE_ID, SOURCE, BASE_SHA):
        raise ValueError('mount donor identity mismatch')
    for entry in manifest['files']:
        name = safe_name(entry['path'])
        data = (staging / name).read_bytes()
        if len(data) != entry['bytes'] or digest(data) != entry['sha256']:
            raise ValueError('mount file identity mismatch: ' + name)
    for entry in manifest['assetOverrides']:
        if digest((base / safe_name(entry['path'])).read_bytes()) != entry['baseSha256']:
            raise ValueError('server donor changed: ' + entry['path'])
    target = SITE / 'mounts' / MOUNT_ID
    backup = SITE / 'route-backups' / MOUNT_ID
    if target.exists() or backup.exists():
        raise ValueError('mount or backup already exists; never overwrite a previous transaction')
    candidate = adapt_vhost(original.decode())
    metadata = VHOST.stat()
    backup.mkdir(parents=True, mode=0o700)
    atomic_write(backup / 'vhost.before.conf', original, metadata)
    record = {'mountId': MOUNT_ID, 'beforeSha256': digest(original), 'afterSha256': digest(candidate.encode()),
              'baseRelease': BASE_ID, 'mountManifestSha256': digest(manifest_bytes), 'state': 'prepared'}
    atomic_write(backup / 'transaction.json', (json.dumps(record, indent=2) + '\n').encode())
    target.mkdir(parents=True)
    for entry in manifest['files'] + [{'path': 'mount-manifest.json'}]:
        name = safe_name(entry['path'])
        atomic_write(target / name, (staging / name).read_bytes())
    atomic_write(INCLUDE, render_include(manifest).encode())
    # Recheck immediately before changing the active vhost. If someone edited
    # it while we staged files, leave that edit and all active routing alone.
    if VHOST.read_bytes() != original or (SITE / 'current').resolve() != base:
        record['state'] = 'aborted-concurrent-change'
        atomic_write(backup / 'transaction.json', (json.dumps(record, indent=2) + '\n').encode())
        raise ValueError('production changed while staging; active config was not replaced')
    try:
        atomic_write(VHOST, candidate.encode(), metadata)
        command(['nginx', '-t'])
        command(['systemctl', 'reload', 'nginx'])
    except BaseException:
        if digest(VHOST.read_bytes()) != record['afterSha256']:
            raise RuntimeError('vhost changed externally after apply; refusing to overwrite it')
        atomic_write(VHOST, original, metadata)
        command(['nginx', '-t'])
        command(['systemctl', 'reload', 'nginx'])
        record['state'] = 'rolled-back-after-error'
        atomic_write(backup / 'transaction.json', (json.dumps(record, indent=2) + '\n').encode())
        raise
    record['state'] = 'applied-awaiting-public-smoke'
    atomic_write(backup / 'transaction.json', (json.dumps(record, indent=2) + '\n').encode())
    print(json.dumps(record))


def rollback():
    backup = SITE / 'route-backups' / MOUNT_ID
    record = json.loads((backup / 'transaction.json').read_text())
    if digest(VHOST.read_bytes()) != record['afterSha256']:
        raise ValueError('vhost has another change; refusing to overwrite it during rollback')
    active_mount(record)
    original = (backup / 'vhost.before.conf').read_bytes()
    if digest(original) != record['beforeSha256']:
        raise ValueError('rollback backup identity mismatch')
    atomic_write(VHOST, original, VHOST.stat())
    command(['nginx', '-t'])
    command(['systemctl', 'reload', 'nginx'])
    record['state'] = 'rolled-back'
    atomic_write(backup / 'transaction.json', (json.dumps(record, indent=2) + '\n').encode())
    print(json.dumps(record))


def active_mount(record):
    manifest_bytes = (SITE / 'mounts' / MOUNT_ID / 'mount-manifest.json').read_bytes()
    if digest(manifest_bytes) != record['mountManifestSha256']:
        raise ValueError('active mount manifest changed')
    include_sha = digest(render_include(json.loads(manifest_bytes)).encode())
    if digest(INCLUDE.read_bytes()) != include_sha:
        raise ValueError('active route include has another change; refusing to overwrite it')
    return include_sha


def verify(receipt):
    """Record a completed external HTTP check without claiming R5 qualification."""
    backup = SITE / 'route-backups' / MOUNT_ID
    record = json.loads((backup / 'transaction.json').read_text())
    report_bytes = receipt.read_bytes()
    report = json.loads(report_bytes)
    if report.get('mountId') != MOUNT_ID or report.get('origin') != 'https://tongye.me' or report.get('status') != 'passed':
        raise ValueError('not a successful public routing smoke report')
    if record['state'] != 'applied-awaiting-public-smoke' or digest(VHOST.read_bytes()) != record['afterSha256']:
        raise ValueError('active configuration differs from the applied transaction')
    include_sha = active_mount(record)
    checks = report.get('checks', [])
    for url, status in [('https://tongye.me/?from=route-check', 302), ('https://tongye.me/experience/', 200),
                        ('https://tongye.me/experience/r5-release-manifest.json', 200)]:
        if not any(item.get('url') == url and item.get('status') == status for item in checks):
            raise ValueError('missing required routing smoke result: ' + url)
    atomic_write(backup / 'http-smoke.json', report_bytes)
    record.update(state='applied-http-verified', includeSha256=include_sha,
                  httpSmokeSha256=digest(report_bytes), verifiedAt=report['completedAt'])
    atomic_write(backup / 'transaction.json', (json.dumps(record, indent=2) + '\n').encode())
    print(json.dumps(record))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['apply', 'rollback', 'verify'])
    parser.add_argument('--staging', type=Path)
    parser.add_argument('--expected-vhost-sha')
    parser.add_argument('--receipt', type=Path)
    args = parser.parse_args()
    if args.action == 'apply':
        if args.staging is None or not re.fullmatch(r'[0-9a-f]{64}', args.expected_vhost_sha or ''):
            parser.error('apply requires staging and the inspected vhost SHA-256')
        apply(args.staging.resolve(), args.expected_vhost_sha)
    elif args.action == 'rollback':
        rollback()
    else:
        if args.receipt is None:
            parser.error('verify requires a successful public HTTP smoke receipt')
        verify(args.receipt)

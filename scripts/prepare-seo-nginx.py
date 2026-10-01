#!/usr/bin/env python3
"""Prepare a scoped vhost update; retain TLS, preview maps, and preview routes."""
import argparse
from pathlib import Path
import re

INCLUDE = '    include /www/server/panel/vhost/nginx/tongye-seo-routes.inc;'


def prepare(source: str) -> str:
    if source.count('server_name tongye.me;') != 1:
        raise ValueError('Expected exactly one canonical tongye.me HTTPS vhost')
    # Only the explicitly known fallback is eligible for migration. Fail closed
    # if an operator has introduced a different routing policy.
    old = 'try_files $uri $uri/ /index.html;'
    new = 'try_files $uri $uri/ =404;'
    if source.count(old) == 1:
        source = source.replace(old, new)
    elif source.count(new) != 1:
        raise ValueError('Unrecognized public fallback; refusing to rewrite vhost')
    if INCLUDE not in source:
        marker = '    location = /index.html {'
        if source.count(marker) != 1:
            raise ValueError('Expected exactly one homepage location')
        # A standalone vhost may not have the optional preview map installed.
        default = '' if '$tongye_preview_robots' in source else '    set $tongye_preview_robots "";\n'
        source = source.replace(marker, f'{default}{INCLUDE}\n\n{marker}')
    if len(re.findall(r'tongye-seo-routes\.inc;', source)) != 1:
        raise ValueError('Duplicate SEO routing includes')
    homepage_pattern = re.compile(r'(location = /index\.html \{[^{}]*?)add_header Cache-Control "no-cache, no-store, must-revalidate";([^{}]*?\})')
    source, replacements = homepage_pattern.subn(
        r'\1add_header Cache-Control "public, max-age=0, must-revalidate";\2',
        source
    )
    if replacements == 0 and 'add_header Cache-Control "public, max-age=0, must-revalidate";' not in source:
        marker = '    location = /index.html {'
        if source.count(marker) != 1:
            raise ValueError('Expected exactly one homepage location')
        source = source.replace(
            marker,
            f'{marker}\n        add_header Cache-Control "public, max-age=0, must-revalidate";'
        )
    if replacements > 1:
        raise ValueError('Duplicate homepage cache policies')
    return source


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.write_text(prepare(args.source.read_text()))

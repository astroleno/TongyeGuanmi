#!/usr/bin/env python3
"""Install opt-in preview routing on the existing origin; never promote current."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys

release = sys.argv[1]
if not re.fullmatch(r"r5-smooth-[0-9]{8}-[0-9]{2}", release):
    raise SystemExit("invalid preview identity")
site = Path('/www/wwwroot/tongye.me')
preview = site / 'previews' / release
if not (preview / 'preview-identity.json').is_file():
    raise SystemExit('preview artifact is not staged')
config = Path('/www/server/panel/vhost/nginx/html_tongye.me.conf')
mapping = config.with_name('tongye-public-preview-map.conf')
registry = site / 'previews' / 'routes.json'
paths = [config, mapping, registry]
originals = {p: p.read_bytes() if p.exists() else None for p in paths}
routes = json.loads(registry.read_text()) if registry.exists() else []
if release not in routes:
    routes.append(release)
if any(not re.fullmatch(r'r5-smooth-[0-9]{8}-[0-9]{2}', item) for item in routes):
    raise SystemExit('invalid existing preview registry')

def atomic_write(file, data):
    temporary = file.with_suffix(file.suffix + '.preview-tmp')
    temporary.write_text(data)
    os.replace(temporary, file)

source = config.read_text()
if 'root /www/wwwroot/tongye.me/current;' in source:
    source = source.replace('root /www/wwwroot/tongye.me/current;', 'root $tongye_site_root;')
elif 'root $tongye_site_root;' not in source:
    raise SystemExit('unexpected production root; refusing to edit')
marker = '# BEGIN TONGYE PUBLIC PREVIEW'
end_marker = '# END TONGYE PUBLIC PREVIEW'
block = [marker]
for item in routes:
    block.extend([
        f'    location = /__preview/{item}/ {{',
        f'        add_header Set-Cookie "tongye_preview={item}; Path=/; Max-Age=7200; Secure; HttpOnly; SameSite=Lax" always;',
        '        add_header Cache-Control "no-store" always;',
        '        add_header X-Robots-Tag "noindex, nofollow" always;',
        '        return 302 https://tongye.me/;',
        '    }'
    ])
block.extend([
    '    location = /__preview/off/ {',
    '        add_header Set-Cookie "tongye_preview=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax" always;',
    '        add_header Cache-Control "no-store" always;',
    '        return 302 https://tongye.me/;',
    '    }', end_marker
])
if marker in source:
    source = re.sub(re.escape(marker) + r'.*?' + re.escape(end_marker), '\n'.join(block), source, flags=re.S)
else:
    source = source.replace('    location = /index.html {', '    ' + '\n'.join(block) + '\n\n    location = /index.html {')
if '$tongye_preview_robots always' not in source:
    source = source.replace('    location = /index.html {', '    location = /index.html {\n        add_header X-Robots-Tag $tongye_preview_robots always;')
maps = ['map $cookie_tongye_preview $tongye_site_root {', f'    default {site}/current;']
maps += [f'    {item} {site}/previews/{item};' for item in routes]
maps += ['}', 'map $cookie_tongye_preview $tongye_preview_robots {', '    default "";']
maps += [f'    {item} "noindex, nofollow";' for item in routes]
maps += ['}', '']
try:
    atomic_write(mapping, '\n'.join(maps))
    atomic_write(config, source)
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    atomic_write(registry, json.dumps(routes, indent=2) + '\n')
except BaseException:
    for file, content in originals.items():
        if content is None:
            file.unlink(missing_ok=True)
        else:
            file.write_bytes(content)
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    raise
print(json.dumps({'preview': release, 'url': f'https://tongye.me/__preview/{release}/',
                  'production': str((site / 'current').resolve())}))

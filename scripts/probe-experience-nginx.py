#!/usr/bin/env python3
"""Exercise the real nginx handler in an isolated loopback-only process."""
import argparse
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time

spec = importlib.util.spec_from_file_location('mount', Path(__file__).with_name('apply-experience-mount.py'))
mount = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mount)


def probe(staging):
    manifest = json.loads((staging / 'mount-manifest.json').read_text())
    assert manifest['mountId'] == mount.MOUNT_ID
    base = mount.SITE / 'releases' / mount.BASE_ID
    assert mount.digest((base / 'r5-release-manifest.json').read_bytes()) == mount.BASE_SHA
    donor = json.loads((base / 'r5-release-manifest.json').read_text())
    with socket.socket() as reserved:
        reserved.bind(('127.0.0.1', 0))
        port = reserved.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='tongye-route-nginx-probe-') as directory:
        root = Path(directory)
        os.chmod(root, 0o755)
        (root / 'logs').mkdir()
        site = root / 'site'
        (site / 'releases').mkdir(parents=True)
        (site / 'mounts').mkdir()
        (site / 'releases' / mount.BASE_ID).symlink_to(base)
        (site / 'mounts' / mount.MOUNT_ID).symlink_to(staging)
        config = root / 'nginx.conf'
        mount.atomic_write(config, f'''pid {root}/nginx.pid;
error_log {root}/error.log notice;
events {{ worker_connections 64; }}
http {{
    lua_package_path "/www/server/nginx/lib/lua/?.lua;;";
    include /www/server/nginx/conf/mime.types;
    access_log off;
    server {{
        listen 127.0.0.1:{port};
        server_name localhost;
        set $tongye_preview_robots "";
        root {base};
{mount.render_include(manifest, site)}
    }}
}}
'''.encode())
        args = ['nginx', '-p', str(root) + '/', '-c', str(config)]
        subprocess.run(args + ['-t'], check=True, timeout=10)
        process = subprocess.Popen(args + ['-g', 'daemon off; master_process off;'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        count = 0
        try:
            deadline = time.monotonic() + 5
            while True:
                if process.poll() is not None:
                    raise RuntimeError(process.communicate()[1].decode())
                try:
                    with socket.create_connection(('127.0.0.1', port), timeout=0.2):
                        break
                except OSError:
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(0.05)

            def check(url, expected=200, sha=None, location=None):
                nonlocal count
                connection = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
                try:
                    connection.request('GET', url)
                    response = connection.getresponse()
                    data = response.read()
                    assert response.status == expected, (url, response.status, data[:120])
                    if sha:
                        assert hashlib.sha256(data).hexdigest() == sha, url
                    if location:
                        assert response.getheader('location').endswith(location), url
                    count += 1
                finally:
                    connection.close()

            check('/?from=probe', 302, location='/experience/?from=probe')
            check('/experience', 301, location='/experience/')
            check('/experience/index.html', 301, location='/experience/')
            overrides = {item['path']: item for item in manifest['files']}
            check('/experience/', sha=overrides['index.html']['sha256'])
            check('/experience/brand-lab', sha=overrides['index.html']['sha256'])
            check('/experience/r5-release-manifest.json', sha=mount.BASE_SHA)
            for item in donor['files']:
                if item['path'].startswith('assets/') and item['path'].endswith(('.js', '.css')):
                    check('/experience/' + item['path'], sha=overrides.get(item['path'], item)['sha256'])
            for name in ['manifest.webmanifest', 'manifest.json', 'site.webmanifest']:
                check('/experience/' + name, sha=overrides[name]['sha256'])
            check('/experience/not-found', 404)
            check('/experience/assets/not-found.js', 404)
            print(json.dumps({'mountId': mount.MOUNT_ID, 'checks': count, 'status': 'passed', 'scope': 'isolated real nginx, no public vhost change'}))
        finally:
            process.terminate()
            try:
                process.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.communicate(timeout=5)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--staging', required=True, type=Path)
    probe(parser.parse_args().staging.resolve())

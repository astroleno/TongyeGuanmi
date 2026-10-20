#!/usr/bin/env python3
"""Offline transaction tests: no SSH, nginx reload, or production mutation."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('mount', Path(__file__).with_name('apply-experience-mount.py'))
mount = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mount)

VHOST = '''server {
    root $tongye_site_root;
    ssl_certificate /unchanged/cert.pem;
    include /www/server/panel/vhost/nginx/tongye-seo-routes.inc;
    location = /index.html {
        add_header Cache-Control "no-cache";
        try_files $uri =404;
    }
    location = /__preview/off/ { return 302 /; }
    location / { try_files $uri $uri/ =404; }
}
'''


class MountTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='tongye-mount-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.site = self.root / 'site'
        self.vhost = self.root / 'nginx' / 'vhost.conf'
        self.include = self.vhost.with_name('tongye-experience-routes.inc')
        self.vhost.parent.mkdir()
        self.vhost.write_text(VHOST)
        self.base = self.site / 'releases' / mount.BASE_ID
        (self.base / 'assets').mkdir(parents=True)
        (self.base / 'r5-release-manifest.json').write_text('{"donor":"fixture"}')
        (self.base / 'assets' / 'entry.js').write_text('/* frozen donor */')
        (self.site / 'current').symlink_to(self.base)
        self.staging = self.root / 'staging'
        (self.staging / 'assets').mkdir(parents=True)
        payloads = {'index.html': b'<html>mounted</html>', 'assets/entry.js': b'/* routing only */'}
        for name, data in payloads.items():
            (self.staging / name).write_bytes(data)
        self.manifest = {
            'mountId': mount.MOUNT_ID, 'baseRelease': mount.BASE_ID,
            'baseSourceCommit': mount.SOURCE,
            'baseManifestSha256': mount.digest((self.base / 'r5-release-manifest.json').read_bytes()),
            'assetOverrides': [{'path': 'assets/entry.js', 'baseSha256': mount.digest((self.base / 'assets/entry.js').read_bytes())}],
            'files': [{'path': name, 'bytes': len(data), 'sha256': mount.digest(data)} for name, data in payloads.items()],
        }
        self.save_manifest()
        self.patcher = patch.multiple(mount, SITE=self.site, VHOST=self.vhost, INCLUDE=self.include,
                                      BASE_SHA=self.manifest['baseManifestSha256'])
        self.patcher.start()
        self.addCleanup(self.patcher.stop)
        self.commands = patch.object(mount, 'command')
        self.command = self.commands.start()
        self.addCleanup(self.commands.stop)

    def save_manifest(self):
        (self.staging / 'mount-manifest.json').write_text(json.dumps(self.manifest))

    def apply(self):
        with contextlib.redirect_stdout(io.StringIO()):
            mount.apply(self.staging, mount.digest(VHOST.encode()))

    def record(self):
        return json.loads((self.site / 'route-backups' / mount.MOUNT_ID / 'transaction.json').read_text())

    def test_preserves_unrelated_routes_and_pins_archive_without_preview_cookie(self):
        result = mount.adapt_vhost(VHOST)
        self.assertIn('ssl_certificate /unchanged/cert.pem;', result)
        self.assertIn('location = /__preview/off/', result)
        self.assertIn(mount.SEO_INCLUDE, result)
        self.assertNotIn('location = /index.html', result)
        rules = mount.render_include(self.manifest)
        self.assertIn(f'alias {self.base}/assets/;', rules)
        self.assertIn('location = /experience/assets/entry.js', rules)
        self.assertIn('if ($tongye_preview_robots = "") { return 302 /experience/$is_args$args; }', rules)
        self.assertIn('try_files /index.html =404;', rules)
        entrance = rules.split('location = /experience/ {')[1].split('    }')[0]
        self.assertNotIn('alias ', entrance, 'file aliases on slash-ending URIs invoke the index module')
        self.assertIn(f'root {self.site}/mounts/{mount.MOUNT_ID};', entrance)
        self.assertIn('try_files /index.html =404;', entrance)
        self.assertIn('location ^~ /experience/ {\n        return 404;', rules)
        self.assertNotIn('location = /brand-lab {', rules)

    def test_success_and_explicit_rollback_restore_exact_original(self):
        self.apply()
        self.assertEqual(self.record()['state'], 'applied-awaiting-public-smoke')
        self.assertEqual(self.command.call_count, 2)
        self.assertEqual((self.base / 'assets/entry.js').read_text(), '/* frozen donor */')
        with contextlib.redirect_stdout(io.StringIO()):
            mount.rollback()
        self.assertEqual(self.vhost.read_text(), VHOST)
        self.assertEqual(self.record()['state'], 'rolled-back')
        self.assertTrue(self.include.exists(), 'rollback retains inactive recoverable artifacts')

    def test_nginx_check_failure_automatically_restores_original(self):
        self.command.side_effect = [subprocess.CalledProcessError(1, ['nginx', '-t']), None, None]
        with self.assertRaises(subprocess.CalledProcessError):
            self.apply()
        self.assertEqual(self.vhost.read_text(), VHOST)
        self.assertEqual(self.record()['state'], 'rolled-back-after-error')
        self.assertEqual(self.command.call_count, 3)

    def test_reload_failure_automatically_restores_original(self):
        self.command.side_effect = [None, subprocess.CalledProcessError(1, ['systemctl', 'reload', 'nginx']), None, None]
        with self.assertRaises(subprocess.CalledProcessError):
            self.apply()
        self.assertEqual(self.vhost.read_text(), VHOST)
        self.assertEqual(self.record()['state'], 'rolled-back-after-error')

    def test_changed_vhost_is_not_overwritten(self):
        self.vhost.write_text(VHOST + '# concurrent edit\n')
        with self.assertRaisesRegex(ValueError, 'vhost changed'):
            self.apply()
        self.assertFalse(self.include.exists())
        self.command.assert_not_called()

    def test_corrupted_overlay_is_rejected_before_any_mutation(self):
        (self.staging / 'assets/entry.js').write_text('wrong bytes')
        with self.assertRaisesRegex(ValueError, 'identity mismatch'):
            self.apply()
        self.assertEqual(self.vhost.read_text(), VHOST)
        self.assertFalse(self.include.exists())
        self.command.assert_not_called()

    def test_changed_donor_is_rejected(self):
        (self.base / 'assets/entry.js').write_text('other donor')
        with self.assertRaisesRegex(ValueError, 'server donor changed'):
            self.apply()
        self.assertFalse(self.include.exists())

    def test_rollback_refuses_to_overwrite_newer_user_edits(self):
        self.apply()
        changed = self.vhost.read_text() + '# newer edit\n'
        self.vhost.write_text(changed)
        with self.assertRaisesRegex(ValueError, 'another change'):
            mount.rollback()
        self.assertEqual(self.vhost.read_text(), changed)

    def test_rollback_refuses_to_discard_newer_route_include_edits(self):
        self.apply()
        self.include.write_text(self.include.read_text() + '# newer route change\n')
        with self.assertRaisesRegex(ValueError, 'route include has another change'):
            mount.rollback()
        self.assertNotEqual(self.vhost.read_text(), VHOST)

    def test_second_apply_and_unexpected_config_are_rejected(self):
        self.apply()
        with self.assertRaises(ValueError):
            self.apply()
        for invalid in [VHOST.replace(mount.SEO_INCLUDE, ''), VHOST + mount.SEO_INCLUDE,
                        VHOST.replace('try_files $uri =404;', 'return 302 /elsewhere;')]:
            with self.assertRaises(ValueError):
                mount.adapt_vhost(invalid)

    def test_filename_traversal_and_noncanonical_names_are_rejected(self):
        for name in ['../file', '/file', 'assets/../../file', 'a b', 'a;quit', '.', 'a/./b', 'a//b']:
            with self.assertRaises(ValueError, msg=name):
                mount.safe_name(name)

    def test_only_verified_public_smoke_can_finalize_transaction(self):
        self.apply()
        receipt = self.root / 'receipt.json'
        report = {'mountId': mount.MOUNT_ID, 'origin': 'https://tongye.me', 'status': 'passed',
                  'completedAt': '2026-10-19T15:00:00Z', 'checks': [
                      {'url': 'https://tongye.me/?from=route-check', 'status': 302},
                      {'url': 'https://tongye.me/experience/', 'status': 200},
                      {'url': 'https://tongye.me/experience/r5-release-manifest.json', 'status': 200}]}
        receipt.write_text(json.dumps({**report, 'origin': 'http://localhost'}))
        with self.assertRaises(ValueError):
            mount.verify(receipt)
        receipt.write_text(json.dumps(report))
        with contextlib.redirect_stdout(io.StringIO()):
            mount.verify(receipt)
        self.assertEqual(self.record()['state'], 'applied-http-verified')


if __name__ == '__main__':
    unittest.main()

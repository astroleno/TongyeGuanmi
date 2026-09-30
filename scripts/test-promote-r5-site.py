#!/usr/bin/env python3
"""Exercise the real promotion transaction in an isolated, unprivileged sandbox."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


class PromotionTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='tongye-promotion-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.site = self.root / 'site'
        self.stage = self.root / 'staging'
        self.bin = self.root / 'bin'
        for directory in [self.site / 'releases/old', self.stage / 'site', self.bin]:
            directory.mkdir(parents=True)
        (self.site / 'current').symlink_to(self.site / 'releases/old')
        (self.stage / 'site/index.html').write_text('new site')
        self.vhost = self.root / 'vhost.conf'
        self.original = 'server_name tongye.me;\n    location = /index.html { }\n    location / { try_files $uri $uri/ /index.html; }\n'
        self.vhost.write_text(self.original)
        self.routes = self.root / 'routes.inc'
        self.routes.write_text('old routes')
        source = Path(__file__).parent
        shutil.copy(source / 'prepare-seo-nginx.py', self.stage)
        (self.stage / 'tongye-seo-routes.inc').write_text('new routes')
        script = (source / 'promote-r5-site.sh').read_text()
        script = script.replace('/www/wwwroot/tongye.me', str(self.site))
        script = script.replace('/www/server/panel/vhost/nginx/html_tongye.me.conf', str(self.vhost))
        script = script.replace('/www/server/panel/vhost/nginx/tongye-seo-routes.inc', str(self.routes))
        script = script.replace('/tmp/tongye-release-$release_id', str(self.stage))
        self.script = self.root / 'promote.sh'
        self.script.write_text(script)
        self.stub('chown', 'exit 0')
        self.stub('rsync', 'cp -R "$3". "$4"')
        # GNU mv -T is unavailable on macOS; this stub only handles symlink replacement.
        self.stub('mv', 'if [ "$1" = -Tf ]; then rm -f "$3"; /bin/mv "$2" "$3"; else /bin/mv "$@"; fi')
        self.stub('nginx', 'if [ "${FAIL_AT:-}" = nginx ] && [ ! -f "$MARKER" ]; then touch "$MARKER"; exit 1; fi')
        self.stub('systemctl', 'if [ "${FAIL_AT:-}" = reload ] && [ ! -f "$MARKER" ]; then touch "$MARKER"; exit 1; fi')
        self.env = {**os.environ, 'PATH': f'{self.bin}:{os.environ["PATH"]}', 'MARKER': str(self.root / 'failed-once')}

    def stub(self, name, body):
        file = self.bin / name
        file.write_text('#!/bin/sh\nset -eu\n' + body + '\n')
        file.chmod(0o755)

    def run_promotion(self, *args, failure=''):
        return subprocess.run(['bash', str(self.script), 'r5-test', str(self.stage), *args],
                              env={**self.env, 'FAIL_AT': failure}, capture_output=True, text=True)

    def assert_restored(self):
        self.assertEqual((self.site / 'current').resolve(), self.site / 'releases/old')
        self.assertEqual(self.vhost.read_text(), self.original)
        self.assertEqual(self.routes.read_text(), 'old routes')

    def test_success_and_explicit_rollback_restore_both_site_and_routing(self):
        result = self.run_promotion()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.site / 'current/index.html').read_text(), 'new site')
        self.assertIn('=404', self.vhost.read_text())
        self.assertEqual(self.routes.read_text(), 'new routes')
        result = self.run_promotion('--rollback')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_restored()

    def test_invalid_configuration_rolls_back_before_switch(self):
        self.assertNotEqual(self.run_promotion(failure='nginx').returncode, 0)
        self.assert_restored()

    def test_reload_failure_rolls_back_after_switch(self):
        self.assertNotEqual(self.run_promotion(failure='reload').returncode, 0)
        self.assert_restored()

    def test_rollback_removes_new_include_if_no_previous_file_existed(self):
        self.routes.unlink()
        self.assertEqual(self.run_promotion().returncode, 0)
        self.assertEqual(self.run_promotion('--rollback').returncode, 0)
        self.assertFalse(self.routes.exists())
        self.assertEqual(self.vhost.read_text(), self.original)


if __name__ == '__main__':
    unittest.main()

#!/usr/bin/env python3
"""Offline fixtures only: no real SSH, public HTTP, or nginx reload."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('native', Path(__file__).with_name('publish-experience-release.py'))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


class NativePublicationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='tongye-native-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.site, self.package = self.root / 'public', self.root / 'package'
        self.vhost, self.include = self.root / 'nginx/vhost.conf', self.root / 'nginx/experience.inc'
        self.vhost.parent.mkdir()
        self.vhost.write_text(f'server {{\n include {self.include};\n # TLS and SEO unchanged\n}}\n')
        self.original = b'''# old mount\n    location = / {\n        if ($tongye_preview_robots = "") { return 302 /experience/$is_args$args; }\n        try_files /index.html =404;\n    }\n    location = /index.html {\n        if ($tongye_preview_robots = "") { return 302 /experience/$is_args$args; }\n        try_files /index.html =404;\n    }\n    location = /experience { return 301 /experience/; }\n'''
        self.include.write_bytes(self.original)
        self.base = self.site / 'releases' / native.BASE_ID
        self.mount = self.site / 'mounts' / native.MOUNT_ID
        (self.base / 'assets').mkdir(parents=True)
        for name in ['services', 'faq']:
            (self.base / name).mkdir()
            (self.base / name / 'index.html').write_text('<html>unchanged root fixture</html>')
        (self.mount / 'assets').mkdir(parents=True)
        self.old_payloads = {'assets/old.js': b'/* donor */', 'assets/shared.css': b'body{color:black}'}
        donor_files = []
        for name, data in self.old_payloads.items():
            (self.base / name).write_bytes(data)
            donor_files.append(self.entry(name, data))
        self.donor_bytes = native.encoded({'files': donor_files})
        (self.base / 'r5-release-manifest.json').write_bytes(self.donor_bytes)
        (self.mount / 'assets/old.js').write_bytes(b'/* old routing overlay */')
        override = self.entry('assets/old.js', b'/* old routing overlay */')
        overlay = {'assetOverrides': [{**override, 'baseSha256': native.digest(self.old_payloads['assets/old.js'])}], 'files': [override]}
        self.overlay_bytes = native.encoded(overlay)
        (self.mount / 'mount-manifest.json').write_bytes(self.overlay_bytes)
        (self.site / 'current').symlink_to(self.base)
        self.rid = 'r5-native-fixture'
        self.commit, self.tag = '1' * 40, '2' * 40
        self.candidate = 'react-refactor-r5-parity-repair-candidate-v56'
        (self.package / 'site/assets').mkdir(parents=True)
        media = b'CDN fixture bytes'
        self.cdn_entry = {'channel': 'assets', 'sourcePath': 'assets/test.webp',
                          'objectKey': f'releases/{self.rid}/assets/test.webp',
                          'url': f'https://assets.tongye.me/releases/{self.rid}/assets/test.webp',
                          'bytes': len(media), 'sha256': native.digest(media), 'contentType': 'image/webp',
                          'cacheControl': 'public, max-age=31536000, immutable'}
        self.cdn = {'schemaVersion': 1, 'enabled': True, 'releaseId': self.rid, 'sourceCommit': self.commit, 'files': [self.cdn_entry]}
        self.payloads = {'index.html': b'<html>native</html>', 'assets/new.js': b'/* native */', 'favicon.ico': b'\x00\x00\x01\x00fixture-only-icon',
                         'assets/shared.css': self.old_payloads['assets/shared.css'],
                         'cdn-publish-manifest.json': native.encoded(self.cdn)}
        for name, data in self.payloads.items():
            (self.package / 'site' / name).write_bytes(data)
        cdn_path = self.package / 'cdn/assets/assets/test.webp'
        cdn_path.parent.mkdir(parents=True)
        cdn_path.write_bytes(media)
        entries = [self.entry(name, data) for name, data in self.payloads.items()] + [self.entry('assets/test.webp', media)]
        entries.sort(key=lambda item: item['path'])
        self.manifest = {'schemaVersion': 3, 'basePath': '/experience/', 'sourceDirty': False,
                         'sourceCommit': self.commit, 'candidateTagObject': self.tag, 'candidate': self.candidate,
                         'files': entries, 'fileCount': len(entries), 'totalBytes': sum(item['bytes'] for item in entries),
                         'artifactTreeSha256': native.digest(json.dumps(entries, separators=(',', ':')).encode())}
        identity = {field: self.manifest[field] for field in ['sourceCommit', 'candidateTagObject', 'candidate', 'artifactTreeSha256']}
        identity['draftManifestSha256'] = '3' * 64
        environment = {'platform': 'darwin', 'browserChannel': 'chrome', 'runnerClass': 'local-macos-hardware',
                       'headless': True, 'arch': 'fixture-only', 'osRelease': 'fixture-only'}
        sample = {'browserPid': 100, 'browserRootRssBytes': 1000, 'totalRssBytes': 3000, 'processCount': 3,
                  'gpuProcessCount': 1, 'gpuRssBytes': 1000, 'rendererProcessCount': 1, 'rendererRssBytes': 1000}
        self.memory = {'schemaVersion': 3, 'kind': 'r5-process-memory-qualification', 'requiredRunCount': 2,
                       'pass': True, 'completedRunCount': 2, 'identity': identity, 'environment': environment,
                       'runs': [{'schemaVersion': 3, 'kind': 'r5-process-memory-run', 'runId': f'fixture-only-{index}',
                                 'pass': True, 'identity': identity, 'environment': environment,
                                 'processSamples': [sample], 'sampling': {'valid': True, 'sampleCount': 1}} for index in range(2)]}
        self.deploy = {'schemaVersion': 1, 'releaseId': self.rid, 'basePath': '/experience/', 'siteDirectory': 'site',
                       'sourceCommit': self.commit, 'candidateTagObject': self.tag, 'candidate': self.candidate,
                       'cdnManifestSha256': native.digest(self.payloads['cdn-publish-manifest.json']),
                       'cdnFiles': [{**self.cdn_entry, 'packagePath': 'cdn/assets/assets/test.webp'}],
                       'cdnFileCount': 1, 'cdnTotalBytes': len(media)}
        self.save()
        self.patcher = patch.multiple(native, SITE=self.site, VHOST=self.vhost, INCLUDE=self.include,
                                     BASE_SHA=native.digest(self.donor_bytes), MOUNT_SHA=native.digest(self.overlay_bytes),
                                     PREDECESSOR_SHA=native.digest(self.original))
        self.patcher.start()
        self.addCleanup(self.patcher.stop)
        self.commands = patch.object(native, 'command')
        self.command = self.commands.start()
        self.addCleanup(self.commands.stop)
        self.vhost_sha, self.include_sha = native.digest(self.vhost.read_bytes()), native.digest(self.original)
        _, _, legacy = native.predecessor(self.vhost_sha, self.include_sha)
        candidate = native.render_include(self.deploy, self.manifest, self.original, legacy)
        self.receipt = self.root / 'probe.json'
        self.proof = {'releaseId': self.rid, 'scope': 'isolated-real-nginx', 'status': 'passed',
                      'releaseManifestSha256': self.deploy['releaseManifestSha256'], 'vhostSha256': self.vhost_sha,
                      'beforeIncludeSha256': self.include_sha, 'afterIncludeSha256': native.digest(candidate),
                      'checks': [{'path': '/experience/', 'status': 200}], 'completedAt': 'fixture-only'}
        self.receipt.write_bytes(native.encoded(self.proof))

    def entry(self, name, data):
        return {'path': name, 'bytes': len(data), 'sha256': native.digest(data)}

    def save(self):
        memory_bytes = native.encoded(self.memory)
        (self.package / 'site/r5-process-memory.json').write_bytes(memory_bytes)
        self.manifest['qualification'] = {'status': 'qualified', 'memoryEvidence': {
            'pass': True, 'runCount': 2, 'path': 'r5-process-memory.json', 'sha256': native.digest(memory_bytes), 'identity': self.memory['identity']}}
        self.save_manifest()
        (self.package / 'site/release-id.txt').write_text(self.rid + '\n')

    def save_manifest(self):
        data = native.encoded(self.manifest)
        (self.package / 'site/r5-release-manifest.json').write_bytes(data)
        self.deploy['releaseManifestSha256'] = native.digest(data)
        self.save_deploy()

    def ego_memory(self):
        environment = self.memory['environment']
        environment.update(browserChannel='ego-lite', runnerClass='local-macos-hardware', headless=False,
                           browserExecutable='/Applications/ego lite.app/Contents/MacOS/ego lite',
                           processScope='entire-shared-browser-tree')
        def point(scene, direction, heap=100):
            return {'scene': scene, 'direction': direction, 'desired': {'kind': 'hold'}, 'usedJsHeapBytes': heap,
                    'canvasPixelBytes': 1000, 'mountedLayers': 2, 'webglCanvases': 1,
                    'videos': [{'paused': True, 'seeking': False}]}
        for index, run in enumerate(self.memory['runs']):
            holds = [point(scene, 'forward' if position else 'boot') for position, scene in enumerate(native.SCROLL_SCENES)]
            holds += [point('contact', 'forward-settled', 80)]
            holds += [point(scene, 'reverse') for scene in list(reversed(native.SCROLL_SCENES))[1:]]
            holds += [point('hero', 'reverse-settled', 80)]
            poses = [{**point('hero', 'forward'), 'desired': {'kind': 'segment'}, 'webglCanvases': 2} for _ in range(90)]
            run.update(browserPage={'isolateId': f'fixture-only-{index}'}, interactionModel='continuous-scroll',
                       sampleIntervalMs=250, settling={'idleMs': 5000}, measurement={'navigationIncluded': True}, budgets=native.SCROLL_BUDGETS,
                       holds=holds, poses=poses, heapSamples=[{'usedJsHeapBytes': 100}], errors=[], failure=None,
                       actual={'peakBrowserTreeRssBytes': 3000, 'peakGpuProcessRssBytes': 1000, 'peakRendererRssBytes': 1000,
                               'peakJsHeapBytes': 100, 'finalJsHeapBytes': 80, 'peakCanvasPixelBytes': 1000,
                               'maxMountedLayers': 2, 'maxWebglCanvasesAtHold': 1, 'maxWebglCanvasesInTransition': 2,
                               'maxWebglCanvasesAtLandmark': 0, 'maxVideosAtContact': 1})
        self.save()

    def save_deploy(self):
        (self.package / 'release-deploy-manifest.json').write_bytes(native.encoded(self.deploy))

    def apply(self):
        return native.apply(self.package, self.vhost_sha, self.include_sha, self.receipt, 'a' * 32)

    def record(self):
        return json.loads((native.state_directory(self.rid) / 'transaction.json').read_bytes())

    def test_complete_frozen_package_is_accepted_without_production_mutation(self):
        deploy, manifest, _ = native.validate_package(self.package)
        self.assertEqual(deploy['releaseId'], self.rid)
        self.assertEqual(manifest['sourceCommit'], self.commit)
        self.assertFalse((self.site / 'releases' / self.rid).exists())
        self.command.assert_not_called()

    def test_icon_mime_matches_the_release_hosts_nginx_not_the_python_platform(self):
        with patch.object(native.mimetypes, 'guess_type', return_value=('image/vnd.microsoft.icon', None)):
            self.assertEqual(native.content_type('favicon.ico'), 'image/x-icon')

    def test_pending_memory_is_rejected_even_with_matching_package_hash(self):
        self.manifest['qualification']['status'] = 'pending-memory'
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, 'not qualified'):
            self.apply()
        self.command.assert_not_called()

    def test_dirty_source_and_root_build_are_rejected(self):
        for field, value in [('sourceDirty', True), ('basePath', '/')]:
            old = self.manifest[field]
            self.manifest[field] = value
            self.save_manifest()
            with self.assertRaisesRegex(ValueError, 'clean, frozen'):
                native.validate_package(self.package)
            self.manifest[field] = old

    def test_memory_evidence_cannot_be_borrowed_from_another_candidate(self):
        self.memory['identity']['sourceCommit'] = '9' * 40
        self.save()
        with self.assertRaisesRegex(ValueError, 'another artifact'):
            native.validate_package(self.package)

    def test_raw_memory_runs_and_real_browser_identity_are_required(self):
        self.memory['runs'][1]['processSamples'] = []
        self.save()
        with self.assertRaisesRegex(ValueError, 'qualification run'):
            native.validate_package(self.package)

    def test_ego_diagnostic_is_not_silently_promoted_to_chrome_qualification(self):
        self.memory['environment']['browserChannel'] = 'ego-lite'
        self.save()
        with self.assertRaisesRegex(ValueError, 'qualification environment'):
            native.validate_package(self.package)

    def test_explicit_ego_qualification_requires_the_same_raw_budgets_and_two_isolates(self):
        self.ego_memory()
        native.validate_package(self.package)
        self.memory['runs'][1]['browserPage']['isolateId'] = self.memory['runs'][0]['browserPage']['isolateId']
        self.save()
        with self.assertRaisesRegex(ValueError, 'two fresh page isolates'):
            native.validate_package(self.package)

    def test_ego_cannot_hide_shared_browser_rss_behind_a_forged_pass_flag(self):
        self.ego_memory()
        self.memory['runs'][0]['processSamples'][0]['totalRssBytes'] = 4_000_000_000
        self.save()
        with self.assertRaisesRegex(ValueError, 'raw whole-tree'):
            native.validate_package(self.package)

    def test_ego_cannot_change_the_budget_or_drop_traversal_points(self):
        self.ego_memory()
        self.memory['runs'][0]['poses'].pop()
        self.save()
        with self.assertRaisesRegex(ValueError, 'raw traversal is incomplete'):
            native.validate_package(self.package)

    def test_corrupt_site_memory_and_cdn_bytes_are_rejected(self):
        for name in ['site/assets/new.js', 'site/r5-process-memory.json', 'cdn/assets/assets/test.webp']:
            file = self.package / name
            previous = file.read_bytes()
            file.write_bytes(b'corrupt')
            with self.assertRaises((ValueError, json.JSONDecodeError), msg=name):
                native.validate_package(self.package)
            file.write_bytes(previous)

    def test_undeclared_files_and_symlink_payloads_are_rejected(self):
        file = self.package / 'site/undeclared.js'
        file.write_text('extra')
        with self.assertRaisesRegex(ValueError, 'inventory'):
            native.validate_package(self.package)
        file.unlink()
        target = self.package / 'site/assets/new.js'
        target.unlink()
        target.symlink_to(self.base / 'assets/old.js')
        with self.assertRaisesRegex(ValueError, 'regular file'):
            native.validate_package(self.package)

    def test_traversal_and_noncanonical_paths_are_rejected(self):
        for name in ['', '../file', '/file', 'a/../b', 'a//b', 'a/./b', '.', 'a;quit', 'x y', 'a\\b']:
            with self.assertRaises(ValueError, msg=name):
                native.safe_name(name)

    def test_duplicate_inventory_or_wrong_tree_hash_is_rejected(self):
        self.manifest['files'].append(self.manifest['files'][0])
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            native.validate_package(self.package)
        self.manifest['files'].pop()
        self.manifest['artifactTreeSha256'] = '0' * 64
        self.memory['identity']['artifactTreeSha256'] = '0' * 64
        self.save()
        with self.assertRaisesRegex(ValueError, 'tree mismatch'):
            native.validate_package(self.package)

    def test_cdn_path_and_release_identity_cannot_escape_the_release(self):
        self.deploy['cdnFiles'][0]['packagePath'] = '../outside'
        self.save_deploy()
        with self.assertRaisesRegex(ValueError, 'package path'):
            native.validate_package(self.package)

    def test_render_keeps_root_rules_and_all_legacy_asset_owners(self):
        _, _, legacy = native.predecessor(self.vhost_sha, self.include_sha)
        text = native.render_include(self.deploy, self.manifest, self.original, legacy).decode()
        self.assertTrue(text.startswith(self.original.decode().split('    location = /experience {')[0]))
        self.assertIn(f'alias {self.mount}/assets/old.js;', text)
        self.assertIn(f'alias {self.base}/assets/shared.css;', text)
        self.assertIn(f'alias {self.site}/releases/{self.rid}/assets/;', text)
        entrance = text.split('location = /experience/ {')[1].split('    }')[0]
        self.assertIn('try_files /index.html =404;', entrance)
        self.assertNotIn('alias ', entrance)
        self.assertNotIn('/experience/mount-manifest.json', text)
        self.assertIn('X-Robots-Tag "noindex, nofollow"', text)

    def test_same_url_different_legacy_bytes_refuses_publication(self):
        _, _, legacy = native.predecessor(self.vhost_sha, self.include_sha)
        self.manifest['files'].append(self.entry('assets/old.js', b'different native bytes'))
        with self.assertRaisesRegex(ValueError, 'URL collision'):
            native.render_include(self.deploy, self.manifest, self.original, legacy)

    def test_success_and_rollback_leave_root_vhost_current_and_old_files_untouched(self):
        old_vhost = self.vhost.read_bytes()
        record = self.apply()
        self.assertEqual(record['state'], 'applied-awaiting-public-smoke')
        self.assertNotEqual(self.include.read_bytes(), self.original)
        self.assertEqual(self.command.call_count, 2)
        record = native.rollback(self.rid)
        self.assertEqual(record['state'], 'rolled-back')
        calls = self.command.call_count
        self.assertEqual(native.rollback(self.rid)['state'], 'rolled-back')
        self.assertEqual(self.command.call_count, calls, 'confirmed rollback is idempotent')
        self.assertEqual(self.include.read_bytes(), self.original)
        self.assertEqual(self.vhost.read_bytes(), old_vhost)
        self.assertEqual((self.site / 'current').resolve(), self.base)
        self.assertEqual((self.base / 'assets/old.js').read_bytes(), self.old_payloads['assets/old.js'])
        self.assertTrue((self.site / 'releases' / self.rid).exists(), 'rollback retains immutable recovery artifacts')

    def test_an_existing_release_is_never_overwritten(self):
        (self.site / 'releases' / self.rid).mkdir()
        with self.assertRaisesRegex(ValueError, 'already exists'):
            self.apply()
        self.assertEqual(self.include.read_bytes(), self.original)
        self.command.assert_not_called()

    def test_missing_or_wrong_probe_identity_prevents_any_release_mutation(self):
        self.proof['afterIncludeSha256'] = '0' * 64
        self.receipt.write_bytes(native.encoded(self.proof))
        with self.assertRaisesRegex(ValueError, 'probe identity'):
            self.apply()
        self.assertFalse((self.site / 'releases' / self.rid).exists())
        self.assertEqual(self.include.read_bytes(), self.original)

    def test_each_nginx_apply_failure_restores_exact_v55_include(self):
        for index in [0, 1]:
            with self.subTest(index=index):
                if index:
                    # A separate immutable transaction fixture for the second case.
                    self.tearDown_fixture_for_retry()
                calls = [None] * index + [subprocess.CalledProcessError(1, ['nginx'])] + [None, None]
                self.command.side_effect = calls
                with self.assertRaises(subprocess.CalledProcessError):
                    self.apply()
                self.assertEqual(self.include.read_bytes(), self.original)
                self.assertEqual(self.record()['state'], 'rolled-back-after-error')

    def tearDown_fixture_for_retry(self):
        # Only fixture-owned temporary directories; never a source/public release.
        import shutil
        shutil.rmtree(self.site / 'releases' / self.rid)
        shutil.rmtree(native.state_directory(self.rid))

    def test_concurrent_include_or_vhost_change_is_not_overwritten(self):
        for file in [self.include, self.vhost]:
            previous = file.read_bytes()
            file.write_bytes(previous + b'# concurrent\n')
            with self.assertRaisesRegex(ValueError, 'configuration changed'):
                self.apply()
            self.assertEqual(file.read_bytes(), previous + b'# concurrent\n')
            file.write_bytes(previous)
        self.command.assert_not_called()

    def test_donor_or_mount_tampering_is_rejected_before_switch(self):
        (self.mount / 'assets/old.js').write_bytes(b'tampered old overlay')
        with self.assertRaisesRegex(ValueError, 'identity mismatch'):
            self.apply()
        self.command.assert_not_called()

    def test_rollback_refuses_to_overwrite_later_edits(self):
        self.apply()
        candidate = self.include.read_bytes()
        self.include.write_bytes(candidate + b'# user edit\n')
        with self.assertRaisesRegex(ValueError, 'another production change'):
            native.rollback(self.rid)
        self.assertEqual(self.include.read_bytes(), candidate + b'# user edit\n')

    def test_rollback_refuses_corrupt_backup(self):
        self.apply()
        (native.state_directory(self.rid) / 'include.before.conf').write_bytes(b'not v55')
        with self.assertRaisesRegex(ValueError, 'backup changed'):
            native.rollback(self.rid)

    def test_failed_duplicate_invocation_cannot_roll_back_the_existing_release(self):
        self.apply()
        candidate = self.include.read_bytes()
        with self.assertRaisesRegex(ValueError, 'another invocation'):
            native.rollback(self.rid, 'b' * 32)
        self.assertEqual(self.include.read_bytes(), candidate)

    def test_pre_switch_interruption_aborts_without_reloading_or_touching_routes(self):
        self.apply()
        record = self.record()
        record['state'] = 'prepared'
        self.include.write_bytes(self.original)
        (native.state_directory(self.rid) / 'transaction.json').write_bytes(native.encoded(record))
        self.command.reset_mock()
        self.assertEqual(native.rollback(self.rid, 'a' * 32)['state'], 'aborted-before-switch')
        self.command.assert_not_called()

    def test_failed_rollback_restores_the_active_candidate_configuration(self):
        self.apply()
        candidate = self.include.read_bytes()
        self.command.side_effect = [subprocess.CalledProcessError(1, ['nginx']), None, None]
        with self.assertRaises(subprocess.CalledProcessError):
            native.rollback(self.rid)
        self.assertEqual(self.include.read_bytes(), candidate)
        self.assertEqual(self.record()['state'], 'applied-awaiting-public-smoke')

    def test_interrupted_switch_remains_recoverable_on_either_side_of_replace(self):
        self.apply()
        record = self.record()
        record['state'] = 'switching'
        (native.state_directory(self.rid) / 'transaction.json').write_bytes(native.encoded(record))
        self.assertEqual(native.rollback(self.rid)['state'], 'rolled-back')
        (native.state_directory(self.rid) / 'transaction.json').write_bytes(native.encoded(record))
        self.include.write_bytes(self.original)
        self.assertEqual(native.rollback(self.rid)['state'], 'rolled-back')
        self.assertEqual(self.include.read_bytes(), self.original)

    def test_public_smoke_failure_does_not_claim_verification(self):
        self.apply()
        with patch.object(native, 'http_checks', side_effect=ValueError('HTTP failed')):
            with self.assertRaisesRegex(ValueError, 'HTTP failed'):
                native.verify(self.package)
        self.assertEqual(self.record()['state'], 'applied-awaiting-public-smoke')

    def test_successful_public_smoke_is_bound_to_the_unchanged_active_include(self):
        self.apply()
        report = {'status': 'passed', 'completedAt': 'fixture-only', 'checks': []}
        with patch.object(native, 'http_checks', return_value=report):
            self.assertEqual(native.verify(self.package)['state'], 'applied-http-verified')
        self.assertTrue((native.state_directory(self.rid) / 'http-smoke.json').exists())


if __name__ == '__main__':
    unittest.main()

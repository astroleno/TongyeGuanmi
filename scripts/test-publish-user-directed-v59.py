#!/usr/bin/env python3
"""Synthetic offline fixtures for the single explicitly directed publication."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('fixtures', Path(__file__).with_name('test-publish-experience-release.py'))
fixtures = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixtures)
native = fixtures.native
PRODUCTION_SHA = native.V59_DIRECT_AUTH_SHA


class UserDirectedPublicationTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.NativePublicationTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        f = self.fixture
        f.ego_memory()
        f.manifest['qualification'] = {'status': 'pending-memory', 'memoryEvidence': None}
        f.save_manifest()
        f.memory['identity']['draftManifestSha256'] = native.digest((f.package / 'site/r5-release-manifest.json').read_bytes())
        f.memory['pass'] = False
        for run in f.memory['runs']:
            run['pass'] = False
            run['processSamples'][0]['totalRssBytes'] = 4_000_000_000
            run['actual']['peakBrowserTreeRssBytes'] = 4_000_000_000
        memory_bytes = native.encoded(f.memory)
        (f.package / 'site/r5-process-memory.json').write_bytes(memory_bytes)
        (f.package / 'evidence').mkdir()
        (f.package / 'evidence/performance.json').write_bytes(b'{"pass": false}\n')
        self.receipt = {'mode': 'user-directed-with-known-validation-gaps', 'releaseId': f.rid, 'basePath': '/experience/',
                        'identity': f.memory['identity'], 'evidence': {
                            'memory': f.entry('site/r5-process-memory.json', memory_bytes),
                            'performance': f.entry('evidence/performance.json', b'{"pass": false}\n')}}
        self.receipt_bytes = native.encoded(self.receipt)
        self.authorization_sha = native.digest(self.receipt_bytes)
        (f.package / native.DIRECT_AUTH_PATH).write_bytes(self.receipt_bytes)
        f.deploy['publicationAuthorization'] = {'path': native.DIRECT_AUTH_PATH, 'sha256': self.authorization_sha,
                                              'mode': self.receipt['mode'], 'memoryEvidenceSha256': native.digest(memory_bytes)}
        f.save_deploy()
        self.policy = patch.object(native, 'V59_DIRECT_AUTH_SHA', self.authorization_sha)
        self.policy.start()
        self.addCleanup(self.policy.stop)
        f.proof.update(releaseManifestSha256=f.deploy['releaseManifestSha256'], userDirectedAuthorizationSha256=self.authorization_sha)
        f.receipt.write_bytes(native.encoded(f.proof))

    def validate(self, authorization_sha=None):
        return native.validate_package(self.fixture.package, authorization_sha or self.authorization_sha)

    def apply(self):
        f = self.fixture
        return native.apply(f.package, f.vhost_sha, f.include_sha, f.receipt, 'c' * 32, self.authorization_sha)

    def test_production_receipt_is_pinned_to_exact_v59_and_failed_evidence(self):
        data = Path(__file__).with_name('authorizations').joinpath('v59-direct-publication-20261020.json').read_bytes()
        self.assertEqual(native.digest(data), PRODUCTION_SHA)
        policy = json.loads(data)
        self.assertEqual(policy['releaseId'], 'r5-c1ee8fd')
        self.assertEqual(policy['identity']['sourceCommit'], 'c1ee8fd386d92ee34d408eb0e094fa87ae21de35')
        self.assertTrue(policy['doesNotGrantPassingQualification'])

    def test_default_publication_still_rejects_the_pending_package(self):
        with self.assertRaisesRegex(ValueError, 'not qualified'):
            native.validate_package(self.fixture.package)
        self.fixture.command.assert_not_called()

    def test_explicit_receipt_accepts_bytes_without_promoting_failed_qualification(self):
        f = self.fixture
        before = (f.package / 'site/r5-process-memory.json').read_bytes()
        _, manifest, _ = self.validate()
        self.assertEqual(manifest['qualification'], {'status': 'pending-memory', 'memoryEvidence': None})
        self.assertEqual(before, (f.package / 'site/r5-process-memory.json').read_bytes())
        self.assertIs(json.loads(before)['pass'], False)

    def test_other_receipt_sha_cannot_enable_direct_publication(self):
        with self.assertRaisesRegex(ValueError, 'exact user-directed'):
            self.validate('9' * 64)

    def test_receipt_tampering_is_rejected(self):
        (self.fixture.package / native.DIRECT_AUTH_PATH).write_bytes(self.receipt_bytes + b' ')
        with self.assertRaisesRegex(ValueError, 'receipt changed'):
            self.validate()

    def test_changed_candidate_cannot_reuse_the_receipt(self):
        f = self.fixture
        f.manifest['candidate'] = 'react-refactor-r5-parity-repair-candidate-v60'
        f.deploy['candidate'] = f.manifest['candidate']
        f.save_manifest()
        with self.assertRaisesRegex(ValueError, 'unchanged frozen'):
            self.validate()

    def test_all_failure_evidence_and_cdn_bytes_remain_integrity_checked(self):
        f = self.fixture
        for name in ['site/r5-process-memory.json', 'evidence/performance.json', 'cdn/assets/assets/test.webp']:
            file = f.package / name
            data = file.read_bytes()
            file.write_bytes(data + b' ')
            with self.assertRaises(ValueError, msg=name):
                self.validate()
            file.write_bytes(data)

    def test_probe_receipt_must_bind_the_explicit_authorization(self):
        f = self.fixture
        f.proof['userDirectedAuthorizationSha256'] = None
        f.receipt.write_bytes(native.encoded(f.proof))
        with self.assertRaisesRegex(ValueError, 'nginx probe identity mismatch'):
            self.apply()
        self.assertEqual(f.include.read_bytes(), f.original)
        f.command.assert_not_called()

    def test_transaction_retains_failed_evidence_and_rolls_back_exactly(self):
        f = self.fixture
        record = self.apply()
        self.assertEqual(record['publicationMode'], 'user-directed-with-known-validation-gaps')
        self.assertEqual(record['qualificationStatusUnchanged'], 'pending-memory')
        self.assertEqual((native.state_directory(f.rid) / native.DIRECT_AUTH_PATH).read_bytes(), self.receipt_bytes)
        self.assertIs(json.loads((native.state_directory(f.rid) / 'evidence/memory.json').read_bytes())['pass'], False)
        self.assertEqual((f.site / 'current').resolve(), f.base)
        native.rollback(f.rid, 'c' * 32)
        self.assertEqual(f.include.read_bytes(), f.original)
        self.assertEqual(f.record()['state'], 'rolled-back')


if __name__ == '__main__':
    unittest.main()

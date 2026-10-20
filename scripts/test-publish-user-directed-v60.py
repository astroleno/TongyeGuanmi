"""Offline tests: no real transport, nginx reload, or qualification claims."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('fixtures', Path(__file__).with_name('test-publish-experience-release.py'))
fixtures = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixtures)
native = fixtures.native
PRODUCTION_SHA = native.V60_PUBLIC_TEST_AUTH_SHA


class PublicTestPublicationTests(unittest.TestCase):
    def setUp(self):
        self.f = f = fixtures.NativePublicationTests()
        f.setUp()
        self.addCleanup(f.doCleanups)
        f.manifest['qualification'] = {'status': 'pending-memory', 'memoryEvidence': None}
        f.save_manifest()
        identity = {key: f.manifest[key] for key in ['candidate', 'candidateTagObject', 'sourceCommit', 'artifactTreeSha256']}
        identity['draftManifestSha256'] = native.digest((f.package / 'site/r5-release-manifest.json').read_bytes())
        self.memory = {'schemaVersion': 1, 'kind': 'r5-unmeasured-process-memory', 'status': 'not-measured',
                       'pass': False, 'requiredRunCount': 2, 'completedRunCount': 0, 'runs': [],
                       'qualificationGranted': False, 'identity': identity,
                       'reason': 'No formal process-memory runs have been collected for this artifact. Earlier candidates are not evidence for this identity.'}
        self.receipt = {'mode': 'user-directed-with-known-validation-gaps', 'releaseId': f.rid,
                        'basePath': '/experience/', 'identity': identity, 'evidence': {}}
        self.rebind()

    def rebind(self):
        f = self.f
        memory_bytes = native.encoded(self.memory)
        (f.package / 'site/r5-process-memory.json').write_bytes(memory_bytes)
        self.receipt['evidence']['memory'] = f.entry('site/r5-process-memory.json', memory_bytes)
        receipt_bytes = native.encoded(self.receipt)
        self.auth = native.digest(receipt_bytes)
        (f.package / native.DIRECT_AUTH_PATH).write_bytes(receipt_bytes)
        f.deploy['publicationAuthorization'] = {'path': native.DIRECT_AUTH_PATH, 'sha256': self.auth,
                                               'mode': self.receipt['mode'], 'memoryEvidenceSha256': native.digest(memory_bytes)}
        f.save_deploy()
        f.proof.update(releaseManifestSha256=f.deploy['releaseManifestSha256'], userDirectedAuthorizationSha256=self.auth)
        f.receipt.write_bytes(native.encoded(f.proof))

    def validate(self):
        with patch.object(native, 'V60_PUBLIC_TEST_AUTH_SHA', self.auth):
            return native.validate_package(self.f.package, self.auth)

    def test_actual_v60_receipt_is_pinned_and_grants_no_future_candidate(self):
        data = Path(__file__).with_name('authorizations').joinpath('v60-public-test-20261021.json').read_bytes()
        self.assertEqual(native.digest(data), PRODUCTION_SHA)
        receipt = json.loads(data)
        self.assertEqual(receipt['identity']['sourceCommit'], 'cb8c17affd9d171a206f19773a9a907cc1f20f1b')
        self.assertTrue(receipt['doesNotGrantPassingQualification'])
        self.assertTrue(receipt['doesNotAuthorizeFutureCandidates'])

    def test_zero_runs_stays_explicitly_unqualified_and_default_path_rejects(self):
        _, manifest, _ = self.validate()
        self.assertEqual(manifest['qualification']['status'], 'pending-memory')
        with self.assertRaisesRegex(ValueError, 'not qualified'):
            native.validate_package(self.f.package)
        self.f.command.assert_not_called()

    def test_claiming_passing_or_measured_memory_is_rejected_even_if_rebound(self):
        for key, value in [('pass', True), ('completedRunCount', 2), ('qualificationGranted', True), ('runs', [{}])]:
            old = self.memory[key]
            self.memory[key] = value
            self.rebind()
            with self.assertRaisesRegex(ValueError, 'zero measured runs'):
                self.validate()
            self.memory[key] = old

    def test_changed_candidate_cannot_borrow_the_exact_receipt(self):
        self.f.manifest['candidate'] = self.f.deploy['candidate'] = 'react-refactor-r5-parity-repair-candidate-v61'
        self.f.save_manifest()
        with self.assertRaisesRegex(ValueError, 'unchanged frozen'):
            self.validate()

    def test_explicit_public_test_transaction_and_rollback_preserve_missing_evidence(self):
        f = self.f
        with patch.object(native, 'V60_PUBLIC_TEST_AUTH_SHA', self.auth):
            record = native.apply(f.package, f.vhost_sha, f.include_sha, f.receipt, 'e' * 32, self.auth)
            self.assertEqual(record['qualificationStatusUnchanged'], 'pending-memory')
            self.assertEqual(json.loads((native.state_directory(f.rid) / 'evidence/memory.json').read_bytes())['completedRunCount'], 0)
            native.rollback(f.rid, 'e' * 32)
        self.assertEqual(f.include.read_bytes(), f.original)


class NativeSuccessorTests(unittest.TestCase):
    def setUp(self):
        self.f = f = fixtures.NativePublicationTests()
        f.setUp()
        self.addCleanup(f.doCleanups)
        self.previous_id = 'r5-previous-fixture'
        root = f.site / 'releases' / self.previous_id
        (root / 'assets').mkdir(parents=True)
        (root / 'assets/previous.js').write_bytes(b'/* previous native lazy module */')
        self.previous_manifest = native.encoded({'files': [f.entry('assets/previous.js', (root / 'assets/previous.js').read_bytes())]})
        (root / 'r5-release-manifest.json').write_bytes(self.previous_manifest)
        _, _, legacy = native.predecessor(f.vhost_sha, f.include_sha)
        self.before = native.render_include({'releaseId': self.previous_id}, json.loads(self.previous_manifest), f.original, legacy)
        self.before_sha = native.digest(self.before)
        backup = native.state_directory(self.previous_id)
        backup.mkdir(parents=True)
        (backup / 'include.before.conf').write_bytes(f.original)
        (backup / 'include.after.conf').write_bytes(self.before)
        (backup / 'transaction.json').write_bytes(native.encoded({'state': 'applied-http-verified', 'releaseId': self.previous_id,
            'afterIncludeSha256': self.before_sha, 'beforeIncludeSha256': f.include_sha,
            'rootCurrent': str(f.base), 'releaseManifestSha256': native.digest(self.previous_manifest)}))
        policy = patch.object(native, 'NATIVE_PREDECESSORS', {self.before_sha: {
            'releaseId': self.previous_id, 'manifestSha256': native.digest(self.previous_manifest)}})
        policy.start()
        self.addCleanup(policy.stop)
        f.include.write_bytes(self.before)
        f.include_sha = self.before_sha
        _, _, legacy = native.predecessor(f.vhost_sha, f.include_sha)
        f.proof.update(beforeIncludeSha256=f.include_sha,
                       afterIncludeSha256=native.digest(native.render_include(f.deploy, f.manifest, self.before, legacy)))
        f.receipt.write_bytes(native.encoded(f.proof))

    def test_both_generations_of_lazy_modules_are_preserved_and_publicly_checked(self):
        f = self.f
        _, _, legacy = native.predecessor(f.vhost_sha, f.include_sha)
        self.assertEqual(set(legacy), {'assets/old.js', 'assets/shared.css', 'assets/previous.js'})
        f.apply()
        self.assertIn(str(f.site / 'releases' / self.previous_id / 'assets/previous.js'), f.include.read_text())
        def check(origin, deploy, manifest, actual):
            self.assertEqual(set(actual), set(legacy))
            return {'status': 'passed', 'checks': [], 'completedAt': 'fixture-only'}
        with patch.object(native, 'http_checks', side_effect=check):
            native.verify(f.package)
        native.rollback(f.rid)
        self.assertEqual(f.include.read_bytes(), self.before)
        self.assertEqual((f.site / 'current').resolve(), f.base)

    def test_native_predecessor_bytes_and_transaction_cannot_be_changed(self):
        f = self.f
        for file in [f.site / 'releases' / self.previous_id / 'assets/previous.js',
                     f.site / 'releases' / self.previous_id / 'r5-release-manifest.json',
                     native.state_directory(self.previous_id) / 'include.after.conf']:
            old = file.read_bytes()
            file.write_bytes(old + b' ')
            with self.assertRaises(ValueError):
                f.apply()
            file.write_bytes(old)
        f.command.assert_not_called()

    def test_unknown_predecessor_is_rejected_even_if_cas_hash_matches(self):
        f = self.f
        f.include.write_bytes(self.before + b'# unknown edit\n')
        with self.assertRaisesRegex(ValueError, 'inspected predecessor'):
            native.predecessor(f.vhost_sha, native.digest(f.include.read_bytes()))

    def test_collision_with_previous_native_module_is_rejected(self):
        f = self.f
        _, _, legacy = native.predecessor(f.vhost_sha, f.include_sha)
        f.manifest['files'].append(f.entry('assets/previous.js', b'changed'))
        with self.assertRaisesRegex(ValueError, 'URL collision'):
            native.render_include(f.deploy, f.manifest, self.before, legacy)


if __name__ == '__main__':
    unittest.main()

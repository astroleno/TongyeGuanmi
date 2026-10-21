"""Offline third-generation successor and exact v63 relative-publication fixtures."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('v60_fixtures', Path(__file__).with_name('test-publish-user-directed-v60.py'))
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)
native = previous.native
PRODUCTION_SHA = native.V63_RELATIVE_AUTH_SHA


class RelativePublicationTests(unittest.TestCase):
    def test_actual_v63_receipt_is_pinned_to_the_frozen_comparison_not_future_candidates(self):
        data = Path(__file__).with_name('authorizations').joinpath('v63-relative-publication-20261021.json').read_bytes()
        self.assertEqual(native.digest(data), PRODUCTION_SHA)
        receipt = json.loads(data)
        self.assertEqual(receipt['identity']['sourceCommit'], 'ac1861109ce612bf3e2c9bce1cee7846ec78f612')
        self.assertTrue(receipt['doesNotGrantPassingQualification'])
        self.assertTrue(receipt['doesNotAuthorizeFutureCandidates'])

    def setUp(self):
        self.public = previous.PublicTestPublicationTests()
        self.public.setUp()
        self.addCleanup(self.public.doCleanups)
        self.f = self.public.f
        self.receipt = self.public.receipt
        self.receipt['baselineIdentity'] = {**self.receipt['identity'], 'sourceCommit': 'b' * 40}
        self.cold = {'kind': 'same-conditions-v60-v63-cold-media-comparison', 'releaseQualified': False,
                     'identities': {'v60': self.receipt['baselineIdentity'], 'v63': self.receipt['identity']}, 'results': []}
        for platform in ['desktop', 'phone']:
            for trial in [1, 2]:
                for segment in ['hero-pattern', 'method-bottom-figure2', 'brand-figure3', 'education-crane', 'crane-contact']:
                    for version in ['v60', 'v63']:
                        self.cold['results'].append({'platform': platform, 'trial': trial, 'rangeId': segment,
                            'version': version, 'ready': True, 'elapsedMs': (80 if platform == 'desktop' and version == 'v63'
                                else 101 if platform == 'phone' and version == 'v63' else 100) + trial,
                            'errors': [], 'mediaEvents': [] if platform == 'desktop' and version == 'v63' else [{'type': 'load-call'}]})
        self.functional = {'kind': 'frozen-v63-functional-and-v60-visual-comparison-unshaped-http',
            'releaseQualified': False, 'passed': True, 'functional': [], 'visual': []}
        for platform in ['desktop', 'phone']:
            self.functional['functional'].append({'platform': platform, 'identity': self.receipt['identity'],
                'passed': True, 'errors': [], 'points': [{'passed': True} for _ in range(121)],
                'aliases': [{'panel': panel, 'passed': True} for panel in ['opening', 'cards', 'closing']]})
            for segment in ['hold:hero', 'hero-pattern', 'pattern-star-map', 'method-bottom-figure2', 'crane-contact', 'figure3-services']:
                self.functional['visual'].append({'platform': platform, 'pose': {'rangeId': segment},
                    'fraction': .001, 'ink': 1000, 'passed': True})
        self.rebind()

    def rebind(self):
        self.receipt['comparison'] = {}
        for platform in ['desktop', 'phone']:
            self.receipt['comparison'][platform] = {}
            for version in ['v60', 'v63']:
                rows = [row for row in self.cold['results'] if row['platform'] == platform and row['version'] == version]
                times = sorted(row['elapsedMs'] for row in rows)
                if len(times) == 10:
                    self.receipt['comparison'][platform][version] = {'samples': 10, 'medianMs': (times[4] + times[5]) / 2,
                        'nearestRankP95Ms': times[9], 'explicitLoadCalls': sum(event['type'] == 'load-call' for row in rows for event in row['mediaEvents'])}
        for name, data in [('coldComparison', self.cold), ('functional', self.functional)]:
            relative = 'evidence/' + name + '.json'
            filename = self.f.package / relative
            filename.parent.mkdir(parents=True, exist_ok=True)
            encoded = native.encoded(data)
            filename.write_bytes(encoded)
            self.receipt['evidence'][name] = self.f.entry(relative, encoded)
        self.public.rebind()

    def validate(self):
        with patch.object(native, 'V63_RELATIVE_AUTH_SHA', self.public.auth):
            return native.validate_package(self.f.package, self.public.auth)

    def test_complete_relative_evidence_does_not_grant_default_qualification(self):
        _, manifest, _ = self.validate()
        self.assertEqual(manifest['qualification'], {'status': 'pending-memory', 'memoryEvidence': None})
        self.assertGreater(self.receipt['comparison']['phone']['v63']['medianMs'], self.receipt['comparison']['phone']['v60']['medianMs'])
        with self.assertRaisesRegex(ValueError, 'not qualified'):
            native.validate_package(self.f.package)
        self.f.command.assert_not_called()

    def test_missing_or_duplicated_cold_samples_are_rejected(self):
        self.cold['results'][-1] = self.cold['results'][0]
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'forty paired samples'):
            self.validate()

    def test_false_improvement_claim_is_recomputed_and_rejected(self):
        for row in self.cold['results']:
            if row['platform'] == 'desktop' and row['version'] == 'v63':
                row['elapsedMs'] = 1000
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'improvement was not demonstrated'):
            self.validate()

    def test_failed_cold_or_functional_evidence_is_rejected(self):
        self.cold['results'][0]['ready'] = False
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'cold-media sample failed'):
            self.validate()
        self.cold['results'][0]['ready'] = True
        self.functional['functional'][0]['points'][0]['passed'] = False
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'functional or Proof'):
            self.validate()

    def test_another_artifact_cannot_borrow_the_comparison(self):
        self.cold['identities']['v60'] = {**self.receipt['baselineIdentity'], 'sourceCommit': 'a' * 40}
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'comparison artifact identity'):
            self.validate()

    def test_visual_threshold_is_not_waived_by_relative_authorization(self):
        self.functional['visual'][0]['fraction'] = .00501
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'visual difference threshold'):
            self.validate()

    def test_raw_evidence_cannot_be_changed_without_the_exact_receipt(self):
        filename = self.f.package / self.receipt['evidence']['coldComparison']['path']
        filename.write_bytes(filename.read_bytes() + b' ')
        with self.assertRaises(ValueError):
            self.validate()

    def test_passing_memory_cannot_be_fabricated_for_relative_publication(self):
        self.public.memory['pass'] = True
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'zero measured runs'):
            self.validate()

    def test_relative_transaction_keeps_raw_evidence_and_exact_rollback(self):
        f = self.f
        with patch.object(native, 'V63_RELATIVE_AUTH_SHA', self.public.auth):
            record = native.apply(f.package, f.vhost_sha, f.include_sha, f.receipt, 'f' * 32, self.public.auth)
            self.assertEqual(record['qualificationStatusUnchanged'], 'pending-memory')
            saved = native.state_directory(f.rid) / 'evidence/coldComparison.json'
            self.assertEqual(json.loads(saved.read_bytes()), self.cold)
            native.rollback(f.rid, 'f' * 32)
        self.assertEqual(f.include.read_bytes(), f.original)


class ThirdGenerationSuccessorTests(unittest.TestCase):
    def setUp(self):
        self.previous = previous.NativeSuccessorTests()
        self.previous.setUp()
        self.addCleanup(self.previous.doCleanups)
        f = self.f = self.previous.f
        self.previous_id = 'r5-second-native-fixture'
        root = f.site / 'releases' / self.previous_id
        (root / 'assets').mkdir(parents=True)
        (root / 'assets/second-native.js').write_bytes(b'/* second native lazy module */')
        manifest = native.encoded({'files': [f.entry('assets/second-native.js', (root / 'assets/second-native.js').read_bytes())]})
        (root / 'r5-release-manifest.json').write_bytes(manifest)
        _, _, legacy = native.predecessor(f.vhost_sha, f.include_sha)
        self.before = native.render_include({'releaseId': self.previous_id}, json.loads(manifest), f.include.read_bytes(), legacy)
        self.before_sha = native.digest(self.before)
        backup = native.state_directory(self.previous_id)
        backup.mkdir(parents=True)
        (backup / 'include.before.conf').write_bytes(f.include.read_bytes())
        (backup / 'include.after.conf').write_bytes(self.before)
        (backup / 'transaction.json').write_bytes(native.encoded({'state': 'applied-http-verified', 'releaseId': self.previous_id,
            'afterIncludeSha256': self.before_sha, 'beforeIncludeSha256': f.include_sha,
            'rootCurrent': str(f.base), 'releaseManifestSha256': native.digest(manifest)}))
        self.policy = {**native.NATIVE_PREDECESSORS, self.before_sha: {'releaseId': self.previous_id,
            'manifestSha256': native.digest(manifest), 'beforeIncludeSha256': f.include_sha}}
        policy = patch.object(native, 'NATIVE_PREDECESSORS', self.policy)
        policy.start()
        self.addCleanup(policy.stop)
        f.include.write_bytes(self.before)
        f.include_sha = self.before_sha

    def test_all_three_generations_of_lazy_urls_are_preserved(self):
        _, _, legacy = native.predecessor(self.f.vhost_sha, self.f.include_sha)
        self.assertEqual(set(legacy), {'assets/old.js', 'assets/shared.css', 'assets/previous.js', 'assets/second-native.js'})

    def test_successor_apply_and_rollback_preserve_the_exact_three_generation_predecessor(self):
        f = self.f
        _, _, legacy = native.predecessor(f.vhost_sha, f.include_sha)
        f.proof.update(beforeIncludeSha256=f.include_sha,
                       afterIncludeSha256=native.digest(native.render_include(f.deploy, f.manifest, self.before, legacy)))
        f.receipt.write_bytes(native.encoded(f.proof))
        f.apply()
        for name in ['assets/previous.js', 'assets/second-native.js']:
            self.assertIn(name, f.include.read_text())
        native.rollback(f.rid)
        self.assertEqual(f.include.read_bytes(), self.before)
        self.assertEqual((f.site / 'current').resolve(), f.base)

    def test_retired_native_bytes_are_still_hash_checked(self):
        old = self.f.site / 'releases' / self.previous.previous_id / 'assets/previous.js'
        old.write_bytes(b'/* tampered retired module */')
        with self.assertRaises(ValueError):
            native.predecessor(self.f.vhost_sha, self.f.include_sha)
        self.f.command.assert_not_called()

    def test_cyclic_predecessor_policies_are_rejected(self):
        self.policy[self.previous.before_sha]['beforeIncludeSha256'] = self.before_sha
        with self.assertRaisesRegex(ValueError, 'chain|transaction'):
            native.predecessor(self.f.vhost_sha, self.f.include_sha)


if __name__ == '__main__':
    unittest.main()

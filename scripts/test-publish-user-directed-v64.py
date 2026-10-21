"""Exact receiver-repair publication; offline fixtures grant no qualification."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('v63_fixtures', Path(__file__).with_name('test-publish-user-directed-v63.py'))
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)
native = previous.native
PRODUCTION_SHA = native.V64_RECEIVER_AUTH_SHA


class ProductionReceiverReceiptTests(unittest.TestCase):
    def test_actual_v64_receipt_is_exact_and_does_not_qualify_future_candidates(self):
        data = Path(__file__).with_name('authorizations').joinpath('v64-receiver-publication-20261021.json').read_bytes()
        self.assertEqual(native.digest(data), PRODUCTION_SHA)
        receipt = json.loads(data)
        self.assertEqual(receipt['identity']['sourceCommit'], 'ba51d441f6a3db2cb4d9fb8080f38bb7742736c4')
        self.assertEqual(receipt['receiverBaselineIdentity']['sourceCommit'], 'ac1861109ce612bf3e2c9bce1cee7846ec78f612')
        self.assertTrue(receipt['doesNotGrantPassingQualification'])
        self.assertTrue(receipt['doesNotAuthorizeFutureCandidates'])


class ReceiverRepairPublicationTests(unittest.TestCase):
    def setUp(self):
        self.base = previous.RelativePublicationTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.f = self.base.f
        self.receipt = self.base.receipt
        self.base.cold['kind'] = 'same-conditions-v60-v64-cold-media-comparison'
        self.base.cold['identities']['v64'] = self.base.cold['identities'].pop('v63')
        for row in self.base.cold['results']:
            if row['version'] == 'v63':
                row['version'] = 'v64'
        for platform in ['desktop', 'phone']:
            self.receipt['comparison'][platform]['v64'] = self.receipt['comparison'][platform].pop('v63')
        self.base.functional['kind'] = 'frozen-v64-functional-and-v60-visual-comparison-unshaped-http'
        self.receipt['receiverBaselineIdentity'] = {**self.receipt['identity'], 'sourceCommit': 'd' * 40}
        self.recovery = {'kind': 'frozen-delayed-first-frame-receiver-regression', 'releaseQualified': False,
            'videoFirstByteMs': 3000, 'readyDeadlineMs': 25000, 'identities': {
                'v63': self.receipt['receiverBaselineIdentity'], 'v64': self.receipt['identity']}, 'results': []}
        for version in ['v63', 'v64']:
            for trial in [1, 2]:
                self.recovery['results'].append({'version': version, 'trial': trial,
                    'platform': 'phone', 'rangeId': 'brand-figure3', 'progress': .25, 'elapsedMs': 3500, 'errors': [],
                    'fallbackObserved': True, 'ready': version == 'v64', 'state': {
                        'viewport': [390, 844, 1], 'snapshot': {'view': {'status': 'ready' if version == 'v64' else 'failed'}},
                        'videos': [{'readyState': 4, 'seeking': False, 'paused': True}]}})
        self.rebind()

    def rebind(self):
        for name, data in [('coldComparison', self.base.cold), ('functional', self.base.functional), ('receiverRecovery', self.recovery)]:
            relative = 'evidence/' + name + '.json'
            raw = native.encoded(data)
            (self.f.package / relative).write_bytes(raw)
            self.receipt['evidence'][name] = self.f.entry(relative, raw)
        self.base.public.rebind()

    def validate(self):
        with patch.object(native, 'V64_RECEIVER_AUTH_SHA', self.base.public.auth):
            return native.validate_package(self.f.package, self.base.public.auth)

    def test_exact_repair_remains_unqualified_and_default_path_rejects(self):
        self.validate()
        with self.assertRaisesRegex(ValueError, 'not qualified'):
            native.validate_package(self.f.package)

    def test_failed_or_unexercised_receiver_cannot_be_called_repaired(self):
        self.recovery['results'][-1]['ready'] = False
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'recovery was not demonstrated'):
            self.validate()
        self.recovery['results'][-1]['ready'] = True
        self.recovery['results'][0]['fallbackObserved'] = False
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'recovery was not demonstrated'):
            self.validate()

    def test_longer_deadline_or_another_artifact_is_rejected(self):
        self.recovery['readyDeadlineMs'] = 30000
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'original readiness conditions'):
            self.validate()
        self.recovery['readyDeadlineMs'] = 25000
        self.recovery['identities']['v64'] = {**self.receipt['identity'], 'sourceCommit': 'a' * 40}
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'identity mismatch'):
            self.validate()

    def test_original_visual_limit_is_still_required(self):
        self.base.functional['visual'][0]['fraction'] = .00501
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'visual difference threshold'):
            self.validate()

    def test_only_the_inspected_v63_transaction_can_be_the_new_predecessor(self):
        policy = native.NATIVE_PREDECESSORS['a1d77c56bafc83b99a81364c381c07a19634189c725a78e4188bf57bbb745e92']
        self.assertEqual(policy, {'releaseId': 'r5-ac18611',
            'manifestSha256': '5c093a9f3e0dcfbc1c9ccf5694ef90b685e8d0947006026a72eccc78ce5961cf',
            'beforeIncludeSha256': 'f6d494173450b37a586392763af8b373f628a639a25fe14125acd9de992ffdd4'})


if __name__ == '__main__':
    unittest.main()

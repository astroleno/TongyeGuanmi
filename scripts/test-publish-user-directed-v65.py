"""Exact image-recovery publication fixtures; default qualification stays strict."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('v64_fixtures', Path(__file__).with_name('test-publish-user-directed-v64.py'))
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)
native = previous.native
PRODUCTION_SHA = native.V65_IMAGE_AUTH_SHA


class ProductionImageReceiptTests(unittest.TestCase):
    def test_actual_image_receipt_does_not_qualify_future_candidates(self):
        raw = Path(__file__).with_name('authorizations').joinpath('v65-image-publication-20261021.json').read_bytes()
        self.assertEqual(native.digest(raw), PRODUCTION_SHA)
        receipt = json.loads(raw)
        self.assertEqual(receipt['identity']['sourceCommit'], 'ae7c4ee56b94a52a06a9b4c8565002236b2b7dde')
        self.assertEqual(receipt['imageBaselineIdentity']['sourceCommit'], 'ba51d441f6a3db2cb4d9fb8080f38bb7742736c4')
        self.assertTrue(receipt['doesNotGrantPassingQualification'])
        self.assertTrue(receipt['doesNotAuthorizeFutureCandidates'])


class FailedImagePublicationTests(unittest.TestCase):
    def setUp(self):
        self.base = previous.ReceiverRepairPublicationTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.f, self.receipt = self.base.f, self.base.receipt
        self.cold, self.functional = self.base.base.cold, self.base.base.functional
        self.cold['kind'] = 'same-conditions-v60-v65-cold-media-comparison'
        self.cold['identities']['v65'] = self.cold['identities'].pop('v64')
        for row in self.cold['results']:
            if row['version'] == 'v64':
                row['version'] = 'v65'
        for platform in ['desktop', 'phone']:
            self.receipt['comparison'][platform]['v65'] = self.receipt['comparison'][platform].pop('v64')
        self.functional['kind'] = 'frozen-v65-functional-and-v60-visual-comparison-unshaped-http'
        self.receipt['imageBaselineIdentity'] = {**self.receipt['identity'], 'sourceCommit': 'd' * 40}
        self.recovery = {'kind': 'frozen-once-failed-image-recovery', 'releaseQualified': False,
            'firstImageResponseStatus': 503, 'imagePath': 'assets/hero-middle-CxRnxl.webp', 'readyDeadlineMs': 25000,
            'identities': {'v64': self.receipt['imageBaselineIdentity'], 'v65': self.receipt['identity']}, 'results': []}
        for version in ['v64', 'v65']:
            for trial in [1, 2]:
                uri = f'http://127.0.0.1/experience/{self.recovery["imagePath"]}?case={trial}'
                images = [{'src': uri, 'complete': True, 'width': 1672 if version == 'v65' else 0} for _ in range(2)]
                requests = [{'path': self.recovery['imagePath'], 'status': 503, 'injected': True}]
                if version == 'v65':
                    requests.append({'path': self.recovery['imagePath'], 'status': 200})
                self.recovery['results'].append({'version': version, 'trial': trial, 'platform': 'desktop',
                    'rangeId': 'hold:hero', 'progress': 0, 'elapsedMs': 500, 'ready': version == 'v65',
                    'injectionObserved': True, 'requests': requests, 'failedUri': uri,
                    'failedImagesBefore': [{'src': uri, 'complete': True, 'width': 0} for _ in range(2)], 'images': images,
                    'state': {'viewport': [1440, 900, 1], 'broken': [] if version == 'v65' else [uri, uri],
                        'snapshot': {'view': {'status': 'ready' if version == 'v65' else 'failed'}},
                        'videos': [{'readyState': 4, 'paused': True, 'seeking': False}]}})
        self.rebind()

    def rebind(self):
        self.base.rebind()
        relative = 'evidence/image-recovery.json'
        raw = native.encoded(self.recovery)
        (self.f.package / relative).write_bytes(raw)
        self.receipt['evidence']['imageRecovery'] = self.f.entry(relative, raw)
        self.base.base.public.rebind()

    def validate(self):
        with patch.object(native, 'V65_IMAGE_AUTH_SHA', self.base.base.public.auth):
            return native.validate_package(self.f.package, self.base.base.public.auth)

    def test_exact_recovery_does_not_grant_default_qualification(self):
        self.validate()
        with self.assertRaisesRegex(ValueError, 'not qualified'):
            native.validate_package(self.f.package)

    def test_preload_consumed_fault_cannot_count_as_retained_image_recovery(self):
        self.recovery['results'][0]['failedImagesBefore'][0]['width'] = 1672
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'retained failed-image state'):
            self.validate()

    def test_wider_deadline_or_other_artifact_is_rejected(self):
        self.recovery['readyDeadlineMs'] = 30000
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'original failure or readiness conditions'):
            self.validate()
        self.recovery['readyDeadlineMs'] = 25000
        self.recovery['identities']['v65'] = {**self.receipt['identity'], 'sourceCommit': 'a' * 40}
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'identity mismatch'):
            self.validate()

    def test_new_picture_or_pending_decoder_cannot_replace_genuine_recovery(self):
        self.recovery['results'][2]['images'][0]['src'] += '-replacement'
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'genuine parked frame'):
            self.validate()

    def test_original_visual_limit_remains(self):
        self.functional['visual'][0]['fraction'] = .00501
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'visual difference threshold'):
            self.validate()

    def test_only_inspected_v64_predecessor_is_allowed(self):
        self.assertEqual(native.NATIVE_PREDECESSORS['049b4b973a3dad8fd0e3966cd1b2f2fb2ed971a9c7aa77e0982984d360b69b73'],
            {'releaseId': 'r5-ba51d44', 'manifestSha256': 'f128c562a66e1091c0d42c3af7fad0085edb63db00eefefc906731ad6e51c9dc',
             'beforeIncludeSha256': 'a1d77c56bafc83b99a81364c381c07a19634189c725a78e4188bf57bbb745e92'})


if __name__ == '__main__':
    unittest.main()

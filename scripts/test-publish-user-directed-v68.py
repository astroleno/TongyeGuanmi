"""A sealed PH repair never authorizes a future candidate or memory pass."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('ph_fixtures', Path(__file__).with_name('test-publish-ph-cors-recovery.py'))
fixtures = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixtures)
native = fixtures.native


class ActualPhReceiptTests(unittest.TestCase):
    def test_exact_candidate_and_inspected_predecessor_are_not_future_authority(self):
        raw = Path(__file__).with_name('authorizations').joinpath('v68-ph-cors-publication-20261021.json').read_bytes()
        self.assertEqual(native.digest(raw), native.V68_PH_AUTH_SHA)
        receipt = json.loads(raw)
        self.assertEqual(receipt['identity']['sourceCommit'], '370e09e3f18036fdcd5d8f903005d5cd7f66902c')
        self.assertEqual(receipt['baselineIdentity']['sourceCommit'], 'ab570a1fc3d41de5d9a147d4c4f95df0e6d01419')
        self.assertTrue(receipt['doesNotGrantPassingQualification'])
        self.assertTrue(receipt['doesNotAuthorizeFutureCandidates'])
        self.assertEqual(native.NATIVE_PREDECESSORS['96141ee37ae7c6436da89e6b70e0b9f1f19fa0068d0bac52c359af1a41352f56'], {
            'releaseId': 'r5-ab570a1', 'manifestSha256': 'beaf7837a77bf4260f38d22cac784454c6c9de58ef8d8d744a6a1328d5c3f9cb',
            'beforeIncludeSha256': '64e100361759a410764aee9f8872b693dc5239bb56a53046660e6de9b46695c8'})


class ExactPhPackageTests(unittest.TestCase):
    def setUp(self):
        self.repair = fixtures.PhCorsRecoveryTests()
        self.repair.setUp()
        self.addCleanup(self.repair.doCleanups)
        self.f = self.repair.f
        self.rebind()

    def rebind(self):
        self.repair.rebind()
        self.repair.base.base.public.rebind()

    def validate(self):
        with patch.object(native, 'V68_PH_AUTH_SHA', self.repair.base.base.public.auth):
            return native.validate_package(self.f.package, self.repair.base.base.public.auth)

    def test_exact_network_repair_is_unqualified_by_default(self):
        self.validate()
        with self.assertRaisesRegex(ValueError, 'not qualified'):
            native.validate_package(self.f.package)

    def test_unknown_authorization_or_changed_artifact_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'exact user-directed'):
            native.validate_package(self.f.package, 'f' * 64)
        self.f.manifest['candidate'] = self.f.deploy['candidate'] = 'react-refactor-r5-parity-repair-candidate-v999'
        self.f.save_manifest()
        with self.assertRaisesRegex(ValueError, 'unchanged frozen'):
            self.validate()

    def test_a_request_owner_fix_cannot_fabricate_memory(self):
        self.repair.base.base.public.memory['pass'] = True
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'zero measured runs'):
            self.validate()

    def test_raw_first_failures_cannot_be_overwritten(self):
        path = self.f.package / self.repair.receipt['evidence']['phCorsRecovery']['path']
        path.write_bytes(path.read_bytes() + b' ')
        with self.assertRaisesRegex(ValueError, 'file identity mismatch'):
            self.validate()

    def test_frozen_traversal_cannot_be_borrowed_from_another_candidate(self):
        self.repair.functional['functional'][0]['identity'] = {**self.repair.receipt['identity'], 'sourceCommit': 'f' * 40}
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'functional or Proof'):
            self.validate()


if __name__ == '__main__':
    unittest.main()

"""One exact loading/Pattern repair never becomes general qualification."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('loading_fixtures', Path(__file__).with_name('test-publish-loading-recovery.py'))
fixtures = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixtures)
native = fixtures.native


class ActualLoadingReceiptTests(unittest.TestCase):
    def test_exact_receipt_and_inspected_predecessor_are_not_future_authority(self):
        raw = Path(__file__).with_name('authorizations').joinpath('v67-loading-publication-20261021.json').read_bytes()
        self.assertEqual(native.digest(raw), native.V67_LOADING_AUTH_SHA)
        receipt = json.loads(raw)
        self.assertEqual(receipt['identity']['sourceCommit'], 'ab570a1fc3d41de5d9a147d4c4f95df0e6d01419')
        self.assertEqual(receipt['baselineIdentity']['sourceCommit'], 'ae7c4ee56b94a52a06a9b4c8565002236b2b7dde')
        self.assertTrue(receipt['doesNotGrantPassingQualification'])
        self.assertTrue(receipt['doesNotAuthorizeFutureCandidates'])
        self.assertEqual(native.NATIVE_PREDECESSORS['64e100361759a410764aee9f8872b693dc5239bb56a53046660e6de9b46695c8'], {
            'releaseId': 'r5-ae7c4ee', 'manifestSha256': 'ff3c9543dd5114c4fcbac49d2aabce093b78512dc5ab3f897ce188a646f3dab5',
            'beforeIncludeSha256': '049b4b973a3dad8fd0e3966cd1b2f2fb2ed971a9c7aa77e0982984d360b69b73'})


class ExactLoadingPackageTests(unittest.TestCase):
    def setUp(self):
        self.repair = fixtures.LoadingRecoveryTests()
        self.repair.setUp()
        self.addCleanup(self.repair.doCleanups)
        self.f = self.repair.f
        self.rebind()

    def rebind(self):
        self.repair.rebind()
        self.repair.base.public.rebind()

    def validate(self):
        with patch.object(native, 'V67_LOADING_AUTH_SHA', self.repair.base.public.auth):
            return native.validate_package(self.f.package, self.repair.base.public.auth)

    def test_exact_pair_is_still_unqualified_by_default(self):
        self.validate()
        with self.assertRaisesRegex(ValueError, 'not qualified'):
            native.validate_package(self.f.package)

    def test_unsealed_authorization_or_changed_artifact_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'exact user-directed'):
            native.validate_package(self.f.package, 'f' * 64)
        self.f.manifest['candidate'] = self.f.deploy['candidate'] = 'react-refactor-r5-parity-repair-candidate-v999'
        self.f.save_manifest()
        with self.assertRaisesRegex(ValueError, 'unchanged frozen'):
            self.validate()

    def test_memory_cannot_be_fabricated_by_this_corrective_path(self):
        self.repair.base.public.memory['pass'] = True
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'zero measured runs'):
            self.validate()

    def test_raw_failure_evidence_cannot_be_overwritten(self):
        path = self.f.package / self.repair.receipt['evidence']['loadingRecovery']['path']
        path.write_bytes(path.read_bytes() + b' ')
        with self.assertRaisesRegex(ValueError, 'file identity mismatch'):
            self.validate()

    def test_complete_visual_gate_cannot_be_borrowed_from_a_different_candidate(self):
        self.repair.functional['functional'][0]['identity'] = {**self.repair.receipt['identity'], 'sourceCommit': 'f' * 40}
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'functional or Proof'):
            self.validate()


if __name__ == '__main__':
    unittest.main()

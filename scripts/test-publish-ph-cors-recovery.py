"""Image request ownership keeps every existing release qualification gate."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('loading_fixtures', Path(__file__).with_name('test-publish-loading-recovery.py'))
fixtures = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixtures)
native = fixtures.native


class PhCorsRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.base = fixtures.LoadingRecoveryTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.f, self.receipt = self.base.f, self.base.receipt
        self.cold, self.functional = self.base.cold, self.base.functional
        self.cold['kind'] = 'same-conditions-v67-v68-cold-media-comparison'
        self.cold['identities'] = {'v67': self.receipt['baselineIdentity'], 'v68': self.receipt['identity']}
        self.cold['environment']['atomicReadinessSnapshot'] = True
        for row in self.cold['results']:
            row['version'] = {'v65': 'v67', 'v67': 'v68'}[row['version']]
            row['videos'] = [{'paused': True, 'seeking': False}]
        self.functional['kind'] = 'frozen-v68-functional-and-v67-visual-comparison-unshaped-http'
        self.recovery = {'kind': 'v67-v68-native-ph-image-cors-request-recovery', 'passed': True,
                         'originalPoseDeadlineMs': 25000, 'viewport': [390, 844, 1], 'releaseQualified': False, 'results': []}
        complete = {'path': 'assets/ph_front-alpha-fixture.webp', 'bodySha256': '48b3cdade0bdf056ad1fa1fc0843d779138b2c50460947150bb3a8354fef3881',
                    'mode': 'cors', 'bytes': 484606, 'complete': True}
        for version in ['v67', 'v68']:
            for trial in [1, 2]:
                repaired = version == 'v68'
                self.recovery['results'].append({'version': version, 'trial': trial, 'ready': repaired,
                    'identity': self.receipt['identity'] if repaired else self.receipt['baselineIdentity'], 'elapsedMs': 1400,
                    'goal': {'rangeId': 'lab-ph', 'progress': .5, 'requestedProgress': .5} if repaired else None,
                    'state': {'platform': 'phone', 'viewport': [390, 844, 1], 'broken': [] if repaired else ['front.webp'],
                              'snapshot': {'pending': False, 'desired': {'rangeId': 'lab-ph', 'progress': .5},
                                           'view': {'status': 'ready' if repaired else 'failed'}},
                              'videos': [{'paused': True, 'seeking': False, 'readyState': 4}]},
                    'health': {'errors': []}, 'requests': [copy.deepcopy(complete)] + ([] if repaired else [{**complete,
                        'mode': 'no-cors', 'bytes': 32, 'complete': False, 'fault': 'same-body-prefix-truncated-no-cors'}])})
        self.rebind()

    def rebind(self):
        for key, data in [('phCorsRecovery', self.recovery), ('coldComparison', self.cold), ('functional', self.functional)]:
            relative = 'evidence/' + key + '.json'
            raw = native.encoded(data)
            (self.f.package / relative).write_bytes(raw)
            self.receipt['evidence'][key] = self.f.entry(relative, raw)

    def validate(self):
        native.validate_ph_cors_recovery(self.f.package, self.receipt)

    def test_complete_counterfactual_is_not_memory_qualification(self):
        self.validate()
        with self.assertRaisesRegex(ValueError, 'not qualified'):
            native.validate_package(self.f.package)

    def test_original_deadline_cannot_be_raised(self):
        self.recovery['originalPoseDeadlineMs'] = 25001
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'original deadline'):
            self.validate()

    def test_both_paired_trials_are_required(self):
        self.recovery['results'].pop()
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'paired trials'):
            self.validate()

    def test_another_candidate_cannot_borrow_the_trace(self):
        self.recovery['results'][-1]['identity'] = {**self.receipt['identity'], 'sourceCommit': 'f' * 40}
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'identity mismatch'):
            self.validate()

    def test_baseline_needs_a_real_truncated_duplicate_and_complete_mask(self):
        self.recovery['results'][0]['requests'].pop()
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'truncated duplicate'):
            self.validate()

    def test_claiming_recovery_with_duplicate_or_non_cors_requests_is_rejected(self):
        self.recovery['results'][-1]['requests'].append(copy.deepcopy(self.recovery['results'][-1]['requests'][0]))
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'one complete request'):
            self.validate()

    def test_a_seeking_or_empty_decoder_is_not_a_complete_frame(self):
        self.recovery['results'][-1]['state']['videos'][0]['seeking'] = True
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'parked decoded media'):
            self.validate()

    def test_changed_pixels_or_different_poses_are_rejected(self):
        self.recovery['results'][-1]['requests'][0]['bodySha256'] = 'f' * 64
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'actual image, pose'):
            self.validate()

    def test_healthy_loading_coverage_and_original_visual_threshold_remain(self):
        self.cold['results'].pop()
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'all forty'):
            self.validate()

    def test_visual_regression_is_not_authorized_by_a_network_repair(self):
        self.functional['visual'][0]['fraction'] = .00501
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'visual difference'):
            self.validate()

    def test_power_mode_cannot_be_changed_between_samples(self):
        self.cold['environment']['powerAfter'] = 'changed'
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'protocol changed'):
            self.validate()

    def test_separate_readiness_and_decoder_observations_are_not_atomic(self):
        self.cold['environment']['atomicReadinessSnapshot'] = False
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'protocol changed'):
            self.validate()

    def test_a_seeking_decoder_cannot_be_claimed_as_a_healthy_sample(self):
        self.cold['results'][0]['videos'][0]['seeking'] = True
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'atomically observe'):
            self.validate()


if __name__ == '__main__':
    unittest.main()

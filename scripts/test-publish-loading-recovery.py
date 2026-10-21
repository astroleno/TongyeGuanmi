"""Controlled loading improvement retains the original artifact/visual gates."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('relative_fixtures', Path(__file__).with_name('test-publish-user-directed-v63.py'))
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)
native = previous.native


class LoadingRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.base = previous.RelativePublicationTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.f, self.receipt = self.base.f, self.base.receipt
        self.cold, self.functional = self.base.cold, self.base.functional
        self.cold['kind'] = 'same-conditions-v65-v67-cold-media-comparison'
        self.cold['identities'] = {'v65': self.receipt['baselineIdentity'], 'v67': self.receipt['identity']}
        self.cold['environment'] = {'latencyMs': 400, 'bytesPerChunk': 16384, 'chunkIntervalMs': 10,
                                    'targetCacheDisabled': True, 'powerBefore': 'unchanged', 'powerAfter': 'unchanged'}
        for row in self.cold['results']:
            row['version'] = {'v60': 'v65', 'v63': 'v67'}[row['version']]
        self.functional['kind'] = 'frozen-v67-functional-and-v65-visual-comparison-unshaped-http'
        self.recovery = {'kind': 'frozen-live-final-transfer-recovery', 'releaseQualified': False,
                         'videoFirstByteMs': 6000, 'frameDeadlineMs': 19000, 'readyDeadlineMs': 25000,
                         'identities': self.cold['identities'], 'results': []}
        for version in ['v65', 'v67']:
            for trial in [1, 2]:
                repaired = version == 'v67'
                self.recovery['results'].append({'version': version, 'trial': trial, 'ready': repaired,
                    'platform': 'desktop', 'rangeId': 'education-crane', 'progress': .25,
                    'elapsedMs': 7400 if repaired else 4500, 'errors': [], 'failure': None if repaired else 'Frame stalled',
                    'mediaEvents': [{'readyState': 0, 'networkState': 2}],
                    'requests': [{'startedAt': 1000, 'headersAt': 7001, 'bytes': 100 if repaired else 0,
                                  'complete': repaired, 'bodySha256': 'a' * 64}],
                    'state': {'viewport': [1440, 900, 1], 'broken': [],
                              'snapshot': {'view': {'status': 'ready' if repaired else 'failed'}},
                              'videos': [{'readyState': 4, 'paused': True, 'seeking': False}]}})
        self.rebind()

    def rebind(self):
        for name, data in [('coldComparison', self.cold), ('functional', self.functional), ('loadingRecovery', self.recovery)]:
            relative = 'evidence/' + name + '.json'
            raw = native.encoded(data)
            (self.f.package / relative).write_bytes(raw)
            self.receipt['evidence'][name] = self.f.entry(relative, raw)

    def validate(self):
        native.validate_loading_recovery(self.f.package, self.receipt)

    def test_complete_paired_improvement_is_accepted_without_qualification(self):
        self.validate()
        with self.assertRaisesRegex(ValueError, 'not qualified'):
            native.validate_package(self.f.package)

    def test_frame_and_pose_deadlines_cannot_be_raised(self):
        for field, value in [('frameDeadlineMs', 19001), ('readyDeadlineMs', 25001)]:
            original = self.recovery[field]
            self.recovery[field] = value
            self.rebind()
            with self.assertRaisesRegex(ValueError, 'original deadline'):
                self.validate()
            self.recovery[field] = original

    def test_another_candidate_cannot_borrow_the_recovery(self):
        self.recovery['identities'] = {**self.recovery['identities'], 'v67': {**self.receipt['identity'], 'sourceCommit': 'f' * 40}}
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'identity mismatch'):
            self.validate()

    def test_missing_loading_state_is_not_a_reproduced_network_failure(self):
        self.recovery['results'][0]['mediaEvents'] = []
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'genuine loading'):
            self.validate()

    def test_pending_or_unloaded_video_is_not_repaired(self):
        self.recovery['results'][-1]['state']['videos'][0]['seeking'] = True
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'parked decoded'):
            self.validate()

    def test_failed_or_missing_healthy_sample_is_rejected(self):
        self.cold['results'].pop()
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'all forty'):
            self.validate()

    def test_original_visual_threshold_and_all_functional_points_remain(self):
        self.functional['visual'][0]['fraction'] = .00501
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'visual difference'):
            self.validate()
        self.functional['visual'][0]['fraction'] = 0
        self.functional['functional'][0]['points'].pop()
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'functional or Proof'):
            self.validate()

    def test_environment_or_qualification_claims_are_rejected(self):
        self.cold['environment']['powerAfter'] = 'changed'
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'protocol changed'):
            self.validate()
        self.cold['environment']['powerAfter'] = 'unchanged'
        self.recovery['releaseQualified'] = True
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'original deadline'):
            self.validate()


if __name__ == '__main__':
    unittest.main()

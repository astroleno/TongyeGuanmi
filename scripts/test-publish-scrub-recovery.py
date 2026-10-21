"""The incremental scrub repair cannot waive original evidence or qualification."""
import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('ph_fixtures', Path(__file__).with_name('test-publish-ph-cors-recovery.py'))
fixtures = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixtures)
native = fixtures.native


class ScrubRecoveryTests(unittest.TestCase):
    def test_actual_receipt_pins_only_the_inspected_candidate_and_predecessor(self):
        import json
        raw = Path(__file__).with_name('authorizations').joinpath('v69-scrub-publication-20261021.json').read_bytes()
        self.assertEqual(native.digest(raw), native.V69_SCRUB_AUTH_SHA)
        receipt = json.loads(raw)
        self.assertEqual(receipt['identity']['sourceCommit'], '81daca0d36a9219bf41e8f6afd5a768bb7ab9505')
        self.assertEqual(receipt['baselineIdentity']['sourceCommit'], '370e09e3f18036fdcd5d8f903005d5cd7f66902c')
        self.assertTrue(receipt['doesNotGrantPassingQualification'])
        self.assertTrue(receipt['doesNotAuthorizeFutureCandidates'])
        self.assertEqual(native.NATIVE_PREDECESSORS['2db02d2bbc08b4fbde6e1d05beccbbf0ee9dfedb391b755161133ba7915809cf']['releaseId'], 'r5-370e09e')

    def setUp(self):
        self.ph = fixtures.PhCorsRecoveryTests()
        self.ph.setUp()
        self.addCleanup(self.ph.doCleanups)
        self.f, self.receipt = self.ph.f, self.ph.receipt
        self.cold, self.functional = self.ph.cold, self.ph.functional
        self.cold['kind'] = 'same-conditions-v68-v69-cold-media-comparison'
        self.cold['identities'] = {'v68': self.receipt['baselineIdentity'], 'v69': self.receipt['identity']}
        for row in self.cold['results']:
            row['version'] = {'v67': 'v68', 'v68': 'v69'}[row['version']]
        self.functional['kind'] = 'frozen-v69-functional-and-v68-visual-comparison-unshaped-http'
        self.recovery = {'kind': 'v68-v69-native-reverse-range-seek-recovery', 'releaseQualified': False,
                         'originalConvergenceDeadlineMs': 20000, 'sourceFrameRate': 30, 'passed': True,
                         'identities': self.cold['identities'], 'results': []}
        self.receipt['driverSources'] = {'v68': 'a' * 64, 'v69': 'b' * 64}
        self.recovery['fixture'] = {'assetBytes': 1341930, 'assetSha256': 'c' * 64,
                                    'baselineDriverSha256': 'a' * 64, 'candidateDriverSha256': 'b' * 64}
        for version in ['v68', 'v69']:
            for trial in [1, 2]:
                repaired = version == 'v69'
                self.recovery['results'].append({'version': version, 'trial': trial, 'ready': repaired,
                    'elapsedMs': 4400 if repaired else 20020,
                    'final': {'driver': {'desiredProgress': .4, 'generation': 1, 'frameReady': repaired, 'presentedTime': .9666667},
                              'video': {'paused': True, 'error': None, 'time': .966666, 'readyState': 4 if repaired else 1,
                                        'seeking': not repaired, 'networkState': 1 if repaired else 2, 'retry': '1' if repaired else None}},
                    'requests': {'requests': [{'fault': 'zero-body-range-stall', 'range': 'bytes=458752-', 'sent': 0}]
                                 + ([{'start': 0, 'sent': 1341930, 'complete': True}] if repaired else [])}})
        self.receipt['measurementSha256'] = 'a' * 64
        self.performance = {'kind': 'same-original-gates-v68-v69-scroll-comparison', 'releaseQualified': False,
                            'completeMeasurements': True, 'measurementSha256': 'a' * 64, 'results': []}
        for platform in ['desktop', 'phone']:
            for version in ['v68', 'v69']:
                for segment in ['hero-pattern', 'pattern-star-map', 'aod-method-top', 'figure2-distance-expand',
                                'figure3-services', 'ttg-lab', 'ph-education', 'crane-contact']:
                    self.performance['results'].append({'platform': platform, 'version': version, 'id': segment,
                        'measured': True, 'passed': False, 'health': {'errors': []}})
        self.rebind()

    def rebind(self):
        for key, report in [('scrubRecovery', self.recovery), ('coldComparison', self.cold),
                            ('functional', self.functional), ('scrollComparison', self.performance)]:
            relative, raw = 'evidence/' + key + '.json', native.encoded(report)
            (self.f.package / relative).write_bytes(raw)
            self.receipt['evidence'][key] = self.f.entry(relative, raw)
        self.ph.base.base.public.rebind()

    def validate(self):
        auth = self.ph.base.base.public.auth
        with patch.object(native, 'V69_SCRUB_AUTH_SHA', auth):
            return native.validate_package(self.f.package, auth)

    def test_complete_repair_keeps_failed_performance_and_unmeasured_memory(self):
        self.validate()
        with self.assertRaisesRegex(ValueError, 'not qualified'):
            native.validate_package(self.f.package)

    def test_exact_receipt_does_not_authorize_future_or_modified_candidates(self):
        with self.assertRaisesRegex(ValueError, 'exact user-directed'):
            native.validate_package(self.f.package, 'f' * 64)
        self.f.manifest['candidate'] = self.f.deploy['candidate'] = 'react-refactor-r5-parity-repair-candidate-v999'
        self.f.save_manifest()
        with self.assertRaisesRegex(ValueError, 'unchanged frozen'):
            self.validate()

    def test_original_convergence_deadline_cannot_change(self):
        self.recovery['originalConvergenceDeadlineMs'] = 20001
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'original deadline'):
            self.validate()

    def test_both_paired_native_trials_are_required(self):
        self.recovery['results'].pop()
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'paired trials'):
            self.validate()

    def test_a_zero_body_range_must_be_genuinely_observed(self):
        self.recovery['results'][0]['requests']['requests'][0]['sent'] = 1
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'genuine body-stalled'):
            self.validate()

    def test_still_seeking_is_not_a_recovered_frame(self):
        self.recovery['results'][-1]['final']['video']['seeking'] = True
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'real parked frame'):
            self.validate()

    def test_same_source_full_bytes_and_two_ms_alignment_are_required(self):
        self.recovery['results'][-1]['final']['video']['time'] += .003
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'real parked frame'):
            self.validate()

    def test_native_failure_cannot_be_retroactively_reclassified(self):
        self.recovery['results'][0]['ready'] = True
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'genuine body-stalled'):
            self.validate()

    def test_atomic_cold_coverage_and_power_conditions_remain(self):
        self.cold['environment']['atomicReadinessSnapshot'] = False
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'protocol changed'):
            self.validate()

    def test_missing_cold_sample_is_rejected(self):
        self.cold['results'].pop()
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'forty atomic'):
            self.validate()

    def test_missing_or_different_original_scroll_measurement_is_rejected(self):
        self.performance['measurementSha256'] = 'b' * 64
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'original scroll measurements'):
            self.validate()

    def test_original_visual_tolerance_is_not_relaxed(self):
        self.functional['visual'][0]['fraction'] = .00501
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'visual difference'):
            self.validate()

    def test_network_recovery_cannot_invent_process_memory(self):
        self.ph.base.base.public.memory['pass'] = True
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'zero measured runs'):
            self.validate()

    def test_raw_evidence_cannot_change_after_sealing(self):
        p = self.f.package / self.receipt['evidence']['scrubRecovery']['path']
        p.write_bytes(p.read_bytes() + b' ')
        with self.assertRaisesRegex(ValueError, 'file identity mismatch'):
            self.validate()


if __name__ == '__main__':
    unittest.main()

"""RVFC work reduction preserves every original evidence and qualification gate."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('scrub_fixtures', Path(__file__).with_name('test-publish-scrub-recovery.py'))
fixtures = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixtures)
native = fixtures.native


class CallbackRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.base = fixtures.ScrubRecoveryTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.f, self.receipt = self.base.f, self.base.receipt
        self.receipt['callbackBaselineIdentity'] = copy.deepcopy(self.receipt['baselineIdentity'])
        self.base.recovery['kind'] = 'v68-v70-native-reverse-range-seek-recovery'
        self.base.cold['kind'] = 'same-conditions-v68-v70-cold-media-comparison'
        self.base.performance['kind'] = 'same-original-gates-v68-v70-scroll-comparison'
        self.base.functional['kind'] = 'frozen-v70-functional-and-v68-visual-comparison-unshaped-http'
        self.receipt['driverSources']['v70'] = self.receipt['driverSources'].pop('v69')
        # The two reports share their identities dictionary; replace it once.
        identities = self.base.cold['identities']
        identities['v70'] = identities.pop('v69')
        for report in [self.base.recovery, self.base.cold, self.base.performance]:
            for row in report['results']:
                if row['version'] == 'v69':
                    row['version'] = 'v70'
        self.callback = {'kind': 'v69-v70-native-proof-readback-cost-comparison', 'releaseQualified': False,
            'pixelsChanged': False, 'proofsChanged': False, 'viewport': [1440, 900, 1],
            'originalMeasurementSeconds': 10, 'outerDeadlineMs': 15000, 'passed': True, 'results': [],
            'totals': {'v69': 8, 'v70': 4}}
        for version in ['v69', 'v70']:
            for trial in [1, 2]:
                for segment in ['ttg-lab', 'crane-contact']:
                    calls = 1 if version == 'v70' else 2
                    self.callback['results'].append({'version': version, 'trial': trial, 'id': segment,
                        'identity': self.receipt['identity'] if version == 'v70' else self.receipt['callbackBaselineIdentity'],
                        'measured': True, 'measurement': {'samples': [{'time': 0}, {'time': 5000}, {'time': 10000}]},
                        'summary': {'checks': dict.fromkeys(['completeVisibleSampling', 'videosPaused', 'finalPose',
                            'fixedViewport', 'focusedSampling'], True)}, 'health': {'errors': []},
                        'readbackCalls': calls, 'copyCalls': calls, 'costs': {'reads': [0.1] * calls, 'draws': [2.0] * calls}})
        self.rebind()

    def rebind(self):
        self.base.rebind()
        raw, relative = native.encoded(self.callback), 'evidence/callback-cost.json'
        (self.f.package / relative).write_bytes(raw)
        self.receipt['evidence']['callbackCostComparison'] = self.f.entry(relative, raw)
        self.base.ph.base.base.public.rebind()

    def validate(self):
        auth = self.base.ph.base.base.public.auth
        with patch.object(native, 'V70_CALLBACK_AUTH_SHA', auth):
            return native.validate_package(self.f.package, auth)

    def test_readback_improvement_does_not_grant_qualification(self):
        self.validate()
        with self.assertRaisesRegex(ValueError, 'not qualified'):
            native.validate_package(self.f.package)

    def test_all_counterbalanced_samples_are_required(self):
        self.callback['results'].pop()
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'eight counterbalanced'):
            self.validate()

    def test_counts_are_recomputed_from_raw_reads(self):
        self.callback['totals']['v70'] = 0
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'did not decrease'):
            self.validate()

    def test_no_actual_reduction_is_rejected(self):
        for row in self.callback['results']:
            row.update(readbackCalls=2, copyCalls=2, costs={'reads': [.1, .1], 'draws': [2., 2.]})
        self.callback['totals'] = {'v69': 8, 'v70': 8}
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'did not decrease'):
            self.validate()

    def test_fabricated_counts_cannot_replace_real_reads(self):
        self.callback['results'][-1]['readbackCalls'] = 0
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'real complete samples'):
            self.validate()

    def test_original_sampler_duration_is_required(self):
        self.callback['originalMeasurementSeconds'] = 9
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'original sampling'):
            self.validate()

    def test_incomplete_sample_or_bad_pose_cannot_claim_work_reduction(self):
        for field in ['completeVisibleSampling', 'videosPaused', 'finalPose', 'fixedViewport', 'focusedSampling']:
            with self.subTest(field=field):
                self.callback['results'][-1]['summary']['checks'][field] = False
                self.rebind()
                with self.assertRaisesRegex(ValueError, 'real complete samples'):
                    self.validate()
                self.callback['results'][-1]['summary']['checks'][field] = True

    def test_old_artifact_cannot_lend_its_cost_evidence(self):
        self.callback['results'][-1]['identity'] = {'sourceCommit': 'f' * 40}
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'another artifact'):
            self.validate()

    def test_original_scrub_recovery_still_required(self):
        self.base.recovery['originalConvergenceDeadlineMs'] = 20001
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'original deadline'):
            self.validate()

    def test_original_visual_gate_still_required(self):
        self.base.functional['visual'][0]['fraction'] = .00501
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'visual difference'):
            self.validate()

    def test_missing_memory_cannot_be_invented(self):
        self.base.ph.base.base.public.memory['pass'] = True
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'zero measured runs'):
            self.validate()

    def test_non_finite_cost_is_rejected(self):
        self.callback['results'][-1]['costs']['draws'][0] = float('nan')
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'real complete samples'):
            self.validate()

    def test_pixel_or_proof_changes_are_not_authorized(self):
        self.callback['pixelsChanged'] = True
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'pixels or qualification'):
            self.validate()


class RetainedDiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.case = CallbackRecoveryTests()
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)
        self.receipt, self.f = self.case.receipt, self.case.f
        self.receipt.update(retainedDiagnosticPublication=True, knownBrowserCommunicationErrorsRetained=True,
                            callbackAbsoluteCountsUsedAsImprovementProof=False, doesNotGrantPassingQualification=True)
        self.receipt['driverSources']['v69'] = 'e' * 64
        error = {'method': 'Log.entryAdded', 'details': {'source': 'other', 'level': 'error',
                 'text': 'Unchecked runtime.lastError: Could not establish connection. Receiving end does not exist.'}}
        functional = self.case.base.functional
        functional['passed'] = False
        for row in functional['functional']:
            row.update(passed=False, errors=[copy.deepcopy(error)])
        self.receipt['retainedFunctionalDiagnostics'] = [
            {'platform': r['platform'], 'passed': False, 'browserErrorCount': 1,
             'browserErrorSha256': native.digest(native.encoded(r['errors']))} for r in functional['functional']]
        for row in self.case.base.performance['results']:
            row.update(passed=False, failures=['rafInterval'], health={'errors': [copy.deepcopy(error)]})
        self.receipt['retainedScrollDiagnostics'] = [native.retained_scroll_diagnostic(r) for r in self.case.base.performance['results']]
        self.receipt['retainedColdDiagnostics'] = [native.retained_cold_diagnostic(r) for r in self.case.base.cold['results']]
        self.case.callback['passed'] = False
        self.proof = {'kind': 'v69-v70-visible-native-causal-frame-proof', 'releaseQualified': False,
            'diagnosticOnly': True, 'notOriginalPerformanceQualification': True, 'passed': True,
            'allBrowserCleanupFinished': True, 'originalConvergenceDeadlineMs': 20000, 'sourceFrameRate': 30,
            'fixture': {'assetBytes': 1341930,
                'assetSha256': '6c82ceeb31ce814e137c880ae41650e5d24df26a202a4af8a3d8a9d60dbeff00',
                'driverSources': {v: self.receipt['driverSources'][v] for v in ['v69', 'v70']}},
            'totals': {'v69': 16, 'v70': 14}, 'results': []}
        self.receipt['nativeTargetReadbacks'] = dict(self.proof['totals'])
        for version in ['v69', 'v70']:
            for trial in [1, 2]:
                for p in range(1, 9):
                    saved = version == 'v70' and trial == 2 and p >= 7
                    self.proof['results'].append({'version': version, 'trial': trial, 'progress': p / 10,
                        'elapsedMs': 10, 'passed': True, 'visible': True, 'focused': True, 'viewport': [1440, 900, 1],
                        'snapshot': {'driver': {'frameReady': True, 'generation': 1, 'desiredProgress': p / 10,
                            'targetTime': p / 10, 'presentedTime': p / 10}, 'proof': 'video-frame-callback' if saved else 'decoded-canvas',
                            'video': {'time': p / 10, 'readyState': 4, 'paused': True, 'seeking': False, 'error': None}},
                        'calls': {'reads': [] if saved else [{'duration': .1}], 'draws': [] if saved else [{'duration': .1}],
                                  'callbacks': [{'mediaTime': p / 10}] if saved else []}})
        self.rebind()

    def rebind(self):
        relative = 'evidence/native-callback-proof.json'
        raw = native.encoded(self.proof)
        (self.f.package / relative).write_bytes(raw)
        self.receipt['evidence']['nativeCallbackProof'] = self.f.entry(relative, raw)
        self.case.rebind()

    def test_retained_failures_allow_only_explicit_public_test_not_qualification(self):
        self.case.validate()
        with self.assertRaisesRegex(ValueError, 'not qualified'):
            native.validate_package(self.f.package)

    def test_original_failed_checks_cannot_be_reclassified(self):
        self.case.base.performance['results'][0]['passed'] = True
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'remain failed'):
            self.case.validate()

    def test_unrelated_functional_errors_are_not_waived(self):
        self.case.base.functional['functional'][0]['errors'][0]['details']['text'] = 'Application crashed'
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'exact retained'):
            self.case.validate()

    def test_unrelated_scroll_errors_are_not_waived(self):
        self.case.base.performance['results'][0]['health']['errors'][0]['details']['text'] = 'Application crashed'
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'remain failed'):
            self.case.validate()

    def test_absolute_confounded_counts_are_not_improvement_proof(self):
        self.receipt['callbackAbsoluteCountsUsedAsImprovementProof'] = True
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'explicit retained'):
            self.case.validate()

    def test_native_comparison_must_include_every_equal_target(self):
        self.proof['results'].pop()
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'thirty-two'):
            self.case.validate()

    def test_zero_read_without_native_callback_is_not_proof(self):
        self.proof['results'][-1]['calls']['callbacks'] = []
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'genuine native callback'):
            self.case.validate()

    def test_callback_metadata_must_match_the_presented_frame(self):
        self.proof['results'][-1]['calls']['callbacks'][0]['mediaTime'] = 0
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'genuine native callback'):
            self.case.validate()

    def test_fallback_still_needs_real_pixel_proof(self):
        self.proof['results'][0]['calls'].update(reads=[], draws=[])
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'actual decoded pixel'):
            self.case.validate()

    def test_parked_native_target_and_original_deadline_are_required(self):
        for field, value in [('elapsedMs', 20001), ('visible', False), ('focused', False)]:
            with self.subTest(field=field):
                row = self.proof['results'][-1]
                old = row[field]
                row[field] = value
                self.rebind()
                with self.assertRaisesRegex(ValueError, 'parked'):
                    self.case.validate()
                row[field] = old

    def test_actual_saved_count_cannot_be_invented(self):
        self.proof['totals']['v70'] = 0
        self.rebind()
        with self.assertRaisesRegex(ValueError, 'actually decrease'):
            self.case.validate()

    def test_real_receipt_is_exactly_pinned(self):
        raw = Path(__file__).with_name('authorizations').joinpath('v70-callback-publication-20261022.json').read_bytes()
        self.assertEqual(native.digest(raw), native.V70_CALLBACK_AUTH_SHA)
        receipt = json.loads(raw)
        self.assertFalse(receipt['callbackAbsoluteCountsUsedAsImprovementProof'])
        self.assertEqual(receipt['nativeTargetReadbacks'], {'v69': 16, 'v70': 14})
        self.assertTrue(receipt['doesNotGrantPassingQualification'])



if __name__ == '__main__':
    unittest.main()



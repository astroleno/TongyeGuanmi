"""Offline synthetic fixtures; never used as browser qualification evidence."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('publication', Path(__file__).with_name('publish-experience-release.py'))
publication = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publication)


class InitialRecoveryPublicationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='tongye-initial-publication-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / 'evidence').mkdir()
        data = b'offline screenshot identity fixture, not a real image'
        (self.root / 'evidence/fixture.png').write_bytes(data)
        shot = {'path': 'fixture.png', 'bytes': len(data), 'sha256': publication.digest(data)}
        self.compiled = {'v70': '1' * 64, 'candidate': '2' * 64}
        sources = {'aod': '00eff9f26a39c48e04a9935ca6de177b5cc504c3659bd7ac72e0da0052956d1e',
                   'figure2': '4366350bbe7c6b1517fa042937bcf7f61b7b8190cece2a50ac59ba8a80511fe6'}
        rows = []
        for asset, mode, faults in [('aod', 'body', 2), ('figure2', 'body', 2), ('aod', 'slow', 0)]:
            for version in ['v70', 'candidate']:
                passing = version == 'candidate' or mode == 'slow'
                row = {'trial': f'v72/initial-{asset}-{mode}-{version}', 'asset': asset, 'version': version,
                       'mode': mode, 'faults': faults, 'source': {'sha': sources[asset]},
                       'compiledDriverSha256': self.compiled[version], 'originalDeadlineMs': 20000,
                       'releaseQualified': False, 'before': {'video': {'readyState': 0, 'seeking': False, 'networkState': 2}},
                       'passed': passing, 'loads': faults if passing else 0, 'checks': {'withinOriginalDeadline': passing},
                       'screenshot': shot,
                       'final': {'video': {'paused': True, 'seeking': False, 'readyState': 2, 'currentTime': 0},
                                 'driver': {'frameReady': True, 'targetTime': 0, 'presentedTime': 0,
                                            'generation': 1, 'presentedGeneration': 1}}}
                if passing:
                    row['readyMs'] = 13000 if faults else 5000
                rows.append(row)
        self.report = {'originalDeadlineMs': 20000, 'releaseQualified': False, 'rows': rows}

    def validate(self):
        publication.validate_v72_initial_recovery(self.root, self.report, self.compiled)

    def test_accepts_complete_physical_proofs_with_baseline_deadlocks_retained(self):
        self.validate()

    def test_rejects_original_deadline_or_budget_changes(self):
        for key, value in [('readyMs', 20001), ('loads', 3), ('originalDeadlineMs', 21000)]:
            with self.subTest(key=key):
                old = copy.deepcopy(self.report)
                self.report['rows'][1][key] = value
                with self.assertRaises(ValueError): self.validate()
                self.report = old

    def test_rejects_synthetic_ready_or_nonzero_presented_target(self):
        for part, key, value in [('video', 'paused', False), ('video', 'seeking', True),
                                 ('video', 'readyState', 1), ('video', 'currentTime', 1), ('driver', 'frameReady', False),
                                 ('driver', 'presentedTime', .1), ('driver', 'presentedGeneration', 2)]:
            with self.subTest(key=key):
                old = copy.deepcopy(self.report)
                self.report['rows'][1]['final'][part][key] = value
                with self.assertRaises(ValueError): self.validate()
                self.report = old

    def test_rejects_erasing_baseline_failure(self):
        self.report['rows'][0]['passed'] = True
        with self.assertRaises(ValueError): self.validate()

    def test_rejects_missing_nonseeking_initial_transfer_or_wrong_source(self):
        self.report['rows'][1]['before']['video']['seeking'] = True
        with self.assertRaises(ValueError): self.validate()
        self.report['rows'][1]['before']['video']['seeking'] = False
        self.report['rows'][1]['compiledDriverSha256'] = '9' * 64
        with self.assertRaises(ValueError): self.validate()

    def test_rejects_missing_cases_or_changed_screenshot_bytes(self):
        original = self.report['rows'].pop()
        with self.assertRaises(ValueError): self.validate()
        self.report['rows'].append(original)
        (self.root / 'evidence/fixture.png').write_bytes(b'changed')
        with self.assertRaises(ValueError): self.validate()


class V73InitialRecoveryPublicationTests(InitialRecoveryPublicationTests):
    def setUp(self):
        super().setUp()
        for row in self.report['rows']:
            row['trial'] = row['trial'].replace('v72/', 'v73/')

    def validate(self):
        publication.validate_v72_initial_recovery(self.root, self.report, self.compiled, 'v73')

    def test_v72_or_future_user_instruction_cannot_authorize_v73(self):
        for version in ['v73', 'v74']:
            with self.subTest(version=version), self.assertRaisesRegex(ValueError, 'exact unchanged user instruction'):
                publication.validate_v72_recovery(self.root, {
                    'userInstruction': 'publish anything', 'doesNotGrantPassingQualification': True,
                    'doesNotAuthorizeFutureCandidates': True}, version)

    def test_v72_source_bytes_cannot_be_relabelled_as_v73(self):
        binding = {'passed': True, 'rows': [
            {'version': 'v70', 'sourceSha256': '6f1b9027df1e6cf95843a9b01c7062c576e57a74cc8e3f518d61a77dcb663e15',
             'compiledSha256': '1' * 64, 'servedSha256': '1' * 64, 'exactMatch': True},
            {'version': 'candidate', 'sourceSha256': 'd68efda4552047a80849a10f9a91abe3a11cd5c11d69eceee0fcc107cfd31eac',
             'compiledSha256': '2' * 64, 'servedSha256': '2' * 64, 'exactMatch': True}]}
        (self.root / 'evidence/binding.json').write_text(json.dumps(binding))
        receipt = {'userInstruction': '允许重建专用验收组，继续补齐冷加载、视觉和滚动复测，不要放宽标准，失败项如实保留。确认比 v70 好就 commit push 到 main，再更新公网复测。',
                   'doesNotGrantPassingQualification': True, 'doesNotAuthorizeFutureCandidates': True,
                   'evidence': {'nativeBinding': {'path': 'evidence/binding.json'}}}
        with self.assertRaisesRegex(ValueError, 'native media proof'):
            publication.validate_v72_recovery(self.root, receipt, 'v73')


if __name__ == '__main__':
    unittest.main()

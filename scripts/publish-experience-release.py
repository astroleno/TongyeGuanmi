#!/usr/bin/env python3
"""Native /experience/ publication; never change the root current symlink.

Only explicitly pinned predecessors are supported. Package validation,
isolated real-nginx probing, CAS application and CAS rollback are separate steps.
No step grants the application its missing browser/performance qualification.
"""
import argparse
import contextlib
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import math
import mimetypes
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import socket
import stat
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

SITE = Path('/www/wwwroot/tongye.me')
VHOST = Path('/www/server/panel/vhost/nginx/html_tongye.me.conf')
INCLUDE = Path('/www/server/panel/vhost/nginx/tongye-experience-routes.inc')
BASE_ID = 'r5-ef69e06'
MOUNT_ID = 'experience-v55-20261019-02'
BASE_SHA = '46609b35907e855e6be6bd8763a9a9b589be1910801e5cd106e537cd3aa67c4f'
MOUNT_SHA = 'a8c155dc3c2e9f3cf0c8ce276d724a8f80b7757332ddab98ae6ec5d78df81ed8'
PREDECESSOR_SHA = 'c4631c1e36e173c434ce980ae266723e57c59b90280aa3ac7c7ddeab15d4a321'
PUBLIC_ORIGIN = 'https://tongye.me'
# One explicitly directed publication, not a new qualification policy. This
# exact receipt pins v59 and its unchanged failing evidence; no other release
# or fabricated pass flag can use this path. Default publication stays strict.
V59_DIRECT_AUTH_SHA = '0721104d84e66c813e5b1a2db98796b05bdc8b776be777b2b44b3ff202c534a8'
V60_PUBLIC_TEST_AUTH_SHA = 'a4357df7669a362473df1a0344233f3f830b9f88e9224b51aad8c39915ede5ae'
# This exact receipt alone records the user's relative-improvement instruction.
V63_RELATIVE_AUTH_SHA = '6b237a250650fd9496dad385cfc0f807992b1ced8e8fab9327434f70ab8f73c1'
V64_RECEIVER_AUTH_SHA = '6ac63feb93a73f525bcd79746ae674e512ac3a38e5e6e17198e9f4e6a4190b6f'
V65_IMAGE_AUTH_SHA = '33c6e82af56cf25f0b1e125be351786314cad2ffc0a7f90984bcacd1371bbdff'
V67_LOADING_AUTH_SHA = '17ccc51e38316a30b1be9077d6453236ab2cce7a9c6127ab7216f5a019cbdab6'
V68_PH_AUTH_SHA = '649860625c1c0976be908ec755b6726a48e218f9424ab3ea81baddced7fc0e10'
V69_SCRUB_AUTH_SHA = 'c03324b007b7f9775b4b4f9966bec6918c35fd44602609149e8ede153b4a6bbd'
V70_CALLBACK_AUTH_SHA = '5e011218bfd8871a349f6433643f06862d212f4e5b13fc778f8a22e0a0a52000'
# Populated only after the exact v72 reports and explicit user instruction are sealed.
V72_RECOVERY_AUTH_SHA = '0000000000000000000000000000000000000000000000000000000000000000'
# A separate exact receipt is required for v73; v72 remains unsealed/failed.
V73_RECOVERY_AUTH_SHA = None
# The second publication preserves both generations of lazy module URLs. This
# is not permission to accept arbitrary future predecessors or pending builds.
NATIVE_PREDECESSORS = {
    'd11780dfd3171756802ed92426cc380da6ba74872ee40b8fd0598cdabe9b2ecd': {
        'releaseId': 'r5-c58c7d9',
        'manifestSha256': '6ab24a1ff643438f880f2723902310ab69cc7829af5caeddd5486f6dd212fd1e',
        'beforeIncludeSha256': '30403daf587c3e9d4816650af117728841ca8a4dcdab32c56f15e1d3b4082d17',
    },
    '30403daf587c3e9d4816650af117728841ca8a4dcdab32c56f15e1d3b4082d17': {
        'releaseId': 'r5-81daca0',
        'manifestSha256': 'a1ee07ea6767650bb9b8a9b3cfacf1ae0f63c5d78b2bf79fef5b0b151a4b8037',
        'beforeIncludeSha256': '2db02d2bbc08b4fbde6e1d05beccbbf0ee9dfedb391b755161133ba7915809cf',
    },
    '2db02d2bbc08b4fbde6e1d05beccbbf0ee9dfedb391b755161133ba7915809cf': {
        'releaseId': 'r5-370e09e',
        'manifestSha256': 'a3612cbe7f78555013d8ed81415544fdc093622b18371ab9930a430a32c1060f',
        'beforeIncludeSha256': '96141ee37ae7c6436da89e6b70e0b9f1f19fa0068d0bac52c359af1a41352f56',
    },
    '96141ee37ae7c6436da89e6b70e0b9f1f19fa0068d0bac52c359af1a41352f56': {
        'releaseId': 'r5-ab570a1',
        'manifestSha256': 'beaf7837a77bf4260f38d22cac784454c6c9de58ef8d8d744a6a1328d5c3f9cb',
        'beforeIncludeSha256': '64e100361759a410764aee9f8872b693dc5239bb56a53046660e6de9b46695c8',
    },
    '01567f5ba32d8ecca93ec95a8a4cdf76f132a61ca208e2d74e8f9db0e4b20d71': {
        'releaseId': 'r5-c1ee8fd',
        'manifestSha256': '1b7d486bfb046f840cd65d51e4d2e915fe270cea383b3b4c38bcb1eba08c58d8'
    },
    'f6d494173450b37a586392763af8b373f628a639a25fe14125acd9de992ffdd4': {
        'releaseId': 'r5-cb8c17a',
        'manifestSha256': '978208bd19b5834dbade2a91340db0a09a161bd3d7ba89bd9bad8dd3445425ce',
        'beforeIncludeSha256': '01567f5ba32d8ecca93ec95a8a4cdf76f132a61ca208e2d74e8f9db0e4b20d71'
    },
    'a1d77c56bafc83b99a81364c381c07a19634189c725a78e4188bf57bbb745e92': {
        'releaseId': 'r5-ac18611',
        'manifestSha256': '5c093a9f3e0dcfbc1c9ccf5694ef90b685e8d0947006026a72eccc78ce5961cf',
        'beforeIncludeSha256': 'f6d494173450b37a586392763af8b373f628a639a25fe14125acd9de992ffdd4'
    },
    '049b4b973a3dad8fd0e3966cd1b2f2fb2ed971a9c7aa77e0982984d360b69b73': {
        'releaseId': 'r5-ba51d44',
        'manifestSha256': 'f128c562a66e1091c0d42c3af7fad0085edb63db00eefefc906731ad6e51c9dc',
        'beforeIncludeSha256': 'a1d77c56bafc83b99a81364c381c07a19634189c725a78e4188bf57bbb745e92'
    },
    '64e100361759a410764aee9f8872b693dc5239bb56a53046660e6de9b46695c8': {
        'releaseId': 'r5-ae7c4ee',
        'manifestSha256': 'ff3c9543dd5114c4fcbac49d2aabce093b78512dc5ab3f897ce188a646f3dab5',
        'beforeIncludeSha256': '049b4b973a3dad8fd0e3966cd1b2f2fb2ed971a9c7aa77e0982984d360b69b73'
    }
}
DIRECT_AUTH_PATH = 'user-directed-publication.json'
SCROLL_BUDGETS = {'peakBrowserTreeRssBytes': 1500000000, 'peakGpuProcessRssBytes': 512 * 1024 * 1024,
                  'peakRendererRssBytes': 1024 * 1024 * 1024, 'peakJsHeapBytes': 192 * 1024 * 1024,
                  'settledHeapFractionOfPeak': 0.9, 'maxMountedLayers': 3, 'maxWebglCanvasesAtHold': 1,
                  'maxWebglCanvasesInTransition': 2, 'maxVideosAtContact': 4}
SCROLL_SCENES = ['hero', 'pattern', 'star-map', 'aod-animation', 'method-top', 'figure2-animation',
                 'figure2-proof', 'brand', 'figure3-animation', 'services', 'ttg-animation', 'lab',
                 'ph-animation', 'education', 'crane-animation', 'contact']


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def safe_name(name):
    if not isinstance(name, str) or not name or not re.fullmatch(r'[A-Za-z0-9_.\-/]+', name):
        raise ValueError('unsafe filename')
    value = PurePosixPath(name)
    if value.is_absolute() or '..' in value.parts or str(value) != name or name == '.':
        raise ValueError('unsafe filename: ' + name)
    return name


def release_id(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-z0-9][a-z0-9._-]{2,79}', value):
        raise ValueError('invalid release id')
    if value == BASE_ID:
        raise ValueError('cannot overwrite the v55 donor')
    return value


def read_regular(root, name):
    name = safe_name(name)
    target = root / name
    cursor = root
    for part in PurePosixPath(name).parts:
        if cursor.is_symlink():
            raise ValueError('symlink in package path: ' + name)
        cursor = cursor / part
    if target.is_symlink() or not target.is_file():
        raise ValueError('missing regular file: ' + name)
    return target.read_bytes()


def checked_file(root, item, field='path'):
    data = read_regular(root, item[field])
    if type(item.get('bytes')) is not int or len(data) != item['bytes'] or digest(data) != item.get('sha256'):
        raise ValueError('file identity mismatch: ' + item[field])
    return data


def validate_ego_run(run):
    if (run.get('interactionModel') != 'continuous-scroll' or run.get('sampleIntervalMs') != 250
            or run.get('settling', {}).get('idleMs') != 5000 or run.get('budgets') != SCROLL_BUDGETS
            or run.get('measurement', {}).get('navigationIncluded') is not True
            or not isinstance(run.get('browserPage', {}).get('isolateId'), str) or not run['browserPage']['isolateId']
            or run.get('failure') or run.get('errors')):
        raise ValueError('Ego run changed the original measurement protocol')
    holds, poses, heaps, samples = (run.get(key, []) for key in ['holds', 'poses', 'heapSamples', 'processSamples'])
    if len(holds) != 33 or len(poses) != 90 or not heaps:
        raise ValueError('Ego raw traversal is incomplete')
    all_poses = poses + holds
    finite = lambda value: type(value) in [int, float] and math.isfinite(value)
    for point in all_poses:
        if (not all(finite(point.get(key)) and point[key] >= 0 for key in ['canvasPixelBytes', 'mountedLayers', 'webglCanvases'])
                or not isinstance(point.get('videos'), list)
                or any(video.get('paused') is not True or video.get('seeking') is not False for video in point['videos'])):
            raise ValueError('Ego resource observations are invalid or decoders are not parked')
    if any(hold.get('desired', {}).get('kind') != ('segment' if hold.get('measurementPhase') == 'segment-landmark' else 'hold') for hold in holds):
        raise ValueError('Ego resource phase differs from actual range kind')
    settled = [hold for hold in holds if hold.get('direction', '').endswith('-settled')]
    if ([hold.get('scene') for hold in holds if hold.get('direction') in ['boot', 'forward']] != SCROLL_SCENES
            or [hold.get('scene') for hold in holds if hold.get('direction') == 'reverse'] != list(reversed(SCROLL_SCENES))[1:]
            or len(settled) != 2 or settled[0].get('scene') != 'contact' or settled[1].get('scene') != 'hero'):
        raise ValueError('Ego chapter or settled endpoint coverage is incomplete')
    heap_values = [item.get('usedJsHeapBytes') for item in heaps + all_poses]
    if not all(finite(value) and value > 0 for value in heap_values):
        raise ValueError('Ego heap samples are missing or invalid')
    if any(not finite(sample.get(key)) or sample[key] < 0 for sample in samples for key in ['totalRssBytes', 'gpuRssBytes', 'rendererRssBytes']):
        raise ValueError('Ego RSS samples are invalid')
    maximum = lambda rows, field: max([row.get(field, 0) for row in rows] or [0])
    landmarks = [hold for hold in holds if hold.get('measurementPhase') == 'segment-landmark']
    actual = {'peakBrowserTreeRssBytes': maximum(samples, 'totalRssBytes'),
              'peakGpuProcessRssBytes': maximum(samples, 'gpuRssBytes'), 'peakRendererRssBytes': maximum(samples, 'rendererRssBytes'),
              'peakJsHeapBytes': max(heap_values), 'finalJsHeapBytes': holds[-1]['usedJsHeapBytes'],
              'peakCanvasPixelBytes': maximum(all_poses, 'canvasPixelBytes'), 'maxMountedLayers': maximum(holds, 'mountedLayers'),
              'maxWebglCanvasesAtHold': maximum([hold for hold in holds if hold not in landmarks], 'webglCanvases'),
              'maxWebglCanvasesInTransition': maximum(poses + landmarks, 'webglCanvases'),
              'maxWebglCanvasesAtLandmark': maximum(landmarks, 'webglCanvases'),
              'maxVideosAtContact': max([len(hold['videos']) for hold in holds if hold.get('scene') == 'contact'] or [0])}
    if (actual != run.get('actual') or any(actual[key] > limit for key, limit in SCROLL_BUDGETS.items() if key != 'settledHeapFractionOfPeak')
            or any(hold['usedJsHeapBytes'] > actual['peakJsHeapBytes'] * 0.9 for hold in settled)
            or len({sample['browserPid'] for sample in samples}) != 1):
        raise ValueError('Ego raw whole-tree/resource measurements do not pass original budgets')


def validate_memory(report):
    """Fail closed on the original contract, including actual process samples."""
    identity_fields = ['candidate', 'candidateTagObject', 'sourceCommit', 'artifactTreeSha256', 'draftManifestSha256']
    environment = report.get('environment', {})
    if (report.get('schemaVersion') != 3 or report.get('kind') != 'r5-process-memory-qualification'
            or report.get('requiredRunCount') != 2 or report.get('completedRunCount') != 2 or report.get('pass') is not True
            or environment.get('platform') != 'darwin' or environment.get('browserChannel') not in ['chrome', 'ego-lite']
            or environment.get('runnerClass') not in ['github-hosted-macos-14', 'local-macos-hardware']
            or type(environment.get('headless')) is not bool
            or not all(isinstance(environment.get(key), str) and environment[key] for key in ['arch', 'osRelease'])
            or not all(isinstance(report.get('identity', {}).get(key), str) and report['identity'][key] for key in identity_fields)):
        raise ValueError('invalid frozen memory qualification environment or identity')
    ego = environment.get('browserChannel') == 'ego-lite'
    if ego and (environment.get('runnerClass') != 'local-macos-hardware' or environment.get('headless') is not False
                or environment.get('processScope') != 'entire-shared-browser-tree'
                or not re.fullmatch(r'/(?:Applications|Users/[^/]+/Applications)/ego lite\.app/Contents/MacOS/ego lite', environment.get('browserExecutable', ''))):
        raise ValueError('invalid frozen memory qualification environment for actual Ego')
    runs = report.get('runs', [])
    if len(runs) != 2 or len({run.get('runId') for run in runs}) != 2:
        raise ValueError('memory qualification requires two distinct runs')
    if ego and len({run.get('browserPage', {}).get('isolateId') for run in runs}) != 2:
        raise ValueError('Ego qualification requires two fresh page isolates')
    for run in runs:
        samples = run.get('processSamples', [])
        if (run.get('schemaVersion') != 3 or run.get('kind') != 'r5-process-memory-run' or run.get('pass') is not True
                or not isinstance(run.get('runId'), str) or not run['runId']
                or run.get('environment') != environment or run.get('sampling', {}).get('valid') is not True
                or not all(run.get('identity', {}).get(key) == report['identity'][key] for key in identity_fields)
                or not samples or run.get('sampling', {}).get('sampleCount') != len(samples)):
            raise ValueError('invalid frozen memory qualification run')
        for sample in samples:
            if not (type(sample.get('browserPid')) is int and sample['browserPid'] > 0
                    and isinstance(sample.get('browserRootRssBytes'), (int, float)) and sample['browserRootRssBytes'] > 0
                    and isinstance(sample.get('totalRssBytes'), (int, float)) and sample['totalRssBytes'] >= sample['browserRootRssBytes']
                    and type(sample.get('processCount')) is int and sample['processCount'] > 0):
                raise ValueError('memory qualification lacks actual browser process samples')
        for prefix in ['gpu', 'renderer']:
            if not any(type(sample.get(prefix + 'ProcessCount')) is int and sample[prefix + 'ProcessCount'] > 0
                       and isinstance(sample.get(prefix + 'RssBytes'), (int, float)) and sample[prefix + 'RssBytes'] > 0 for sample in samples):
                raise ValueError('memory qualification lacks ' + prefix + ' samples')
        if ego:
            validate_ego_run(run)


def validate_relative_improvement(package, receipt, candidate_version='v63'):
    """Exact pinned comparisons are not passing qualification."""
    cold = json.loads(read_regular(package, receipt['evidence']['coldComparison']['path']))
    if cold.get('kind') != f'same-conditions-v60-{candidate_version}-cold-media-comparison' or cold.get('releaseQualified') is not False or cold.get('failure'):
        raise ValueError('relative comparison is incomplete or claims qualification')
    for version, expected in [('v60', receipt['baselineIdentity']), (candidate_version, receipt['identity'])]:
        if any(cold.get('identities', {}).get(version, {}).get(key) != value for key, value in expected.items() if key != 'draftManifestSha256'):
            raise ValueError('relative comparison artifact identity changed')
    ranges = ['hero-pattern', 'method-bottom-figure2', 'brand-figure3', 'education-crane', 'crane-contact']
    expected = {(platform, trial, segment, version) for platform in ['desktop', 'phone']
                for trial in [1, 2] for segment in ranges for version in ['v60', candidate_version]}
    rows = cold.get('results', [])
    if len(rows) != 40 or {(row.get('platform'), row.get('trial'), row.get('rangeId'), row.get('version')) for row in rows} != expected:
        raise ValueError('relative comparison must preserve all forty paired samples')
    if any(row.get('ready') is not True or row.get('failure') or row.get('errors')
           or type(row.get('elapsedMs')) not in [int, float] or not 0 <= row['elapsedMs'] < float('inf') for row in rows):
        raise ValueError('relative cold-media sample failed')
    computed = {}
    for platform in ['desktop', 'phone']:
        computed[platform] = {}
        for version in ['v60', candidate_version]:
            samples = [row for row in rows if row['platform'] == platform and row['version'] == version]
            times = sorted(row['elapsedMs'] for row in samples)
            computed[platform][version] = {'samples': len(times), 'medianMs': (times[4] + times[5]) / 2,
                'nearestRankP95Ms': times[9], 'explicitLoadCalls': sum(event.get('type') == 'load-call' for row in samples for event in row.get('mediaEvents', []))}
    # Ten samples per platform are not a tail-latency qualification. Preserve
    # the p95 verbatim, but require both a lower median and fewer explicit loads
    # for this one incremental publication. Original scroll gates are unchanged.
    if receipt.get('comparison') != computed or any(computed['desktop'][candidate_version][key] >= computed['desktop']['v60'][key] for key in ['medianMs', 'explicitLoadCalls']):
        raise ValueError('authorized desktop median and reload improvement was not demonstrated')
    validate_frozen_functional_visual(package, receipt, candidate_version)


def validate_frozen_functional_visual(package, receipt, candidate_version, baseline_version='v60'):
    """Same full traversal, aliases and visual gates for each pinned comparison."""
    functional = json.loads(read_regular(package, receipt['evidence']['functional']['path']))
    retained = candidate_version == 'v70' and receipt.get('retainedDiagnosticPublication') is True
    if (functional.get('kind') != f'frozen-{candidate_version}-functional-and-{baseline_version}-visual-comparison-unshaped-http'
            or functional.get('passed') is not (False if retained else True) or functional.get('failure') or functional.get('releaseQualified') is not False):
        raise ValueError('relative publication requires complete frozen functional and visual checks')
    runs = functional.get('functional', [])
    if len(runs) != 2 or {run.get('platform') for run in runs} != {'desktop', 'phone'}:
        raise ValueError('both frozen functional platforms are required')
    for run in runs:
        if (run.get('passed') is not (False if retained else True)
                or (run.get('errors') and not retained) or len(run.get('points', [])) != 121
                or any(point.get('passed') is not True for point in run['points'])
                or any(run.get('identity', {}).get(key) != value for key, value in receipt['identity'].items() if key != 'draftManifestSha256')
                or len(run.get('aliases', [])) != 3 or {alias.get('panel') for alias in run['aliases']} != {'opening', 'cards', 'closing'}
                or any(alias.get('passed') is not True for alias in run['aliases'])):
            raise ValueError('frozen functional or Proof alias regression')
    if retained:
        diagnostics = [{'platform': r['platform'], 'passed': r['passed'], 'browserErrorCount': len(r['errors']),
                        'browserErrorSha256': digest(encoded(r['errors']))} for r in runs]
        if receipt.get('retainedFunctionalDiagnostics') != diagnostics or any(not retained_communication_errors(r['errors']) for r in runs):
            raise ValueError('only the exact retained communication errors are authorized; functional runs stay failed')
    visual = functional.get('visual', [])
    visual_ranges = ['hold:hero', 'hero-pattern', 'pattern-star-map', 'method-bottom-figure2', 'crane-contact', 'figure3-services']
    if (len(visual) != 12 or {(row.get('platform'), row.get('pose', {}).get('rangeId')) for row in visual}
            != {(platform, segment) for platform in ['desktop', 'phone'] for segment in visual_ranges}
            or any(row.get('passed') is not True or type(row.get('fraction')) not in [int, float]
                   or not 0 <= row['fraction'] <= .005 or row.get('ink', 0) <= 100 for row in visual)):
        raise ValueError('original frozen visual difference threshold failed')


def validate_loading_recovery(package, receipt):
    """A repaired false failure, not a timing, memory or device qualification."""
    report = json.loads(read_regular(package, receipt['evidence']['loadingRecovery']['path']))
    if (report.get('kind') != 'frozen-live-final-transfer-recovery' or report.get('releaseQualified') is not False
            or report.get('videoFirstByteMs') != 6000 or report.get('frameDeadlineMs') != 19000
            or report.get('readyDeadlineMs') != 25000 or report.get('failure')):
        raise ValueError('loading recovery changed the original deadline or controlled first byte')
    for version, expected in [('v65', receipt['baselineIdentity']), ('v67', receipt['identity'])]:
        if any(report.get('identities', {}).get(version, {}).get(key) != value for key, value in expected.items() if key != 'draftManifestSha256'):
            raise ValueError('loading recovery identity mismatch')
    rows = report.get('results', [])
    if len(rows) != 4 or {(row.get('version'), row.get('trial')) for row in rows} != {(version, trial) for version in ['v65', 'v67'] for trial in [1, 2]}:
        raise ValueError('loading recovery requires both paired trials')
    for row in rows:
        repaired = row['version'] == 'v67'
        state = row.get('state', {})
        if (row.get('ready') is not repaired or row.get('platform') != 'desktop'
                or row.get('rangeId') != 'education-crane' or row.get('progress') != .25
                or state.get('viewport') != [1440, 900, 1]
                or state.get('snapshot', {}).get('view', {}).get('status') != ('ready' if repaired else 'failed')
                or not any(event.get('readyState') == 0 and event.get('networkState') == 2 for event in row.get('mediaEvents', []))):
            raise ValueError('genuine loading request and failed/ready state are required')
        requests = row.get('requests', [])
        if not requests or any(request.get('bytes', 0) < 0 or not re.fullmatch(r'[0-9a-f]{64}', request.get('bodySha256', '')) for request in requests):
            raise ValueError('loading recovery requires the real frozen media transport')
        if repaired:
            if (row.get('failure') or row.get('errors') or not 6000 <= row.get('elapsedMs', 25000) < 25000
                    or state.get('broken') or not state.get('videos')
                    or any(video.get('readyState', 0) < 2 or video.get('paused') is not True
                           or video.get('seeking') is not False for video in state['videos'])
                    or not all(request.get('complete') is True and request.get('bytes', 0) > 0
                               and request.get('headersAt', 0) - request['startedAt'] >= 6000 for request in requests)):
                raise ValueError('loading recovery needs genuine delayed bytes and parked decoded frames')
        elif not row.get('failure') or not 0 <= row.get('elapsedMs', 25000) < 6000:
            raise ValueError('the unchanged early-failure baseline is required')
    cold = json.loads(read_regular(package, receipt['evidence']['coldComparison']['path']))
    if (cold.get('kind') != 'same-conditions-v65-v67-cold-media-comparison' or cold.get('releaseQualified') is not False
            or cold.get('failure') or cold.get('environment', {}).get('latencyMs') != 400
            or cold['environment'].get('bytesPerChunk') != 16384 or cold['environment'].get('chunkIntervalMs') != 10
            or cold['environment'].get('targetCacheDisabled') is not True
            or not cold['environment'].get('powerBefore') or cold['environment']['powerBefore'] != cold['environment'].get('powerAfter')):
        raise ValueError('healthy cold-media protocol changed')
    for version, expected in [('v65', receipt['baselineIdentity']), ('v67', receipt['identity'])]:
        if any(cold.get('identities', {}).get(version, {}).get(key) != value for key, value in expected.items() if key != 'draftManifestSha256'):
            raise ValueError('healthy cold-media identity mismatch')
    ranges = ['hero-pattern', 'method-bottom-figure2', 'brand-figure3', 'education-crane', 'crane-contact']
    expected = {(platform, trial, segment, version) for platform in ['desktop', 'phone']
                for trial in [1, 2] for segment in ranges for version in ['v65', 'v67']}
    samples = cold.get('results', [])
    if (len(samples) != 40 or {(row.get('platform'), row.get('trial'), row.get('rangeId'), row.get('version')) for row in samples} != expected
            or any(row.get('ready') is not True or row.get('failure') or row.get('errors')
                   or type(row.get('elapsedMs')) not in [int, float] or not 0 <= row['elapsedMs'] < float('inf') for row in samples)):
        raise ValueError('all forty healthy cold-media samples are required')
    validate_frozen_functional_visual(package, receipt, 'v67', 'v65')


def validate_ph_cors_recovery(package, receipt):
    """One fixed image request owner, not a relaxed decode or memory gate."""
    report = json.loads(read_regular(package, receipt['evidence']['phCorsRecovery']['path']))
    if (report.get('kind') != 'v67-v68-native-ph-image-cors-request-recovery'
            or report.get('originalPoseDeadlineMs') != 25000 or report.get('viewport') != [390, 844, 1]
            or report.get('releaseQualified') is not False or report.get('passed') is not True or report.get('failure')):
        raise ValueError('PH recovery changed the original deadline or qualification')
    rows = report.get('results', [])
    if len(rows) != 4 or {(row.get('version'), row.get('trial')) for row in rows} != {(version, trial) for version in ['v67', 'v68'] for trial in [1, 2]}:
        raise ValueError('PH recovery requires both paired trials')
    image_sha = '48b3cdade0bdf056ad1fa1fc0843d779138b2c50460947150bb3a8354fef3881'
    for row in rows:
        repaired = row['version'] == 'v68'
        identity = receipt['identity'] if repaired else receipt['baselineIdentity']
        if any(row.get('identity', {}).get(key) != value for key, value in identity.items() if key != 'draftManifestSha256'):
            raise ValueError('PH recovery artifact identity mismatch')
        state, requests = row.get('state', {}), row.get('requests', [])
        view = state.get('snapshot', {}).get('view', {})
        desired = state.get('snapshot', {}).get('desired', {})
        peer = next(item for item in rows if item['trial'] == row['trial'] and item['version'] != row['version'])
        if (row.get('ready') is not repaired or state.get('platform') != 'phone' or state.get('viewport') != [390, 844, 1]
                or view.get('status') != ('ready' if repaired else 'failed') or not requests
                or type(desired.get('progress')) not in [int, float] or not math.isfinite(desired['progress'])
                or desired.get('rangeId') != 'lab-ph' or desired.get('progress') != peer.get('state', {}).get('snapshot', {}).get('desired', {}).get('progress')
                or (repaired and (row.get('goal', {}).get('rangeId') != 'lab-ph' or row['goal'].get('requestedProgress') != .5 or row['goal'].get('progress') != desired.get('progress')))
                or any(not request.get('path', '').startswith('assets/ph_front-alpha-') or request.get('bodySha256') != image_sha for request in requests)):
            raise ValueError('PH recovery did not preserve the actual image, pose or native failure')
        complete = lambda request: (request.get('mode') == 'cors' and request.get('bytes') == 484606
                                    and request.get('complete') is True and not request.get('fault'))
        if not repaired:
            if (not any(complete(request) for request in requests)
                    or not any(request.get('mode') == 'no-cors' and request.get('fault') == 'same-body-prefix-truncated-no-cors'
                               and request.get('bytes') == 32 and request.get('complete') is False for request in requests)
                    or not state.get('broken')):
                raise ValueError('PH baseline must show a real truncated duplicate and complete mask')
        elif (len(requests) != 1 or not complete(requests[0]) or state.get('broken') or state['snapshot'].get('pending')
              or row.get('error') or row.get('health', {}).get('errors')
              or type(row.get('elapsedMs')) not in [int, float] or not 0 <= row['elapsedMs'] < 25000
              or not state.get('videos') or any(video.get('readyState', 0) < 2 or video.get('paused') is not True
                  or video.get('seeking') is not False for video in state['videos'])):
            raise ValueError('PH candidate requires one complete request and parked decoded media')
    cold = json.loads(read_regular(package, receipt['evidence']['coldComparison']['path']))
    environment = cold.get('environment', {})
    if (cold.get('kind') != 'same-conditions-v67-v68-cold-media-comparison' or cold.get('releaseQualified') is not False
            or cold.get('failure') or environment.get('latencyMs') != 400 or environment.get('bytesPerChunk') != 16384
            or environment.get('chunkIntervalMs') != 10 or environment.get('targetCacheDisabled') is not True
            or environment.get('atomicReadinessSnapshot') is not True
            or not environment.get('powerBefore') or environment['powerBefore'] != environment.get('powerAfter')):
        raise ValueError('PH healthy cold-media protocol changed')
    for version, expected in [('v67', receipt['baselineIdentity']), ('v68', receipt['identity'])]:
        if any(cold.get('identities', {}).get(version, {}).get(key) != value for key, value in expected.items() if key != 'draftManifestSha256'):
            raise ValueError('PH healthy cold-media identity mismatch')
    ranges = ['hero-pattern', 'method-bottom-figure2', 'brand-figure3', 'education-crane', 'crane-contact']
    expected = {(platform, trial, segment, version) for platform in ['desktop', 'phone'] for trial in [1, 2]
                for segment in ranges for version in ['v67', 'v68']}
    samples = cold.get('results', [])
    if (len(samples) != 40 or {(row.get('platform'), row.get('trial'), row.get('rangeId'), row.get('version')) for row in samples} != expected
            or any(row.get('ready') is not True or row.get('failure') or row.get('errors')
                   or type(row.get('elapsedMs')) not in [int, float] or not 0 <= row['elapsedMs'] < float('inf') for row in samples)):
        raise ValueError('all forty PH healthy cold-media samples are required')
    if any(not isinstance(row.get('videos'), list) or any(video.get('paused') is not True or video.get('seeking') is not False for video in row['videos']) for row in samples):
        raise ValueError('PH cold-media must atomically observe every decoder parked')
    validate_frozen_functional_visual(package, receipt, 'v68', 'v67')


def validate_scrub_recovery(package, receipt, candidate_version='v69'):
    """One sealed recovery comparison; original performance/memory gates stay false."""
    report = json.loads(read_regular(package, receipt['evidence']['scrubRecovery']['path']))
    if (report.get('kind') != f'v68-{candidate_version}-native-reverse-range-seek-recovery'
            or report.get('originalConvergenceDeadlineMs') != 20000 or report.get('sourceFrameRate') != 30
            or report.get('releaseQualified') is not False or report.get('passed') is not True or report.get('failure')):
        raise ValueError('scrub recovery changed the original deadline or qualification')
    for version, identity in [('v68', receipt['baselineIdentity']), (candidate_version, receipt['identity'])]:
        if any(report.get('identities', {}).get(version, {}).get(key) != value for key, value in identity.items() if key != 'draftManifestSha256'):
            raise ValueError('scrub artifact identity mismatch')
    fixture = report.get('fixture', {})
    if (fixture.get('assetBytes') != 1341930
            or fixture.get('baselineDriverSha256') != receipt.get('driverSources', {}).get('v68')
            or fixture.get('candidateDriverSha256') != receipt.get('driverSources', {}).get(candidate_version)
            or not all(re.fullmatch(r'[0-9a-f]{64}', str(fixture.get(key, '')))
                       for key in ['baselineDriverSha256', 'candidateDriverSha256', 'assetSha256'])):
        raise ValueError('scrub fixture must bind the actual frozen driver sources and media')
    rows = report.get('results', [])
    if len(rows) != 4 or {(r.get('version'), r.get('trial')) for r in rows} != {(v, t) for v in ['v68', candidate_version] for t in [1, 2]}:
        raise ValueError('scrub recovery needs both paired trials')
    for row in rows:
        repaired = row['version'] == candidate_version
        state = row.get('final', {})
        video, driver = state.get('video', {}), state.get('driver', {})
        requests = row.get('requests', {}).get('requests', [])
        if (row.get('ready') is not repaired or driver.get('desiredProgress') != .4 or driver.get('generation') != 1
                or video.get('paused') is not True or video.get('error') is not None
                or not any(r.get('fault') == 'zero-body-range-stall' and r.get('range') == 'bytes=458752-'
                           and r.get('sent') == 0 for r in requests)):
            raise ValueError('scrub comparison needs a genuine body-stalled Range and unchanged pose')
        if repaired:
            if (not 0 <= row.get('elapsedMs', 20000) < 20000 or driver.get('frameReady') is not True
                    or video.get('readyState', 0) < 2 or video.get('seeking') is not False or video.get('retry') != '1'
                    or abs(video.get('time', -1) - driver.get('presentedTime', -2)) > .002
                    or not any(r.get('start') == 0 and r.get('sent') == 1341930 and r.get('complete') is True for r in requests)):
                raise ValueError('scrub repair lacks the same-source bounded retry and real parked frame')
        elif (row.get('elapsedMs', 0) < 20000 or video.get('seeking') is not True or video.get('readyState') != 1
              or video.get('networkState') != 2 or driver.get('frameReady') is not False or video.get('retry') is not None):
            raise ValueError('scrub baseline must retain its actual pending native seek')
    cold = json.loads(read_regular(package, receipt['evidence']['coldComparison']['path']))
    environment = cold.get('environment', {})
    if (cold.get('kind') != f'same-conditions-v68-{candidate_version}-cold-media-comparison' or cold.get('releaseQualified') is not False
            or cold.get('failure') or environment.get('latencyMs') != 400 or environment.get('bytesPerChunk') != 16384
            or environment.get('chunkIntervalMs') != 10 or environment.get('targetCacheDisabled') is not True
            or environment.get('atomicReadinessSnapshot') is not True or not environment.get('powerBefore')
            or environment['powerBefore'] != environment.get('powerAfter')):
        raise ValueError('scrub healthy cold-media protocol changed')
    for version, identity in [('v68', receipt['baselineIdentity']), (candidate_version, receipt['identity'])]:
        if any(cold.get('identities', {}).get(version, {}).get(key) != value for key, value in identity.items() if key != 'draftManifestSha256'):
            raise ValueError('scrub cold-media identity mismatch')
    expected = {(p, t, r, v) for p in ['desktop', 'phone'] for t in [1, 2] for v in ['v68', candidate_version]
                for r in ['hero-pattern', 'method-bottom-figure2', 'brand-figure3', 'education-crane', 'crane-contact']}
    samples = cold.get('results', [])
    retained = candidate_version == 'v70' and receipt.get('retainedDiagnosticPublication') is True
    if (len(samples) != 40 or {(r.get('platform'), r.get('trial'), r.get('rangeId'), r.get('version')) for r in samples} != expected
            or any(r.get('ready') is not True or r.get('failure') or (r.get('errors') and not retained)
                   or type(r.get('elapsedMs')) not in [int, float] or not 0 <= r['elapsedMs'] < float('inf')
                   or not isinstance(r.get('videos'), list)
                   or any(v.get('paused') is not True or v.get('seeking') is not False for v in r['videos']) for r in samples)):
        raise ValueError('all forty atomic healthy scrub samples are required')
    if retained and (receipt.get('retainedColdDiagnostics') != [retained_cold_diagnostic(r) for r in samples]
                     or any(not retained_communication_errors(r.get('errors', [])) or r['elapsedMs'] >= 25000 for r in samples)):
        raise ValueError('all cold communication errors and original readiness deadlines must remain exact')
    performance = json.loads(read_regular(package, receipt['evidence']['scrollComparison']['path']))
    measured = performance.get('results', [])
    expected_performance = {(p, r, v) for p in ['desktop', 'phone'] for v in ['v68', candidate_version]
                            for r in ['hero-pattern', 'pattern-star-map', 'aod-method-top', 'figure2-distance-expand',
                                      'figure3-services', 'ttg-lab', 'ph-education', 'crane-contact']}
    if (performance.get('kind') != f'same-original-gates-v68-{candidate_version}-scroll-comparison'
            or performance.get('releaseQualified') is not False or performance.get('completeMeasurements') is not True
            or performance.get('failure') or performance.get('measurementSha256') != receipt.get('measurementSha256')
            or len(measured) != 32 or {(r.get('platform'), r.get('id'), r.get('version')) for r in measured} != expected_performance
            or any(r.get('measured') is not True or r.get('failure')
                   or (r.get('health', {}).get('errors') and not (candidate_version == 'v70' and receipt.get('retainedDiagnosticPublication') is True)) for r in measured)):
        raise ValueError('all unchanged original scroll measurements are required, including failures')
    validate_frozen_functional_visual(package, receipt, candidate_version, 'v68')


def validate_callback_cost_recovery(package, receipt):
    """A pinned RVFC-first work reduction; never a blanket FPS qualification."""
    if receipt.get('retainedDiagnosticPublication') is True:
        return validate_retained_v70_callback_proof(package, receipt)
    report = json.loads(read_regular(package, receipt['evidence']['callbackCostComparison']['path']))
    if (report.get('kind') != 'v69-v70-native-proof-readback-cost-comparison'
            or report.get('releaseQualified') is not False or report.get('pixelsChanged') is not False
            or report.get('proofsChanged') is not False or report.get('viewport') != [1440, 900, 1]
            or report.get('originalMeasurementSeconds') != 10 or report.get('outerDeadlineMs') != 15000
            or report.get('passed') is not True or report.get('failure')):
        raise ValueError('callback comparison changed original sampling, pixels or qualification')
    rows = report.get('results', [])
    expected = {(v, t, r) for v in ['v69', 'v70'] for t in [1, 2] for r in ['ttg-lab', 'crane-contact']}
    if len(rows) != 8 or {(r.get('version'), r.get('trial'), r.get('id')) for r in rows} != expected:
        raise ValueError('callback reduction requires all eight counterbalanced samples')
    totals = {'v69': 0, 'v70': 0}
    for row in rows:
        identity = receipt['identity'] if row['version'] == 'v70' else receipt['callbackBaselineIdentity']
        if any(row.get('identity', {}).get(k) != v for k, v in identity.items() if k != 'draftManifestSha256'):
            raise ValueError('callback evidence belongs to another artifact')
        checks = row.get('summary', {}).get('checks', {})
        samples = row.get('measurement', {}).get('samples', [])
        calls = row.get('readbackCalls')
        reads = row.get('costs', {}).get('reads', [])
        draws = row.get('costs', {}).get('draws', [])
        if (row.get('measured') is not True or row.get('failure') or row.get('health', {}).get('errors')
                or type(calls) is not int or calls < 0 or calls != len(reads) or row.get('copyCalls') != len(draws)
                or len(samples) < 3 or samples[-1].get('time', 0) < 10000
                or any(checks.get(k) is not True for k in ['completeVisibleSampling', 'videosPaused', 'finalPose', 'fixedViewport', 'focusedSampling'])
                or any(type(value) not in [int, float] or not 0 <= value < float('inf') for value in reads + draws)):
            raise ValueError('callback reduction needs real complete samples and parked target frames')
        totals[row['version']] += calls
    if report.get('totals') != totals or totals['v70'] >= totals['v69']:
        raise ValueError('actual readbacks did not decrease')


def retained_communication_errors(errors):
    return all(e.get('method') == 'Log.entryAdded'
               and e.get('details', {}).get('source') == 'other'
               and e.get('details', {}).get('level') == 'error'
               and e.get('details', {}).get('text') == 'Unchecked runtime.lastError: Could not establish connection. Receiving end does not exist.'
               for e in errors)


def retained_cold_diagnostic(row):
    errors = row.get('errors', [])
    return {'platform': row['platform'], 'trial': row['trial'], 'rangeId': row['rangeId'], 'version': row['version'],
            'ready': row['ready'], 'browserErrorCount': len(errors), 'browserErrorSha256': digest(encoded(errors))}


def retained_scroll_diagnostic(row):
    errors = row.get('health', {}).get('errors', [])
    return {'platform': row['platform'], 'id': row['id'], 'version': row['version'],
            'measured': row.get('measured'), 'passed': row.get('passed'), 'failedChecks': row.get('failures'),
            'browserErrorCount': len(errors), 'browserErrorSha256': digest(encoded(errors))}


def validate_retained_v70_callback_proof(package, receipt):
    """The freshly authorized failed-diagnostic release is still unqualified.

    Absolute copies during unequal RAF cadence are NOT an improvement proof.
    Require equal target counts, real native callbacks and decoded-frame proof.
    """
    if (receipt.get('knownBrowserCommunicationErrorsRetained') is not True
            or receipt.get('callbackAbsoluteCountsUsedAsImprovementProof') is not False
            or receipt.get('doesNotGrantPassingQualification') is not True):
        raise ValueError('explicit retained diagnostics and no qualification are required')
    scroll = json.loads(read_regular(package, receipt['evidence']['scrollComparison']['path']))
    rows = scroll.get('results', [])
    if (receipt.get('retainedScrollDiagnostics') != [retained_scroll_diagnostic(r) for r in rows]
            or any(r.get('passed') is not False or not retained_communication_errors(r.get('health', {}).get('errors', [])) for r in rows)):
        raise ValueError('original failed scroll metrics and browser errors must remain failed and exact')
    cost = json.loads(read_regular(package, receipt['evidence']['callbackCostComparison']['path']))
    samples = cost.get('results', [])
    expected = {(v, t, segment) for v in ['v69', 'v70'] for t in [1, 2] for segment in ['ttg-lab', 'crane-contact']}
    if (cost.get('kind') != 'v69-v70-native-proof-readback-cost-comparison'
            or cost.get('releaseQualified') is not False or cost.get('passed') is not False or cost.get('pixelsChanged') is not False
            or cost.get('proofsChanged') is not False or cost.get('originalMeasurementSeconds') != 10
            or cost.get('outerDeadlineMs') != 15000 or cost.get('failure')
            or len(samples) != 8 or {(r.get('version'), r.get('trial'), r.get('id')) for r in samples} != expected):
        raise ValueError('all eight original callback diagnostics must remain present')
    for row in samples:
        raw = row.get('measurement', {}).get('samples', [])
        checks = row.get('summary', {}).get('checks', {})
        identity = receipt['identity'] if row['version'] == 'v70' else receipt['callbackBaselineIdentity']
        reads, draws = row.get('costs', {}).get('reads', []), row.get('costs', {}).get('draws', [])
        if (row.get('measured') is not True or row.get('failure') or len(raw) < 3
                or not retained_communication_errors(row.get('health', {}).get('errors', []))
                or raw[-1].get('time', 0) < 10000 or row.get('readbackCalls') != len(reads)
                or row.get('copyCalls') != len(draws)
                or any(type(v) not in [int, float] or not 0 <= v < float('inf') for v in reads + draws)
                or any(checks.get(k) is not True for k in ['completeVisibleSampling', 'videosPaused', 'finalPose', 'fixedViewport', 'focusedSampling'])
                or any(row.get('identity', {}).get(k) != v for k, v in identity.items() if k != 'draftManifestSha256')):
            raise ValueError('retained callback diagnostics changed original samples or artifact')
    proof = json.loads(read_regular(package, receipt['evidence']['nativeCallbackProof']['path']))
    fixture = proof.get('fixture', {})
    if (proof.get('kind') != 'v69-v70-visible-native-causal-frame-proof'
            or proof.get('releaseQualified') is not False or proof.get('diagnosticOnly') is not True
            or proof.get('notOriginalPerformanceQualification') is not True or proof.get('passed') is not True
            or proof.get('failure') or proof.get('allBrowserCleanupFinished') is not True
            or proof.get('originalConvergenceDeadlineMs') != 20000 or proof.get('sourceFrameRate') != 30
            or fixture.get('assetBytes') != 1341930
            or fixture.get('assetSha256') != '6c82ceeb31ce814e137c880ae41650e5d24df26a202a4af8a3d8a9d60dbeff00'
            or fixture.get('driverSources') != {v: receipt['driverSources'][v] for v in ['v69', 'v70']}):
        raise ValueError('native callback proof must use exact original bytes, sources and deadlines')
    rows = proof.get('results', [])
    expected = {(v, t, p / 10) for v in ['v69', 'v70'] for t in [1, 2] for p in range(1, 9)}
    if len(rows) != 32 or {(r.get('version'), r.get('trial'), r.get('progress')) for r in rows} != expected:
        raise ValueError('all thirty-two target-matched native observations are required')
    totals, indexed, saved = {'v69': 0, 'v70': 0}, {}, 0
    for row in rows:
        state = row.get('snapshot', {})
        driver, video, calls = state.get('driver', {}), state.get('video', {}), row.get('calls', {})
        reads, draws, callbacks = calls.get('reads', []), calls.get('draws', []), calls.get('callbacks', [])
        if (row.get('passed') is not True or row.get('failure') or not 0 <= row.get('elapsedMs', 20000) < 20000
                or row.get('visible') is not True or row.get('focused') is not True or row.get('viewport') != [1440, 900, 1]
                or driver.get('frameReady') is not True or driver.get('generation') != 1
                or driver.get('desiredProgress') != row['progress'] or video.get('readyState', 0) < 2
                or video.get('paused') is not True or video.get('seeking') is not False or video.get('error') is not None
                or abs(video.get('time', -1) - driver.get('presentedTime', -2)) > .002
                or len(reads) != len(draws) or len(reads) not in [0, 1]):
            raise ValueError('native callback proof needs actual parked, visible, aligned decoded targets')
        if state.get('proof') == 'video-frame-callback':
            if (row['version'] != 'v70' or reads or not callbacks
                    or not any(abs(c.get('mediaTime', -1) - driver['presentedTime']) <= .002 for c in callbacks)):
                raise ValueError('saved copies require a genuine native callback and zero reads')
            saved += 1
        elif state.get('proof') != 'decoded-canvas' or len(reads) != 1:
            raise ValueError('fallback targets still require actual decoded pixel reads')
        totals[row['version']] += len(reads)
        indexed[row['version'], row['trial'], row['progress']] = row
    for trial in [1, 2]:
        for p in range(1, 9):
            old, new = (indexed[v, trial, p / 10] for v in ['v69', 'v70'])
            if old['snapshot']['driver']['targetTime'] != new['snapshot']['driver']['targetTime']:
                raise ValueError('native targets changed between frozen peers')
    if (proof.get('totals') != totals or receipt.get('nativeTargetReadbacks') != totals
            or totals['v69'] != 16 or totals['v70'] >= totals['v69'] or saved != totals['v69'] - totals['v70']):
        raise ValueError('target-matched native copies did not actually decrease')



def validate_receiver_recovery(package, receipt):
    report = json.loads(read_regular(package, receipt['evidence']['receiverRecovery']['path']))
    if (report.get('kind') != 'frozen-delayed-first-frame-receiver-regression' or report.get('releaseQualified') is not False
            or report.get('videoFirstByteMs') != 3000 or report.get('readyDeadlineMs') != 25000 or report.get('failure')):
        raise ValueError('receiver recovery changed the original readiness conditions')
    for version, expected in [('v63', receipt['receiverBaselineIdentity']), ('v64', receipt['identity'])]:
        if any(report.get('identities', {}).get(version, {}).get(key) != value for key, value in expected.items() if key != 'draftManifestSha256'):
            raise ValueError('receiver recovery identity mismatch')
    rows = report.get('results', [])
    if len(rows) != 4 or {(row.get('version'), row.get('trial')) for row in rows} != {(version, trial) for version in ['v63', 'v64'] for trial in [1, 2]}:
        raise ValueError('receiver recovery requires both paired trials')
    for row in rows:
        expected_ready = row['version'] == 'v64'
        if (row.get('fallbackObserved') is not True or row.get('ready') is not expected_ready
                or row.get('platform') != 'phone' or row.get('rangeId') != 'brand-figure3' or row.get('progress') != .25
                or row.get('state', {}).get('snapshot', {}).get('view', {}).get('status') != ('ready' if expected_ready else 'failed')
                or row.get('state', {}).get('viewport') != [390, 844, 1]
                or not row.get('state', {}).get('videos') or any(video.get('readyState', 0) < 2 or video.get('paused') is not True
                    or video.get('seeking') is not False for video in row['state']['videos'])
                or (expected_ready and (row.get('elapsedMs', 25000) >= 25000 or row.get('errors') != []))):
            raise ValueError('receiver false-timeout recovery was not demonstrated')


def validate_image_recovery(package, receipt):
    report = json.loads(read_regular(package, receipt['evidence']['imageRecovery']['path']))
    if (report.get('kind') != 'frozen-once-failed-image-recovery' or report.get('releaseQualified') is not False
            or report.get('firstImageResponseStatus') != 503 or report.get('readyDeadlineMs') != 25000
            or report.get('imagePath') != 'assets/hero-middle-CxRnxl.webp' or report.get('failure')):
        raise ValueError('image recovery changed the original failure or readiness conditions')
    for version, expected in [('v64', receipt['imageBaselineIdentity']), ('v65', receipt['identity'])]:
        if any(report.get('identities', {}).get(version, {}).get(key) != value for key, value in expected.items() if key != 'draftManifestSha256'):
            raise ValueError('image recovery identity mismatch')
    rows = report.get('results', [])
    if len(rows) != 4 or {(row.get('version'), row.get('trial')) for row in rows} != {(version, trial) for version in ['v64', 'v65'] for trial in [1, 2]}:
        raise ValueError('image recovery requires both paired trials')
    for row in rows:
        repaired = row['version'] == 'v65'
        requests = row.get('requests', [])
        if (row.get('injectionObserved') is not True or row.get('ready') is not repaired
                or row.get('platform') != 'desktop' or row.get('rangeId') != 'hold:hero' or row.get('progress') != 0
                or row.get('state', {}).get('viewport') != [1440, 900, 1]
                or row.get('state', {}).get('snapshot', {}).get('view', {}).get('status') != ('ready' if repaired else 'failed')
                or len([request for request in requests if request.get('status') == 503 and request.get('injected') is True]) != 1
                or any(request.get('path') != report['imagePath'] for request in requests)):
            raise ValueError('failed-image recovery was not demonstrated')
        failed_before = row.get('failedImagesBefore', [])
        if (len(failed_before) != 2 or not row.get('failedUri')
                or any(image.get('complete') is not True or image.get('width') != 0
                       or image.get('src') != row['failedUri'] for image in failed_before)):
            raise ValueError('genuine retained failed-image state is missing')
        if repaired:
            if (row.get('elapsedMs', 25000) >= 25000 or row.get('state', {}).get('broken')
                    or not row.get('images') or any(not image.get('complete') or image.get('width', 0) <= 0 for image in row['images'])
                    or not any(request.get('status') == 200 for request in requests)
                    or len([image for image in row['images'] if image.get('src') == row['failedUri']]) != 2
                    or not row.get('state', {}).get('videos') or any(video.get('readyState', 0) < 2
                        or video.get('paused') is not True or video.get('seeking') is not False for video in row['state']['videos'])):
                raise ValueError('recovered image or genuine parked frame is missing')
        elif not row.get('state', {}).get('broken'):
            raise ValueError('baseline failed-image reproduction is missing')


def validate_v72_initial_recovery(package, initial, compiled, candidate_version='v72'):
    """The original initial-zero transfer deadline and physical-frame proof."""
    initial_rows = initial.get('rows', [])
    initial_cases = [('aod', 'body', 2), ('figure2', 'body', 2), ('aod', 'slow', 0)]
    initial_sources = {'aod': '00eff9f26a39c48e04a9935ca6de177b5cc504c3659bd7ac72e0da0052956d1e',
                       'figure2': '4366350bbe7c6b1517fa042937bcf7f61b7b8190cece2a50ac59ba8a80511fe6'}
    if (initial.get('originalDeadlineMs') != 20000 or initial.get('releaseQualified') is not False
            or len(initial_rows) != 6 or len({r.get('trial') for r in initial_rows}) != 6):
        raise ValueError('all six native initial-frame comparisons are required')
    for asset, mode, faults in initial_cases:
        for version in ['v70', 'candidate']:
            rows = [r for r in initial_rows if r.get('trial') == f'{candidate_version}/initial-{asset}-{mode}-{version}']
            if len(rows) != 1:
                raise ValueError('missing initial-frame comparison')
            row = rows[0]
            before = row.get('before', {}).get('video', {})
            if (row.get('failure') or row.get('asset') != asset or row.get('version') != version
                    or row.get('mode') != mode or row.get('faults') != faults
                    or row.get('source', {}).get('sha') != initial_sources[asset]
                    or row.get('compiledDriverSha256') != compiled[version]
                    or row.get('originalDeadlineMs') != 20000 or row.get('releaseQualified') is not False
                    or before.get('readyState') != 0 or before.get('seeking') is not False or before.get('networkState') != 2):
                raise ValueError('initial frame must prove a real non-seeking unbuffered transfer')
            final = row.get('final', {})
            video, driver = final.get('video', {}), final.get('driver', {})
            if version == 'candidate' or mode == 'slow':
                if (row.get('passed') is not True or not row.get('checks') or not all(v is True for v in row['checks'].values())
                        or type(row.get('readyMs')) not in [int, float] or not 0 <= row['readyMs'] <= 20000
                        or row.get('loads') != faults or video.get('paused') is not True or video.get('seeking') is not False
                        or video.get('readyState', 0) < 2 or driver.get('frameReady') is not True
                        or type(video.get('currentTime')) not in [int, float] or abs(video['currentTime']) > .001
                        or driver.get('targetTime') != 0 or driver.get('presentedTime') != 0
                        or driver.get('presentedGeneration') != driver.get('generation')):
                    raise ValueError('initial frame recovery changed a physical proof or the original deadline')
            elif row.get('passed') is not False or row.get('readyMs') is not None or row.get('loads') != 0:
                raise ValueError('v70 initial-frame deadlocks must stay failed')
            checked_file(package / 'evidence', row['screenshot'])


def validate_v72_recovery(package, receipt, candidate_version='v72'):
    """Pinned recovery comparisons only; no failing observation becomes qualified."""
    instructions = {
        'v72': '把浏览器报告和截图重新补齐，不要放宽验收标准，失败项如实保留。确认比 v70 好就 commit push 到 main，再更新公网复测。',
        'v73': '允许重建专用验收组，继续补齐冷加载、视觉和滚动复测，不要放宽标准，失败项如实保留。确认比 v70 好就 commit push 到 main，再更新公网复测。',
    }
    sources = {'v72': 'd68efda4552047a80849a10f9a91abe3a11cd5c11d69eceee0fcc107cfd31eac',
               'v73': '707abbd4a3f959e68019c521b29ea870b8bb6703006e612b860c8949a78b0c33'}
    if (candidate_version not in instructions or receipt.get('userInstruction') != instructions[candidate_version]
            or receipt.get('doesNotGrantPassingQualification') is not True
            or receipt.get('doesNotAuthorizeFutureCandidates') is not True):
        raise ValueError('recovery publication needs the exact unchanged user instruction and retained qualification gaps')
    load = lambda key: json.loads(read_regular(package, receipt['evidence'][key]['path']))
    same_identity = lambda actual, expected: all(actual.get(k) == v for k, v in expected.items())
    binding = load('nativeBinding')
    expected_sources = {'v70': '6f1b9027df1e6cf95843a9b01c7062c576e57a74cc8e3f518d61a77dcb663e15',
                        'candidate': sources[candidate_version]}
    if (binding.get('passed') is not True or len(binding.get('rows', [])) != 2
            or {r.get('version') for r in binding['rows']} != set(expected_sources)
            or any(r.get('sourceSha256') != expected_sources[r['version']] or r.get('exactMatch') is not True
                   or r.get('compiledSha256') != r.get('servedSha256') for r in binding['rows'])):
                raise ValueError('native media proof must bind freshly compiled exact v70/v72 source bytes')
    compiled = {r['version']: r['compiledSha256'] for r in binding['rows']}
    validate_v72_initial_recovery(package, load('initialRecovery'), compiled, candidate_version)
    native = load('nativeRecovery')
    trials = native.get('results', [])
    pairs = [('flock', 'empty', 2), ('figure2', 'empty', 2), ('flock', 'slow', 0), ('figure2', 'slow', 0),
             ('flock', 'empty', 2), ('figure2', 'empty', 2), ('flock', 'empty', 1), ('figure2', 'empty', 1)]
    if (native.get('originalDeadlineMs') != 20000 or native.get('releaseQualified') is not False or len(trials) != 16
            or len({r.get('trial') for r in trials}) != 16):
        raise ValueError('all sixteen unchanged native recovery comparisons must remain present')
    source_hashes = {'flock': '6c82ceeb31ce814e137c880ae41650e5d24df26a202a4af8a3d8a9d60dbeff00',
                     'figure2': '4366350bbe7c6b1517fa042937bcf7f61b7b8190cece2a50ac59ba8a80511fe6'}
    for index, (asset, mode, faults) in enumerate(pairs, 1):
        for version in ['v70', 'candidate']:
            rows = [r for r in trials if r.get('trial') == f'{candidate_version}/native-{index}-{asset}-{version}']
            if len(rows) != 1:
                raise ValueError('missing counterbalanced native trial')
            row = rows[0]
            if (row.get('failure') or row.get('asset') != asset or row.get('mode') != mode or row.get('faults') != faults
                    or row.get('source', {}).get('sha') != source_hashes[asset]
                    or row.get('compiledDriverSha256') != compiled[version] or row.get('originalDeadlineMs') != 20000
                    or not row.get('http', {}).get('requests') or row.get('releaseQualified') is not False):
                raise ValueError('native trial changed original media, source, transport or deadline')
            if version == 'candidate':
                final = row.get('final', {})
                video, driver = final.get('video', {}), final.get('driver', {})
                if (row.get('passed') is not True or not row.get('checks') or not all(v is True for v in row['checks'].values())
                        or type(row.get('readyMs')) not in [int, float] or not 0 <= row['readyMs'] <= 20000
                        or row.get('loads') != faults or video.get('paused') is not True or video.get('seeking') is not False
                        or video.get('readyState', 0) < 2 or driver.get('frameReady') is not True
                        or driver.get('presentedGeneration') != driver.get('generation')
                        or abs(video.get('currentTime', -1) - driver.get('targetTime', -2)) > .001
                        or driver.get('presentedTime') != driver.get('targetTime')):
                    raise ValueError('v72 must genuinely recover every parked native frame within the original deadline')
            elif mode == 'empty' and faults == 2:
                if row.get('passed') is not False or row.get('readyMs') is not None or row.get('loads') != 1:
                    raise ValueError('v70 double-stall failures must not be erased or falsely improved')
    functional = load('functional')
    if (functional.get('releaseQualified') is not False or len(functional.get('results', [])) != 2
            or {r.get('platform') for r in functional['results']} != {'desktop', 'phone'}):
        raise ValueError('both full frozen functional platforms are required')
    for run in functional['results']:
        if (run.get('platform') not in ['desktop', 'phone'] or run.get('renderedPassed') is not True or run.get('failure')
                or len(run.get('points', [])) != 121 or any(p.get('passed') is not True for p in run['points'])
                or len(run.get('aliases', [])) != 3 or any(a.get('passed') is not True for a in run['aliases'])
                or len(run.get('interactions', [])) != (6 if run['platform'] == 'phone' else 5)
                or not same_identity(run.get('identity', {}), receipt['identity'])
                or run.get('passed') is not (not bool(run.get('errors')))
                or not retained_communication_errors(run.get('errors', []))):
            raise ValueError('functional coverage, failure status or frozen identity changed')
    visual = load('visual').get('rows', [])
    ranges = ['hold:hero', 'hero-pattern', 'pattern-star-map', 'method-bottom-figure2', 'crane-contact', 'figure3-services']
    if len(visual) != 12 or {(r.get('platform'), r.get('pose', {}).get('rangeId')) for r in visual} != {(p, r) for p in ['desktop', 'phone'] for r in ranges}:
        raise ValueError('all twelve original visual points are required')
    for row in visual:
        if (row.get('passed') is not True or row.get('maxFraction') != .005 or row.get('channelThreshold') != 24
                or row.get('minimumInk') != 100 or not 0 <= row.get('fraction', -1) <= .005 or row.get('ink', 0) <= 100):
            raise ValueError('original visual gates changed or failed')
        for version, identity in [('candidate', receipt['identity']), ('v70', receipt['baselineIdentity'])]:
            evidence = row.get('versions', {}).get(version, {})
            if not same_identity(evidence.get('identity', {}), identity):
                raise ValueError('visual reference belongs to another frozen artifact')
            checked_file(package / 'evidence', evidence['screenshot'])
    cold = load('coldComparison').get('results', [])
    expected_cold = {(p, t, r, v) for p in ['desktop', 'phone'] for t in [1, 2]
                     for r in ['hero-pattern', 'method-bottom-figure2', 'brand-figure3', 'education-crane', 'crane-contact'] for v in ['v70', 'candidate']}
    if (len(cold) != 40 or {(r.get('platform'), r.get('trial'), r.get('rangeId'), r.get('version')) for r in cold} != expected_cold
            or any(r.get('ready') is not True or r.get('failure')
                   or not retained_communication_errors(r.get('health', {}).get('errors', []))
                   or r.get('passed') is not (not bool(r.get('health', {}).get('errors', [])))
                   or not same_identity(r.get('identity', {}), receipt['identity'] if r['version'] == 'candidate' else receipt['baselineIdentity'])
                   for r in cold)):
        raise ValueError('all original healthy cold cases must complete without hiding failures')
    scroll = load('scrollComparison').get('results', [])
    segments = ['hero-pattern', 'pattern-star-map', 'aod-method-top', 'figure2-distance-expand', 'figure3-services', 'ttg-lab', 'ph-education', 'crane-contact']
    thresholds = {'durationMs': 10000, 'preparationMs': 25000, 'rafP95Ms': 20, 'poseLagP95Ms': 100,
                  'convergenceMs': 150, 'longTaskLimitMs': 50, 'allowedLongTasks': 0}
    if len(scroll) != 4 or {(r.get('platform'), r.get('version')) for r in scroll} != {(p, v) for p in ['desktop', 'phone'] for v in ['v70', 'candidate']}:
        raise ValueError('all four original scroll comparisons are required')
    for run in scroll:
        if (run.get('originalThresholds') != thresholds or run.get('failure') or len(run.get('results', [])) != 8
                or [r.get('id') for r in run['results']] != segments or run.get('releaseQualified') is not False
                or not same_identity(run.get('identity', {}), receipt['identity'] if run['version'] == 'candidate' else receipt['baselineIdentity'])
                or not retained_communication_errors(run.get('health', {}).get('errors', []))
                or any(r.get('failure') or not r.get('samples') or r['samples'][-1].get('time', 0) < 10000 for r in run['results'])):
            raise ValueError('original scroll measurements must be complete; failures remain failures')
        for row in run['results']:
            checks, metrics = row.get('checks', {}), row.get('metrics', {})
            expected_keys = {'completeVisibleSampling', 'rafInterval', 'poseLag', 'convergence', 'longTasks',
                             'videosPaused', 'finalPose', 'fixedViewport', 'focusedSampling'}
            p95 = lambda values: sorted(values)[math.ceil(len(values) * .95) - 1] if values else None
            intervals = [s.get('interval') for s in row['samples'][2:]]
            if any(type(v) not in [int, float] or not math.isfinite(v) for v in intervals):
                raise ValueError('invalid raw scroll intervals')
            actual_p95 = p95(intervals)
            actual_long = (sum(t['duration'] > 50 for t in row.get('longTasks', []))
                           if row.get('longTasksSupported') is True else None)
            if (set(checks) != expected_keys or metrics.get('rafIntervalP95') != actual_p95
                    or checks.get('rafInterval') is not (actual_p95 is not None and actual_p95 <= 20)
                    or checks.get('convergence') is not (type(row.get('convergenceMs')) in [int, float] and 0 <= row['convergenceMs'] <= 150)
                    or metrics.get('over50msTasks') != actual_long
                    or checks.get('longTasks') is not (None if actual_long is None else actual_long == 0)
                    or row.get('passed') is not (all(v is True for v in checks.values()))):
                raise ValueError('a failing original scroll check was promoted to passing')
            checked_file(package / 'evidence', row['screenshot'])
    index = load('retentionIndex')
    if index.get('allCopiedAndHashVerified') is not True or index.get('screenshots', 0) < 64:
        raise ValueError('raw screenshots and reports must have a hash-verified retained copy')
    for entry in index.get('files', []):
        checked_file(package / 'evidence', entry)


def validate_direct_publication(package, deploy, manifest, manifest_bytes, authorization_sha):
    if not authorization_sha or authorization_sha not in [V59_DIRECT_AUTH_SHA, V60_PUBLIC_TEST_AUTH_SHA, V63_RELATIVE_AUTH_SHA, V64_RECEIVER_AUTH_SHA, V65_IMAGE_AUTH_SHA, V67_LOADING_AUTH_SHA, V68_PH_AUTH_SHA, V69_SCRUB_AUTH_SHA, V70_CALLBACK_AUTH_SHA, V72_RECOVERY_AUTH_SHA, V73_RECOVERY_AUTH_SHA]:
        raise ValueError('direct publication requires the exact user-directed v59 receipt, v60 public-test receipt, sealed v63 relative receipt, or sealed v64 receiver-repair receipt')
    receipt_bytes = read_regular(package, DIRECT_AUTH_PATH)
    if digest(receipt_bytes) != authorization_sha:
        raise ValueError('direct publication receipt changed')
    receipt = json.loads(receipt_bytes)
    descriptor = {'path': DIRECT_AUTH_PATH, 'sha256': authorization_sha, 'mode': receipt['mode'],
                  'memoryEvidenceSha256': receipt['evidence']['memory']['sha256']}
    if deploy.get('publicationAuthorization') != descriptor:
        raise ValueError('direct publication descriptor differs from the explicit receipt')
    if (deploy['releaseId'] != receipt['releaseId'] or manifest['basePath'] != receipt['basePath']
            or digest(manifest_bytes) != receipt['identity']['draftManifestSha256']
            or manifest.get('qualification') != {'status': 'pending-memory', 'memoryEvidence': None}
            or any(manifest.get(key) != value for key, value in receipt['identity'].items() if key != 'draftManifestSha256')):
        raise ValueError('direct publication belongs only to the unchanged frozen authorized artifact')
    for item in receipt['evidence'].values():
        checked_file(package, item)
    memory = json.loads(read_regular(package / 'site', 'r5-process-memory.json'))
    if authorization_sha in [V60_PUBLIC_TEST_AUTH_SHA, V63_RELATIVE_AUTH_SHA, V64_RECEIVER_AUTH_SHA, V65_IMAGE_AUTH_SHA, V67_LOADING_AUTH_SHA, V68_PH_AUTH_SHA, V69_SCRUB_AUTH_SHA, V70_CALLBACK_AUTH_SHA, V72_RECOVERY_AUTH_SHA, V73_RECOVERY_AUTH_SHA]:
        # A declaration of missing evidence is not a synthetic measurement and
        # can never satisfy validate_memory or the default qualified path.
        expected = {'schemaVersion': 1, 'kind': 'r5-unmeasured-process-memory', 'status': 'not-measured',
                    'pass': False, 'requiredRunCount': 2, 'completedRunCount': 0, 'runs': [],
                    'qualificationGranted': False, 'identity': receipt['identity'],
                    'reason': 'No formal process-memory runs have been collected for this artifact. Earlier candidates are not evidence for this identity.'}
        if memory != expected:
            raise ValueError('public-test memory must explicitly preserve zero measured runs and no qualification')
        if authorization_sha == V63_RELATIVE_AUTH_SHA:
            validate_relative_improvement(package, receipt)
        if authorization_sha == V64_RECEIVER_AUTH_SHA:
            validate_relative_improvement(package, receipt, 'v64')
            validate_receiver_recovery(package, receipt)
        if authorization_sha == V65_IMAGE_AUTH_SHA:
            validate_relative_improvement(package, receipt, 'v65')
            validate_image_recovery(package, receipt)
        if authorization_sha == V67_LOADING_AUTH_SHA:
            validate_loading_recovery(package, receipt)
        if authorization_sha == V68_PH_AUTH_SHA:
            validate_ph_cors_recovery(package, receipt)
        if authorization_sha == V69_SCRUB_AUTH_SHA:
            validate_scrub_recovery(package, receipt)
        if authorization_sha == V70_CALLBACK_AUTH_SHA:
            validate_scrub_recovery(package, receipt, 'v70')
            validate_callback_cost_recovery(package, receipt)
        if authorization_sha == V72_RECOVERY_AUTH_SHA:
            validate_v72_recovery(package, receipt)
        if authorization_sha == V73_RECOVERY_AUTH_SHA:
            validate_v72_recovery(package, receipt, 'v73')
        return receipt
    if (memory.get('pass') is not False or memory.get('completedRunCount') != 2
            or memory.get('identity') != receipt['identity'] or len(memory.get('runs', [])) != 2
            or any(run.get('pass') is not False or run.get('failure') or run.get('errors')
                   or len(run.get('holds', [])) != 33 or len(run.get('poses', [])) != 90 for run in memory['runs'])):
        raise ValueError('direct publication must preserve both complete failing runs')
    return receipt


def validate_package(package, authorization_sha=None):
    """Validate every packaged byte before SSH/upload and again on the server."""
    deploy = json.loads(read_regular(package, 'release-deploy-manifest.json'))
    if deploy.get('schemaVersion') != 1 or deploy.get('basePath') != '/experience/' or deploy.get('siteDirectory') != 'site':
        raise ValueError('requires a native /experience/ release package')
    rid = release_id(deploy.get('releaseId'))
    site = package / 'site'
    manifest_bytes = read_regular(site, 'r5-release-manifest.json')
    cdn_bytes = read_regular(site, 'cdn-publish-manifest.json')
    manifest, cdn = json.loads(manifest_bytes), json.loads(cdn_bytes)
    if digest(manifest_bytes) != deploy.get('releaseManifestSha256') or digest(cdn_bytes) != deploy.get('cdnManifestSha256'):
        raise ValueError('package manifest hash mismatch')
    if manifest.get('schemaVersion') != 3 or manifest.get('basePath') != '/experience/' or manifest.get('sourceDirty') is not False:
        raise ValueError('release must have a clean, frozen native identity')
    for field in ['sourceCommit', 'candidateTagObject']:
        if not re.fullmatch(r'[0-9a-f]{40}', str(manifest.get(field, ''))) or manifest[field] != deploy.get(field):
            raise ValueError('release identity mismatch: ' + field)
    candidate = manifest.get('candidate')
    if not isinstance(candidate, str) or not re.fullmatch(r'react-refactor-r5-(?:parity-repair-)?candidate(?:-v[1-9][0-9]*)?', candidate) or candidate != deploy.get('candidate'):
        raise ValueError('release candidate identity mismatch')
    qualification = manifest.get('qualification', {})
    evidence = qualification.get('memoryEvidence') or {}
    memory_bytes = read_regular(site, 'r5-process-memory.json')
    memory = json.loads(memory_bytes)
    if authorization_sha is not None:
        receipt = validate_direct_publication(package, deploy, manifest, manifest_bytes, authorization_sha)
        evidence = {'sha256': receipt['evidence']['memory']['sha256'], 'identity': receipt['identity']}
    else:
        if qualification.get('status') != 'qualified' or evidence.get('pass') is not True or evidence.get('runCount') != 2 or evidence.get('path') != 'r5-process-memory.json':
            raise ValueError('release is not qualified by two frozen memory runs')
        if deploy.get('publicationAuthorization') is not None:
            raise ValueError('direct publication requires its explicit authorization SHA')
        validate_memory(memory)
    expected_run_count = 0 if authorization_sha is not None and authorization_sha in [V60_PUBLIC_TEST_AUTH_SHA, V63_RELATIVE_AUTH_SHA, V64_RECEIVER_AUTH_SHA, V65_IMAGE_AUTH_SHA, V67_LOADING_AUTH_SHA, V68_PH_AUTH_SHA, V69_SCRUB_AUTH_SHA, V70_CALLBACK_AUTH_SHA, V72_RECOVERY_AUTH_SHA, V73_RECOVERY_AUTH_SHA] else 2
    if digest(memory_bytes) != evidence.get('sha256') or memory.get('pass') is not (authorization_sha is None) or memory.get('completedRunCount') != expected_run_count or memory.get('identity') != evidence.get('identity'):
        raise ValueError('memory evidence identity mismatch')
    for field in ['sourceCommit', 'candidateTagObject', 'candidate', 'artifactTreeSha256']:
        if memory.get('identity', {}).get(field) != manifest.get(field):
            raise ValueError('memory evidence belongs to another artifact: ' + field)
    if cdn.get('schemaVersion') != 1 or cdn.get('enabled') is not True or cdn.get('releaseId') != rid or cdn.get('sourceCommit') != manifest['sourceCommit']:
        raise ValueError('CDN release identity mismatch')
    cdn_files = deploy.get('cdnFiles', [])
    if [dict((key, value) for key, value in item.items() if key != 'packagePath') for item in cdn_files] != cdn.get('files'):
        raise ValueError('CDN package inventory mismatch')
    by_source = {}
    for item in cdn_files:
        name = safe_name(item['sourcePath'])
        channel = item.get('channel')
        if channel not in ['assets', 'media'] or name in by_source or not name.startswith('assets/') or item.get('objectKey') != f'releases/{rid}/{name}':
            raise ValueError('invalid CDN object')
        if item.get('packagePath') != f'cdn/{channel}/{name}':
            raise ValueError('invalid CDN package path')
        checked_file(package, item, 'packagePath')
        by_source[name] = item
    if deploy.get('cdnFileCount') != len(cdn_files) or deploy.get('cdnTotalBytes') != sum(item['bytes'] for item in cdn_files):
        raise ValueError('CDN totals mismatch')
    entries = manifest.get('files', [])
    names = set()
    site_names = {'r5-release-manifest.json', 'r5-process-memory.json', 'release-id.txt'}
    for item in entries:
        name = safe_name(item['path'])
        if name in names or name in {'r5-release-manifest.json', 'r5-process-memory.json', 'release-id.txt'}:
            raise ValueError('duplicate or reserved artifact path')
        names.add(name)
        if name in by_source:
            cdn_item = by_source[name]
            if (item['bytes'], item['sha256']) != (cdn_item['bytes'], cdn_item['sha256']):
                raise ValueError('CDN bytes differ from frozen artifact')
        else:
            checked_file(site, item)
            site_names.add(name)
    if not set(by_source).issubset(names) or not {'index.html', 'cdn-publish-manifest.json'}.issubset(names):
        raise ValueError('incomplete artifact inventory')
    tree_sha = digest(json.dumps(entries, separators=(',', ':'), ensure_ascii=False).encode())
    if tree_sha != manifest.get('artifactTreeSha256') or manifest.get('fileCount') != len(entries) or manifest.get('totalBytes') != sum(item['bytes'] for item in entries):
        raise ValueError('frozen artifact tree mismatch')
    actual = set()
    for target in site.rglob('*'):
        if target.is_symlink():
            raise ValueError('symlink in site payload')
        if target.is_file():
            actual.add(target.relative_to(site).as_posix())
    if actual != site_names or read_regular(site, 'release-id.txt') != (rid + '\n').encode():
        raise ValueError('site payload inventory mismatch')
    return deploy, manifest, site_names


def atomic_write(filename, data, owner=None):
    handle, temporary = tempfile.mkstemp(prefix='.' + filename.name + '-', dir=filename.parent)
    try:
        with os.fdopen(handle, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, stat.S_IMODE(owner.st_mode) if owner else 0o644)
        if owner:
            os.chown(temporary, owner.st_uid, owner.st_gid)
        os.replace(temporary, filename)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def command(args):
    subprocess.run(args, check=True, timeout=45)


@contextlib.contextmanager
def locked():
    directory = SITE / 'route-backups'
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / '.experience-publish.lock').open('a') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def predecessor(expected_vhost_sha, expected_include_sha):
    original, vhost = INCLUDE.read_bytes(), VHOST.read_bytes()
    if digest(vhost) != expected_vhost_sha or digest(original) != expected_include_sha:
        raise ValueError('active configuration changed')
    if vhost.decode().count(f'include {INCLUDE};') != 1 or (SITE / 'current').resolve() != SITE / 'releases' / BASE_ID:
        raise ValueError('root site changed')
    return original, vhost, legacy_assets(expected_include_sha)


def legacy_assets(include_sha, visited=None):
    if include_sha != PREDECESSOR_SHA and include_sha not in NATIVE_PREDECESSORS:
        raise ValueError('configuration is not an inspected predecessor')
    visited = set() if visited is None else visited
    if include_sha in visited:
        raise ValueError('native predecessor chain is cyclic')
    visited = visited | {include_sha}
    base, mount = SITE / 'releases' / BASE_ID, SITE / 'mounts' / MOUNT_ID
    donor_bytes = (base / 'r5-release-manifest.json').read_bytes()
    overlay_bytes = (mount / 'mount-manifest.json').read_bytes()
    if digest(donor_bytes) != BASE_SHA or digest(overlay_bytes) != MOUNT_SHA:
        raise ValueError('v55 predecessor identity mismatch')
    donor, overlay = json.loads(donor_bytes), json.loads(overlay_bytes)
    overrides = {item['path']: item for item in overlay['assetOverrides']}
    for item in overlay['files']:
        checked_file(mount, item)
    assets = {}
    for item in donor['files']:
        name = safe_name(item['path'])
        if name.startswith('assets/') and name.endswith(('.js', '.css')):
            checked_file(base, item)
            override = overrides.get(name)
            if override and override['baseSha256'] != item['sha256']:
                raise ValueError('legacy override donor mismatch')
            assets[name] = {**(override or item), 'filename': (mount if override else base) / name, 'override': bool(override)}
    if not set(overrides).issubset(assets):
        raise ValueError('unresolved legacy override')
    if include_sha in NATIVE_PREDECESSORS:
        previous = NATIVE_PREDECESSORS[include_sha]
        before_sha = previous.get('beforeIncludeSha256', PREDECESSOR_SHA)
        root = SITE / 'releases' / previous['releaseId']
        backup = state_directory(previous['releaseId'])
        record = json.loads(read_regular(backup, 'transaction.json'))
        if (record.get('state') != 'applied-http-verified' or record.get('releaseId') != previous['releaseId']
                or record.get('rootCurrent') != str(base) or record.get('afterIncludeSha256') != include_sha
                or record.get('beforeIncludeSha256') != before_sha
                or record.get('releaseManifestSha256') != previous['manifestSha256']
                or digest(read_regular(backup, 'include.before.conf')) != before_sha
                or digest(read_regular(backup, 'include.after.conf')) != include_sha):
            raise ValueError('native predecessor transaction mismatch')
        # Retain all explicitly inspected generations, not just the most
        # recent native files. Each edge, transaction and byte is revalidated;
        # an unknown ancestor or a cycle cannot broaden this fixed allowlist.
        if before_sha != PREDECESSOR_SHA:
            assets = legacy_assets(before_sha, visited)
        manifest_bytes = read_regular(root, 'r5-release-manifest.json')
        if digest(manifest_bytes) != previous['manifestSha256']:
            raise ValueError('native predecessor manifest changed')
        for item in json.loads(manifest_bytes)['files']:
            name = safe_name(item['path'])
            if name.startswith('assets/') and name.endswith(('.js', '.css')):
                checked_file(root, item)
                if name in assets:
                    if item['sha256'] != assets[name]['sha256']:
                        raise ValueError('native predecessor legacy URL collision')
                else:
                    assets[name] = {**item, 'filename': root / name, 'override': False}
    return assets


def content_type(name):
    return {'.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
            '.webmanifest': 'application/manifest+json', '.html': 'text/html',
            '.ico': 'image/x-icon', '.webp': 'image/webp', '.png': 'image/png',
            '.svg': 'image/svg+xml', '.txt': 'text/plain'}.get(Path(name).suffix) or mimetypes.guess_type(name)[0] or 'application/octet-stream'


def headers(rid, cache='no-cache', mime=None):
    prefix = f'        default_type {mime};\n' if mime else ''
    return prefix + f'''        add_header Cache-Control "{cache}" always;
        add_header Strict-Transport-Security "max-age=31536000" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Tongye-Experience-Release "{rid}" always;
'''


def exact_file(url, filename, rid, cache='no-cache', noindex=False):
    source = (f'        root {filename.parent};\n        try_files /{filename.name} =404;\n'
              if url.endswith('/') else f'        alias {filename};\n')
    extra = '        add_header X-Robots-Tag "noindex, nofollow" always;\n' if noindex else ''
    return f'    location = {url} {{\n{source}{headers(rid, cache, content_type(filename.name))}{extra}    }}\n'


def render_include(deploy, manifest, original, legacy, site=None):
    site = SITE if site is None else site
    rid = deploy['releaseId']
    root = site / 'releases' / rid
    marker = '    location = /experience {'
    text = original.decode()
    if text.count(marker) != 1:
        raise ValueError('unexpected predecessor root routes')
    text = text.split(marker)[0] + '# Native experience; root redirect and preview rules above are unchanged.\n'
    for url, target in [('/experience', '/experience/'), ('/experience/index.html', '/experience/'), ('/experience/brand-lab/', '/experience/brand-lab')]:
        text += f'    location = {url} {{\n{headers(rid, "no-store")}        return 301 {target}$is_args$args;\n    }}\n'
    text += exact_file('/experience/', root / 'index.html', rid)
    text += exact_file('/experience/brand-lab', root / 'index.html', rid, noindex=True)
    new_assets = {item['path']: item for item in manifest['files'] if item['path'].startswith('assets/')}
    for name, item in sorted(legacy.items()):
        if name in new_assets and new_assets[name]['sha256'] != item['sha256']:
            raise ValueError('legacy asset URL collision: ' + name)
        filename = site / item['filename'].relative_to(SITE)
        text += exact_file('/experience/' + name, filename, rid, 'no-cache' if item['override'] else 'public, max-age=31536000, immutable')
    public_files = {'r5-release-manifest.json', 'release-id.txt', 'manifest.webmanifest', 'manifest.json', 'site.webmanifest',
                    'favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'og-image.webp'}
    for name in sorted(public_files):
        if name in {'r5-release-manifest.json', 'release-id.txt'} or any(item['path'] == name for item in manifest['files']):
            text += exact_file('/experience/' + name, root / name, rid)
    text += f'''    location ^~ /experience/assets/ {{
        alias {root}/assets/;
{headers(rid, 'public, max-age=31536000, immutable')}    }}
    location ^~ /experience/ {{
{headers(rid, 'no-store')}        return 404;
    }}
'''
    return text.encode()


def state_directory(rid):
    return SITE / 'route-backups' / ('native-' + release_id(rid))


def assert_active(record, include_sha):
    if digest(VHOST.read_bytes()) != record['vhostSha256'] or digest(INCLUDE.read_bytes()) != include_sha or str((SITE / 'current').resolve()) != record['rootCurrent']:
        raise ValueError('another production change; refusing to overwrite')


def apply(package, expected_vhost_sha, expected_include_sha, probe_receipt, transaction_token, authorization_sha=None):
    if not re.fullmatch(r'[0-9a-f]{32}', transaction_token or ''):
        raise ValueError('apply requires a unique transaction token')
    deploy, manifest, site_names = validate_package(package, authorization_sha)
    memory_sha = (deploy['publicationAuthorization']['memoryEvidenceSha256'] if authorization_sha
                  else manifest['qualification']['memoryEvidence']['sha256'])
    rid = deploy['releaseId']
    with locked():
        original, vhost, legacy = predecessor(expected_vhost_sha, expected_include_sha)
        candidate = render_include(deploy, manifest, original, legacy)
        probe_bytes = probe_receipt.read_bytes()
        report = json.loads(probe_bytes)
        for field, expected in {'releaseId': rid, 'scope': 'isolated-real-nginx', 'status': 'passed',
                                'releaseManifestSha256': deploy['releaseManifestSha256'],
                                'vhostSha256': expected_vhost_sha, 'beforeIncludeSha256': expected_include_sha,
                                'userDirectedAuthorizationSha256': authorization_sha,
                                'afterIncludeSha256': digest(candidate)}.items():
            if report.get(field) != expected:
                raise ValueError('isolated nginx probe identity mismatch: ' + field)
        if not report.get('checks') or not report.get('completedAt'):
            raise ValueError('isolated nginx probe is incomplete')
        target, backup = SITE / 'releases' / rid, state_directory(rid)
        if target.exists() or target.is_symlink() or backup.exists():
            raise ValueError('immutable release or transaction already exists')
        backup.mkdir(mode=0o700)
        owner = INCLUDE.stat()
        atomic_write(backup / 'include.before.conf', original)
        atomic_write(backup / 'include.after.conf', candidate)
        atomic_write(backup / 'nginx-probe.json', probe_bytes)
        record = {'releaseId': rid, 'transactionToken': transaction_token, 'sourceCommit': deploy['sourceCommit'], 'basePath': '/experience/',
                  'vhostSha256': digest(vhost), 'beforeIncludeSha256': digest(original), 'afterIncludeSha256': digest(candidate),
                  'rootCurrent': str((SITE / 'current').resolve()), 'releaseManifestSha256': deploy['releaseManifestSha256'],
                  'state': 'prepared'}
        if authorization_sha:
            receipt_bytes = read_regular(package, DIRECT_AUTH_PATH)
            if digest(receipt_bytes) != authorization_sha:
                raise ValueError('direct publication receipt changed before staging')
            receipt = json.loads(receipt_bytes)
            atomic_write(backup / DIRECT_AUTH_PATH, receipt_bytes)
            (backup / 'evidence').mkdir()
            for name, item in receipt['evidence'].items():
                atomic_write(backup / 'evidence' / (name + '.json'), checked_file(package, item))
            record.update(publicationMode=receipt['mode'], userDirectedAuthorizationSha256=authorization_sha,
                          qualificationStatusUnchanged='pending-memory')
        atomic_write(backup / 'transaction.json', encoded(record))
        target.mkdir(mode=0o755)
        target.chmod(0o755)
        for name in sorted(site_names):
            destination = target / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            parent = destination.parent
            while parent != target:
                parent.chmod(0o755)
                parent = parent.parent
            atomic_write(destination, read_regular(package / 'site', name))
        # Catch a changing staging tree before it can affect the active include.
        for name in site_names:
            if (target / name).read_bytes() != read_regular(package / 'site', name):
                raise ValueError('staged site changed during copying')
        # Revalidate copied bytes against frozen hashes, not only against source.
        cdn_sources = {item['sourcePath'] for item in deploy['cdnFiles']}
        for item in manifest['files']:
            if item['path'] not in cdn_sources:
                checked_file(target, item)
        if digest((target / 'r5-release-manifest.json').read_bytes()) != deploy['releaseManifestSha256']:
            raise ValueError('copied manifest changed')
        if digest((target / 'r5-process-memory.json').read_bytes()) != memory_sha or (target / 'release-id.txt').read_bytes() != (rid + '\n').encode():
            raise ValueError('copied qualification or release id changed')
        shutil.copyfile(__file__, backup / 'publish-experience-release.py')
        assert_active(record, record['beforeIncludeSha256'])
        record['state'] = 'switching'
        atomic_write(backup / 'transaction.json', encoded(record))
        try:
            atomic_write(INCLUDE, candidate, owner)
            command(['nginx', '-t'])
            command(['systemctl', 'reload', 'nginx'])
        except BaseException:
            assert_active(record, record['afterIncludeSha256'])
            atomic_write(INCLUDE, original, owner)
            command(['nginx', '-t'])
            command(['systemctl', 'reload', 'nginx'])
            record['state'] = 'rolled-back-after-error'
            atomic_write(backup / 'transaction.json', encoded(record))
            raise
        record['state'] = 'applied-awaiting-public-smoke'
        atomic_write(backup / 'transaction.json', encoded(record))
        return record


def rollback(rid, transaction_token=None):
    with locked():
        backup = state_directory(rid)
        record = json.loads((backup / 'transaction.json').read_bytes())
        if transaction_token is not None and transaction_token != record.get('transactionToken'):
            raise ValueError('rollback belongs to another invocation; refusing to overwrite')
        if record['state'] in ['rolled-back', 'rolled-back-after-error', 'aborted-before-switch']:
            assert_active(record, record['beforeIncludeSha256'])
            return record
        if record['state'] == 'prepared':
            assert_active(record, record['beforeIncludeSha256'])
            record['state'] = 'aborted-before-switch'
            atomic_write(backup / 'transaction.json', encoded(record))
            return record
        if record['state'] not in ['switching', 'applied-awaiting-public-smoke', 'applied-http-verified']:
            raise ValueError('transaction is not active')
        active_sha = digest(INCLUDE.read_bytes())
        allowed = [record['afterIncludeSha256']]
        if record['state'] == 'switching':
            allowed.append(record['beforeIncludeSha256'])
        if active_sha not in allowed:
            raise ValueError('another production change; refusing to overwrite')
        assert_active(record, active_sha)
        original = (backup / 'include.before.conf').read_bytes()
        if digest(original) != record['beforeIncludeSha256']:
            raise ValueError('rollback backup changed')
        atomic_write(INCLUDE, original, INCLUDE.stat())
        try:
            command(['nginx', '-t'])
            command(['systemctl', 'reload', 'nginx'])
        except BaseException:
            assert_active(record, record['beforeIncludeSha256'])
            candidate = (backup / 'include.after.conf').read_bytes()
            if digest(candidate) != record['afterIncludeSha256']:
                raise ValueError('rollback rescue backup changed')
            atomic_write(INCLUDE, candidate, INCLUDE.stat())
            command(['nginx', '-t'])
            command(['systemctl', 'reload', 'nginx'])
            raise
        record['state'] = 'rolled-back'
        atomic_write(backup / 'transaction.json', encoded(record))
        return record


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, hdrs, newurl):
        return None


def http_checks(origin, deploy, manifest, legacy):
    checks = []
    opener = urllib.request.build_opener(NoRedirect)

    def check(url, status=200, sha=None, mime=None, location=None, cache=None, noindex=False):
        request = urllib.request.Request(origin + url, headers={'Cache-Control': 'no-cache', 'Accept-Encoding': 'identity'})
        try:
            response = opener.open(request, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            body = response.read()
            if response.status != status or (sha and digest(body) != sha) or (mime and mime not in response.headers.get('Content-Type', '')):
                raise ValueError(f'HTTP check failed: {url} ({response.status}); '
                                 f'sha256={digest(body)} expected={sha}; '
                                 f'mime={response.headers.get("Content-Type")} expected={mime}')
            if location and not response.headers.get('Location', '').endswith(location):
                raise ValueError('HTTP redirect mismatch: ' + url)
            if cache and response.headers.get('Cache-Control') != cache:
                raise ValueError('HTTP cache mismatch: ' + url)
            if noindex and response.headers.get('X-Robots-Tag') != 'noindex, nofollow':
                raise ValueError('HTTP robots mismatch: ' + url)
            if status == 200 and url.startswith('/experience/') and response.headers.get('X-Tongye-Experience-Release') != deploy['releaseId']:
                raise ValueError('HTTP release header mismatch: ' + url)
            checks.append({'path': url, 'status': status, 'sha256': digest(body) if sha else None})

    check('/?from=release-check', 302, location='/experience/?from=release-check')
    check('/index.html?from=release-check', 302, location='/experience/?from=release-check')
    for url, target in [('/experience', '/experience/'), ('/experience/index.html', '/experience/'), ('/experience/brand-lab/', '/experience/brand-lab')]:
        check(url + '?from=release-check', 301, location=target + '?from=release-check')
    entry = next(item for item in manifest['files'] if item['path'] == 'index.html')
    check('/experience/', sha=entry['sha256'], mime='text/html', cache='no-cache')
    check('/experience/brand-lab', sha=entry['sha256'], mime='text/html', cache='no-cache', noindex=True)
    check('/experience/r5-release-manifest.json', sha=deploy['releaseManifestSha256'], mime='application/json', cache='no-cache')
    check('/experience/release-id.txt', sha=digest((deploy['releaseId'] + '\n').encode()), mime='text/plain')
    for item in manifest['files']:
        if item['path'].startswith('assets/') and item['path'].endswith(('.js', '.css')):
            old = legacy.get(item['path'])
            cache = 'no-cache' if old and old.get('override') else 'public, max-age=31536000, immutable'
            check('/experience/' + item['path'], sha=item['sha256'], mime=content_type(item['path']), cache=cache)
    for name, item in sorted(legacy.items()):
        check('/experience/' + name, sha=item['sha256'], mime=content_type(name),
              cache='no-cache' if item.get('override') else 'public, max-age=31536000, immutable')
    for item in manifest['files']:
        if item['path'] in ['manifest.webmanifest', 'manifest.json', 'site.webmanifest', 'favicon.ico', 'favicon.svg',
                            'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'og-image.webp']:
            check('/experience/' + item['path'], sha=item['sha256'], mime=content_type(item['path']), cache='no-cache')
    check('/r5-release-manifest.json', sha=BASE_SHA, mime='application/json')
    for route in ['/services/', '/faq/']:
        check(route, mime='text/html')
    for route in ['/experience/not-found', '/experience/assets/not-found.js', '/experience/mount-manifest.json']:
        check(route, 404)
    return {'releaseId': deploy['releaseId'], 'origin': origin, 'status': 'passed', 'checks': checks,
            'completedAt': datetime.now(timezone.utc).isoformat()}


def probe(package, expected_vhost_sha, expected_include_sha, authorization_sha=None):
    deploy, manifest, _ = validate_package(package, authorization_sha)
    original, _, legacy = predecessor(expected_vhost_sha, expected_include_sha)
    with tempfile.TemporaryDirectory(prefix='tongye-native-nginx-probe-') as directory:
        root = Path(directory)
        os.chmod(root, 0o755)
        (root / 'logs').mkdir()
        site = root / 'site'
        (site / 'releases').mkdir(parents=True)
        (site / 'mounts').mkdir()
        (site / 'releases' / BASE_ID).symlink_to(SITE / 'releases' / BASE_ID)
        (site / 'releases' / deploy['releaseId']).symlink_to(package / 'site')
        (site / 'mounts' / MOUNT_ID).symlink_to(SITE / 'mounts' / MOUNT_ID)
        for item in legacy.values():
            relative = item['filename'].relative_to(SITE)
            if relative.parts[0] == 'releases':
                previous = site / 'releases' / relative.parts[1]
                if not previous.exists():
                    previous.symlink_to(SITE / 'releases' / relative.parts[1])
        with socket.socket() as reserved:
            reserved.bind(('127.0.0.1', 0))
            port = reserved.getsockname()[1]
        config = root / 'nginx.conf'
        routes = render_include(deploy, manifest, original, legacy, site).decode()
        atomic_write(config, f'''pid {root}/nginx.pid;
error_log {root}/error.log notice;
events {{ worker_connections 64; }}
http {{
    lua_package_path "/www/server/nginx/lib/lua/?.lua;;";
    include /www/server/nginx/conf/mime.types;
    access_log off;
    server {{
        listen 127.0.0.1:{port};
        server_name localhost;
        set $tongye_preview_robots "";
        root {site}/releases/{BASE_ID};
{routes}
        location / {{ try_files $uri $uri/ =404; }}
    }}
}}
'''.encode())
        args = ['nginx', '-p', str(root) + '/', '-c', str(config)]
        command(args + ['-t'])
        process = subprocess.Popen(args + ['-g', 'daemon off; master_process off;'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            deadline = time.monotonic() + 5
            while True:
                if process.poll() is not None:
                    raise RuntimeError(process.communicate()[1].decode())
                try:
                    with socket.create_connection(('127.0.0.1', port), timeout=0.2):
                        break
                except OSError:
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(0.05)
            report = http_checks(f'http://127.0.0.1:{port}', deploy, manifest, legacy)
            report.update(scope='isolated-real-nginx', releaseManifestSha256=deploy['releaseManifestSha256'], vhostSha256=expected_vhost_sha,
                          userDirectedAuthorizationSha256=authorization_sha,
                          beforeIncludeSha256=expected_include_sha,
                          afterIncludeSha256=digest(render_include(deploy, manifest, original, legacy)))
            return report
        finally:
            process.terminate()
            try:
                process.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.communicate(timeout=5)


def verify(package, authorization_sha=None):
    deploy, manifest, _ = validate_package(package, authorization_sha)
    backup = state_directory(deploy['releaseId'])
    with locked():
        record = json.loads((backup / 'transaction.json').read_bytes())
        if record['state'] != 'applied-awaiting-public-smoke' or record['releaseManifestSha256'] != deploy['releaseManifestSha256']:
            raise ValueError('not the pending published artifact')
        if record.get('userDirectedAuthorizationSha256') != authorization_sha:
            raise ValueError('published authorization identity changed')
        assert_active(record, record['afterIncludeSha256'])
        # Recover the exact predecessor inventory without accepting a newer include.
        with (backup / 'include.before.conf').open('rb') as stream:
            before = stream.read()
        if digest(before) != record['beforeIncludeSha256']:
            raise ValueError('predecessor backup changed')
        legacy = legacy_assets(record['beforeIncludeSha256'])
        report = http_checks(PUBLIC_ORIGIN, deploy, manifest, legacy)
        assert_active(record, record['afterIncludeSha256'])
        atomic_write(backup / 'http-smoke.json', encoded(report))
        record.update(state='applied-http-verified', httpSmokeSha256=digest(encoded(report)), verifiedAt=report['completedAt'])
        atomic_write(backup / 'transaction.json', encoded(record))
        return record


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['validate', 'probe', 'apply', 'rollback', 'verify'])
    parser.add_argument('--package', type=Path)
    parser.add_argument('--release-id')
    parser.add_argument('--expected-vhost-sha')
    parser.add_argument('--expected-include-sha')
    parser.add_argument('--probe-receipt', type=Path)
    parser.add_argument('--transaction-token')
    parser.add_argument('--user-directed-authorization-sha')
    args = parser.parse_args()
    if args.action == 'rollback':
        result = rollback(args.release_id, args.transaction_token)
    else:
        if args.package is None:
            parser.error('requires --package')
        package = args.package.absolute()
        if args.action == 'validate':
            deploy, manifest, _ = validate_package(package, args.user_directed_authorization_sha)
            result = {'releaseId': deploy['releaseId'], 'sourceCommit': manifest['sourceCommit'], 'status': 'validated'}
        elif args.action == 'verify':
            result = verify(package, args.user_directed_authorization_sha)
        else:
            if not all(re.fullmatch(r'[0-9a-f]{64}', value or '') for value in [args.expected_vhost_sha, args.expected_include_sha]):
                parser.error('requires both inspected configuration SHA-256 values')
            if args.probe_receipt is None:
                parser.error('probe/apply requires --probe-receipt')
            if args.action == 'probe':
                result = probe(package, args.expected_vhost_sha, args.expected_include_sha, args.user_directed_authorization_sha)
                with args.probe_receipt.open('xb') as stream:
                    stream.write(encoded(result))
                    stream.flush()
                    os.fsync(stream.fileno())
            else:
                result = apply(package, args.expected_vhost_sha, args.expected_include_sha, args.probe_receipt, args.transaction_token, args.user_directed_authorization_sha)
    print(json.dumps(result))

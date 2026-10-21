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
# The second publication preserves both generations of lazy module URLs. This
# is not permission to accept arbitrary future predecessors or pending builds.
NATIVE_PREDECESSORS = {
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
    functional = json.loads(read_regular(package, receipt['evidence']['functional']['path']))
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
    if (functional.get('kind') != f'frozen-{candidate_version}-functional-and-v60-visual-comparison-unshaped-http'
            or functional.get('passed') is not True or functional.get('failure') or functional.get('releaseQualified') is not False):
        raise ValueError('relative publication requires complete frozen functional and visual checks')
    runs = functional.get('functional', [])
    if len(runs) != 2 or {run.get('platform') for run in runs} != {'desktop', 'phone'}:
        raise ValueError('both frozen functional platforms are required')
    for run in runs:
        if (run.get('passed') is not True or run.get('errors') or len(run.get('points', [])) != 121
                or any(point.get('passed') is not True for point in run['points'])
                or any(run.get('identity', {}).get(key) != value for key, value in receipt['identity'].items() if key != 'draftManifestSha256')
                or len(run.get('aliases', [])) != 3 or {alias.get('panel') for alias in run['aliases']} != {'opening', 'cards', 'closing'}
                or any(alias.get('passed') is not True for alias in run['aliases'])):
            raise ValueError('frozen functional or Proof alias regression')
    visual = functional.get('visual', [])
    visual_ranges = ['hold:hero', 'hero-pattern', 'pattern-star-map', 'method-bottom-figure2', 'crane-contact', 'figure3-services']
    if (len(visual) != 12 or {(row.get('platform'), row.get('pose', {}).get('rangeId')) for row in visual}
            != {(platform, segment) for platform in ['desktop', 'phone'] for segment in visual_ranges}
            or any(row.get('passed') is not True or type(row.get('fraction')) not in [int, float]
                   or not 0 <= row['fraction'] <= .005 or row.get('ink', 0) <= 100 for row in visual)):
        raise ValueError('original frozen visual difference threshold failed')


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


def validate_direct_publication(package, deploy, manifest, manifest_bytes, authorization_sha):
    if authorization_sha not in [V59_DIRECT_AUTH_SHA, V60_PUBLIC_TEST_AUTH_SHA, V63_RELATIVE_AUTH_SHA, V64_RECEIVER_AUTH_SHA]:
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
    if authorization_sha in [V60_PUBLIC_TEST_AUTH_SHA, V63_RELATIVE_AUTH_SHA, V64_RECEIVER_AUTH_SHA]:
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
    expected_run_count = 0 if authorization_sha in [V60_PUBLIC_TEST_AUTH_SHA, V63_RELATIVE_AUTH_SHA, V64_RECEIVER_AUTH_SHA] else 2
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

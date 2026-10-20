#!/usr/bin/env python3
"""Real nginx integration using synthetic, temporary data; NEVER publishes.

Run where the release host's nginx/modules are available. A passing fixture
does not replace the mandatory probe of the actual qualified release package.
"""
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('fixture', Path(__file__).with_name('test-publish-experience-release.py'))
fixture_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture_module)
fixture = fixture_module.NativePublicationTests()
fixture.setUp()
try:
    fixture.commands.stop()  # This integration must execute the actual handler.
    before = fixture.include.read_bytes(), fixture.vhost.read_bytes(), (fixture.site / 'current').resolve()
    report = fixture_module.native.probe(fixture.package, fixture.vhost_sha, fixture.include_sha)
    assert before == (fixture.include.read_bytes(), fixture.vhost.read_bytes(), (fixture.site / 'current').resolve())
    print(json.dumps({'status': report['status'], 'checks': len(report['checks']),
                      'scope': 'synthetic fixture against real loopback nginx; no public configuration or application qualification'}))
finally:
    fixture.doCleanups()

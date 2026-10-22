import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createCdnTransport, parseCurlResponse } from './cdn-release-transport.mjs';

test('uses original fetch by default and rejects unknown transports', () => {
  const original = () => {};
  assert.equal(createCdnTransport(undefined, { fetchImpl: original }), original);
  assert.throws(() => createCdnTransport('skip'));
});
test('reads final HTTP headers after a proxy and redirect without consuming binary body', async () => {
  const body = Buffer.from([0, 255, 1, 13, 10]);
  const result = parseCurlResponse(Buffer.concat([Buffer.from('HTTP/1.1 200 Connection established\r\n\r\nHTTP/2 302 Found\r\nlocation: /new\r\n\r\nHTTP/2 206 \r\ncontent-type: video/webm\r\ncontent-length: 5\r\ncontent-range: bytes 0-4/10\r\n\r\n'), body]), 'GET');
  assert.equal(result.status, 206);assert.equal(result.headers.get('content-length'), '5');
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), body);
});
test('preserves final failures and rejects truncated or malformed headers', () => {
  assert.equal(parseCurlResponse(Buffer.from('HTTP/2 503 \r\ncontent-length: 0\r\n\r\n'), 'HEAD').status, 503);
  for(const text of ['HTTP/2 200', 'not-http\r\n\r\n', 'HTTP/2 200 \r\nbad-header\r\n\r\n']) assert.throws(() => parseCurlResponse(Buffer.from(text), 'HEAD'));
});
test('curl keeps original methods, headers and deadlines; transport errors propagate', async () => {
  let recorded;
  const request = createCdnTransport('curl', { execImpl: async (...args) => { recorded=args;return { stdout: Buffer.from('HTTP/2 200 \r\ncontent-length: 42\r\n\r\n') }; } });
  const signal = AbortSignal.timeout(20000);
  await request('https://media.tongye.me/test', { method:'HEAD',headers:{ Origin:'https://tongye.me' },signal });
  assert.equal(recorded[0], 'curl');assert.ok(recorded[1].includes('--head'));assert.ok(recorded[1].includes('20'));assert.ok(recorded[1].includes('Origin: https://tongye.me'));assert.equal(recorded[2].signal,signal);
  assert.ok(recorded[1].includes('--proto-redir'));assert.ok(recorded[1].includes('=http,https'));
  const failed = createCdnTransport('curl', { execImpl: async () => { throw Error('connect timeout'); } });
  await assert.rejects(failed('https://media.tongye.me/test'), /connect timeout/);
  await assert.rejects(request('file:///private'), /HTTP/);
});

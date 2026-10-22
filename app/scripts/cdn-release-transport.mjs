import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

// Curl can use the host's existing network path when Node's direct connection
// cannot. Only the transport changes: the caller keeps every original check.
export function parseCurlResponse(output, method) {
  const bytes = Buffer.from(output);
  let offset = 0, status, headers;
  do {
    const end = bytes.indexOf('\r\n\r\n', offset);
    if (end < 0) throw new Error('curl returned incomplete HTTP headers');
    const lines = bytes.subarray(offset, end).toString('latin1').split('\r\n');
    const match = /^HTTP\/\S+ (\d{3})(?: |$)/.exec(lines.shift());
    if (!match) throw new Error('curl returned an invalid HTTP status');
    status = Number(match[1]);
    headers = new Headers();
    for (const line of lines) {
      const colon = line.indexOf(':');
      if (colon <= 0) throw new Error('curl returned an invalid HTTP header');
      headers.append(line.slice(0, colon), line.slice(colon + 1).trim());
    }
    offset = end + 4;
    // Proxy CONNECT, informational responses and redirects precede the actual
    // response. Never use an intermediate success as the final result.
  } while (bytes.subarray(offset, offset + 5).toString() === 'HTTP/');
  const body = method === 'HEAD' ? Buffer.alloc(0) : bytes.subarray(offset);
  return { status, headers, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
}

export function createCdnTransport(name = 'fetch', { fetchImpl = globalThis.fetch, execImpl = execute } = {}) {
  if (name === 'fetch') return fetchImpl;
  if (name !== 'curl') throw new Error('unknown CDN verification transport: ' + name);
  return async (url, options = {}) => {
    if (!/^https?:\/\//.test(url)) throw new Error('CDN verification requires HTTP(S)');
    const method = options.method ?? 'GET';
    if (!['GET', 'HEAD'].includes(method)) throw new Error('unsupported CDN verification method');
    const args = ['--silent', '--show-error', '--globoff', '--location', '--max-redirs', '20',
      '--proto', '=http,https', '--proto-redir', '=http,https',
      '--connect-timeout', '10', '--max-time', '20', '--include'];
    if (method === 'HEAD') args.push('--head');
    for (const [key, value] of Object.entries(options.headers ?? {})) {
      if (/[\r\n]/.test(key + value)) throw new Error('invalid CDN verification header');
      args.push('--header', `${key}: ${value}`);
    }
    args.push(url);
    const { stdout } = await execImpl('curl', args, { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024, signal: options.signal });
    return parseCurlResponse(stdout, method);
  };
}

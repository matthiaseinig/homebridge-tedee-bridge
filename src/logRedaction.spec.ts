import {strict as assert} from 'node:assert';
import {after, before, describe, it} from 'node:test';
import {createServer, IncomingMessage, Server, ServerResponse} from 'node:http';
import {AddressInfo} from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {format} from 'node:util';

import {API, Logger, PlatformConfig} from 'homebridge';

import {HomebridgeTedeePlatform} from './platform';
import {TedeeLocalApiClient} from './clients/tedee-local-api-client';
import {createRedactingLogger, createSecretRedactor, REDACTED} from './redaction';

// A fake key that is easy to find in log output. It is not a real Tedee key.
const API_KEY = 'TestKey-9f8e7d6c5b4a-q1w2e3';
// api_token = sha256(key + timestamp) in hex, followed by the timestamp.
const TOKEN_HASH_SHAPE = /[0-9a-fA-F]{64}/;

/** Captures every line of every log level, formatted the way Homebridge formats it. */
function captureLogger(lines: string[]): Logger {
  const push = (level: string) => (message: unknown, ...params: unknown[]) => {
    lines.push(`${level} ${format(message, ...params)}`);
  };
  return {
    prefix: 'test',
    info: push('info'),
    success: push('success'),
    warn: push('warn'),
    error: push('error'),
    debug: push('debug'),
    log: (level: string, message: unknown, ...params: unknown[]) => push(level)(message, ...params),
  } as unknown as Logger;
}

function fakeApi(configPath: string): API {
  return {
    hap: {Service: {}, Characteristic: {}, uuid: {generate: (s: string) => s}},
    on: () => undefined,
    user: {configPath: () => configPath},
    platformAccessory: class {},
    registerPlatformAccessories: () => undefined,
    unregisterPlatformAccessories: () => undefined,
    updatePlatformAccessories: () => undefined,
  } as unknown as API;
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for log output');
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

/** Asserts that no log line contains the key or any api_token the bridge received. */
function assertNoSecrets(lines: string[], tokens: string[]): void {
  assert.ok(lines.length > 0, 'expected some log output');
  for (const line of lines) {
    assert.ok(!line.includes(API_KEY), `API key leaked in log line: ${line.split(API_KEY).join('<KEY>')}`);
    // Tokens the bridge never received (for example when it is unreachable) are caught by their shape.
    assert.ok(!TOKEN_HASH_SHAPE.test(line), 'something shaped like an api_token hash leaked in a log line');
    for (const token of tokens) {
      assert.ok(!line.includes(token), 'api_token leaked in a log line');
      // The hash part alone is enough for an offline guess of the key.
      assert.ok(!line.includes(token.slice(0, 64)), 'api_token hash leaked in a log line');
    }
  }
}

describe('the API key never reaches the log', () => {
  let server: Server;
  let bridgeAddr: string;
  let tmpDir: string;
  let configPath: string;
  const receivedTokens: string[] = [];
  let mode: 'reflect' | 'unauthorized' = 'reflect';

  before(async () => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const token = req.headers['api_token'];
      if (typeof token === 'string') {
        receivedTokens.push(token);
      }
      res.setHeader('content-type', 'application/json');
      if (mode === 'unauthorized') {
        res.statusCode = 401;
        res.end(JSON.stringify({error: 'unauthorized'}));
        return;
      }
      // A misbehaving bridge that reflects the request headers in its error body.
      res.statusCode = 500;
      res.end(JSON.stringify({error: 'boom', headers: req.headers}));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    bridgeAddr = `127.0.0.1:${(server.address() as AddressInfo).port}`;

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tedee-redaction-spec-'));
    configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({platforms: [{platform: 'TedeeBridge', apiKey: API_KEY}]}));
  });

  after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(tmpDir, {recursive: true, force: true});
  });

  function newPlatform(lines: string[]): HomebridgeTedeePlatform {
    const config = {platform: 'TedeeBridge', name: 'Tedee', apiKey: API_KEY, maximumApiRetry: 1, devices: []} as unknown as PlatformConfig;
    return new HomebridgeTedeePlatform(captureLogger(lines), config, fakeApi(configPath));
  }

  it('does not log the key when the API client is initialized', async () => {
    const lines: string[] = [];
    const platform = newPlatform(lines);
    platform.connectBridge(bridgeAddr);
    await waitFor(() => lines.some(l => l.includes('Initialized API client')));
    assertNoSecrets(lines, receivedTokens);
  });

  it('does not log the key or token when the bridge reflects request headers in an error', async () => {
    mode = 'reflect';
    const lines: string[] = [];
    const platform = newPlatform(lines);
    platform.connectBridge(bridgeAddr);
    platform.discoverDevices();
    await waitFor(() => lines.some(l => l.includes('Failed to get locks')));
    assert.ok(receivedTokens.length > 0, 'the bridge should have received a token');
    assertNoSecrets(lines, receivedTokens);
  });

  it('does not log the key or token when the bridge rejects the request', async () => {
    mode = 'unauthorized';
    const lines: string[] = [];
    const platform = newPlatform(lines);
    platform.connectBridge(bridgeAddr);
    platform.discoverDevices();
    await waitFor(() => lines.some(l => l.includes('Failed to get locks')));
    assertNoSecrets(lines, receivedTokens);
  });

  it('does not log the key or token when the bridge is unreachable', async () => {
    const lines: string[] = [];
    const platform = newPlatform(lines);
    // Port 9 (discard) on loopback refuses the connection; the AxiosError carries the request config and headers.
    platform.connectBridge('127.0.0.1:9');
    platform.discoverDevices();
    await waitFor(() => lines.some(l => l.includes('Failed to get locks')));
    assertNoSecrets(lines, receivedTokens);
  });

  it('does not log the key when the bridge check fails', async () => {
    mode = 'unauthorized';
    const lines: string[] = [];
    const platform = newPlatform(lines);
    await assert.rejects(platform.checkForBridgeApi(bridgeAddr));
    assertNoSecrets(lines, receivedTokens);
  });

  it('the API client never reports the key or token, even without retries and with raw callbacks', async () => {
    for (const [addr, bridgeMode] of [[bridgeAddr, 'reflect'], [bridgeAddr, 'unauthorized'], ['127.0.0.1:9', 'reflect']] as const) {
      mode = bridgeMode;
      const lines: string[] = [];
      const client = new TedeeLocalApiClient(
        addr, API_KEY, 2000, 0,
        (e) => lines.push(`error ${format(e)}`),
        (d) => lines.push(`debug ${format(d)}`),
      );
      await assert.rejects(client.getLockList());
      assertNoSecrets(lines, receivedTokens);
    }
  });

  it('redacts the key from any message, parameter, error and stack trace logged through the platform', () => {
    const lines: string[] = [];
    const platform = newPlatform(lines);
    const startupLines = lines.length;
    const err = new Error(`request failed for key ${API_KEY}`);
    platform.log.error(err as unknown as string);
    platform.log.warn('config %s', JSON.stringify({apiKey: API_KEY}));
    platform.log.debug('object', {nested: {apiKey: API_KEY}});
    platform.log.info(`plain ${API_KEY}`);
    platform.log.success(`done ${encodeURIComponent(API_KEY)}`);
    platform.log.log('info' as never, `level ${API_KEY}`);
    const logged = lines.slice(startupLines);
    assert.equal(logged.length, 6);
    assertNoSecrets(lines, []);
    assert.ok(logged.every(l => l.includes(REDACTED)), 'each line should carry the redaction marker');
    assert.ok(logged[0].includes('at '), 'the error is logged with its stack trace');
  });
});

describe('createSecretRedactor', () => {
  it('redacts every occurrence of the key and its encodings', () => {
    const redact = createSecretRedactor(() => ['a+b/c"d']);
    const out = redact(`x a+b/c"d y ${encodeURIComponent('a+b/c"d')} z ${JSON.stringify('a+b/c"d')}`);
    assert.ok(!out.includes('a+b/c"d'));
    assert.ok(!out.includes(encodeURIComponent('a+b/c"d')));
    assert.ok(!out.includes('a+b/c\\"d'));
  });

  it('redacts Tedee api_token values (64 hex chars plus a millisecond timestamp)', () => {
    const redact = createSecretRedactor(() => []);
    const token = 'ab'.repeat(32) + '1731270000000';
    const out = redact(`{"api_token":"${token}"} and api_token=${token}`);
    assert.ok(!out.includes(token));
    assert.ok(!out.includes('ab'.repeat(32)));
  });

  it('ignores empty or missing keys', () => {
    const redact = createSecretRedactor(() => ['', undefined]);
    assert.equal(redact('nothing secret here'), 'nothing secret here');
  });
});

describe('createRedactingLogger', () => {
  it('keeps the logger prefix and forwards each level once', () => {
    const lines: string[] = [];
    const log = createRedactingLogger(captureLogger(lines), createSecretRedactor(() => ['s3cret']));
    log.info('hello %s', 's3cret');
    assert.deepEqual(lines, [`info hello ${REDACTED}`]);
    assert.equal(log.prefix, 'test');
  });
});

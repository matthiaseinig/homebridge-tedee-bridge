import {strict as assert} from 'node:assert';
import {after, before, describe, it} from 'node:test';
import {createServer, IncomingMessage, Server, ServerResponse} from 'node:http';
import {AddressInfo} from 'node:net';

import {TedeeLocalApiClient} from './clients/tedee-local-api-client';

describe('API client retries HTTP errors', () => {
  let server: Server;
  let addr: string;
  let status = 401;
  let hits = 0;

  before(async () => {
    server = createServer((_req: IncomingMessage, res: ServerResponse) => {
      hits += 1;
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({error: `status ${status}`}));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    addr = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  for (const code of [401, 500]) {
    it(`retries a ${code} maximumApiRetry times and rejects with the readable bridge error`, async () => {
      status = code;
      hits = 0;
      const errors: string[] = [];
      const debug: string[] = [];
      const client = new TedeeLocalApiClient(addr, 'k', 2000, 2, e => errors.push(String(e)), d => debug.push(String(d)), 1);
      await assert.rejects(client.getLockList(), (e: unknown) => {
        assert.ok(!(e instanceof TypeError), `must not be a TypeError: ${String(e)}`);
        assert.deepEqual(e, {error: `status ${code}`});
        return true;
      });
      assert.equal(hits, 3, '1 request plus 2 retries');
      assert.ok(debug.some(l => l.includes(`status=${code}`) && l.includes(`status ${code}`)), 'status and data are logged');
      assert.ok(debug.every(l => !l.includes('circular')), 'no circular JSON error');
      assert.ok(errors.length > 0);
    });
  }

  it('waits without blocking the event loop between retries', async () => {
    status = 500;
    const client = new TedeeLocalApiClient(addr, 'k', 2000, 1, undefined, undefined, 150);
    let ticks = 0;
    const timer = setInterval(() => ticks++, 10);
    await assert.rejects(client.getLockList());
    clearInterval(timer);
    assert.ok(ticks >= 5, `event loop was blocked (ticks=${ticks})`);
  });

  for (const code of [401, 500]) {
    it(`does NOT retry an unlock POST that gets ${code}`, async () => {
      status = code;
      hits = 0;
      const client = new TedeeLocalApiClient(addr, 'k', 2000, 3, undefined, undefined, 1);
      await assert.rejects(client.unlockDevice(1), (e: unknown) => {
        assert.deepEqual(e, {error: `status ${code}`});
        return true;
      });
      assert.equal(hits, 1);
    });
  }

  it('does NOT retry lock and pull POSTs after a response', async () => {
    status = 500;
    hits = 0;
    const client = new TedeeLocalApiClient(addr, 'k', 2000, 3, undefined, undefined, 1);
    await assert.rejects(client.lockDevice(1));
    await assert.rejects(client.pullDevice(1));
    assert.equal(hits, 2);
  });

  it('does NOT retry an unlock POST that times out', async () => {
    const hanging = createServer(() => undefined);
    await new Promise<void>(resolve => hanging.listen(0, '127.0.0.1', resolve));
    let seen = 0;
    hanging.on('request', () => seen++);
    try {
      const hangAddr = `127.0.0.1:${(hanging.address() as AddressInfo).port}`;
      const client = new TedeeLocalApiClient(hangAddr, 'k', 100, 3, undefined, undefined, 1);
      await assert.rejects(client.unlockDevice(1));
      assert.equal(seen, 1);
    } finally {
      hanging.closeAllConnections();
      await new Promise<void>(resolve => hanging.close(() => resolve()));
    }
  });

  it('retries a GET that times out', async () => {
    const hanging = createServer(() => undefined);
    await new Promise<void>(resolve => hanging.listen(0, '127.0.0.1', resolve));
    let seen = 0;
    hanging.on('request', () => seen++);
    try {
      const hangAddr = `127.0.0.1:${(hanging.address() as AddressInfo).port}`;
      const client = new TedeeLocalApiClient(hangAddr, 'k', 100, 1, undefined, undefined, 1);
      await assert.rejects(client.getLockList());
      assert.equal(seen, 2);
    } finally {
      hanging.closeAllConnections();
      await new Promise<void>(resolve => hanging.close(() => resolve()));
    }
  });

  it('retries a POST only when the connection was refused (request never sent)', async () => {
    const probe = createServer();
    await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
    const closedAddr = `127.0.0.1:${(probe.address() as AddressInfo).port}`;
    await new Promise<void>(resolve => probe.close(() => resolve()));
    const debug: string[] = [];
    const client = new TedeeLocalApiClient(closedAddr, 'k', 500, 2, undefined, d => debug.push(String(d)), 1);
    await assert.rejects(client.unlockDevice(1));
    assert.equal(debug.filter(l => l.includes('Retry attempt')).length, 2);
  });

  it('redacts the key from a long response body before truncating it', async () => {
    const key = 'SuperSecretKey-0123456789abcdef';
    const custom = createServer((_req, res) => {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      // the key straddles the 500 character cut
      res.end(JSON.stringify({pad: 'x'.repeat(460), leaked: key, more: 'y'.repeat(200)}));
    });
    await new Promise<void>(resolve => custom.listen(0, '127.0.0.1', resolve));
    try {
      const customAddr = `127.0.0.1:${(custom.address() as AddressInfo).port}`;
      const debug: string[] = [];
      const client = new TedeeLocalApiClient(customAddr, key, 2000, 1, undefined, d => debug.push(String(d)), 1);
      await assert.rejects(client.getLockList());
      const line = debug.find(l => l.startsWith('Response status='));
      assert.ok(line, 'response line logged');
      assert.ok(!line.includes(key), 'full key leaked');
      assert.ok(!line.includes(key.slice(0, 8)), 'partial key leaked');
      assert.ok(line.includes('[redacted]'));
    } finally {
      await new Promise<void>(resolve => custom.close(() => resolve()));
    }
  });
});

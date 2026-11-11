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
});

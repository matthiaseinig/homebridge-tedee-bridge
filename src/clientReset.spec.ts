import {strict as assert} from 'node:assert';
import {describe, it} from 'node:test';
import {createServer, IncomingMessage, Server, ServerResponse} from 'node:http';
import {AddressInfo} from 'node:net';

import {TedeeLocalApiClient} from './clients/tedee-local-api-client';

async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const close = (server: Server) => new Promise<void>(resolve => {
  server.closeAllConnections();
  server.close(() => resolve());
});

/** A bridge that resets the connection on the first request it sees, then behaves. */
function resetFirstRequest(counter: { hits: number }): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    counter.hits += 1;
    if (counter.hits === 1) {
      req.socket.destroy();
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify([]));
  });
}

describe('ECONNRESET handling', () => {
  it('retries a callback PUT after ECONNRESET and succeeds', async () => {
    const counter = {hits: 0};
    const server = resetFirstRequest(counter);
    const addr = await listen(server);
    try {
      const client = new TedeeLocalApiClient(addr, 'k', 2000, 3, undefined, undefined, 1);
      await client.setMultipleCallbacks([]);
      assert.equal(counter.hits, 2);
    } finally {
      await close(server);
    }
  });

  it('retries callback POST and DELETE after ECONNRESET', async () => {
    for (const call of [(c: TedeeLocalApiClient) => c.addCallback({url: 'http://x', httpMethod: 'POST', includeBody: true} as never), (c: TedeeLocalApiClient) => c.deleteCallback(1)]) {
      const counter = {hits: 0};
      const server = resetFirstRequest(counter);
      const addr = await listen(server);
      try {
        await call(new TedeeLocalApiClient(addr, 'k', 2000, 3, undefined, undefined, 1));
        assert.equal(counter.hits, 2);
      } finally {
        await close(server);
      }
    }
  });

  for (const name of ['lockDevice', 'unlockDevice', 'pullDevice'] as const) {
    it(`does NOT retry ${name} after ECONNRESET`, async () => {
      const counter = {hits: 0};
      const server = resetFirstRequest(counter);
      const addr = await listen(server);
      try {
        const client = new TedeeLocalApiClient(addr, 'k', 2000, 3, undefined, undefined, 1);
        await assert.rejects(client[name](1));
        assert.equal(counter.hits, 1);
      } finally {
        await close(server);
      }
    });
  }

  it('does not hit a dead idle socket: a bridge that drops reused connections never resets the first request', async () => {
    // Serves each connection once; a second request on the same connection is reset
    // (what the Tedee bridge does to a kept-alive socket it has already closed).
    const served = new WeakSet<object>();
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (served.has(req.socket)) {
        req.socket.destroy();
        return;
      }
      served.add(req.socket);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify([]));
    });
    const addr = await listen(server);
    try {
      // no retries allowed: any reset would fail the call
      const client = new TedeeLocalApiClient(addr, 'k', 2000, 0, undefined, undefined, 1);
      await client.getLockList();
      await new Promise(resolve => setTimeout(resolve, 50));
      await client.unlockDevice(1);
      await client.getLockList();
    } finally {
      await close(server);
    }
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IntexSpaClient, SpaUnreachableError } from '../src/intex/client.js';
import { closedPort, startFakeSpa } from './helpers/fakeSpa.js';

const fast = { timeoutMs: 300, retryDelayMs: 10 };

test('the client reads the status of the spa', async (t) => {
  const spa = await startFakeSpa({ water: 31, target: 38 });
  const client = new IntexSpaClient({ host: '127.0.0.1', port: spa.port, ...fast });
  t.after(async () => {
    client.close();
    await spa.close();
  });

  const status = await client.getStatus();
  assert.equal(status.waterTemperature, 31);
  assert.equal(status.targetTemperature, 38);
  assert.equal(status.power, true);
});

test('toggles and the target temperature go out as the spa expects', async (t) => {
  const spa = await startFakeSpa();
  const client = new IntexSpaClient({ host: '127.0.0.1', port: spa.port, ...fast });
  t.after(async () => {
    client.close();
    await spa.close();
  });

  assert.equal((await client.toggle('bubbles')).bubbles, true);
  assert.equal((await client.setTargetTemperature(39)).targetTemperature, 39);
  assert.deepEqual(spa.toggled(), ['bubbles']);
  assert.throws(() => client.toggle('status'), /Unknown spa function/);
});

test('one connection is kept for every request', async (t) => {
  const spa = await startFakeSpa();
  const client = new IntexSpaClient({ host: '127.0.0.1', port: spa.port, ...fast });
  t.after(async () => {
    client.close();
    await spa.close();
  });

  await client.getStatus();
  await client.getStatus();
  await client.getStatus();
  assert.equal(spa.connections, 1);
});

test('requests sent together reach the spa one at a time', async (t) => {
  const spa = await startFakeSpa();
  const client = new IntexSpaClient({ host: '127.0.0.1', port: spa.port, ...fast });
  t.after(async () => {
    client.close();
    await spa.close();
  });

  const results = await Promise.all([
    client.toggle('heater'),
    client.toggle('bubbles'),
    client.getStatus(),
  ]);
  assert.equal(results[2].heater, true);
  assert.equal(results[2].bubbles, true);
});

test('a lost answer is retried', async (t) => {
  const spa = await startFakeSpa();
  spa.mode = 'silent';
  spa.misbehaveCount = 1;
  const client = new IntexSpaClient({ host: '127.0.0.1', port: spa.port, ...fast });
  t.after(async () => {
    client.close();
    await spa.close();
  });

  const status = await client.getStatus();
  assert.equal(status.power, true);
  assert.equal(spa.requests.length, 2);
  // A timeout leaves the link in doubt: it is reopened.
  assert.equal(spa.connections, 2);
});

test('a malformed answer is retried', async (t) => {
  const spa = await startFakeSpa();
  spa.mode = 'garbage';
  spa.misbehaveCount = 2;
  const client = new IntexSpaClient({ host: '127.0.0.1', port: spa.port, ...fast });
  t.after(async () => {
    client.close();
    await spa.close();
  });

  assert.equal((await client.getStatus()).power, true);
  assert.equal(spa.requests.length, 3);
});

test('a spa that never answers is reported unreachable', async (t) => {
  const spa = await startFakeSpa();
  spa.mode = 'silent';
  const client = new IntexSpaClient({ host: '127.0.0.1', port: spa.port, ...fast });
  t.after(async () => {
    client.close();
    await spa.close();
  });

  await assert.rejects(client.getStatus(), SpaUnreachableError);
  assert.equal(spa.requests.length, 3);
});

test('a refused connection is reported unreachable, and the queue goes on', async () => {
  const port = await closedPort();
  const client = new IntexSpaClient({ host: '127.0.0.1', port, ...fast });
  await assert.rejects(client.getStatus(), SpaUnreachableError);
  await assert.rejects(client.getStatus(), SpaUnreachableError);
  client.close();
});

test('the identity of the module is read', async (t) => {
  const spa = await startFakeSpa();
  const client = new IntexSpaClient({ host: '127.0.0.1', port: spa.port, ...fast });
  t.after(async () => {
    client.close();
    await spa.close();
  });

  assert.deepEqual(await client.getInfo(), { ip: '127.0.0.1', uid: 'SPA-TEST-1', dtype: 'spa' });
});

test('a spa restarting between two requests is reconnected', async (t) => {
  const spa = await startFakeSpa();
  const client = new IntexSpaClient({ host: '127.0.0.1', port: spa.port, ...fast });
  t.after(async () => {
    client.close();
    await spa.close();
  });

  await client.getStatus();
  for (const socket of spa.sockets) {
    socket.destroy();
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal((await client.getStatus()).power, true);
  assert.equal(spa.connections, 2);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IntexSpaClient } from '../src/intex/client.js';
import { SpaController, SpaOrderError } from '../src/intex/spa.js';
import { closedPort, startFakeSpa } from './helpers/fakeSpa.js';

const createClient = (options) =>
  new IntexSpaClient({ ...options, timeoutMs: 300, retryDelayMs: 10 });

async function setup(t, initial) {
  const fake = await startFakeSpa(initial);
  const spa = new SpaController({ host: '127.0.0.1', port: fake.port, createClient });
  t.after(async () => {
    spa.close();
    await fake.close();
  });
  return { fake, spa };
}

test('an order already satisfied sends no toggle', async (t) => {
  const { fake, spa } = await setup(t, { filter: true });
  const status = await spa.setFunction('filter', true);
  assert.equal(status.filter, true);
  assert.deepEqual(fake.toggled(), []);
});

test('an order reads the spa, then toggles what differs', async (t) => {
  const { fake, spa } = await setup(t, { heater: false });
  const status = await spa.setFunction('heater', true);
  assert.equal(status.heater, true);
  assert.deepEqual(fake.toggled(), ['heater']);
});

test('the same order twice at once toggles only once', async (t) => {
  // Both would read OFF and flip the heater twice without the lock.
  const { fake, spa } = await setup(t, { heater: false });
  await Promise.all([spa.setFunction('heater', true), spa.setFunction('heater', true)]);
  assert.deepEqual(fake.toggled(), ['heater']);
  assert.equal(fake.state.heater, true);
});

test('switching a function on powers the spa on first', async (t) => {
  const { fake, spa } = await setup(t, { power: false, filter: false });
  const status = await spa.setFunction('bubbles', true);
  assert.deepEqual(fake.toggled(), ['power', 'bubbles']);
  assert.equal(status.power, true);
  assert.equal(status.bubbles, true);
});

test('switching a function off never powers the spa on', async (t) => {
  const { fake, spa } = await setup(t, { power: false });
  await spa.setFunction('heater', false);
  assert.deepEqual(fake.toggled(), []);
});

test('an order the panel refuses returns the real status', async (t) => {
  const { fake, spa } = await setup(t, { heater: false });
  fake.stuck.add('heater');
  const status = await spa.setFunction('heater', true);
  assert.equal(status.heater, false);
});

test('the target temperature is checked against the unit of the spa', async (t) => {
  const { fake, spa } = await setup(t, { target: 37 });
  assert.equal((await spa.setTargetTemperature(39)).targetTemperature, 39);
  await assert.rejects(spa.setTargetTemperature(55), (err) => {
    assert.ok(err instanceof SpaOrderError);
    assert.match(err.userMessage.fr, /entre 10 et 40/);
    return true;
  });
  fake.state.target = 100; // the panel switched to Fahrenheit
  assert.equal((await spa.setTargetTemperature(102)).targetTemperature, 102);
  assert.equal(spa.unit, 'fahrenheit');
});

test('an unchanged target sends nothing', async (t) => {
  const { fake, spa } = await setup(t, { target: 37 });
  await spa.setTargetTemperature(37);
  assert.ok(fake.requests.every((request) => !request.data.startsWith('8888050F0C')));
});

test('every read is announced with the status before it', async (t) => {
  const { spa } = await setup(t, { water: 30 });
  const seen = [];
  spa.on('status', (status, previous) => seen.push([status.waterTemperature, previous]));
  await spa.refresh();
  await spa.refresh();
  assert.equal(seen.length, 2);
  assert.equal(seen[0][1], null);
  assert.equal(seen[1][1].waterTemperature, 30);
});

test('the link going down and up is announced once each way', async () => {
  const port = await closedPort();
  const spa = new SpaController({ host: '127.0.0.1', port, createClient });
  const changes = [];
  spa.on('reachable', (reachable) => changes.push(reachable));
  await assert.rejects(spa.refresh());
  await assert.rejects(spa.refresh());
  assert.deepEqual(changes, [false]);
  assert.equal(spa.reachable, false);
  assert.match(spa.lastFailure, /did not answer/);
  spa.close();
});

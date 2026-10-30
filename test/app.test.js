// -----------------------------------------------------------------------------
// The whole integration, wired to the SDK's fake Gladys and to a fake spa on
// 127.0.0.1: what Gladys receives from a connection, an order, a poll, a spa
// going away, a new configuration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerIntegration } from '../src/app.js';
import { IntexSpaClient } from '../src/intex/client.js';
import { SpaController } from '../src/intex/spa.js';
import { FEATURES } from '../src/devices/spa.js';
import { SCENE_TRIGGERS } from '../src/capabilities/scenes.js';
import { SPA_WIDGET } from '../src/capabilities/widget.js';
import { startFakeSpa } from './helpers/fakeSpa.js';

const createController = (options) =>
  new SpaController({
    ...options,
    createClient: (clientOptions) =>
      new IntexSpaClient({ ...clientOptions, timeoutMs: 200, retryDelayMs: 10 }),
  });

async function setup(t, { spaState, config = {} } = {}) {
  const spa = await startFakeSpa(spaState);
  const gladys = createFakeGladys({ config: { host: '127.0.0.1', port: spa.port, ...config } });
  const integration = registerIntegration(gladys, { createController });
  t.after(async () => {
    integration.stop();
    await spa.close();
  });
  await gladys.connect();
  await integration.settled();
  const [device] = gladys.fake.discoveredDevices;
  const feature = (key) => device.features.find((f) => f.external_id.endsWith(`:${key}`));
  return { spa, gladys, integration, device, feature };
}

test('on connection, Gladys gets the spa, its states, its badge and the status', async (t) => {
  const { gladys, feature } = await setup(t, { spaState: { water: 33, target: 38 } });

  assert.equal(gladys.fake.discoveredDevices.length, 1);
  assert.equal(gladys.fake.lastState(feature(FEATURES.WATER_TEMPERATURE).external_id), 33);
  assert.equal(gladys.fake.lastState(feature(FEATURES.TARGET_TEMPERATURE).external_id), 38);
  assert.equal(gladys.fake.lastState(feature(FEATURES.ERROR).external_id), 'OK');
  assert.equal(gladys.fake.transports.at(-1).transport, DEVICE_TRANSPORTS.LOCAL);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.ok(gladys.fake.widgetRefreshes.includes(SPA_WIDGET));
});

test('a switch order from Gladys reaches the spa and comes back confirmed', async (t) => {
  const { spa, gladys, device, feature } = await setup(t, { spaState: { heater: false } });
  const heater = feature(FEATURES.HEATER);

  assert.deepEqual(await gladys.fake.setValue(device, heater, 1), { success: true });
  assert.equal(spa.state.heater, true);
  assert.equal(gladys.fake.lastState(heater.external_id), 1);
});

test('an order the spa refuses publishes the state it kept', async (t) => {
  const { spa, gladys, device, feature } = await setup(t, { spaState: { heater: false } });
  spa.stuck.add('heater');
  const heater = feature(FEATURES.HEATER);

  await gladys.fake.setValue(device, heater, 1);
  // Gladys showed 1 the moment the user clicked: 0 must be sent again.
  assert.equal(gladys.fake.lastState(heater.external_id), 0);
});

test('the target temperature is set from Gladys', async (t) => {
  const { spa, gladys, device, feature } = await setup(t);
  const target = feature(FEATURES.TARGET_TEMPERATURE);
  await gladys.fake.setValue(device, target, 39);
  assert.equal(spa.state.target, 39);
  assert.equal(gladys.fake.lastState(target.external_id), 39);
});

test('a poll publishes what changed and fires the scene events', async (t) => {
  const { spa, gladys, device, feature, integration } = await setup(t, {
    spaState: { heater: true, water: 37, target: 38 },
  });
  spa.state.water = 38;

  assert.deepEqual(await gladys.fake.poll(device), { success: true });
  await integration.settled();
  assert.equal(gladys.fake.lastState(feature(FEATURES.WATER_TEMPERATURE).external_id), 38);
  assert.deepEqual(gladys.fake.sceneEvents, [
    { key: SCENE_TRIGGERS.TEMPERATURE_REACHED, data: { temperature: 38, target: 38 } },
  ]);
});

test('an error code on the panel reaches Gladys as a state and an event', async (t) => {
  const { spa, gladys, feature, integration } = await setup(t);
  spa.state.errorCode = 'E81';
  await integration.context.spa.refresh();
  await integration.settled();
  assert.equal(gladys.fake.lastState(feature(FEATURES.ERROR).external_id), 'E81');
  assert.deepEqual(gladys.fake.sceneEvents, [
    { key: SCENE_TRIGGERS.ERROR_DETECTED, data: { code: 'E81' } },
  ]);
});

test('a spa going away turns the badge, the status and fires connection_lost', async (t) => {
  const { spa, gladys, device, integration } = await setup(t);
  spa.mode = 'silent';

  // A poll of a silent spa is no failure for Gladys: the badge says it.
  assert.deepEqual(await gladys.fake.poll(device), { success: true });
  await integration.settled();
  assert.equal(gladys.fake.transports.at(-1).transport, DEVICE_TRANSPORTS.UNREACHABLE);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /does not answer/);
  assert.deepEqual(gladys.fake.sceneEvents, [
    { key: SCENE_TRIGGERS.CONNECTION_LOST, data: { host: '127.0.0.1' } },
  ]);

  spa.mode = 'answer';
  await integration.context.spa.refresh();
  await integration.settled();
  assert.equal(gladys.fake.transports.at(-1).transport, DEVICE_TRANSPORTS.LOCAL);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a spa switched to Fahrenheit re-publishes its device', async (t) => {
  const { spa, gladys, integration } = await setup(t);
  spa.state.target = 100;
  spa.state.water = 95;
  await integration.context.spa.refresh();
  await integration.settled();
  const target = gladys.fake.discoveredDevices[0].features.find((f) =>
    f.external_id.endsWith(FEATURES.TARGET_TEMPERATURE),
  );
  assert.equal(target.unit, 'fahrenheit');
});

test('without an address, the Configuration screen says what to do', async () => {
  const gladys = createFakeGladys({ config: {} });
  const integration = registerIntegration(gladys, { createController });
  await gladys.connect();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /Saisissez l'adresse du spa/);
  assert.equal(gladys.fake.transports.at(-1).transport, DEVICE_TRANSPORTS.UNREACHABLE);
  const { data } = await gladys.fake.action('test_connection');
  assert.match(data.message.en, /Type the address/);
  integration.stop();
});

test('a new configuration adds the jets and moves to the new address', async (t) => {
  const { spa, gladys, integration } = await setup(t);
  const other = await startFakeSpa({ water: 22 });
  t.after(() => other.close());

  await gladys.fake.configUpdated({ host: '127.0.0.1', port: other.port, has_jets: true });
  await integration.settled();
  const [device] = gladys.fake.discoveredDevices;
  assert.ok(device.features.some((f) => f.external_id.endsWith(`:${FEATURES.JETS}`)));
  const water = device.features.find((f) => f.external_id.endsWith(FEATURES.WATER_TEMPERATURE));
  assert.equal(gladys.fake.lastState(water.external_id), 22);
  // The device keeps its id: same spa, new address.
  assert.equal(device.external_id, gladys.fake.discoveredDevices[0].external_id);
  const before = spa.requests.length;
  await integration.context.spa.refresh();
  assert.equal(spa.requests.length, before);
});

test('"Test the connection" names the spa and reads it', async (t) => {
  const { gladys } = await setup(t, { spaState: { water: 35, target: 38, heater: true } });
  const { success, data } = await gladys.fake.action('test_connection');
  assert.equal(success, true);
  assert.equal(
    data.message.en,
    'The spa answers (SPA-TEST-1): water 35°C, target 38°C, heater ON.',
  );
  assert.match(data.message.de, /Das Spa antwortet/);
  assert.match(data.message.es, /El spa responde/);
});

test('the scene actions and the widget run against the spa', async (t) => {
  const { spa, gladys } = await setup(t, { spaState: { heater: false, target: 30 } });

  const heat = await gladys.fake.sceneAction('set_target_temperature', {
    temperature: 39,
    heater: true,
  });
  assert.equal(heat.success, true);
  assert.equal(heat.data.outputs.target_temperature, 39);
  assert.equal(spa.state.heater, true);

  const content = await gladys.fake.widgetGet(SPA_WIDGET);
  assert.equal(content.success, true);
  const toast = await gladys.fake.widgetAction(SPA_WIDGET, 'bubbles', { on: true });
  assert.equal(toast.success, true);
  assert.equal(spa.state.bubbles, true);
});

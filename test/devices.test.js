import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_UNITS,
  DEVICE_POLL_FREQUENCIES,
  DEVICE_TRANSPORTS,
} from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  DEVICE_BLUEPRINTS,
  buildDiscoveredDevices,
  buildTransportEntries,
  createPoller,
} from '../src/devices/index.js';
import { FEATURES, NO_ERROR, spa, statesFromStatus } from '../src/devices/spa.js';
import { normalizeConfig } from '../src/config.js';

const config = normalizeConfig({ host: '192.168.1.50' });
const STATUS = {
  power: true,
  filter: true,
  heater: true,
  jets: false,
  bubbles: false,
  sanitizer: true,
  unit: 'celsius',
  waterTemperature: 34,
  targetTemperature: 37,
  errorCode: null,
};

const suffixes = (device) => device.features.map((feature) => feature.external_id.split(':').pop());

test('Gladys accepts the discovery payload', async () => {
  // The SDK fake refuses what the host API refuses (category, type, unit,
  // poll_frequency) with the same 400, for the whole list.
  const gladys = createFakeGladys();
  await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, { config, spa: null }));
  assert.equal(gladys.fake.discoveredDevices.length, DEVICE_BLUEPRINTS.length);
});

test('every feature declares min and max', () => {
  const gladys = createFakeGladys();
  const device = spa.buildDevice(gladys, { config: { ...config, has_jets: true }, spa: null });
  for (const feature of device.features) {
    assert.equal(typeof feature.min, 'number', `${feature.name}: min`);
    assert.equal(typeof feature.max, 'number', `${feature.name}: max`);
  }
});

test('jets and the salt sanitizer only show on the models that have them', () => {
  const gladys = createFakeGladys();
  const base = spa.buildDevice(gladys, { config, spa: null });
  assert.ok(!suffixes(base).includes(FEATURES.JETS));
  assert.ok(!suffixes(base).includes(FEATURES.SANITIZER));
  const full = spa.buildDevice(gladys, {
    config: { ...config, has_jets: true, has_sanitizer: true },
    spa: null,
  });
  assert.ok(suffixes(full).includes(FEATURES.JETS));
  assert.ok(suffixes(full).includes(FEATURES.SANITIZER));
});

test('the device id never depends on the address of the spa', () => {
  const gladys = createFakeGladys();
  const a = spa.buildDevice(gladys, { config, spa: null });
  const b = spa.buildDevice(gladys, { config: { ...config, host: '10.0.0.9' }, spa: null });
  assert.equal(a.external_id, b.external_id);
});

test('the temperatures take the unit of the spa', () => {
  const gladys = createFakeGladys();
  const device = spa.buildDevice(gladys, { config, spa: { unit: 'fahrenheit' } });
  const target = device.features.find((f) => f.external_id.endsWith(FEATURES.TARGET_TEMPERATURE));
  assert.equal(target.unit, DEVICE_FEATURE_UNITS.FAHRENHEIT);
  assert.equal(target.min, 50);
  assert.equal(target.max, 104);
});

test('the spa is polled at a pace Gladys accepts', () => {
  const gladys = createFakeGladys();
  const device = spa.buildDevice(gladys, { config, spa: null });
  assert.ok(Object.values(DEVICE_POLL_FREQUENCIES).includes(device.poll_frequency));
  assert.equal(device.should_poll, true);
});

test('the states follow the status, the error feature included', async () => {
  const gladys = createFakeGladys();
  const states = statesFromStatus(gladys, STATUS, config);
  const byFeature = Object.fromEntries(
    states.map((state) => [
      state.device_feature_external_id.split(':').pop(),
      state.text ?? state.state,
    ]),
  );
  assert.deepEqual(byFeature, {
    [FEATURES.POWER]: 1,
    [FEATURES.FILTER]: 1,
    [FEATURES.HEATER]: 1,
    [FEATURES.BUBBLES]: 0,
    [FEATURES.WATER_TEMPERATURE]: 34,
    [FEATURES.TARGET_TEMPERATURE]: 37,
    [FEATURES.ERROR]: NO_ERROR,
  });
  // Gladys takes them: numeric states, and a text for the error code.
  await gladys.publishStates(states);
});

test('during a fault the error code is published and the temperature is not', () => {
  const gladys = createFakeGladys();
  const states = statesFromStatus(
    gladys,
    { ...STATUS, waterTemperature: null, errorCode: 'E90' },
    config,
  );
  const ids = states.map((state) => state.device_feature_external_id.split(':').pop());
  assert.ok(!ids.includes(FEATURES.WATER_TEMPERATURE));
  assert.equal(states.find((state) => state.text).text, 'E90');
});

test('the transport badge follows the link', () => {
  const gladys = createFakeGladys();
  const entry = (controller) => buildTransportEntries(gladys, { config, spa: controller })[0];
  assert.equal(entry({ reachable: true }).transport, DEVICE_TRANSPORTS.LOCAL);
  assert.equal(entry({ reachable: null }).transport, DEVICE_TRANSPORTS.LOCAL);
  assert.equal(entry({ reachable: false }).transport, DEVICE_TRANSPORTS.UNREACHABLE);
  assert.equal(entry(null).transport, DEVICE_TRANSPORTS.UNREACHABLE);
});

test('the poller reads the spa at the interval of the configuration', async (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  const gladys = createFakeGladys();
  const pollDevice = createPoller();
  let reads = 0;
  const context = {
    config: { ...config, poll_frequency: 60 },
    spa: { refresh: async () => reads++ },
  };
  const device = { external_id: spa.deviceExternalId(gladys) };

  assert.equal(await pollDevice(gladys, device, context), true);
  t.mock.timers.tick(30_000);
  assert.equal(await pollDevice(gladys, device, context), false);
  t.mock.timers.tick(30_000);
  assert.equal(await pollDevice(gladys, device, context), true);
  assert.equal(reads, 2);
});

test('a command on an unknown feature is refused', async () => {
  const gladys = createFakeGladys();
  await assert.rejects(
    spa.onSetValue(gladys, {
      feature: { external_id: `${spa.deviceExternalId(gladys)}:${FEATURES.ERROR}` },
      value: 1,
      context: { config, spa: {} },
    }),
    /cannot be controlled/,
  );
});

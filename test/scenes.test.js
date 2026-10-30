import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SCENE_ACTIONS,
  SCENE_TRIGGERS,
  sceneEventsFromStatus,
} from '../src/capabilities/scenes.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const BASE = {
  power: true,
  filter: true,
  heater: true,
  jets: false,
  bubbles: false,
  sanitizer: false,
  unit: 'celsius',
  waterTemperature: 36,
  targetTemperature: 38,
  errorCode: null,
};

test('nothing fires on the first read', () => {
  assert.deepEqual(sceneEventsFromStatus({ ...BASE, errorCode: 'E81' }, null), []);
});

test('an error fires once, when it appears', () => {
  const error = { ...BASE, waterTemperature: null, errorCode: 'E81' };
  assert.deepEqual(sceneEventsFromStatus(error, BASE), [
    { key: SCENE_TRIGGERS.ERROR_DETECTED, data: { code: 'E81' } },
  ]);
  assert.deepEqual(sceneEventsFromStatus(error, error), []);
  // Another code is another event.
  assert.equal(sceneEventsFromStatus({ ...error, errorCode: 'E90' }, error).length, 1);
});

test('the target temperature reached fires on the crossing only', () => {
  const reached = { ...BASE, waterTemperature: 38 };
  assert.deepEqual(sceneEventsFromStatus(reached, BASE), [
    { key: SCENE_TRIGGERS.TEMPERATURE_REACHED, data: { temperature: 38, target: 38 } },
  ]);
  assert.deepEqual(sceneEventsFromStatus({ ...reached, waterTemperature: 39 }, reached), []);
  // Heater off: the water warmed by the sun is not "reached".
  assert.deepEqual(sceneEventsFromStatus({ ...reached, heater: false }, BASE), []);
  // Lowering the target under the water temperature is no crossing either.
  assert.deepEqual(
    sceneEventsFromStatus({ ...BASE, targetTemperature: 35 }, { ...BASE, targetTemperature: 38 }),
    [],
  );
});

test('the event data only holds the declared variables', () => {
  const events = [
    ...sceneEventsFromStatus({ ...BASE, waterTemperature: null, errorCode: 'E81' }, BASE),
    ...sceneEventsFromStatus({ ...BASE, waterTemperature: 38 }, BASE),
  ];
  for (const { key, data } of events) {
    const trigger = manifest.scene_triggers.find((entry) => entry.key === key);
    const declared = (trigger.variables ?? []).map((variable) => variable.key);
    for (const name of Object.keys(data)) {
      assert.ok(declared.includes(name), `${key}: ${name} is not declared`);
    }
  }
});

/** A controller double: the status after each call. */
function fakeSpa(initial = BASE) {
  const calls = [];
  let status = initial;
  return {
    calls,
    refresh: async () => status,
    setTargetTemperature: async (target) => {
      calls.push(['target', target]);
      status = { ...status, targetTemperature: target };
      return status;
    },
    setFunction: async (name, on) => {
      calls.push([name, on]);
      status = { ...status, [name]: on };
      return status;
    },
  };
}

test('the scene actions return only their declared outputs', async () => {
  for (const action of manifest.scene_actions) {
    const outputs = await SCENE_ACTIONS[action.key](null, {
      fields: { temperature: 38 },
      context: { spa: fakeSpa() },
    });
    const declared = action.outputs.map((output) => output.key);
    assert.deepEqual(Object.keys(outputs).sort(), [...declared].sort(), action.key);
  }
});

test('"Heat the spa to" switches the heater on unless unticked', async () => {
  const spa = fakeSpa({ ...BASE, heater: false });
  const outputs = await SCENE_ACTIONS.set_target_temperature(null, {
    fields: { temperature: 39, heater: true },
    context: { spa },
  });
  assert.deepEqual(spa.calls, [
    ['target', 39],
    ['heater', true],
  ]);
  assert.equal(outputs.target_temperature, 39);

  const quiet = fakeSpa();
  await SCENE_ACTIONS.set_target_temperature(null, {
    fields: { temperature: 39, heater: false },
    context: { spa: quiet },
  });
  assert.deepEqual(quiet.calls, [['target', 39]]);
});

test('a scene action without a configured spa fails that action only', async () => {
  await assert.rejects(
    SCENE_ACTIONS.read_status(null, { fields: {}, context: { spa: null } }),
    /not configured/,
  );
});

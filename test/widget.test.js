import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { buildDiscoveredDevices } from '../src/devices/index.js';
import { normalizeConfig } from '../src/config.js';
import { WIDGET_ACTIONS, buildWidgetContent, runWidgetAction } from '../src/capabilities/widget.js';
import { LANGUAGES } from '../src/i18n.js';

const gladys = createFakeGladys();
const config = normalizeConfig({ host: '192.168.1.50', has_jets: true, has_sanitizer: true });

const STATUS = {
  power: true,
  filter: true,
  heater: false,
  jets: false,
  bubbles: true,
  sanitizer: true,
  unit: 'celsius',
  waterTemperature: 34,
  targetTemperature: 38,
  errorCode: null,
};

function fakeSpa(status = STATUS, reachable = true) {
  const calls = [];
  return {
    calls,
    status,
    reachable,
    setFunction: async (name, on) => {
      calls.push([name, on]);
      return { ...status, [name]: on };
    },
    setTargetTemperature: async (target) => {
      calls.push(['target', target]);
      return { ...status, targetTemperature: target };
    },
  };
}

test('every state of the widget is rendered exactly as sent', () => {
  const contexts = [
    { config: normalizeConfig(), spa: null },
    { config, spa: fakeSpa(null, null) },
    { config, spa: fakeSpa() },
    { config, spa: fakeSpa({ ...STATUS, waterTemperature: null, errorCode: 'E81' }) },
    { config, spa: fakeSpa(STATUS, false) },
  ];
  for (const context of contexts) {
    // [] = nothing the core would drop, truncate or trim to the content budget.
    assert.deepEqual(validateWidgetContent(buildWidgetContent(gladys, context)), []);
  }
});

test('the live tiles reference features the integration publishes', () => {
  const context = { config, spa: fakeSpa() };
  const featureIds = new Set(
    buildDiscoveredDevices(gladys, context).flatMap((device) =>
      device.features.map((feature) => feature.external_id),
    ),
  );
  const tiles = buildWidgetContent(gladys, context).components.filter((c) => c.device_feature);
  assert.equal(tiles.length, 2);
  for (const tile of tiles) {
    assert.ok(featureIds.has(tile.device_feature), tile.device_feature);
  }
});

test('every button action is handled', async () => {
  const spa = fakeSpa();
  const buttons = buildWidgetContent(gladys, { config, spa }).components.filter(
    (component) => component.type === 'button',
  );
  assert.deepEqual(
    buttons.map((button) => button.action.key).sort(),
    Object.values(WIDGET_ACTIONS).sort(),
  );
  for (const button of buttons) {
    const toast = await runWidgetAction(gladys, {
      actionKey: button.action.key,
      params: button.action.params,
      values: { temperature: 39 },
      context: { config, spa },
    });
    for (const language of LANGUAGES) {
      assert.ok(toast[language], `${button.action.key}: toast in ${language}`);
    }
  }
  // A button asks for the opposite of what the spa does.
  assert.deepEqual(spa.calls, [
    ['heater', true],
    ['bubbles', false],
    ['filter', false],
    ['target', 39],
  ]);
});

test('the target form follows the range of the unit', () => {
  const spa = fakeSpa({ ...STATUS, unit: 'fahrenheit', targetTemperature: 100 });
  const button = buildWidgetContent(gladys, { config, spa }).components.find(
    (component) => component.action?.key === WIDGET_ACTIONS.TARGET,
  );
  const [field] = button.action.fields;
  assert.deepEqual([field.min, field.max, field.default], [50, 104, 100]);
});

test('a target tap relayed without its form is refused', async () => {
  await assert.rejects(
    runWidgetAction(gladys, {
      actionKey: WIDGET_ACTIONS.TARGET,
      params: undefined,
      values: undefined,
      context: { config, spa: fakeSpa() },
    }),
    /update Gladys/,
  );
});

// -----------------------------------------------------------------------------
// Device type: the Intex PureSpa.
//
// One device, its features following what the spa reports:
//   - power, filtration, heater, bubbles (+ jets and salt sanitizer on the
//     models that have them, see `has_jets` / `has_sanitizer`): switches;
//   - the water temperature: a read-only sensor;
//   - the target temperature: a thermostat setpoint;
//   - the error code of the control panel (E81...): a text sensor, "OK" when
//     there is none.
//
// The spa speaks Celsius or Fahrenheit depending on its panel setting; the
// temperature features take the unit of the last status read, and index.js
// re-publishes the device when it changes.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_POLL_FREQUENCIES,
  DEVICE_TRANSPORTS,
} from '@gladysassistant/integration-sdk';
import { TARGET_LIMITS } from '../intex/protocol.js';

const DEVICE_TYPE = 'spa';

// One integration drives one spa: the configuration holds a single address.
// The platform id is NOT that address (a DHCP lease changes, the device and
// its history must not), nor the module uid (only reachable once the spa
// answers, and an id is needed before). External ids are forever.
const PLATFORM_DEVICE_ID = 'purespa';

export const FEATURES = {
  POWER: 'power',
  FILTER: 'filter',
  HEATER: 'heater',
  BUBBLES: 'bubbles',
  JETS: 'jets',
  SANITIZER: 'sanitizer',
  WATER_TEMPERATURE: 'water-temperature',
  TARGET_TEMPERATURE: 'target-temperature',
  ERROR: 'error',
};

/** The switch features, keyed by the function of the status frame they mirror. */
const SWITCHES = [
  { feature: FEATURES.POWER, fn: 'power', name: 'Power' },
  { feature: FEATURES.FILTER, fn: 'filter', name: 'Filtration' },
  { feature: FEATURES.HEATER, fn: 'heater', name: 'Heater' },
  { feature: FEATURES.BUBBLES, fn: 'bubbles', name: 'Bubbles' },
  { feature: FEATURES.JETS, fn: 'jets', name: 'Jets', option: 'has_jets' },
  { feature: FEATURES.SANITIZER, fn: 'sanitizer', name: 'Salt sanitizer', option: 'has_sanitizer' },
];

/** What the error feature reads when the panel shows no error. */
export const NO_ERROR = 'OK';

const UNITS = {
  celsius: DEVICE_FEATURE_UNITS.CELSIUS,
  fahrenheit: DEVICE_FEATURE_UNITS.FAHRENHEIT,
};

// Range of the water sensor: from freezing to the 50 °C the spa never reaches.
const WATER_LIMITS = { celsius: { min: 0, max: 50 }, fahrenheit: { min: 32, max: 122 } };

/** The switches this spa has, given the models options of the config. */
function switchesFor(config) {
  return SWITCHES.filter((entry) => !entry.option || config[entry.option]);
}

function ids(gladys) {
  return gladys.externalIds(DEVICE_TYPE, PLATFORM_DEVICE_ID);
}

/** The feature external id of a FEATURES key. */
export function featureExternalId(gladys, feature) {
  return ids(gladys).feature(feature);
}

/** The states of every feature, from a status read. */
export function statesFromStatus(gladys, status, config) {
  const states = switchesFor(config).map(({ feature, fn }) => ({
    device_feature_external_id: featureExternalId(gladys, feature),
    state: status[fn] ? 1 : 0,
  }));
  states.push({
    device_feature_external_id: featureExternalId(gladys, FEATURES.TARGET_TEMPERATURE),
    state: status.targetTemperature,
  });
  // During a fault the temperature byte carries the code: no reading then.
  if (status.waterTemperature !== null) {
    states.push({
      device_feature_external_id: featureExternalId(gladys, FEATURES.WATER_TEMPERATURE),
      state: status.waterTemperature,
    });
  }
  states.push({
    device_feature_external_id: featureExternalId(gladys, FEATURES.ERROR),
    text: status.errorCode ?? NO_ERROR,
  });
  return states;
}

export const spa = {
  key: DEVICE_TYPE,

  deviceExternalId(gladys) {
    return ids(gladys).device;
  },

  buildDevice(gladys, { config, spa: controller }) {
    const unit = controller?.unit ?? 'celsius';
    const deviceIds = ids(gladys);
    const switches = switchesFor(config).map(({ feature, name }) => ({
      name,
      external_id: deviceIds.feature(feature),
      category: DEVICE_FEATURE_CATEGORIES.SWITCH,
      type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
      read_only: false,
      has_feedback: true,
      keep_history: true,
      min: 0,
      max: 1,
    }));
    return {
      name: 'Intex PureSpa',
      external_id: deviceIds.device,
      // Gladys polls at most once a minute and the module tolerates no more
      // than one read every 30 s: poll every 30 s, and the poller in
      // src/devices/index.js applies the interval of the configuration.
      should_poll: true,
      poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_30_SECONDS,
      features: [
        ...switches,
        {
          name: 'Water temperature',
          external_id: deviceIds.feature(FEATURES.WATER_TEMPERATURE),
          category: DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR,
          type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
          unit: UNITS[unit],
          read_only: true,
          has_feedback: false,
          keep_history: true,
          ...WATER_LIMITS[unit],
        },
        {
          name: 'Target temperature',
          external_id: deviceIds.feature(FEATURES.TARGET_TEMPERATURE),
          category: DEVICE_FEATURE_CATEGORIES.THERMOSTAT,
          type: DEVICE_FEATURE_TYPES.THERMOSTAT.TARGET_TEMPERATURE,
          unit: UNITS[unit],
          read_only: false,
          has_feedback: true,
          keep_history: true,
          ...TARGET_LIMITS[unit],
        },
        {
          name: 'Error code',
          external_id: deviceIds.feature(FEATURES.ERROR),
          category: DEVICE_FEATURE_CATEGORIES.TEXT,
          type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
          read_only: true,
          has_feedback: false,
          keep_history: true,
          min: 0,
          max: 0,
        },
      ],
    };
  },

  // The only channel is the LAN: `local` while the spa answers.
  transport(_gladys, { spa: controller }) {
    return controller?.reachable === false || !controller
      ? DEVICE_TRANSPORTS.UNREACHABLE
      : DEVICE_TRANSPORTS.LOCAL;
  },

  async onPoll(_gladys, { spa: controller }) {
    if (!controller) {
      return;
    }
    // The states follow from the 'status' event (see index.js).
    await controller.refresh();
  },

  async onSetValue(gladys, { feature, value, context }) {
    const { spa: controller } = context;
    if (!controller) {
      throw new Error('The address of the spa is not configured');
    }
    const suffix = feature.external_id.split(':').pop();
    let status;
    if (suffix === FEATURES.TARGET_TEMPERATURE) {
      status = await controller.setTargetTemperature(value);
    } else {
      const entry = SWITCHES.find((candidate) => candidate.feature === suffix);
      if (!entry) {
        throw new Error(`Feature ${feature.external_id} cannot be controlled`);
      }
      status = await controller.setFunction(entry.fn, value === 1);
    }
    // Gladys already shows the value asked for: send back the one the spa
    // really took, even unchanged since the last publication (a refused order).
    const confirmed = statesFromStatus(gladys, status, context.config).find(
      (state) => state.device_feature_external_id === feature.external_id,
    );
    if (confirmed) {
      await gladys.publishState(feature.external_id, confirmed.state);
    }
  },
};

// -----------------------------------------------------------------------------
// Scene triggers and scene actions (Gladys 5.1+).
//
// Triggers say "this happened" and are computed from two status reads in a
// row (see index.js, on the controller's 'status' and 'reachable' events):
// one event per transition, never one per poll. A state the user wants to
// compare (`>` on the water temperature) stays a device feature: the standard
// "device state" trigger covers it.
//
// Actions are operations a scene places, with resolved fields and scalar
// outputs. Throwing fails that action only; a scene action is never a
// condition, the scene author gates on its outputs.
//
// Keys are forever: scenes store them.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { NO_ERROR } from '../devices/spa.js';

const logger = createLogger({ name: 'scenes' });

export const SCENE_TRIGGERS = {
  ERROR_DETECTED: 'error_detected',
  TEMPERATURE_REACHED: 'temperature_reached',
  CONNECTION_LOST: 'connection_lost',
};

/**
 * The scene events a new status read gives rise to.
 *
 * Nothing fires on the very first read: it is no transition, and every restart
 * of the integration would fire again an error the spa had for hours. The
 * error code feature carries it anyway.
 *
 * @param {object} status the status just read
 * @param {object|null} previous the status read before, null the first time
 * @returns {{ key: string, data: object }[]}
 */
export function sceneEventsFromStatus(status, previous) {
  if (!previous) {
    return [];
  }
  const events = [];
  if (status.errorCode && status.errorCode !== previous.errorCode) {
    events.push({ key: SCENE_TRIGGERS.ERROR_DETECTED, data: { code: status.errorCode } });
  }
  const reached =
    status.heater &&
    status.waterTemperature !== null &&
    status.waterTemperature >= status.targetTemperature;
  const wasBelow =
    previous.waterTemperature !== null && previous.waterTemperature < status.targetTemperature;
  if (reached && wasBelow) {
    events.push({
      key: SCENE_TRIGGERS.TEMPERATURE_REACHED,
      data: { temperature: status.waterTemperature, target: status.targetTemperature },
    });
  }
  return events;
}

/** Publish the events of a status read; a refused event never stops the poll. */
export async function publishStatusEvents(gladys, status, previous) {
  for (const { key, data } of sceneEventsFromStatus(status, previous)) {
    logger.info(`Scene event ${key} ${JSON.stringify(data)}`);
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.error(`Scene event ${key} refused`, err);
    }
  }
}

/** The spa stopped answering, after it had answered. */
export async function publishConnectionLost(gladys, host) {
  logger.info(`Scene event ${SCENE_TRIGGERS.CONNECTION_LOST}`);
  try {
    await gladys.publishSceneEvent(SCENE_TRIGGERS.CONNECTION_LOST, { host });
  } catch (err) {
    logger.error(`Scene event ${SCENE_TRIGGERS.CONNECTION_LOST} refused`, err);
  }
}

/** The spa as it is after an action, limited to the outputs it declares. */
function statusOutputs(status, keys) {
  const outputs = {
    target_temperature: status.targetTemperature,
    power: status.power,
    heater: status.heater,
    filter: status.filter,
    bubbles: status.bubbles,
    error_code: status.errorCode ?? NO_ERROR,
  };
  if (status.waterTemperature !== null) {
    outputs.water_temperature = status.waterTemperature;
  }
  return Object.fromEntries(Object.entries(outputs).filter(([key]) => keys.includes(key)));
}

function requireSpa(context) {
  if (!context.spa) {
    throw new Error('The address of the spa is not configured');
  }
  return context.spa;
}

export const SCENE_ACTIONS = {
  // Set the target, and switch the heater on unless told not to: "warm the
  // spa to 38 °C for Saturday" is one card, not three.
  async set_target_temperature(_gladys, { fields, context }) {
    const spa = requireSpa(context);
    logger.info(`Scene action set_target_temperature <- ${fields.temperature}`);
    let status = await spa.setTargetTemperature(fields.temperature);
    if (fields.heater !== false) {
      status = await spa.setFunction('heater', true);
    }
    return statusOutputs(status, [
      'water_temperature',
      'target_temperature',
      'heater',
      'error_code',
    ]);
  },

  async read_status(_gladys, { context }) {
    const spa = requireSpa(context);
    logger.info('Scene action read_status');
    return statusOutputs(await spa.refresh(), [
      'water_temperature',
      'target_temperature',
      'power',
      'heater',
      'filter',
      'bubbles',
      'error_code',
    ]);
  },
};

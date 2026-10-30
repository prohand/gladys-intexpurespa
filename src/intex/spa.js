// -----------------------------------------------------------------------------
// The spa as the rest of the integration sees it: its last known status, and
// orders expressed as wishes ("heater ON") rather than as the toggles the
// protocol speaks.
//
// Every status read — a poll, the answer to an order, a scene action — goes
// through `#apply`, which tells the listeners what changed. The device, the
// scene triggers and the widget all follow from there, whoever asked.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { createLogger } from '@gladysassistant/integration-sdk';
import { IntexSpaClient } from './client.js';
import { TARGET_LIMITS } from './protocol.js';

const logger = createLogger({ name: 'spa' });

/** Functions that need the spa powered on to run. */
const NEEDS_POWER = ['filter', 'heater', 'jets', 'bubbles', 'sanitizer'];

/** A wish the spa cannot honor (out of range temperature, missing function...). */
export class SpaOrderError extends Error {
  constructor(message, userMessage) {
    super(message);
    this.name = 'SpaOrderError';
    this.userMessage = userMessage;
  }
}

/**
 * Events:
 *   - 'status' (status, previous): every status read, previous being null the
 *     first time;
 *   - 'reachable' (reachable: boolean): the link came up or went down.
 */
export class SpaController extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.host
   * @param {number} options.port
   * @param {(options: object) => IntexSpaClient} [options.createClient]
   */
  constructor({ host, port, createClient = (options) => new IntexSpaClient(options) }) {
    super();
    this.host = host;
    this.port = port;
    this.client = createClient({ host, port });
    this.status = null;
    this.reachable = null;
    this.lastSeen = null;
    this.lastFailure = null;
    // Orders that read then toggle must not interleave: two "heater ON" in a
    // row would read OFF twice and flip the heater twice.
    this.lock = Promise.resolve();
  }

  /** The unit the spa works in; Celsius until the first read says otherwise. */
  get unit() {
    return this.status?.unit ?? 'celsius';
  }

  /** Read the status now. */
  refresh() {
    return this.#exclusive(() => this.#read(() => this.client.getStatus()));
  }

  /**
   * Switch a function on or off. The protocol only toggles: the status is read
   * first, and nothing is sent when the function is already as wished.
   * Switching a function on powers the spa on first, as its control panel does.
   * @returns {Promise<object>} the status after the order
   */
  setFunction(name, on) {
    return this.#exclusive(async () => {
      let status = await this.#read(() => this.client.getStatus());
      if (on && name !== 'power' && NEEDS_POWER.includes(name) && !status.power) {
        logger.info(`Powering the spa on before switching ${name} on`);
        status = await this.#read(() => this.client.toggle('power'));
      }
      if (status[name] === on) {
        return status;
      }
      logger.info(`${name} -> ${on ? 'ON' : 'OFF'}`);
      status = await this.#read(() => this.client.toggle(name));
      if (status[name] !== on) {
        // The panel refused it (the heater during a fault, say): the published
        // state will show the truth, the log says why it differs.
        logger.warn(`The spa kept ${name} ${status[name] ? 'ON' : 'OFF'} after the order`);
      }
      return status;
    });
  }

  /**
   * Set the target temperature, in the unit of the spa.
   * @returns {Promise<object>} the status after the order
   */
  setTargetTemperature(temperature) {
    return this.#exclusive(async () => {
      // A fresh read: the unit (and so the range) may have changed on the panel.
      const status = await this.#read(() => this.client.getStatus());
      const limits = TARGET_LIMITS[status.unit];
      const target = Math.round(Number(temperature));
      if (!Number.isFinite(target) || target < limits.min || target > limits.max) {
        throw new SpaOrderError(`Target ${temperature} out of ${limits.min}-${limits.max}`, {
          en: `The target must be between ${limits.min} and ${limits.max}.`,
          fr: `La consigne doit être comprise entre ${limits.min} et ${limits.max}.`,
          de: `Die Solltemperatur muss zwischen ${limits.min} und ${limits.max} liegen.`,
          es: `La consigna debe estar entre ${limits.min} y ${limits.max}.`,
        });
      }
      if (status.targetTemperature === target) {
        return status;
      }
      logger.info(`Target temperature -> ${target}`);
      return this.#read(() => this.client.setTargetTemperature(target));
    });
  }

  /** Identity of the Wi-Fi module, for "Test the connection". */
  getInfo() {
    return this.#exclusive(() => this.client.getInfo());
  }

  close() {
    this.client.close();
    this.removeAllListeners();
  }

  #exclusive(task) {
    const run = this.lock.then(task);
    this.lock = run.catch(() => {});
    return run;
  }

  async #read(request) {
    let status;
    try {
      status = await request();
    } catch (err) {
      this.lastFailure = err.message;
      this.#setReachable(false);
      throw err;
    }
    this.lastSeen = new Date();
    this.lastFailure = null;
    this.#setReachable(true);
    this.#apply(status);
    return status;
  }

  #apply(status) {
    const previous = this.status;
    this.status = status;
    this.emit('status', status, previous);
  }

  #setReachable(reachable) {
    if (this.reachable === reachable) {
      return;
    }
    this.reachable = reachable;
    if (reachable) {
      logger.info(`Spa reachable at ${this.host}:${this.port}`);
    } else {
      logger.warn(`Spa unreachable at ${this.host}:${this.port}: ${this.lastFailure}`);
    }
    this.emit('reachable', reachable);
  }
}

// -----------------------------------------------------------------------------
// TCP client of the spa's Wi-Fi module.
//
// What the module tolerates, learnt the hard way by the community:
//   - one client and one request at a time: a second request sent before the
//     first answer is lost, so requests are queued here;
//   - the connection is kept open between requests: opening one per request
//     makes the module drop off the Wi-Fi after a while;
//   - an answer can be lost, or come back malformed: each request is tried
//     three times, the connection being reopened after a network error.
// -----------------------------------------------------------------------------

import net from 'node:net';
import { createLogger } from '@gladysassistant/integration-sdk';
import {
  COMMANDS,
  DEFAULT_PORT,
  MESSAGE_TYPES,
  ProtocolError,
  decodeResponse,
  decodeStatus,
  encodeRequest,
  nextSid,
  targetTemperatureFrame,
} from './protocol.js';

const logger = createLogger({ name: 'intex-client' });

/** The spa could not be reached, or never answered usefully. */
export class SpaUnreachableError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'SpaUnreachableError';
  }
}

export class IntexSpaClient {
  /**
   * @param {object} options
   * @param {string} options.host address of the Wi-Fi module
   * @param {number} [options.port]
   * @param {number} [options.timeoutMs] per attempt, connection included
   * @param {number} [options.attempts]
   * @param {number} [options.retryDelayMs] pause between two attempts
   */
  constructor({ host, port = DEFAULT_PORT, timeoutMs = 5000, attempts = 3, retryDelayMs = 1000 }) {
    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
    this.attempts = attempts;
    this.retryDelayMs = retryDelayMs;
    this.socket = null;
    this.buffer = '';
    this.pending = null;
    this.queue = Promise.resolve();
    this.closed = false;
  }

  /** Read the status of the spa. */
  getStatus() {
    return this.#statusRequest(COMMANDS.status);
  }

  /** Flip one function (power, filter, heater, jets, bubbles, sanitizer). */
  toggle(name) {
    if (!(name in COMMANDS) || name === 'status') {
      throw new Error(`Unknown spa function: ${name}`);
    }
    return this.#statusRequest(COMMANDS[name]);
  }

  /** Set the target temperature, in the unit the spa is set to. */
  setTargetTemperature(temperature) {
    return this.#statusRequest(targetTemperatureFrame(temperature));
  }

  /** The identity of the Wi-Fi module: `{ ip, uid, dtype }`. */
  getInfo() {
    return this.#enqueue({ type: MESSAGE_TYPES.INFO });
  }

  /** Close the connection; later requests fail. */
  close() {
    this.closed = true;
    this.#dropSocket(new SpaUnreachableError('Client closed'));
  }

  async #statusRequest(data) {
    return decodeStatus(await this.#enqueue({ data, type: MESSAGE_TYPES.COMMAND }));
  }

  /** Requests run one after the other, never two on the wire at once. */
  #enqueue(request) {
    const run = this.queue.then(() => this.#withRetries(request));
    // The queue survives a failed request.
    this.queue = run.catch(() => {});
    return run;
  }

  async #withRetries(request) {
    let lastError;
    for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
      if (this.closed) {
        throw new SpaUnreachableError('Client closed');
      }
      try {
        return await this.#exchange(request);
      } catch (err) {
        lastError = err;
        logger.debug(`Attempt ${attempt}/${this.attempts} failed: ${err.message}`);
        if (!(err instanceof ProtocolError)) {
          // A network error leaves the connection in an unknown state.
          this.#dropSocket(err);
        }
        if (attempt < this.attempts) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
        }
      }
    }
    throw new SpaUnreachableError(
      `The spa at ${this.host}:${this.port} did not answer (${lastError?.message})`,
      lastError,
    );
  }

  async #exchange({ data, type }) {
    const sid = nextSid();
    const deadline = Date.now() + this.timeoutMs;
    await this.#connect(this.timeoutMs);
    const line = await this.#send(encodeRequest({ data, type, sid }), deadline - Date.now());
    return decodeResponse(line, { sid, type });
  }

  #connect(timeoutMs) {
    if (this.socket && !this.socket.destroyed && !this.socket.connecting) {
      return Promise.resolve();
    }
    this.#dropSocket();
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`connection timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      socket.setEncoding('utf8');
      socket.setKeepAlive(true, 30_000);
      socket.once('connect', () => {
        clearTimeout(timer);
        logger.debug(`Connected to ${this.host}:${this.port}`);
        resolve();
      });
      socket.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      socket.on('data', (chunk) => this.#onData(chunk));
      socket.on('error', (err) => this.#failPending(err));
      socket.on('close', () => {
        if (this.socket === socket) {
          this.socket = null;
        }
        this.#failPending(new Error('connection closed by the spa'));
      });
      this.socket = socket;
      this.buffer = '';
    });
  }

  #send(payload, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.pending = null;
          reject(new Error(`no answer within ${this.timeoutMs} ms`));
        },
        Math.max(timeoutMs, 1),
      );
      this.pending = {
        resolve: (line) => {
          clearTimeout(timer);
          resolve(line);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      };
      this.socket.write(payload);
    });
  }

  #onData(chunk) {
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line && this.pending) {
        const { resolve } = this.pending;
        this.pending = null;
        resolve(line);
      } else if (line) {
        logger.debug('Unsolicited line from the spa ignored');
      }
      newline = this.buffer.indexOf('\n');
    }
  }

  #failPending(err) {
    if (this.pending) {
      const { reject } = this.pending;
      this.pending = null;
      reject(err);
    }
  }

  #dropSocket(err) {
    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      socket.removeAllListeners('close');
      socket.destroy();
    }
    if (err) {
      this.#failPending(err);
    }
    this.buffer = '';
  }
}

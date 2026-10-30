// -----------------------------------------------------------------------------
// The local protocol of the Intex PureSpa Wi-Fi module.
//
// The module listens on TCP 8990. Each request is one JSON object:
//
//   {"data":"8888060FEE0F01DA","sid":"17300000000000","type":1}
//
// and each answer one JSON line echoing the same `sid`:
//
//   {"sid":"17300000000000","data":"FFFF110F0107…12","result":"ok","type":2}
//
// `data` is a hex frame whose last byte is a checksum. Every command but the
// target temperature is a TOGGLE: sending "heater" flips the heater, whatever
// its state. Never send one without reading the state first (see spa.js).
//
// Reverse-engineered by the community; the reference implementation is the
// MIT-licensed Python library mathieu-mp/aio-intex-spa, whose frames, bit
// positions and test vectors are reproduced here.
// -----------------------------------------------------------------------------

export const DEFAULT_PORT = 8990;

/** `type` of the JSON envelope. */
export const MESSAGE_TYPES = { COMMAND: 1, STATUS: 2, INFO: 3 };

/** Frames without their checksum. */
export const COMMANDS = {
  status: '8888060FEE0F01',
  power: '8888060F014000',
  filter: '8888060F010004',
  heater: '8888060F010010',
  jets: '8888060F011000',
  bubbles: '8888060F010400',
  sanitizer: '8888060F010001',
};

/** The target temperature frame: this prefix, then the temperature byte. */
const TARGET_TEMPERATURE_PREFIX = '8888050F0C';

/** The functions a command toggles, in the order the status frame carries them. */
export const FUNCTIONS = ['power', 'filter', 'heater', 'jets', 'bubbles', 'sanitizer'];

/** Bit position of each function in the status frame, from the end. */
const FUNCTION_BITS = {
  power: 104,
  filter: 105,
  heater: 106,
  jets: 107,
  bubbles: 108,
  sanitizer: 109,
};

/**
 * Range of the target temperature the control panel accepts. The spa has no
 * unit flag: a target above 40 can only be Fahrenheit.
 */
export const TARGET_LIMITS = {
  celsius: { min: 10, max: 40 },
  fahrenheit: { min: 50, max: 104 },
};

/** The water temperature byte holds an error code from this value on. */
const FIRST_ERROR_VALUE = 181;

/**
 * Checksum of a hex frame: 0xFF minus the sum of its bytes, modulo 0xFF (not
 * 0x100), 0x00 being written 0xFF.
 * @param {string} hex frame without checksum
 * @returns {number}
 */
export function checksum(hex) {
  let sum = 0xff;
  for (let index = 0; index < hex.length; index += 2) {
    sum -= Number.parseInt(hex.slice(index, index + 2), 16);
  }
  // `%` keeps the sign in JavaScript: bring it back into 0..0xFE first.
  const value = ((sum % 0xff) + 0xff) % 0xff;
  return value === 0 ? 0xff : value;
}

/** The frame followed by its checksum byte, upper case. */
export function withChecksum(hex) {
  return `${hex}${checksum(hex).toString(16).padStart(2, '0')}`.toUpperCase();
}

/** Whether a frame (checksum included) carries the right checksum. */
export function hasValidChecksum(hex) {
  if (typeof hex !== 'string' || !/^([0-9A-Fa-f]{2}){2,}$/.test(hex)) {
    return false;
  }
  return checksum(hex.slice(0, -2)) === Number.parseInt(hex.slice(-2), 16);
}

/** The frame that sets the target temperature (an integer, unit of the spa). */
export function targetTemperatureFrame(temperature) {
  if (!Number.isInteger(temperature) || temperature < 0 || temperature > 0xff) {
    throw new RangeError(`Invalid target temperature: ${temperature}`);
  }
  return `${TARGET_TEMPERATURE_PREFIX}${temperature.toString(16).padStart(2, '0').toUpperCase()}`;
}

let sidCounter = 0;

/**
 * A session id the spa echoes back. The official app sends tenths of a
 * millisecond; a counter in the last digit keeps two requests of the same
 * millisecond apart.
 */
export function nextSid(now = Date.now()) {
  sidCounter = (sidCounter + 1) % 10;
  return String(now * 10 + sidCounter);
}

/**
 * The JSON request for a frame (without checksum) or an info query.
 * @param {{ data?: string, type: number, sid: string }} request
 * @returns {string}
 */
export function encodeRequest({ data = '', type, sid }) {
  return JSON.stringify({ data: data === '' ? '' : withChecksum(data), sid, type });
}

/**
 * Check and unwrap one answer line.
 * @param {string} line the JSON line received
 * @param {{ sid: string, type: number }} request what was sent
 * @returns {string|object} the status frame (hex), or the info object
 */
export function decodeResponse(line, { sid, type }) {
  let response;
  try {
    response = JSON.parse(line);
  } catch {
    throw new ProtocolError('the spa answered something that is not JSON');
  }
  if (response?.sid !== sid) {
    throw new ProtocolError(`answer to another request (sid ${response?.sid})`);
  }
  if (response.result !== 'ok') {
    throw new ProtocolError(`the spa refused the request (result ${response.result})`);
  }
  if (type === MESSAGE_TYPES.INFO) {
    if (response.type !== MESSAGE_TYPES.INFO) {
      throw new ProtocolError(`unexpected answer type ${response.type}`);
    }
    const info = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    return { ip: info?.ip ?? null, uid: info?.uid ?? null, dtype: info?.dtype ?? null };
  }
  if (response.type !== MESSAGE_TYPES.STATUS) {
    throw new ProtocolError(`unexpected answer type ${response.type}`);
  }
  if (!hasValidChecksum(response.data)) {
    throw new ProtocolError('the status frame has a wrong checksum');
  }
  return response.data.toUpperCase();
}

/**
 * Read a status frame.
 * @param {string} hex status frame, checksum included
 * @returns {{
 *   power: boolean, filter: boolean, heater: boolean, jets: boolean,
 *   bubbles: boolean, sanitizer: boolean, unit: 'celsius'|'fahrenheit',
 *   waterTemperature: number|null, targetTemperature: number,
 *   errorCode: string|null
 * }}
 */
export function decodeStatus(hex) {
  const raw = BigInt(`0x${hex}`);
  const byteAt = (shift) => Number((raw >> BigInt(shift)) & 0xffn);
  const bit = (shift) => ((raw >> BigInt(shift)) & 1n) === 1n;

  const functions = Object.fromEntries(FUNCTIONS.map((name) => [name, bit(FUNCTION_BITS[name])]));
  const water = byteAt(88);
  const targetTemperature = byteAt(24);
  return {
    ...functions,
    unit: targetTemperature <= TARGET_LIMITS.celsius.max ? 'celsius' : 'fahrenheit',
    // The water temperature byte carries the error code instead, E81 being 181.
    waterTemperature: water < FIRST_ERROR_VALUE ? water : null,
    targetTemperature,
    errorCode: water < FIRST_ERROR_VALUE ? null : `E${water - 100}`,
  };
}

/** A malformed or refused answer: worth a retry, the link itself is fine. */
export class ProtocolError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProtocolError';
  }
}

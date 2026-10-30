import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMANDS,
  MESSAGE_TYPES,
  ProtocolError,
  checksum,
  decodeResponse,
  decodeStatus,
  encodeRequest,
  hasValidChecksum,
  nextSid,
  targetTemperatureFrame,
  withChecksum,
} from '../src/intex/protocol.js';

// Frames captured on real spas (aio-intex-spa test vectors and issue #27).
const REAL_STATUS = 'FFFF110F010700220000000080808022000012';
const FAHRENHEIT_STATUS = 'FFFF110F01070064000000008080806700008A';
const CHECKSUM_ZERO_STATUS = 'FFFF110F0107006400000085808085670000FF';
const ERROR_STATUS = 'FFFF110F010700B50000000080808022000012';

test('the status request carries the checksum the spa expects', () => {
  assert.equal(withChecksum(COMMANDS.status), '8888060FEE0F01DA');
});

test('the checksum of real frames is recognized', () => {
  for (const frame of [REAL_STATUS, FAHRENHEIT_STATUS, CHECKSUM_ZERO_STATUS]) {
    assert.ok(hasValidChecksum(frame), frame);
  }
});

test('a wrong checksum, or a checksum of 0x00, is refused', () => {
  assert.equal(hasValidChecksum('FFFF110F010700220000000080808022000044'), false);
  // A sum landing on 0 is written 0xFF, never 0x00.
  assert.equal(hasValidChecksum('00000000000000000000000000000000000000'), false);
  assert.equal(checksum('FFFF110F0107006400000085808085670000'), 0xff);
  assert.equal(hasValidChecksum('not hex'), false);
});

test('a checksum below 0x10 is written on two digits', () => {
  // 0xFF - 0xF0 = 0x0F
  assert.equal(withChecksum('F0'), 'F00F');
});

test('a real status frame is decoded', () => {
  assert.deepEqual(decodeStatus(REAL_STATUS), {
    power: true,
    filter: true,
    heater: true,
    jets: false,
    bubbles: false,
    sanitizer: false,
    unit: 'celsius',
    waterTemperature: 34,
    targetTemperature: 34,
    errorCode: null,
  });
});

test('a target above 40 means the spa works in Fahrenheit', () => {
  const status = decodeStatus(FAHRENHEIT_STATUS);
  assert.equal(status.unit, 'fahrenheit');
  assert.equal(status.waterTemperature, 100);
  assert.equal(status.targetTemperature, 103);
});

test('an error code replaces the water temperature', () => {
  const status = decodeStatus(ERROR_STATUS);
  assert.equal(status.errorCode, 'E81');
  assert.equal(status.waterTemperature, null);
  assert.equal(status.targetTemperature, 34);
});

test('the target temperature frame carries the temperature byte', () => {
  assert.equal(targetTemperatureFrame(38), '8888050F0C26');
  assert.equal(targetTemperatureFrame(10), '8888050F0C0A');
  assert.throws(() => targetTemperatureFrame(37.5), RangeError);
  assert.throws(() => targetTemperatureFrame(300), RangeError);
});

test('a request is the JSON envelope the official app sends', () => {
  const sid = nextSid(1_730_000_000_000);
  assert.match(sid, /^1730000000000\d$/);
  assert.deepEqual(
    JSON.parse(encodeRequest({ data: COMMANDS.heater, type: MESSAGE_TYPES.COMMAND, sid })),
    { data: withChecksum(COMMANDS.heater), sid, type: 1 },
  );
  assert.deepEqual(JSON.parse(encodeRequest({ type: MESSAGE_TYPES.INFO, sid })), {
    data: '',
    sid,
    type: 3,
  });
});

test('two requests of the same millisecond get different sids', () => {
  assert.notEqual(nextSid(1), nextSid(1));
});

test('an answer is checked before it is trusted', () => {
  const request = { sid: '42', type: MESSAGE_TYPES.COMMAND };
  const line = (fields) =>
    JSON.stringify({ sid: '42', data: REAL_STATUS, result: 'ok', type: 2, ...fields });

  assert.equal(decodeResponse(line({}), request), REAL_STATUS);
  assert.throws(() => decodeResponse('{oops', request), ProtocolError);
  assert.throws(() => decodeResponse(line({ sid: '41' }), request), /another request/);
  assert.throws(() => decodeResponse(line({ result: 'error' }), request), /refused/);
  assert.throws(() => decodeResponse(line({ type: 3 }), request), /unexpected answer type/);
  assert.throws(
    () => decodeResponse(line({ data: 'FFFF110F010700220000000080808022000044' }), request),
    /checksum/,
  );
});

test('the info answer gives the identity of the module', () => {
  const answer = JSON.stringify({
    sid: '7',
    data: JSON.stringify({ ip: '192.168.1.50', uid: 'ABC', dtype: 'spa' }),
    result: 'ok',
    type: 3,
  });
  assert.deepEqual(decodeResponse(answer, { sid: '7', type: MESSAGE_TYPES.INFO }), {
    ip: '192.168.1.50',
    uid: 'ABC',
    dtype: 'spa',
  });
});

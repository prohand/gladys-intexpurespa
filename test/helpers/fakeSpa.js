// -----------------------------------------------------------------------------
// A fake Intex Wi-Fi module on 127.0.0.1: it speaks the protocol (one JSON
// line per answer, toggles, target temperature, info), keeps a status, and
// can be told to stay silent or to answer garbage, to exercise the retries.
// -----------------------------------------------------------------------------

import net from 'node:net';
import { COMMANDS, FUNCTIONS, MESSAGE_TYPES, checksum } from '../../src/intex/protocol.js';

// A real frame (aio-intex-spa test vector) with every value cleared: the
// bytes this fake does not model keep what a spa sends.
const BASE_FRAME = 'FFFF110F010000000000000080808000000000';
const FUNCTION_BITS = {
  power: 104,
  filter: 105,
  heater: 106,
  jets: 107,
  bubbles: 108,
  sanitizer: 109,
};

/** The status frame (checksum included) of a fake state. */
export function encodeStatus(state) {
  let raw = BigInt(`0x${BASE_FRAME.slice(0, -2)}`);
  // `raw` is the frame without its checksum byte: shifts are 8 bits smaller.
  for (const name of FUNCTIONS) {
    if (state[name]) {
      raw |= 1n << BigInt(FUNCTION_BITS[name] - 8);
    }
  }
  const water = state.errorCode ? Number(state.errorCode.slice(1)) + 100 : state.water;
  raw |= BigInt(water) << 80n;
  raw |= BigInt(state.target) << 16n;
  const hex = raw.toString(16).toUpperCase().padStart(36, '0');
  return `${hex}${checksum(hex).toString(16).toUpperCase().padStart(2, '0')}`;
}

export async function startFakeSpa(initial = {}) {
  const state = {
    power: true,
    filter: true,
    heater: false,
    jets: false,
    bubbles: false,
    sanitizer: false,
    water: 30,
    target: 37,
    errorCode: null,
    ...initial,
  };
  const fake = {
    state,
    requests: [],
    connections: 0,
    // 'answer' | 'silent' (swallow the next requests) | 'garbage'
    mode: 'answer',
    // How many requests to treat with `mode` before answering again.
    misbehaveCount: Infinity,
    // A panel refusing an order: functions listed here never toggle.
    stuck: new Set(),
    port: 0,
    server: null,
    sockets: new Set(),
  };

  const toggles = Object.fromEntries(FUNCTIONS.map((name) => [`${COMMANDS[name]}`, name]));

  function answer(request) {
    if (request.type === MESSAGE_TYPES.INFO) {
      return {
        sid: request.sid,
        data: JSON.stringify({ ip: '127.0.0.1', uid: 'SPA-TEST-1', dtype: 'spa' }),
        result: 'ok',
        type: MESSAGE_TYPES.INFO,
      };
    }
    const frame = request.data.slice(0, -2);
    if (frame.startsWith('8888050F0C')) {
      state.target = Number.parseInt(frame.slice(10, 12), 16);
    } else if (toggles[frame] && !fake.stuck.has(toggles[frame])) {
      state[toggles[frame]] = !state[toggles[frame]];
    }
    return {
      sid: request.sid,
      data: encodeStatus(state),
      result: 'ok',
      type: MESSAGE_TYPES.STATUS,
    };
  }

  fake.server = net.createServer((socket) => {
    fake.connections += 1;
    fake.sockets.add(socket);
    socket.on('close', () => fake.sockets.delete(socket));
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk;
      // Requests carry no line break: each one is a complete JSON object.
      let end = buffer.indexOf('}');
      while (end !== -1) {
        const request = JSON.parse(buffer.slice(0, end + 1));
        buffer = buffer.slice(end + 1);
        fake.requests.push(request);
        if (fake.mode !== 'answer' && fake.misbehaveCount > 0) {
          fake.misbehaveCount -= 1;
          if (fake.mode === 'garbage') {
            socket.write('{"sid":"0","result":"ok","type":2,"data":"FFFF"}\n');
          }
        } else {
          socket.write(`${JSON.stringify(answer(request))}\n`);
        }
        end = buffer.indexOf('}');
      }
    });
    socket.on('error', () => {});
  });

  await new Promise((resolve) => fake.server.listen(0, '127.0.0.1', resolve));
  fake.port = fake.server.address().port;

  /** The functions toggled so far, in order. */
  fake.toggled = () =>
    fake.requests
      .map((request) => toggles[request.data?.slice(0, -2)])
      .filter((name) => name !== undefined);

  fake.close = async () => {
    for (const socket of fake.sockets) {
      socket.destroy();
    }
    await new Promise((resolve) => fake.server.close(resolve));
  };

  return fake;
}

/** A TCP port nothing listens on. */
export async function closedPort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

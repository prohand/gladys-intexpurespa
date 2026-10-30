import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, isConfigured, normalizeConfig } from '../src/config.js';

test('an empty configuration gets the defaults', () => {
  const config = normalizeConfig();
  assert.deepEqual(config, DEFAULT_CONFIG);
  assert.equal(isConfigured(config), false);
});

test('values typed in a form are brought back to their types', () => {
  const config = normalizeConfig({
    host: ' 192.168.1.50 ',
    port: '8990',
    has_jets: 'true',
    has_sanitizer: false,
    poll_frequency: '120',
  });
  assert.equal(config.host, '192.168.1.50');
  assert.equal(config.port, 8990);
  assert.equal(config.has_jets, true);
  assert.equal(config.has_sanitizer, false);
  assert.equal(config.poll_frequency, 120);
  assert.equal(isConfigured(config), true);
});

test('out of range values fall back inside the bounds', () => {
  assert.equal(normalizeConfig({ port: 70000 }).port, 8990);
  assert.equal(normalizeConfig({ port: 'abc' }).port, 8990);
  // Below 30 s the Wi-Fi module drops off the network.
  assert.equal(normalizeConfig({ poll_frequency: 5 }).poll_frequency, 30);
  assert.equal(normalizeConfig({ poll_frequency: 99999 }).poll_frequency, 3600);
  assert.equal(normalizeConfig({ poll_frequency: 'x' }).poll_frequency, 60);
});

// -----------------------------------------------------------------------------
// Integration configuration.
//
// The configuration is filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. The SDK fetches it for you
// (`gladys.getConfig()`) and notifies you of every change through
// `gladys.onConfigUpdated()`.
//
// This module only provides defaults and normalizes the received object, so the
// rest of the code never has to deal with `undefined` or with numbers typed as
// strings.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // Address of the spa's Wi-Fi module on the LAN. Empty until the user types it.
  host: '',
  // The Intex Wi-Fi module always listens on TCP 8990; kept editable for a NAT
  // or a port forward in between.
  port: 8990,
  // Jets and the salt sanitizer only exist on some models: the status frame
  // always carries their bit, so nothing on the wire says whether the spa has
  // them. The user says so, and the device only shows what is there.
  has_jets: false,
  has_sanitizer: false,
  // Seconds between two status reads. The Wi-Fi module of the spa is slow and
  // serves one client at a time: reading it too often makes it drop off the
  // network, hence a 30 s floor.
  poll_frequency: 60,
};

export const POLL_FREQUENCY_LIMITS = { min: 30, max: 3600 };

/** A port number, or the default one when the value is not a valid TCP port. */
function toPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_CONFIG.port;
}

/** The refresh interval in seconds, kept inside the manifest bounds. */
function toPollFrequency(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return DEFAULT_CONFIG.poll_frequency;
  }
  return Math.min(POLL_FREQUENCY_LIMITS.max, Math.max(POLL_FREQUENCY_LIMITS.min, seconds));
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    host: typeof raw.host === 'string' ? raw.host.trim() : DEFAULT_CONFIG.host,
    port: toPort(raw.port ?? DEFAULT_CONFIG.port),
    // A boolean field may come back as a string from a form.
    has_jets: raw.has_jets === true || raw.has_jets === 'true',
    has_sanitizer: raw.has_sanitizer === true || raw.has_sanitizer === 'true',
    poll_frequency: toPollFrequency(raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency),
  };
}

/** Whether the user typed the address of the spa yet. */
export function isConfigured(config) {
  return config.host.length > 0;
}

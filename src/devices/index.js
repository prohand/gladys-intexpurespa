// -----------------------------------------------------------------------------
// Device registry.
//
// Each device type lives in its own file and exposes the same shape (see the
// official template): key, deviceExternalId(gladys), buildDevice(gladys,
// context), and optionally onPoll, onSetValue and transport. The context is
// `{ config, spa }`: the normalized configuration and the SpaController (null
// until the address of the spa is configured).
// -----------------------------------------------------------------------------

import { DEVICE_POLL_FREQUENCIES } from '@gladysassistant/integration-sdk';
import { spa } from './spa.js';

export const DEVICE_BLUEPRINTS = [spa];

/** The discovery payload for Gladys (all devices). */
export function buildDiscoveredDevices(gladys, context) {
  return DEVICE_BLUEPRINTS.map((bp) => bp.buildDevice(gladys, context));
}

/** The blueprint that owns a device, from its external_id. */
export function findBlueprintByDevice(gladys, device) {
  return DEVICE_BLUEPRINTS.find((bp) => bp.deviceExternalId(gladys) === device.external_id);
}

/** The `publishTransports` payload: the effective transport of every device. */
export function buildTransportEntries(gladys, context) {
  return DEVICE_BLUEPRINTS.filter((bp) => typeof bp.transport === 'function').map((bp) => ({
    external_id: bp.deviceExternalId(gladys),
    transport: bp.transport(gladys, context),
  }));
}

// Gladys' poll ticks drift by a few milliseconds: a read due within the next
// quarter of a tick runs now, so a 60 s interval does not slip to 90 s.
const POLL_TOLERANCE_MS = DEVICE_POLL_FREQUENCIES.EVERY_30_SECONDS / 4;

/**
 * The `onPoll` dispatcher: route the poll to the owner blueprint, at the
 * refresh interval of the configuration (`poll_frequency`, in seconds).
 * Gladys polls every 30 s (the pace read when the device is created); the
 * slower interval is applied by skipping polls, so the user can change it
 * without re-creating the device. Resolves `true` when the device was read.
 * A read that throws is retried at the next poll.
 */
export function createPoller() {
  const lastReads = new Map();
  return async function pollDevice(gladys, device, context) {
    const blueprint = findBlueprintByDevice(gladys, device);
    if (!blueprint || typeof blueprint.onPoll !== 'function') {
      return false;
    }
    const now = Date.now();
    const lastRead = lastReads.get(device.external_id);
    if (
      lastRead !== undefined &&
      now - lastRead < context.config.poll_frequency * 1000 - POLL_TOLERANCE_MS
    ) {
      return false;
    }
    await blueprint.onPoll(gladys, context);
    lastReads.set(device.external_id, now);
    return true;
  };
}

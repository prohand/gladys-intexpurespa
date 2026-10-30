// -----------------------------------------------------------------------------
// The integration, wired to a Gladys client.
//
// Kept apart from index.js so the tests can wire it to the SDK's fake Gladys:
// index.js only creates the real client, calls `registerIntegration` and
// connects. Every handler is registered here, before connect().
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isConfigured, normalizeConfig } from './config.js';
import { NOT_CONFIGURED, testConnection, unreachableMessage } from './connection.js';
import {
  buildDiscoveredDevices,
  buildTransportEntries,
  createPoller,
  findBlueprintByDevice,
} from './devices/index.js';
import { statesFromStatus } from './devices/spa.js';
import { SpaController } from './intex/spa.js';
import { SpaUnreachableError } from './intex/client.js';
import {
  SCENE_ACTIONS,
  publishConnectionLost,
  publishStatusEvents,
} from './capabilities/scenes.js';
import { SPA_WIDGET, buildWidgetContent, runWidgetAction } from './capabilities/widget.js';

const logger = createLogger({ name: 'app' });

// An unchanged reading is re-sent every 30 minutes, so a stable water
// temperature stays recently dated in Gladys.
const HEARTBEAT_MS = 30 * 60 * 1000;

// What the widget shows of a status: a change of any of these re-pulls it.
const WIDGET_FIELDS = [
  'power',
  'filter',
  'heater',
  'jets',
  'bubbles',
  'sanitizer',
  'errorCode',
  'unit',
];

/**
 * Register every handler of the integration on `gladys`.
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {{ createController?: (options: object) => SpaController }} [options]
 * @returns {{ context: object, settled: () => Promise<void>, stop: () => void }}
 */
export function registerIntegration(gladys, { createController } = {}) {
  const context = { config: normalizeConfig(), spa: null };
  const pollDevice = createPoller();
  let publishedUnit = null;
  let everReachable = false;
  // The reactions to the controller's events run one after the other, so the
  // states reach Gladys in the order the spa reported them.
  let chain = Promise.resolve();

  function schedule(task) {
    chain = chain.then(task).catch((err) => logger.error('Status handling failed', err));
    return chain;
  }

  function newController(config) {
    const options = { host: config.host, port: config.port };
    const controller = createController ? createController(options) : new SpaController(options);
    controller.on('status', (status, previous) =>
      schedule(() => onStatus(controller, status, previous)),
    );
    controller.on('reachable', (reachable) => schedule(() => onReachable(controller, reachable)));
    return controller;
  }

  /** Follow a new configuration: a new address means a new controller. */
  function applyConfig(raw) {
    const previous = context.config;
    context.config = normalizeConfig(raw);
    const { host, port } = context.config;
    if (context.spa && previous.host === host && previous.port === port) {
      return;
    }
    context.spa?.close();
    context.spa = null;
    everReachable = false;
    if (isConfigured(context.config)) {
      logger.info(`Spa address: ${host}:${port}`);
      context.spa = newController(context.config);
    }
  }

  async function publishDevices() {
    await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, context));
    publishedUnit = context.spa?.unit ?? null;
  }

  async function publishTransports() {
    await gladys.publishTransports(buildTransportEntries(gladys, context));
  }

  async function publishConnectionStatus() {
    const { config, spa } = context;
    if (!isConfigured(config) || !spa) {
      await gladys.setConnectionStatus(false, NOT_CONFIGURED);
    } else if (spa.reachable === false) {
      await gladys.setConnectionStatus(false, unreachableMessage(config.host, config.port));
    } else {
      await gladys.setConnectionStatus(true);
    }
  }

  function refreshWidget() {
    gladys.requestWidgetRefresh(SPA_WIDGET);
  }

  async function onStatus(controller, status, previous) {
    if (controller !== context.spa) {
      return; // a status of the spa at the previous address
    }
    if (publishedUnit !== null && status.unit !== publishedUnit) {
      // Celsius <-> Fahrenheit on the panel: the features change unit and range.
      logger.info(`The spa now works in ${status.unit}: re-publishing the device`);
      await publishDevices();
    }
    await gladys.publishChangedStates(statesFromStatus(gladys, status, context.config), {
      heartbeat: HEARTBEAT_MS,
    });
    await publishStatusEvents(gladys, status, previous);
    if (!previous || WIDGET_FIELDS.some((field) => status[field] !== previous[field])) {
      refreshWidget();
    }
  }

  async function onReachable(controller, reachable) {
    if (controller !== context.spa) {
      return;
    }
    if (!reachable && everReachable) {
      await publishConnectionLost(gladys, context.config.host);
    }
    everReachable ||= reachable;
    await publishTransports();
    await publishConnectionStatus();
    refreshWidget();
  }

  /** Everything Gladys must know after a (re)connection or a new configuration. */
  async function resynchronize() {
    if (context.spa) {
      // A first read tells the unit before the device is published.
      await context.spa.refresh().catch((err) => logger.warn(err.message));
    }
    await publishDevices();
    await publishTransports();
    await publishConnectionStatus();
    refreshWidget();
  }

  // --- Discovery -------------------------------------------------------------
  gladys.onScanRequest(async () => {
    logger.info('onScanRequest -> publishing the spa');
    await publishDevices();
  });

  // --- Commands --------------------------------------------------------------
  gladys.onSetValue(async (device, feature, value) => {
    logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
    const blueprint = findBlueprintByDevice(gladys, device);
    if (!blueprint || typeof blueprint.onSetValue !== 'function') {
      throw new Error(`No command handler for ${device.external_id}`);
    }
    await blueprint.onSetValue(gladys, { device, feature, value, context });
  });

  // --- Polling ---------------------------------------------------------------
  gladys.onPoll(async (device) => {
    try {
      if (!(await pollDevice(gladys, device, context))) {
        logger.debug(`onPoll skipped (not due) for ${device.external_id}`);
      }
    } catch (err) {
      // Already shown by the badge and the connection status: no need to make
      // Gladys log a failed poll every 30 s while the spa is off.
      if (!(err instanceof SpaUnreachableError)) {
        throw err;
      }
      logger.debug(err.message);
    }
  });

  // --- Configuration screen actions -------------------------------------------
  gladys.onAction('test_connection', () => testConnection(context));

  // --- Scene actions -----------------------------------------------------------
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler(gladys, { fields, context }));
  }

  // --- Dashboard widget --------------------------------------------------------
  gladys.onWidgetGet(SPA_WIDGET, async () => buildWidgetContent(gladys, context));
  gladys.onWidgetAction(SPA_WIDGET, (actionKey, params, { values } = {}) =>
    runWidgetAction(gladys, { actionKey, params, values, context }),
  );

  // --- Configuration ----------------------------------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('onConfigUpdated -> new configuration received');
    applyConfig(newConfig);
    await resynchronize();
  });

  // --- Connection lifecycle -----------------------------------------------------
  gladys.on('connected', async () => {
    try {
      applyConfig(await gladys.getConfig());
      await resynchronize();
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys
        .setConnectionStatus(false, {
          en: 'Initialization failed, check the integration logs.',
          fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
          de: 'Die Initialisierung ist fehlgeschlagen, prüfe die Logs der Integration.',
          es: 'La inicialización ha fallado, consulte los registros de la integración.',
        })
        .catch(() => {});
    }
  });

  return {
    context,
    /** Resolves once the reactions to the events received so far are done. */
    settled: () => chain,
    stop() {
      context.spa?.close();
      context.spa = null;
    },
  };
}

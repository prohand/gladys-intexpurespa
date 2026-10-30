// -----------------------------------------------------------------------------
// Dashboard widget "Intex spa" (Gladys 5.1+, button forms 5.3+).
//
// Two live tiles bound to the device features (water and target temperature:
// they follow the published states, nothing to refresh), a status list of the
// functions, the link and the error code, and buttons: heater, bubbles,
// filtration, and a form to set the target temperature.
//
// The content is cached by the core until its TTL; index.js nudges it
// (requestWidgetRefresh) whenever a status read changes what it shows.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { featureExternalId, FEATURES } from '../devices/spa.js';
import { TARGET_LIMITS } from '../intex/protocol.js';
import { isConfigured } from '../config.js';
import { localize, pick } from '../i18n.js';

const logger = createLogger({ name: 'widget' });

export const SPA_WIDGET = 'spa';

export const WIDGET_ACTIONS = {
  HEATER: 'heater',
  BUBBLES: 'bubbles',
  FILTER: 'filter',
  TARGET: 'target',
};

const WORDS = {
  on: { en: 'On', fr: 'Marche', de: 'An', es: 'Encendido' },
  off: { en: 'Off', fr: 'Arrêt', de: 'Aus', es: 'Apagado' },
  heater: { en: 'Heater', fr: 'Chauffage', de: 'Heizung', es: 'Calefacción' },
  bubbles: { en: 'Bubbles', fr: 'Bulles', de: 'Sprudel', es: 'Burbujas' },
  filter: { en: 'Filtration', fr: 'Filtration', de: 'Filterung', es: 'Filtración' },
  jets: { en: 'Jets', fr: 'Jets', de: 'Düsen', es: 'Chorros' },
  sanitizer: {
    en: 'Salt sanitizer',
    fr: 'Traitement au sel',
    de: 'Salzdesinfektion',
    es: 'Clorador salino',
  },
  power: { en: 'Power', fr: 'Alimentation', de: 'Strom', es: 'Encendido' },
};

const TOGGLES = [
  { action: WIDGET_ACTIONS.HEATER, fn: 'heater', icon: 'thermometer' },
  { action: WIDGET_ACTIONS.BUBBLES, fn: 'bubbles', icon: 'wind' },
  { action: WIDGET_ACTIONS.FILTER, fn: 'filter', icon: 'refresh-cw' },
];

function onOff(value) {
  return value ? WORDS.on : WORDS.off;
}

function functionRow(fn, status) {
  return {
    label: WORDS[fn],
    value: onOff(status[fn]),
    color: status[fn] ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
  };
}

function statusList(context) {
  const { spa, config } = context;
  const status = spa.status;
  const items = [];
  if (status) {
    items.push(functionRow('power', status), functionRow('heater', status));
    items.push(functionRow('filter', status), functionRow('bubbles', status));
    if (config.has_jets) {
      items.push(functionRow('jets', status));
    }
    if (config.has_sanitizer) {
      items.push(functionRow('sanitizer', status));
    }
    items.push({
      label: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
      icon: status.errorCode ? 'alert-triangle' : 'check-circle',
      value: status.errorCode ?? { en: 'None', fr: 'Aucune', de: 'Keiner', es: 'Ninguno' },
      color: status.errorCode ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
    });
  }
  items.push({
    label: { en: 'Connection', fr: 'Connexion', de: 'Verbindung', es: 'Conexión' },
    icon: 'wifi',
    value:
      spa.reachable === false
        ? { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' }
        : { en: 'Local', fr: 'Locale', de: 'Lokal', es: 'Local' },
    color: spa.reachable === false ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
  });
  return { type: 'status', items };
}

function toggleButton({ action, fn, icon }, status) {
  const wanted = !status[fn];
  return {
    type: 'button',
    // "Heater: On" switches the heater on; the status list shows where it is.
    label: localize((language) => `${pick(language, WORDS[fn])}: ${pick(language, onOff(wanted))}`),
    icon,
    style: wanted ? 'primary' : 'secondary',
    action: { key: action, params: { on: wanted } },
  };
}

function targetButton(status) {
  const limits = TARGET_LIMITS[status.unit];
  return {
    type: 'button',
    label: {
      en: 'Set temperature',
      fr: 'Régler la consigne',
      de: 'Temperatur setzen',
      es: 'Fijar temperatura',
    },
    icon: 'sliders',
    style: 'secondary',
    action: {
      key: WIDGET_ACTIONS.TARGET,
      fields: [
        {
          key: 'temperature',
          type: 'number',
          required: true,
          min: limits.min,
          max: limits.max,
          default: status.targetTemperature,
          label: {
            en: 'Target temperature',
            fr: 'Température de consigne',
            de: 'Solltemperatur',
            es: 'Temperatura objetivo',
          },
        },
      ],
    },
  };
}

/** The widget content for the current context. */
export function buildWidgetContent(gladys, context) {
  if (!isConfigured(context.config) || !context.spa) {
    return {
      ttl_seconds: 300,
      components: [
        {
          type: 'text',
          variant: 'body',
          text: {
            en: 'Type the address of the spa in the integration configuration.',
            fr: "Saisissez l'adresse du spa dans la configuration de l'intégration.",
            de: 'Gib die Adresse des Spas in der Konfiguration der Integration ein.',
            es: 'Introduzca la dirección del spa en la configuración de la integración.',
          },
        },
      ],
    };
  }
  const status = context.spa.status;
  const components = [
    {
      type: 'value',
      label: { en: 'Water', fr: 'Eau', de: 'Wasser', es: 'Agua' },
      icon: 'droplet',
      device_feature: featureExternalId(gladys, FEATURES.WATER_TEMPERATURE),
    },
    {
      type: 'value',
      label: { en: 'Target', fr: 'Consigne', de: 'Soll', es: 'Objetivo' },
      icon: 'target',
      device_feature: featureExternalId(gladys, FEATURES.TARGET_TEMPERATURE),
    },
    statusList(context),
  ];
  if (status) {
    components.push(...TOGGLES.map((toggle) => toggleButton(toggle, status)), targetButton(status));
  }
  return {
    // Nudged on every change: the TTL only catches a nudge lost while the
    // socket was down.
    ttl_seconds: 300,
    components,
  };
}

/**
 * A tapped button. `params` were written by buildWidgetContent, `values` typed
 * in the form of the target button.
 * @returns {Promise<Record<string, string>>} the toast
 */
export async function runWidgetAction(_gladys, { actionKey, params, values, context }) {
  logger.info(`onWidgetAction <- ${SPA_WIDGET}.${actionKey}`);
  const { spa } = context;
  if (!spa) {
    throw new Error('The address of the spa is not configured');
  }
  const toggle = TOGGLES.find((entry) => entry.action === actionKey);
  if (toggle) {
    const status = await spa.setFunction(toggle.fn, params?.on === true);
    return localize(
      (language) =>
        `${pick(language, WORDS[toggle.fn])}: ${pick(language, onOff(status[toggle.fn]))}`,
    );
  }
  if (actionKey === WIDGET_ACTIONS.TARGET) {
    // An older core drops the form and relays the tap without values.
    if (values?.temperature === undefined) {
      throw new Error('No temperature received: update Gladys to use this form');
    }
    const status = await spa.setTargetTemperature(values.temperature);
    return localize(
      (language) =>
        `${pick(language, { en: 'Target', fr: 'Consigne', de: 'Soll', es: 'Objetivo' })}: ${status.targetTemperature}°`,
    );
  }
  throw new Error(`Unknown widget action: ${actionKey}`);
}

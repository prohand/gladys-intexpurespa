// -----------------------------------------------------------------------------
// What the Configuration screen says about the link to the spa: the
// connection status under the title, and the answer of "Test the connection".
// -----------------------------------------------------------------------------

import { isConfigured } from './config.js';
import { localize, pick } from './i18n.js';

const UNIT_SYMBOLS = { celsius: '°C', fahrenheit: '°F' };

export const NOT_CONFIGURED = {
  en: 'Type the address of the spa (its IP on your network) to connect.',
  fr: "Saisissez l'adresse du spa (son IP sur votre réseau) pour vous connecter.",
  de: 'Gib die Adresse des Spas (seine IP in deinem Netzwerk) ein, um dich zu verbinden.',
  es: 'Introduzca la dirección del spa (su IP en su red) para conectarse.',
};

/** The connection status message when the spa does not answer. */
export function unreachableMessage(host, port) {
  return {
    en: `The spa at ${host}:${port} does not answer. Check that it is powered and on the Wi-Fi.`,
    fr: `Le spa à ${host}:${port} ne répond pas. Vérifiez qu'il est alimenté et sur le Wi-Fi.`,
    de: `Das Spa unter ${host}:${port} antwortet nicht. Prüfe Strom und WLAN-Verbindung.`,
    es: `El spa en ${host}:${port} no responde. Compruebe que está encendido y en el Wi-Fi.`,
  };
}

/** The status in one line, for the test answer. */
function describeStatus(language, status) {
  const unit = UNIT_SYMBOLS[status.unit];
  const water =
    status.waterTemperature === null
      ? pick(language, { en: 'unknown', fr: 'inconnue', de: 'unbekannt', es: 'desconocida' })
      : `${status.waterTemperature}${unit}`;
  const parts = [
    `${pick(language, { en: 'water', fr: 'eau', de: 'Wasser', es: 'agua' })} ${water}`,
    `${pick(language, { en: 'target', fr: 'consigne', de: 'Soll', es: 'objetivo' })} ${status.targetTemperature}${unit}`,
    `${pick(language, { en: 'heater', fr: 'chauffage', de: 'Heizung', es: 'calefacción' })} ${status.heater ? 'ON' : 'OFF'}`,
  ];
  if (status.errorCode) {
    parts.push(
      `${pick(language, { en: 'error', fr: 'erreur', de: 'Fehler', es: 'error' })} ${status.errorCode}`,
    );
  }
  return parts.join(', ');
}

/**
 * Handler of the `test_connection` manifest action.
 * @returns {Promise<Record<string, string>>} the message shown under the button
 */
export async function testConnection(context) {
  const { config, spa } = context;
  if (!isConfigured(config) || !spa) {
    return NOT_CONFIGURED;
  }
  let status;
  try {
    status = await spa.refresh();
  } catch {
    return unreachableMessage(config.host, config.port);
  }
  // The identity is a bonus: some firmwares never answer the info query.
  const info = await spa.getInfo().catch(() => null);
  return localize((language) => {
    const head = pick(language, {
      en: 'The spa answers',
      fr: 'Le spa répond',
      de: 'Das Spa antwortet',
      es: 'El spa responde',
    });
    const id = info?.uid ? ` (${info.uid})` : '';
    return `${head}${id}: ${describeStatus(language, status)}.`;
  });
}

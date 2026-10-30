// -----------------------------------------------------------------------------
// Entry point of the Intex PureSpa integration for Gladys Assistant.
//
// Environment variables provided by the Gladys supervisor to the container
// (read by the SDK, `new GladysIntegration()` is enough):
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
//
// The handlers are all in src/app.js, registered before connect().
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerIntegration } from './src/app.js';

const gladys = new GladysIntegration();
const integration = registerIntegration(gladys);

// A stray rejection is logged, never a reason to stop the container.
process.on('unhandledRejection', (err) => logger.error('Unhandled rejection', err));

// The SDK disconnects cleanly and exits with code 0 on SIGTERM/SIGINT.
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  integration.stop();
});

logger.info('Starting the Intex PureSpa integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});

import { buildModelGateway } from './app.js';
import { loadGatewayConfig } from './config.js';

const config = loadGatewayConfig();
const app = await buildModelGateway(config);

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'Shutting down CherryFin model gateway');
  await app.close();
  process.exit(0);
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

try {
  await app.listen({
    host: config.MODEL_GATEWAY_HOST,
    port: config.MODEL_GATEWAY_PORT
  });
} catch (error) {
  app.log.fatal({ err: error }, 'CherryFin model gateway failed to start');
  await app.close();
  process.exit(1);
}

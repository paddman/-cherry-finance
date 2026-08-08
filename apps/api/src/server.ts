import { Redis } from 'ioredis';
import { buildApp } from './app.js';
import { loadApiConfig } from './config.js';
import { createDatabase } from './database.js';
import { createReadinessCheck } from './readiness.js';
import {
  ensureDevelopmentUser,
  PostgresOrganizationRepository
} from './repositories/postgres-organizations.js';

const config = loadApiConfig();
const database = createDatabase(config.DATABASE_URL);
const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableReadyCheck: true
});

await redis.connect();
await ensureDevelopmentUser(database.db, config);

const app = await buildApp(config, {
  organizations: new PostgresOrganizationRepository(database.db),
  readiness: createReadinessCheck(config, database, redis)
});

app.addHook('onClose', async () => {
  await Promise.allSettled([database.close(), redis.quit()]);
});

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'Shutting down CherryFin API');
  await app.close();
  process.exit(0);
};

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (error) {
  app.log.fatal({ err: error }, 'CherryFin API failed to start');
  await app.close();
  process.exit(1);
}

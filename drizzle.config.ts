import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './packages/schemas/src/db/index.ts',
  out: './infra/migrations/generated',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://cherryfin:cherryfin@localhost:5432/cherryfin'
  },
  strict: true,
  verbose: true
});

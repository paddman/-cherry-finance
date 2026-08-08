import * as schema from '@cherryfin/schemas/db';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

export type Database = PostgresJsDatabase<typeof schema>;

export interface DatabaseResources {
  client: Sql;
  db: Database;
  close: () => Promise<void>;
}

export function createDatabase(databaseUrl: string): DatabaseResources {
  const client = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false
  });

  return {
    client,
    db: drizzle(client, { schema }),
    close: async () => {
      await client.end({ timeout: 5 });
    }
  };
}

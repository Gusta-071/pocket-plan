import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../generated/prisma/client.js';

const databaseUrl = process.env.DATABASE_URL ?? 'file:./data/pocket-plan.db';

// O SQLite cria o arquivo, mas não a pasta onde ele fica.
const databaseFile = databaseUrl.replace(/^file:/, '');
if (databaseFile !== ':memory:') mkdirSync(dirname(databaseFile), { recursive: true });

export const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: databaseUrl }),
});

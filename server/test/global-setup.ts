import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

/** Recria o banco de teste do zero aplicando as migrations. */
export default function setup() {
  // Num clone novo (como no CI), a pasta data/ ainda não existe.
  mkdirSync('data', { recursive: true });
  rmSync('data/test.db', { force: true });
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: 'file:./data/test.db' },
    stdio: 'ignore',
  });
}

// No Windows, o terminal do VS Code abre a pasta como "c:\..." (letra minúscula) e o
// Vitest carrega a si mesmo duas vezes, falhando com "failed to find the runner".
// Este script padroniza a letra do disco antes de iniciar o Vitest.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const upperDrive = (path) => path.replace(/^[a-z]:/, (drive) => drive.toUpperCase());
const cwd = upperDrive(process.cwd());
const vitest = upperDrive(fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)));
const { status } = spawnSync(process.execPath, [vitest, ...process.argv.slice(2)], { cwd, stdio: 'inherit' });
process.exit(status ?? 1);

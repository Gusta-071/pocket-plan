import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.API_PORT ?? '3333';

// No Windows, o terminal do VS Code abre a pasta como "c:\..." (minúsculo) e o Vite
// deixa de servir web/public (o ícone some). Padronizar a letra do disco evita isso.
const root = import.meta.dirname.replace(/^[a-z]:/, (drive) => drive.toUpperCase());

export default defineConfig({
  root,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': `http://localhost:${apiPort}` },
  },
  build: { outDir: '../dist/web', emptyOutDir: true },
});

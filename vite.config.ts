import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const DEV_REMINDER = "Reminder: Vite is for testing and development only. When using Vite, any IP address can access the admin page without a password. Use server for production by running 'npm run build' followed by 'npm run server'.";

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'dev-reminder',
      apply: 'serve',
      configureServer(server) {
        server.httpServer?.once('listening', () => {
          setTimeout(() => {
            server.config.logger.info(DEV_REMINDER);
          }, 50);
        });
      },
    },
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/ws': {
        target: 'ws://localhost:8787',
        ws: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'server/**/*.test.ts'],
  },
});

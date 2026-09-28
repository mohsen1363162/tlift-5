import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''),
    'import.meta.env.VITE_SYNC_API': JSON.stringify('/api/sync.php'),
  },
  build: {
    outDir: 'node_modules/.cache/tlift-integration',
    rollupOptions: { input: 'tests/harness/index.html' },
  },
  preview: { host: '0.0.0.0', port: 4174, allowedHosts: true },
});

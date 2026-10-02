import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = path.join(root, 'audio', '2時のデバッグ.wav');

// The song lives outside app/ (and has a Japanese file name): serve it at /audio/song.wav.
function projectAssets(): Plugin {
  return {
    name: 'project-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0]!);
        if (url !== '/audio/song.wav') return next();
        const stat = fs.statSync(AUDIO);
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Length', String(stat.size));
        fs.createReadStream(AUDIO).pipe(res);
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  // relative base for the static website build (served from /<repo>/ on GitHub Pages)
  base: command === 'build' ? './' : '/',
  plugins: [projectAssets()],
  // LNC_NO_HMR=1: no live reload (an export must not reload mid-run when a file changes)
  server: { port: 5173, hmr: process.env.LNC_NO_HMR ? false : undefined, fs: { allow: [root] } },
  build: { target: 'esnext', assetsInlineLimit: 0, chunkSizeWarningLimit: 4000 },
}));

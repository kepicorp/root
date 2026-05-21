// Minimal static file handler for the built React bundle, with SPA fallback.
// No external dep — keeps the container slim.

import { createReadStream, statSync, existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2':'font/woff2',
  '.txt':  'text/plain; charset=utf-8',
  '.map':  'application/json; charset=utf-8',
};

export function makeStaticHandler(rootDir: string) {
  const root = resolve(rootDir);
  return (req: IncomingMessage, res: ServerResponse): boolean => {
    if (!existsSync(root)) return false;
    const rawPath = (req.url ?? '/').split('?')[0] ?? '/';
    const pathPart = rawPath === '/' ? '/index.html' : rawPath;
    let filePath = normalize(join(root, pathPart));
    // Guard against path traversal.
    if (!filePath.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return true; }
    let stat;
    try { stat = statSync(filePath); } catch { stat = null; }
    if (!stat || !stat.isFile()) {
      // SPA fallback: serve index.html for unknown routes.
      filePath = join(root, 'index.html');
      try { stat = statSync(filePath); } catch { return false; }
      if (!stat.isFile()) return false;
    }
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    createReadStream(filePath).pipe(res);
    return true;
  };
}

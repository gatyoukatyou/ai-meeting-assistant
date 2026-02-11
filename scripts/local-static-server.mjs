/**
 * Shared local static server helper for Playwright smoke tests.
 *
 * - Reuses an already running server when available.
 * - Starts an in-process static file server when no server is listening.
 * - Protects against path traversal by enforcing repository-root boundaries.
 */

import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function resolveRequestPath(rootDir, urlPathname) {
  const sanitized = urlPathname === '/' ? '/index.html' : urlPathname;
  const relativePath = sanitized.startsWith('/') ? sanitized.slice(1) : sanitized;
  const resolvedPath = path.resolve(rootDir, relativePath);
  const insideRoot = resolvedPath === rootDir || resolvedPath.startsWith(`${rootDir}${path.sep}`);
  return insideRoot ? resolvedPath : null;
}

function createStaticServer({ rootDir, baseUrl }) {
  return createServer(async (req, res) => {
    const method = req.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    let requestPath;
    try {
      const requestUrl = new URL(req.url || '/', baseUrl);
      requestPath = resolveRequestPath(rootDir, decodeURIComponent(requestUrl.pathname));
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    if (!requestPath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    try {
      let filePath = requestPath;
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

      const body = await fs.readFile(filePath);
      res.writeHead(200, {
        'Content-Type': getMimeType(filePath),
        'Cache-Control': 'no-cache'
      });
      if (method === 'HEAD') {
        res.end();
        return;
      }
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    }
  });
}

async function probeServer(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/index.html`, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

function listen(server, { port, host }) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close(err => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function getLocalServerConfig(options = {}) {
  const port = Number(options.port || process.env.PORT || 8080);
  const host = options.host || 'localhost';
  const rootDir = options.rootDir || DEFAULT_ROOT_DIR;
  const baseUrl = `http://${host}:${port}`;
  return { port, host, rootDir, baseUrl };
}

export async function ensureLocalStaticServer(options = {}) {
  const config = getLocalServerConfig(options);
  const { port, host, rootDir, baseUrl } = config;

  if (await probeServer(baseUrl)) {
    return {
      ...config,
      reused: true,
      async stop() {}
    };
  }

  const server = createStaticServer({ rootDir, baseUrl });
  await listen(server, { port, host });

  let stopped = false;
  return {
    ...config,
    reused: false,
    async stop() {
      if (stopped) return;
      stopped = true;
      await close(server);
    }
  };
}

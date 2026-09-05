import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(__dirname, '..');
const OPENAI_CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets';
export const REALTIME_MODEL = 'gpt-realtime-2.1';
export const REALTIME_TOKEN_PATH = '/api/realtime/client-secret';
export const DEFAULT_PORT = 8787;
const MAX_REQUEST_BODY_BYTES = 16 * 1024;

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

function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function errorBody(code, message) {
  return { error: { code, message } };
}

function getSessionConfig(model = REALTIME_MODEL) {
  return {
    session: {
      type: 'realtime',
      model,
      instructions:
        '日本語で短く自然に回答してください。会議の音声アシスタントとして、回答は30秒以内を目安にしてください。',
      audio: {
        input: {
          turn_detection: {
            type: 'server_vad',
            create_response: true,
            interrupt_response: true
          }
        },
        output: { voice: 'marin' }
      }
    }
  };
}

export async function requestClientSecret({
  apiKey,
  fetchImpl = fetch,
  model = REALTIME_MODEL
} = {}) {
  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    return {
      status: 503,
      body: errorBody('missing_api_key', 'ローカルサーバーにOPENAI_API_KEYが設定されていません。')
    };
  }

  let response;
  try {
    response = await fetchImpl(OPENAI_CLIENT_SECRETS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(getSessionConfig(model))
    });
  } catch (_) {
    return {
      status: 502,
      body: errorBody('openai_network', 'OpenAI Realtime APIへ接続できませんでした。')
    };
  }

  if (response.ok) {
    let data;
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }
    if (data && typeof data.value === 'string' && data.value.length > 0) {
      // Return only the short-lived client secret. Never return the standard key.
      return { status: 200, body: { value: data.value } };
    }
    return {
      status: 502,
      body: errorBody(
        'openai_invalid_response',
        'OpenAI Realtime APIの応答を確認できませんでした。'
      )
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      status: 502,
      body: errorBody('openai_authentication', 'OpenAI APIキーの認証に失敗しました。')
    };
  }
  if (response.status === 429) {
    return {
      status: 429,
      body: errorBody(
        'rate_limited',
        'OpenAI Realtime APIの利用上限に達しました。時間をおいて再試行してください。'
      )
    };
  }
  if (response.status >= 500 || response.status === 408) {
    return {
      status: 502,
      body: errorBody('openai_server_error', 'OpenAI Realtime APIで一時的な障害が発生しています。')
    };
  }
  return {
    status: 502,
    body: errorBody('openai_request_failed', 'OpenAI Realtime APIへのリクエストに失敗しました。')
  };
}

export class TokenRateLimiter {
  constructor({ maxRequests = 3, windowMs = 60_000, now = () => Date.now() } = {}) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.now = now;
    this.hits = new Map();
  }

  allow(key) {
    const current = this.now();
    const recent = (this.hits.get(key) || []).filter(
      timestamp => current - timestamp < this.windowMs
    );
    if (recent.length >= this.maxRequests) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(current);
    this.hits.set(key, recent);
    return true;
  }
}

function isLoopbackRequest(req, port) {
  const host = String(req.headers?.host || '')
    .split(':')[0]
    .replace(/^\[/, '')
    .replace(/\]$/, '');
  if (host && !['127.0.0.1', 'localhost', '::1'].includes(host)) return false;
  const origin = req.headers?.origin;
  if (!origin) return true;
  return [`http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://[::1]:${port}`].includes(
    origin
  );
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_REQUEST_BODY_BYTES) {
        reject(Object.assign(new Error('request too large'), { code: 'too_large' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function serveStatic(req, res, rootDir, baseUrl) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    jsonResponse(res, 405, errorBody('method_not_allowed', 'Method Not Allowed'));
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || '/', baseUrl).pathname);
  } catch (_) {
    jsonResponse(res, 400, errorBody('bad_request', 'Bad Request'));
    return;
  }
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(rootDir, relativePath);
  if (filePath !== rootDir && !filePath.startsWith(`${rootDir}${path.sep}`)) {
    jsonResponse(res, 403, errorBody('forbidden', 'Forbidden'));
    return;
  }
  try {
    let target = filePath;
    const stat = await fs.stat(target);
    if (stat.isDirectory()) target = path.join(target, 'index.html');
    const body = await fs.readFile(target);
    res.writeHead(200, {
      'Content-Type': getMimeType(target),
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (_) {
    jsonResponse(res, 404, errorBody('not_found', 'Not Found'));
  }
}

export function createRealtimeRequestHandler({
  rootDir = DEFAULT_ROOT_DIR,
  port = DEFAULT_PORT,
  env = process.env,
  fetchImpl = fetch,
  limiter = new TokenRateLimiter()
} = {}) {
  const baseUrl = `http://127.0.0.1:${port}`;
  return async function handleRequest(req, res) {
    let requestUrl;
    try {
      requestUrl = new URL(req.url || '/', baseUrl);
    } catch (_) {
      jsonResponse(res, 400, errorBody('bad_request', 'Bad Request'));
      return;
    }
    if (requestUrl.pathname === REALTIME_TOKEN_PATH) {
      if (req.method !== 'POST') {
        jsonResponse(res, 405, errorBody('method_not_allowed', 'POST only'));
        return;
      }
      if (!isLoopbackRequest(req, port)) {
        jsonResponse(
          res,
          403,
          errorBody('local_only', 'この機能はローカル接続からのみ利用できます。')
        );
        return;
      }
      if (!limiter.allow(req.socket?.remoteAddress || 'local')) {
        jsonResponse(
          res,
          429,
          errorBody(
            'rate_limited_local',
            '短時間の連続発行を制限しています。少し待ってから再試行してください。'
          )
        );
        return;
      }
      try {
        await readRequestBody(req);
      } catch (error) {
        if (error.code === 'too_large') {
          jsonResponse(res, 413, errorBody('payload_too_large', 'リクエストが大きすぎます。'));
          return;
        }
        jsonResponse(res, 400, errorBody('bad_request', 'リクエストを読み取れませんでした。'));
        return;
      }
      const result = await requestClientSecret({
        apiKey: env.OPENAI_API_KEY,
        fetchImpl,
        model: REALTIME_MODEL
      });
      jsonResponse(res, result.status, result.body);
      return;
    }

    if (requestUrl.pathname === '/api/realtime/health' && req.method === 'GET') {
      if (!isLoopbackRequest(req, port)) {
        jsonResponse(
          res,
          403,
          errorBody('local_only', 'この機能はローカル接続からのみ利用できます。')
        );
        return;
      }
      jsonResponse(res, 200, { ok: true, model: REALTIME_MODEL });
      return;
    }

    await serveStatic(req, res, rootDir, baseUrl);
  };
}

export function createRealtimeLocalServer(options = {}) {
  const port = Number(
    options.port || process.env.REALTIME_PORT || process.env.PORT || DEFAULT_PORT
  );
  const host = options.host || '127.0.0.1';
  const handler = createRealtimeRequestHandler({ ...options, port });
  return { server: createServer(handler), port, host };
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
}

async function main() {
  const { server, port, host } = createRealtimeLocalServer();
  await listen(server, port, host);
  console.log(`[realtime] Local server: http://${host}:${port}`);
  console.log(`[realtime] Model: ${REALTIME_MODEL}`);
  console.log(`[realtime] OPENAI_API_KEY configured: ${process.env.OPENAI_API_KEY ? 'yes' : 'no'}`);
  const shutdown = () => server.close(() => process.exit(0));
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`[realtime] Local server failed: ${error.name || 'Error'}`);
    process.exit(1);
  });
}

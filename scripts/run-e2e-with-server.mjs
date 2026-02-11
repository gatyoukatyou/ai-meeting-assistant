/**
 * Run Playwright E2E smoke tests with an auto-started local static server.
 *
 * This keeps `npm run test:e2e` self-contained:
 * - Reuses an already running server on PORT when available.
 * - Starts a temporary static server when no server is listening.
 * - Always shuts down the temporary server on exit.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { ensureLocalStaticServer, getLocalServerConfig } from './local-static-server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8080);

function runNpmScript(scriptName) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, ['run', scriptName], {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        PORT: String(PORT)
      },
      stdio: 'inherit'
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`npm run ${scriptName} failed (code=${code}, signal=${signal || 'none'})`));
    });
  });
}

async function main() {
  const server = await ensureLocalStaticServer({ port: PORT });
  const { baseUrl } = getLocalServerConfig({ port: PORT });

  if (server.reused) {
    console.log(`[e2e] Reusing existing server: ${baseUrl}`);
  } else {
    console.log(`[e2e] Started static server: ${baseUrl}`);
  }

  try {
    await runNpmScript('test:model-registry');
    await runNpmScript('test:upload');
  } finally {
    if (!server.reused) {
      await server.stop();
      console.log('[e2e] Stopped static server');
    }
  }
}

main().catch(error => {
  console.error(`[e2e] ${error.message}`);
  process.exit(1);
});

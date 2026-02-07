/**
 * Shared helpers for E2E upload tests
 *
 * Provides common utilities used by test-upload-basic, test-upload-formats,
 * and test-upload-edge to eliminate boilerplate duplication.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PORT = process.env.PORT || 8080;
export const BASE_URL = `http://localhost:${PORT}`;
export const TEST_FILES = path.join(__dirname, 'test-files');

export function createResultTracker() {
  const results = [];

  function record(section, file, expected, actual) {
    const passed = actual.status === expected;
    results.push({ section, file, expected, ...actual, passed });
    const icon = passed ? '\u2713' : '\u2717';
    const color = passed ? '\x1b[32m' : '\x1b[31m';
    console.log(`${color}${icon}\x1b[0m [${section}] ${file}: ${actual.status} (expected: ${expected})`);
    if (!passed) {
      console.log(`    actual: ${JSON.stringify(actual)}`);
    }
  }

  return { results, record };
}

export async function setupPage(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', () => {});

  await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'networkidle', timeout: 30000 });

  await page.evaluate(() => {
    SecureStorage.setOption('enhancedContext', true);
    SecureStorage.setOption('persistMeetingContext', true);
  });
  await page.reload({ waitUntil: 'networkidle' });

  return { page, context };
}

export async function openContextModal(page) {
  await page.click('#openContextModalBtn');
  await page.waitForSelector('#contextModal.active', { timeout: 5000 });
}

export async function uploadAndWait(page, filePath) {
  await page.setInputFiles('#contextFileInput', filePath);

  await page.waitForFunction(() => {
    const ctx = meetingContext;
    if (!ctx || !ctx.files || ctx.files.length === 0) return false;
    return !ctx.files.some(f => f.status === 'loading');
  }, { timeout: 30000 });

  return page.evaluate(() => {
    const files = meetingContext?.files || [];
    const last = files[files.length - 1];
    if (!last) return { status: 'no_file', charCount: 0, warning: '', errorType: '' };
    return {
      status: last.status,
      charCount: last.charCount || 0,
      warning: last.errorMessage || '',
      errorType: last.errorMessage || ''
    };
  });
}

export async function writeSummary(label, results, jsonFileName) {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`\n=== ${label}: ${passed} passed, ${failed} failed ===`);

  const outPath = path.join(TEST_FILES, jsonFileName);
  const fs = await import('node:fs');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Results written to ${outPath}`);

  return failed;
}

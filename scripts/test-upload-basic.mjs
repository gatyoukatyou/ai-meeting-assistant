/**
 * UI・基本動作テスト
 *
 * Issue #39 §1-§2: コンテキストモーダルUI確認 + TXT基本動作
 *
 * Run: node scripts/test-upload-basic.mjs
 * Requires: Playwright, local server on PORT (default 8080)
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_FILES = path.join(__dirname, 'test-files');
const PORT = process.env.PORT || 8080;
const BASE_URL = `http://localhost:${PORT}`;

const results = [];

function record(section, file, expected, actual) {
  const passed = actual.status === expected;
  results.push({ section, file, expected, ...actual, passed });
  const icon = passed ? '✓' : '✗';
  const color = passed ? '\x1b[32m' : '\x1b[31m';
  console.log(`${color}${icon}\x1b[0m [${section}] ${file}: ${actual.status} (expected: ${expected})`);
  if (!passed) {
    console.log(`    actual: ${JSON.stringify(actual)}`);
  }
}

async function setupPage(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect console for debugging
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));

  // Navigate
  await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'networkidle', timeout: 30000 });

  // Enable enhanced context
  await page.evaluate(() => {
    SecureStorage.setOption('enhancedContext', true);
    SecureStorage.setOption('persistMeetingContext', true);
  });
  await page.reload({ waitUntil: 'networkidle' });

  return { page, context, logs };
}

async function openContextModal(page) {
  await page.click('#openContextModalBtn');
  await page.waitForSelector('#contextModal.active', { timeout: 5000 });
}

async function uploadAndWait(page, filePath) {
  await page.setInputFiles('#contextFileInput', filePath);

  // Wait for processing to complete
  await page.waitForFunction(() => {
    const ctx = meetingContext;
    if (!ctx || !ctx.files || ctx.files.length === 0) return false;
    return !ctx.files.some(f => f.status === 'loading');
  }, { timeout: 30000 });

  // Get file result
  return page.evaluate(() => {
    const files = meetingContext?.files || [];
    const last = files[files.length - 1];
    if (!last) return { status: 'no_file' };
    return {
      status: last.status,
      charCount: last.charCount || 0,
      warning: last.errorMessage || '',
      errorType: last.errorMessage || ''
    };
  });
}

// ==========================
// §1 UI Tests
// ==========================
async function testUI(browser) {
  console.log('\n--- §1 UI Tests ---');
  const { page, context } = await setupPage(browser);

  try {
    await openContextModal(page);

    // 1a. ドロップゾーンヒント確認
    const hint = await page.textContent('.file-drop-hint');
    const hintOk = hint && (hint.includes('TXT') || hint.includes('PDF') || hint.includes('DOCX') || hint.includes('CSV'));
    record('§1', 'drop-zone-hint', 'success', {
      status: hintOk ? 'success' : 'fail',
      charCount: 0,
      warning: hintOk ? '' : `Hint text: "${hint}"`
    });

    // 1b. ファイルセクションが表示されているか
    const sectionVisible = await page.evaluate(() => {
      const el = document.getElementById('contextFileUploadSection');
      return el && el.style.display !== 'none';
    });
    record('§1', 'file-section-visible', 'success', {
      status: sectionVisible ? 'success' : 'fail',
      charCount: 0,
      warning: ''
    });

    // 1c. accept属性の確認
    const accept = await page.getAttribute('#contextFileInput', 'accept');
    const hasRequired = accept && accept.includes('.pdf') && accept.includes('.docx') && accept.includes('.csv');
    record('§1', 'accept-attribute', 'success', {
      status: hasRequired ? 'success' : 'fail',
      charCount: 0,
      warning: hasRequired ? '' : `accept="${accept}"`
    });

  } finally {
    await context.close();
  }
}

// ==========================
// §2 TXT Basic Tests
// ==========================
async function testTxtBasic(browser) {
  console.log('\n--- §2 TXT Basic Tests ---');

  // 2a. Normal TXT upload
  {
    const { page, context } = await setupPage(browser);
    try {
      await openContextModal(page);
      const result = await uploadAndWait(page, path.join(TEST_FILES, 'test-text.txt'));
      const ok = result.status === 'success' && result.charCount > 0;
      record('§2', 'test-text.txt', 'success', {
        status: ok ? 'success' : 'fail',
        charCount: result.charCount,
        warning: result.warning
      });
    } finally {
      await context.close();
    }
  }

  // 2b. charCount verification
  {
    const { page, context } = await setupPage(browser);
    try {
      await openContextModal(page);
      const result = await uploadAndWait(page, path.join(TEST_FILES, 'test-text.txt'));
      const charOk = result.charCount === 500;
      record('§2', 'txt-charCount=500', 'success', {
        status: charOk ? 'success' : 'fail',
        charCount: result.charCount,
        warning: charOk ? '' : `Expected 500, got ${result.charCount}`
      });
    } finally {
      await context.close();
    }
  }

  // 2c. Multiple files
  {
    const { page, context } = await setupPage(browser);
    try {
      await openContextModal(page);

      // Upload first file
      await uploadAndWait(page, path.join(TEST_FILES, 'test-text.txt'));

      // Upload second file
      await page.setInputFiles('#contextFileInput', path.join(TEST_FILES, 'test-small.csv'));
      await page.waitForFunction(() => {
        const ctx = meetingContext;
        if (!ctx || !ctx.files) return false;
        return ctx.files.length >= 2 && !ctx.files.some(f => f.status === 'loading');
      }, { timeout: 30000 });

      const fileCount = await page.evaluate(() => meetingContext?.files?.length || 0);
      record('§2', 'multiple-files', 'success', {
        status: fileCount >= 2 ? 'success' : 'fail',
        charCount: fileCount,
        warning: fileCount >= 2 ? '' : `Only ${fileCount} files`
      });
    } finally {
      await context.close();
    }
  }
}

// ==========================
// Main
// ==========================
async function main() {
  console.log('=== Upload Basic Tests (§1-§2) ===');
  console.log(`Server: ${BASE_URL}\n`);

  const browser = await chromium.launch();

  try {
    await testUI(browser);
    await testTxtBasic(browser);
  } catch (err) {
    console.error('\nFatal error:', err.message);
    results.push({
      section: 'FATAL', file: 'error', expected: 'success',
      status: 'fail', charCount: 0, warning: err.message, passed: false
    });
  } finally {
    await browser.close();
  }

  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`\n=== Basic Tests: ${passed} passed, ${failed} failed ===`);

  // Output JSON for aggregation
  const outPath = path.join(__dirname, 'test-files', 'results-basic.json');
  const fs = await import('node:fs');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Results written to ${outPath}`);

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

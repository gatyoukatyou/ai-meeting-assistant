/**
 * 上限制御・セキュリティ・異常系テスト
 *
 * Issue #39 §6-§8: 文字数/ページ制限、リロード復元、異常系
 *
 * Run: node scripts/test-upload-edge.mjs
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
  page.on('console', () => {});

  await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'networkidle', timeout: 30000 });

  await page.evaluate(() => {
    SecureStorage.setOption('enhancedContext', true);
    SecureStorage.setOption('persistMeetingContext', true);
  });
  await page.reload({ waitUntil: 'networkidle' });

  return { page, context };
}

async function openContextModal(page) {
  await page.click('#openContextModalBtn');
  await page.waitForSelector('#contextModal.active', { timeout: 5000 });
}

async function uploadAndWait(page, filePath) {
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

// ==========================
// §6 Limit Control Tests
// ==========================
async function testLimits(browser) {
  console.log('\n--- §6 Limit Control Tests ---');

  // 6a. Large TXT (60,000 chars) → truncated to EXTRACTION_MAX_CHARS
  {
    const { page, context } = await setupPage(browser);
    try {
      await openContextModal(page);
      const result = await uploadAndWait(page, path.join(TEST_FILES, 'test-large.txt'));
      // App level truncation: CONTEXT_MAX_CHARS_PER_FILE = 2000
      // FileExtractor truncation: EXTRACTION_MAX_CHARS = 50000
      // Combined: charCount should be <= 2000 (app-level limit kicks in)
      const truncated = result.charCount <= 2000;
      const hasWarning = result.warning && result.warning.includes('TRUNCATED');
      record('§6', 'test-large.txt (50k limit)', 'warning', {
        status: (truncated || hasWarning) ? 'warning' : result.status,
        charCount: result.charCount,
        warning: result.warning || `charCount=${result.charCount}`
      });
    } finally {
      await context.close();
    }
  }

  // 6b. 25-page PDF → truncated at PDF_MAX_PAGES=20
  {
    const { page, context } = await setupPage(browser);
    try {
      await openContextModal(page);
      const result = await uploadAndWait(page, path.join(TEST_FILES, 'test-25pages.pdf'));
      // Should show TRUNCATED warning due to page limit
      const hasWarning = result.warning && result.warning.includes('TRUNCATED');
      record('§6', 'test-25pages.pdf (20p limit)', 'warning', {
        status: (hasWarning || result.status === 'warning') ? 'warning' : result.status,
        charCount: result.charCount,
        warning: result.warning
      });
    } finally {
      await context.close();
    }
  }
}

// ==========================
// §7 Reload Persistence Tests
// ==========================
async function testReloadPersistence(browser) {
  console.log('\n--- §7 Reload Persistence Tests ---');

  const { page, context } = await setupPage(browser);
  try {
    await openContextModal(page);

    // Upload a file
    await uploadAndWait(page, path.join(TEST_FILES, 'test-text.txt'));

    // Save context
    await page.click('#saveContextBtn');
    await page.waitForTimeout(500);

    // 7a. Check that context persists in storage
    const prePersist = await page.evaluate(() => {
      const stored = localStorage.getItem('_meetingContext');
      if (!stored) return { found: false };
      const ctx = JSON.parse(stored);
      return {
        found: true,
        filesCount: ctx.files?.length || 0,
        hasExtractedText: ctx.files?.some(f => f.extractedText && f.extractedText.length > 0) || false
      };
    });
    record('§7', 'context-persisted', 'success', {
      status: prePersist.found && prePersist.filesCount > 0 ? 'success' : 'fail',
      charCount: prePersist.filesCount,
      warning: prePersist.found ? '' : 'Not found in localStorage'
    });

    // 7b. Reload and check restoration
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const postReload = await page.evaluate(() => {
      const ctx = meetingContext;
      return {
        hasFiles: (ctx?.files?.length || 0) > 0,
        filesCount: ctx?.files?.length || 0,
        firstFileName: ctx?.files?.[0]?.name || ''
      };
    });
    record('§7', 'context-restored-after-reload', 'success', {
      status: postReload.hasFiles ? 'success' : 'fail',
      charCount: postReload.filesCount,
      warning: postReload.hasFiles ? '' : 'Files not restored'
    });

    // 7c. File metadata check after reload
    record('§7', 'file-metadata-preserved', 'success', {
      status: postReload.firstFileName === 'test-text.txt' ? 'success' : 'fail',
      charCount: 0,
      warning: postReload.firstFileName ? `name=${postReload.firstFileName}` : 'No file name'
    });

    // 7d. base64Data NON-persistence (security check)
    const storageCheck = await page.evaluate(() => {
      const stored = localStorage.getItem('_meetingContext');
      if (!stored) return { found: false, hasBase64: false };
      const ctx = JSON.parse(stored);
      return {
        found: true,
        filesCount: ctx.files?.length || 0,
        hasBase64: ctx.files?.some(f => f.base64Data != null && f.base64Data !== '') || false,
        // Also check raw string for any base64-looking data
        rawHasBase64Key: stored.includes('"base64Data"')
      };
    });
    record('§7', 'base64Data-not-persisted', 'success', {
      status: (!storageCheck.hasBase64 && !storageCheck.rawHasBase64Key) ? 'success' : 'fail',
      charCount: 0,
      warning: storageCheck.hasBase64 ? 'base64Data found in storage!' : '',
      errorType: storageCheck.rawHasBase64Key ? 'base64Data key present in JSON' : ''
    });

  } finally {
    await context.close();
  }
}

// ==========================
// §8 Error/Edge Case Tests
// ==========================
async function testEdgeCases(browser) {
  console.log('\n--- §8 Edge Case Tests ---');

  // 8a. PNG rejection (unsupported format)
  {
    const { page, context } = await setupPage(browser);
    try {
      await openContextModal(page);

      // Capture toast messages
      await page.evaluate(() => {
        window._testToasts = [];
        const orig = window.showToast;
        window.showToast = function(msg, type) {
          window._testToasts.push({ msg, type });
          if (orig) orig.call(this, msg, type);
        };
      });

      await page.setInputFiles('#contextFileInput', path.join(TEST_FILES, 'test-image.png'));

      // Wait a bit for processing
      await page.waitForTimeout(2000);

      // Check: either file was rejected (not added) or added with error status
      const pngResult = await page.evaluate(() => {
        const files = meetingContext?.files || [];
        const pngFile = files.find(f => f.name === 'test-image.png');
        if (!pngFile) return { status: 'rejected', charCount: 0, warning: 'File not added (filtered by accept)' };
        return {
          status: pngFile.status,
          charCount: pngFile.charCount || 0,
          warning: pngFile.errorMessage || '',
          errorType: pngFile.errorMessage || ''
        };
      });

      // PNG should be rejected or error
      const pngOk = pngResult.status === 'rejected' || pngResult.status === 'error';
      record('§8', 'test-image.png (reject)', 'success', {
        status: pngOk ? 'success' : 'fail',
        charCount: pngResult.charCount,
        warning: pngResult.warning || pngResult.status
      });
    } finally {
      await context.close();
    }
  }

  // 8b. File size rejection (3MB > 2MB limit)
  {
    const { page, context } = await setupPage(browser);
    try {
      await openContextModal(page);

      // Track toasts
      await page.evaluate(() => {
        window._testToasts = [];
        const orig = window.showToast;
        window.showToast = function(msg, type) {
          window._testToasts.push({ msg, type });
          if (orig) orig.call(this, msg, type);
        };
      });

      await page.setInputFiles('#contextFileInput', path.join(TEST_FILES, 'test-3mb.txt'));

      await page.waitForTimeout(2000);

      const sizeResult = await page.evaluate(() => {
        const files = meetingContext?.files || [];
        const bigFile = files.find(f => f.name === 'test-3mb.txt');
        const toasts = window._testToasts || [];
        const sizeToast = toasts.find(t => t.type === 'error' || (t.msg && t.msg.includes('MB')));
        if (!bigFile && sizeToast) return { status: 'rejected', charCount: 0, warning: sizeToast.msg };
        if (!bigFile) return { status: 'rejected', charCount: 0, warning: 'File not added' };
        return {
          status: bigFile.status,
          charCount: bigFile.charCount || 0,
          warning: bigFile.errorMessage || ''
        };
      });

      // Should be rejected (not added to files list)
      record('§8', 'test-3mb.txt (size reject)', 'success', {
        status: sizeResult.status === 'rejected' ? 'success' : 'fail',
        charCount: sizeResult.charCount,
        warning: sizeResult.warning
      });
    } finally {
      await context.close();
    }
  }

  // 8c. Duplicate file rejection
  {
    const { page, context } = await setupPage(browser);
    try {
      await openContextModal(page);

      // Upload first
      await uploadAndWait(page, path.join(TEST_FILES, 'test-text.txt'));

      // Track toasts
      await page.evaluate(() => {
        window._testToasts = [];
        const orig = window.showToast;
        window.showToast = function(msg, type) {
          window._testToasts.push({ msg, type });
          if (orig) orig.call(this, msg, type);
        };
      });

      // Try uploading the same file again
      await page.setInputFiles('#contextFileInput', path.join(TEST_FILES, 'test-text.txt'));
      await page.waitForTimeout(2000);

      const dupResult = await page.evaluate(() => {
        const files = meetingContext?.files || [];
        const matchCount = files.filter(f => f.name === 'test-text.txt').length;
        const toasts = window._testToasts || [];
        const dupToast = toasts.find(t => t.type === 'warning');
        return {
          count: matchCount,
          toast: dupToast?.msg || ''
        };
      });

      record('§8', 'duplicate-file-reject', 'success', {
        status: dupResult.count === 1 ? 'success' : 'fail',
        charCount: dupResult.count,
        warning: dupResult.toast || `Duplicate count: ${dupResult.count}`
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
  console.log('=== Upload Edge Case Tests (§6-§8) ===');
  console.log(`Server: ${BASE_URL}\n`);

  const browser = await chromium.launch();

  try {
    await testLimits(browser);
    await testReloadPersistence(browser);
    await testEdgeCases(browser);
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
  console.log(`\n=== Edge Tests: ${passed} passed, ${failed} failed ===`);

  // Output JSON
  const outPath = path.join(__dirname, 'test-files', 'results-edge.json');
  const fs = await import('node:fs');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Results written to ${outPath}`);

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

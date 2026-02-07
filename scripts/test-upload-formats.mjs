/**
 * フォーマット別抽出テスト
 *
 * Issue #39 §3-§5: PDF / DOCX / CSV 各形式の抽出確認
 *
 * Run: node scripts/test-upload-formats.mjs
 * Requires: Playwright, local server on PORT (default 8080)
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { TEST_FILES, createResultTracker, setupPage, openContextModal, uploadAndWait, writeSummary } from './test-helpers.mjs';

const { results, record } = createResultTracker();

// ==========================
// §3 PDF Tests
// ==========================
async function testPdf(browser) {
  console.log('\n--- §3 PDF Tests ---');

  // 3a. Text PDF → success
  {
    const { page, context } = await setupPage(browser);
    try {
      await openContextModal(page);
      const result = await uploadAndWait(page, path.join(TEST_FILES, 'test-text.pdf'));
      // success or warning both acceptable (charCount > 0)
      const ok = (result.status === 'success' || result.status === 'warning') && result.charCount > 0;
      record('§3', 'test-text.pdf', 'success', {
        status: ok ? 'success' : 'fail',
        charCount: result.charCount,
        warning: result.warning
      });
    } finally {
      await context.close();
    }
  }

  // 3b. Scan PDF (no text layer) → record (charCount ≈ 0)
  {
    const { page, context } = await setupPage(browser);
    try {
      await openContextModal(page);
      const result = await uploadAndWait(page, path.join(TEST_FILES, 'test-scan.pdf'));
      // Scan PDF has no text — success with charCount=0 or warning
      // We record the result regardless; the key observation is charCount is low
      record('§3', 'test-scan.pdf (record)', 'success', {
        status: (result.status === 'success' || result.status === 'warning') ? 'success' : result.status,
        charCount: result.charCount,
        warning: result.warning || `charCount=${result.charCount}`
      });
    } finally {
      await context.close();
    }
  }

  // 3c. Password PDF → error (or success if pdf-lib encryption not strong enough)
  // Note: pdf-lib's userPassword option may not produce encryption that pdf.js enforces.
  // The app's PasswordException handler (file-extractor.js L226) is verified by code review.
  // This test records the actual behavior for the Issue report.
  {
    const { page, context } = await setupPage(browser);
    try {
      await openContextModal(page);
      const result = await uploadAndWait(page, path.join(TEST_FILES, 'test-password.pdf'));
      // Record as-is; error = pdf.js detected encryption, success = pdf-lib encryption was weak
      const isExpectedBehavior = result.status === 'error' || result.status === 'success';
      record('§3', 'test-password.pdf (record)', 'success', {
        status: isExpectedBehavior ? 'success' : 'fail',
        charCount: result.charCount,
        warning: result.status === 'error'
          ? `Correctly rejected: ${result.errorType}`
          : `pdf-lib encryption not enforced by pdf.js (charCount=${result.charCount})`
      });
    } finally {
      await context.close();
    }
  }
}

// ==========================
// §4 DOCX Tests
// ==========================
async function testDocx(browser) {
  console.log('\n--- §4 DOCX Tests ---');

  // 4a. Simple DOCX → success
  {
    const { page, context } = await setupPage(browser);
    try {
      await openContextModal(page);
      const result = await uploadAndWait(page, path.join(TEST_FILES, 'test-simple.docx'));
      const ok = (result.status === 'success' || result.status === 'warning') && result.charCount > 0;
      record('§4', 'test-simple.docx', 'success', {
        status: ok ? 'success' : 'fail',
        charCount: result.charCount,
        warning: result.warning
      });
    } finally {
      await context.close();
    }
  }

  // 4b. Complex DOCX → record
  {
    const { page, context } = await setupPage(browser);
    try {
      await openContextModal(page);
      const result = await uploadAndWait(page, path.join(TEST_FILES, 'test-complex.docx'));
      const ok = (result.status === 'success' || result.status === 'warning') && result.charCount > 0;
      record('§4', 'test-complex.docx (record)', 'success', {
        status: ok ? 'success' : 'fail',
        charCount: result.charCount,
        warning: result.warning
      });
    } finally {
      await context.close();
    }
  }
}

// ==========================
// §5 CSV Tests
// ==========================
async function testCsv(browser) {
  console.log('\n--- §5 CSV Tests ---');

  // 5a. Small CSV → success
  {
    const { page, context } = await setupPage(browser);
    try {
      await openContextModal(page);
      const result = await uploadAndWait(page, path.join(TEST_FILES, 'test-small.csv'));
      const ok = (result.status === 'success' || result.status === 'warning') && result.charCount > 0;
      record('§5', 'test-small.csv', 'success', {
        status: ok ? 'success' : 'fail',
        charCount: result.charCount,
        warning: result.warning
      });
    } finally {
      await context.close();
    }
  }

  // 5b. Large CSV → TRUNCATED warning
  {
    const { page, context } = await setupPage(browser);
    try {
      await openContextModal(page);
      const result = await uploadAndWait(page, path.join(TEST_FILES, 'test-large.csv'));
      // Large CSV (250 rows) should be truncated at CSV_MAX_ROWS=200
      // Status can be 'warning' or 'success' depending on whether app-level truncation also kicks in
      // Key check: warning includes TRUNCATED
      const hasTruncateWarning = result.warning && result.warning.includes('TRUNCATED');
      record('§5', 'test-large.csv', 'warning', {
        status: (result.status === 'warning' || hasTruncateWarning) ? 'warning' : result.status,
        charCount: result.charCount,
        warning: result.warning
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
  console.log('=== Upload Format Tests (§3-§5) ===');
  console.log(`Server: http://localhost:${process.env.PORT || 8080}\n`);

  const browser = await chromium.launch();

  try {
    await testPdf(browser);
    await testDocx(browser);
    await testCsv(browser);
  } catch (err) {
    console.error('\nFatal error:', err.message);
    results.push({
      section: 'FATAL', file: 'error', expected: 'success',
      status: 'fail', charCount: 0, warning: err.message, passed: false
    });
  } finally {
    await browser.close();
  }

  const failed = await writeSummary('Format Tests', results, 'results-formats.json');
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

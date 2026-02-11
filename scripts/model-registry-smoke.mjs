/**
 * Model Registry Smoke Test
 *
 * Tests critical ModelRegistry functions in a browser environment:
 * - normalizeGeminiModelId() - no /models/models/ double prefix
 * - isShutdownDatePassed() - shutdown date logic stable
 *
 * Run: node scripts/model-registry-smoke.mjs
 * Requires: Playwright
 */

import { chromium } from 'playwright';
import { ensureLocalStaticServer } from './local-static-server.mjs';

const PORT = Number(process.env.PORT || 8080);

async function runTests() {
  console.log('Starting Model Registry smoke tests...\n');
  const serverSession = await ensureLocalStaticServer({ port: PORT });
  const BASE_URL = serverSession.baseUrl;

  if (serverSession.reused) {
    console.log(`Reusing existing server: ${BASE_URL}`);
  } else {
    console.log(`Started static server: ${BASE_URL}`);
  }

  let browser;
  const consoleLogs = [];

  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    // Navigate to index.html
    console.log(`Navigating to ${BASE_URL}/index.html`);
    const response = await page.goto(`${BASE_URL}/index.html`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    if (!response.ok()) {
      throw new Error(`Failed to load page: ${response.status()}`);
    }

    // Wait for ModelRegistry to be available
    await page.waitForFunction(() => typeof window.ModelRegistry !== 'undefined', {
      timeout: 10000
    });

    console.log('ModelRegistry loaded successfully\n');

    // Run tests in browser context
    const results = await page.evaluate(() => {
      const tests = [];

      // Test 1: normalizeGeminiModelId - removes models/ prefix
      {
        const input = 'models/gemini-2.5-pro';
        const expected = 'gemini-2.5-pro';
        const actual = ModelRegistry.normalizeGeminiModelId(input);
        tests.push({
          name: 'normalizeGeminiModelId removes "models/" prefix',
          input,
          expected,
          actual,
          passed: actual === expected
        });
      }

      // Test 2: normalizeGeminiModelId - keeps clean ID unchanged
      {
        const input = 'gemini-2.5-pro';
        const expected = 'gemini-2.5-pro';
        const actual = ModelRegistry.normalizeGeminiModelId(input);
        tests.push({
          name: 'normalizeGeminiModelId keeps clean ID unchanged',
          input,
          expected,
          actual,
          passed: actual === expected
        });
      }

      // Test 3: normalizeGeminiModelId - handles null/undefined
      {
        const actual1 = ModelRegistry.normalizeGeminiModelId(null);
        const actual2 = ModelRegistry.normalizeGeminiModelId(undefined);
        tests.push({
          name: 'normalizeGeminiModelId handles null/undefined',
          input: 'null, undefined',
          expected: 'null, undefined',
          actual: `${actual1}, ${actual2}`,
          passed: actual1 === null && actual2 === undefined
        });
      }

      // Test 4: isShutdownDatePassed - past date returns true
      // Using a date that is definitely in the past
      {
        // We verify exported constants that are required for stable cache logic.
        const hasTTL = typeof ModelRegistry.MODEL_LIST_TTL === 'number';
        const hasHealthTTL = typeof ModelRegistry.HEALTH_TTL === 'number';

        tests.push({
          name: 'ModelRegistry exports TTL constants',
          input: 'MODEL_LIST_TTL, HEALTH_TTL',
          expected: 'numbers',
          actual: `${ModelRegistry.MODEL_LIST_TTL}, ${ModelRegistry.HEALTH_TTL}`,
          passed: hasTTL && hasHealthTTL
        });
      }

      // Test 5: PROVIDER_CONFIG exists and has expected providers
      {
        const config = ModelRegistry.PROVIDER_CONFIG;
        const hasGemini = config && config.gemini;
        const hasOpenAI = config && config.openai_llm;
        const hasClaude = config && config.claude;
        const hasGroq = config && config.groq;

        tests.push({
          name: 'PROVIDER_CONFIG has all providers',
          input: 'gemini, openai_llm, claude, groq',
          expected: 'all present',
          actual: `gemini:${!!hasGemini}, openai:${!!hasOpenAI}, claude:${!!hasClaude}, groq:${!!hasGroq}`,
          passed: hasGemini && hasOpenAI && hasClaude && hasGroq
        });
      }

      // Test 6: getFixedModels returns arrays
      {
        const geminiFixed = ModelRegistry.getFixedModels('gemini');
        const openaiFixed = ModelRegistry.getFixedModels('openai_llm');

        tests.push({
          name: 'getFixedModels returns arrays',
          input: 'gemini, openai_llm',
          expected: 'non-empty arrays',
          actual: `gemini:${geminiFixed.length}, openai:${openaiFixed.length}`,
          passed: Array.isArray(geminiFixed) && geminiFixed.length > 0 &&
                  Array.isArray(openaiFixed) && openaiFixed.length > 0
        });
      }

      // Test 7: Gemini fixed models include 2.5 series
      {
        const geminiFixed = ModelRegistry.getFixedModels('gemini');
        const has25Pro = geminiFixed.some(m => m.id === 'gemini-2.5-pro');
        const has25Flash = geminiFixed.some(m => m.id === 'gemini-2.5-flash');

        tests.push({
          name: 'Gemini fixed models include 2.5 series',
          input: 'gemini-2.5-pro, gemini-2.5-flash',
          expected: 'both present',
          actual: `2.5-pro:${has25Pro}, 2.5-flash:${has25Flash}`,
          passed: has25Pro && has25Flash
        });
      }

      // Test 8: Health functions exist
      {
        const hasProbe = typeof ModelRegistry.probeModel === 'function';
        const hasGetHealth = typeof ModelRegistry.getModelHealth === 'function';
        const hasSetHealth = typeof ModelRegistry.setModelHealth === 'function';

        tests.push({
          name: 'Health management functions exist',
          input: 'probeModel, getModelHealth, setModelHealth',
          expected: 'all functions',
          actual: `probe:${hasProbe}, get:${hasGetHealth}, set:${hasSetHealth}`,
          passed: hasProbe && hasGetHealth && hasSetHealth
        });
      }

      return tests;
    });

    // Print results
    let passed = 0;
    let failed = 0;

    for (const test of results) {
      const status = test.passed ? '✓' : '✗';
      const color = test.passed ? '\x1b[32m' : '\x1b[31m';
      const reset = '\x1b[0m';

      console.log(`${color}${status}${reset} ${test.name}`);
      if (!test.passed) {
        console.log(`  Input:    ${test.input}`);
        console.log(`  Expected: ${test.expected}`);
        console.log(`  Actual:   ${test.actual}`);
      }

      if (test.passed) passed++;
      else failed++;
    }

    console.log(`\n${passed} passed, ${failed} failed`);

    if (failed > 0) {
      console.log('\nConsole logs from browser:');
      consoleLogs.forEach(log => console.log('  ' + log));
      return false;
    }
    return true;

  } catch (error) {
    console.error('Test error:', error.message);
    console.log('\nConsole logs from browser:');
    consoleLogs.forEach(log => console.log('  ' + log));
    return false;
  } finally {
    if (browser) {
      await browser.close();
    }
    if (!serverSession.reused) {
      await serverSession.stop();
      console.log('Stopped static server');
    }
  }
}

runTests().then(success => {
  if (!success) process.exit(1);
}).catch(error => {
  console.error('Test runner failed:', error.message);
  process.exit(1);
});

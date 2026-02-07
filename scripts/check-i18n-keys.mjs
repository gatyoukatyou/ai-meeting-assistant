/**
 * i18n locale key completeness checker
 *
 * Compares all locale JSON files against the reference locale (ja.json)
 * and reports missing or extra keys at every nesting level.
 *
 * Run: node scripts/check-i18n-keys.mjs
 * Exit code: 0 = all locales in sync, 1 = mismatches found
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const REFERENCE_LOCALE = 'ja';

function flattenKeys(obj, prefix = '') {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function loadLocale(name) {
  const filePath = path.join(LOCALES_DIR, `${name}.json`);
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function main() {
  console.log('Checking i18n locale key completeness...\n');

  const files = readdirSync(LOCALES_DIR).filter(f => f.endsWith('.json'));
  const localeNames = files.map(f => f.replace('.json', ''));

  if (!localeNames.includes(REFERENCE_LOCALE)) {
    console.error(`Reference locale "${REFERENCE_LOCALE}.json" not found`);
    process.exit(1);
  }

  const refData = loadLocale(REFERENCE_LOCALE);
  const refKeys = new Set(flattenKeys(refData));

  console.log(`Reference: ${REFERENCE_LOCALE}.json (${refKeys.size} keys)`);

  let hasErrors = false;

  for (const name of localeNames) {
    if (name === REFERENCE_LOCALE) continue;

    const data = loadLocale(name);
    const keys = new Set(flattenKeys(data));

    const missing = [...refKeys].filter(k => !keys.has(k));
    const extra = [...keys].filter(k => !refKeys.has(k));

    if (missing.length === 0 && extra.length === 0) {
      console.log(`  \x1b[32m\u2713\x1b[0m ${name}.json (${keys.size} keys) — in sync`);
    } else {
      hasErrors = true;
      console.log(`  \x1b[31m\u2717\x1b[0m ${name}.json (${keys.size} keys) — mismatches found`);
      for (const k of missing) {
        console.log(`      MISSING: ${k}`);
      }
      for (const k of extra) {
        console.log(`      EXTRA:   ${k}`);
      }
    }
  }

  console.log('');
  if (hasErrors) {
    console.log('i18n key check FAILED — locales are out of sync');
    process.exit(1);
  } else {
    console.log('i18n key check passed — all locales in sync');
  }
}

main();

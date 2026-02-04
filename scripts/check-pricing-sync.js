#!/usr/bin/env node
/**
 * Check that all ModelRegistry fixedModels have corresponding PRICING entries.
 * Outputs warnings for missing entries (does not fail CI).
 *
 * Uses GitHub Actions workflow commands for visible warnings in PR checks.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP_JS = path.join(ROOT, 'js', 'app.js');
const MODEL_REGISTRY_JS = path.join(ROOT, 'js', 'model-registry.js');

// Provider name mapping: ModelRegistry -> PRICING
const PROVIDER_MAP = {
  gemini: 'gemini',
  openai_llm: 'openai',
  claude: 'claude',
  groq: 'groq'
};

// OpenAI model prefixes (gpt-4o, o1-, o3-, etc.)
const OPENAI_PREFIXES = ['gpt-', 'o1-', 'o3-'];

/**
 * Extract PRICING block using brace-counting (more robust than regex)
 */
function extractPricingBlock(content) {
  const startMarker = 'const PRICING = {';
  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let stringChar = '';
  let blockStart = startIdx + startMarker.length - 1; // Start at '{'

  for (let i = blockStart; i < content.length; i++) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : '';

    // Handle string literals
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (inString) continue;

    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) {
        return content.slice(blockStart, i + 1);
      }
    }
  }

  return null;
}

/**
 * Determine provider from model ID
 */
function getProviderFromModelId(modelId) {
  if (modelId.startsWith('gemini-')) return 'gemini';
  if (modelId.startsWith('claude-')) return 'claude';
  if (modelId.startsWith('llama-')) return 'groq';

  // OpenAI: gpt-*, o1-*, o3-*, etc.
  for (const prefix of OPENAI_PREFIXES) {
    if (modelId.startsWith(prefix)) return 'openai';
  }

  return null;
}

function extractPricingModels(content) {
  const pricingBlock = extractPricingBlock(content);
  if (!pricingBlock) {
    warn('Could not extract PRICING block - check script compatibility');
    return {};
  }

  const models = {};

  // Extract all model IDs (pattern: 'model-id': { input:)
  const modelPattern = /'([a-zA-Z0-9._-]+)':\s*\{\s*input:/g;
  let match;

  while ((match = modelPattern.exec(pricingBlock)) !== null) {
    const modelId = match[1];
    const provider = getProviderFromModelId(modelId);

    if (!provider) continue;

    if (!models[provider]) {
      models[provider] = [];
    }
    models[provider].push(modelId);
  }

  return models;
}

/**
 * Extract model IDs from array content (supports both object and string formats)
 * - Object format: { id: 'gpt-4o', displayName: '...' }
 * - String format: 'gpt-4o'
 */
function extractModelIdsFromArray(arrayContent) {
  const ids = [];
  const seen = new Set();

  // Object format: { id: 'xxx' }
  const objIdPattern = /id:\s*'([^']+)'/g;
  let m;
  while ((m = objIdPattern.exec(arrayContent)) !== null) {
    if (!seen.has(m[1])) {
      ids.push(m[1]);
      seen.add(m[1]);
    }
  }

  // String format: 'xxx' (only if no object format found - avoid false positives)
  if (ids.length === 0) {
    const strPattern = /'([a-zA-Z0-9._-]+)'/g;
    while ((m = strPattern.exec(arrayContent)) !== null) {
      const v = m[1];
      // Filter out non-model-id strings (e.g., 'Recommended', 'Low cost')
      if (getProviderFromModelId(v) && !seen.has(v)) {
        ids.push(v);
        seen.add(v);
      }
    }
  }

  return ids;
}

function extractFixedModels(content) {
  const models = {};
  const providers = ['gemini', 'openai_llm', 'claude', 'groq'];

  for (const provider of providers) {
    const providerPattern = new RegExp(
      provider + ':\\s*\\{[\\s\\S]*?fixedModels:\\s*\\[([\\s\\S]*?)\\]',
      'm'
    );
    const match = content.match(providerPattern);

    if (match) {
      const arrayContent = match[1];
      const ids = extractModelIdsFromArray(arrayContent);

      if (ids.length > 0) {
        models[provider] = ids;
      }
    }
  }

  return models;
}

/**
 * Output warning (GitHub Actions format if in CI)
 */
function warn(message) {
  if (process.env.GITHUB_ACTIONS) {
    // GitHub Actions workflow command - shows in PR Checks
    console.log(`::warning title=PRICING sync::${message}`);
  } else {
    console.warn(`⚠️  ${message}`);
  }
}

function main() {
  console.log('Checking PRICING <-> ModelRegistry sync...\n');

  let appJs, registryJs;
  try {
    appJs = fs.readFileSync(APP_JS, 'utf8');
    registryJs = fs.readFileSync(MODEL_REGISTRY_JS, 'utf8');
  } catch (e) {
    warn(`Failed to read source files: ${e.message}`);
    process.exit(0);
  }

  const pricingModels = extractPricingModels(appJs);
  const fixedModels = extractFixedModels(registryJs);

  let warningCount = 0;

  for (const [registryProvider, models] of Object.entries(fixedModels)) {
    const pricingProvider = PROVIDER_MAP[registryProvider] || registryProvider;
    const pricingSet = new Set(pricingModels[pricingProvider] || []);

    for (const modelId of models) {
      if (!pricingSet.has(modelId)) {
        warn(`"${modelId}" (${registryProvider}) is in fixedModels but missing from PRICING`);
        warningCount++;
      }
    }
  }

  console.log('');

  if (warningCount === 0) {
    console.log('✅ All fixedModels have PRICING entries');
  } else {
    console.log(`\n⚠️  ${warningCount} model(s) missing from PRICING`);
    console.log('   Add entries to PRICING in js/app.js to fix cost estimation.');
  }

  // Always exit 0 (soft check - warning only)
  process.exit(0);
}

main();

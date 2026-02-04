#!/usr/bin/env node
/**
 * Check that all ModelRegistry fixedModels have corresponding PRICING entries.
 * Outputs warnings for missing entries (does not fail CI).
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

function extractPricingModels(content) {
  // Find the PRICING object
  const pricingMatch = content.match(/const PRICING\s*=\s*\{[\s\S]*?\n\};/);
  if (!pricingMatch) {
    console.error('Could not find PRICING object');
    return {};
  }

  const pricingBlock = pricingMatch[0];
  const models = {};

  // Extract all model IDs (pattern: 'model-id': { input:)
  const modelPattern = /'([a-zA-Z0-9._-]+)':\s*\{\s*input:/g;
  let match;

  while ((match = modelPattern.exec(pricingBlock)) !== null) {
    const modelId = match[1];

    // Determine provider from model ID
    let provider;
    if (modelId.startsWith('gemini-')) {
      provider = 'gemini';
    } else if (modelId.startsWith('gpt-')) {
      provider = 'openai';
    } else if (modelId.startsWith('claude-')) {
      provider = 'claude';
    } else if (modelId.startsWith('llama-')) {
      provider = 'groq';
    } else {
      continue;
    }

    if (!models[provider]) {
      models[provider] = [];
    }
    models[provider].push(modelId);
  }

  return models;
}

function extractFixedModels(content) {
  const models = {};

  // Match provider config blocks with fixedModels
  const providers = ['gemini', 'openai_llm', 'claude', 'groq'];

  for (const provider of providers) {
    // Find the provider block
    const providerPattern = new RegExp(
      provider + ':\\s*\\{[\\s\\S]*?fixedModels:\\s*\\[([\\s\\S]*?)\\]',
      'm'
    );
    const match = content.match(providerPattern);

    if (match) {
      const arrayContent = match[1];
      const idPattern = /id:\s*'([^']+)'/g;
      let idMatch;
      const ids = [];

      while ((idMatch = idPattern.exec(arrayContent)) !== null) {
        ids.push(idMatch[1]);
      }

      if (ids.length > 0) {
        models[provider] = ids;
      }
    }
  }

  return models;
}

function main() {
  console.log('Checking PRICING <-> ModelRegistry sync...\n');

  const appJs = fs.readFileSync(APP_JS, 'utf8');
  const registryJs = fs.readFileSync(MODEL_REGISTRY_JS, 'utf8');

  const pricingModels = extractPricingModels(appJs);
  const fixedModels = extractFixedModels(registryJs);

  // Debug: show what was found
  // console.log('PRICING models:', pricingModels);
  // console.log('Fixed models:', fixedModels);

  let warningCount = 0;
  const warnings = [];

  for (const [registryProvider, models] of Object.entries(fixedModels)) {
    const pricingProvider = PROVIDER_MAP[registryProvider] || registryProvider;
    const pricingSet = new Set(pricingModels[pricingProvider] || []);

    for (const modelId of models) {
      if (!pricingSet.has(modelId)) {
        warnings.push(`⚠️  WARNING: "${modelId}" (${registryProvider}) is in fixedModels but missing from PRICING`);
        warningCount++;
      }
    }
  }

  // Print warnings
  for (const w of warnings) {
    console.warn(w);
  }

  console.log('');

  if (warningCount === 0) {
    console.log('✅ All fixedModels have PRICING entries');
  } else {
    console.log(`⚠️  ${warningCount} model(s) missing from PRICING`);
    console.log('   Add entries to PRICING in js/app.js to fix cost estimation.');
  }

  // Always exit 0 (soft check - warning only)
  process.exit(0);
}

main();

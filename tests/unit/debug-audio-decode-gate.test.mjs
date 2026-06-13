import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const PROJECT_ROOT = resolve(__dirname, '../..');

function getFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName} must exist`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) {
      return source.slice(start, i + 1);
    }
  }

  assert.fail(`Could not parse ${functionName}`);
}

describe('debug audio decode gate', () => {
  it('limits processCompleteBlob audio duration decoding to debug mode', () => {
    const source = readFileSync(resolve(PROJECT_ROOT, 'js/app.js'), 'utf8');
    const functionSource = getFunctionSource(source, 'processCompleteBlob');
    const decodeIndex = functionSource.indexOf('decodeAudioData');
    const gateIndex = functionSource.indexOf('if (isDebugModeEnabled())');

    assert.notEqual(decodeIndex, -1, 'processCompleteBlob should still support debug duration decode');
    assert.notEqual(gateIndex, -1, 'processCompleteBlob must gate debug duration decode');
    assert.ok(gateIndex < decodeIndex, 'debug gate must appear before decodeAudioData');
    assert.match(functionSource, /duration=skipped \(debug disabled\)/);
  });

  it('uses the same debug predicate for the debug HUD and audio duration decode', () => {
    const source = readFileSync(resolve(PROJECT_ROOT, 'js/app.js'), 'utf8');
    const hudSource = getFunctionSource(source, 'initDebugHUD');
    const blobSource = getFunctionSource(source, 'processCompleteBlob');

    assert.match(source, /function isDebugModeEnabled\(\)/);
    assert.match(hudSource, /if \(!isDebugModeEnabled\(\)\) return;/);
    assert.match(blobSource, /if \(isDebugModeEnabled\(\)\)/);
  });
});

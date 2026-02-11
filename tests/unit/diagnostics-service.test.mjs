import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

const { DiagnosticsService } = loadScript('js/services/diagnostics-service.js');

describe('DiagnosticsService', () => {
  it('normalizes common diagnostic errors', () => {
    assert.equal(DiagnosticsService.normalizeDiagnosticErrorCode('http 429 rate limit'), 'HTTP_429');
    assert.equal(DiagnosticsService.normalizeDiagnosticErrorCode('request timeout'), 'TIMEOUT');
  });

  it('summarizes context file diagnostics', () => {
    const summary = DiagnosticsService.summarizeContextFileDiagnostics([
      { status: 'success' },
      { status: 'warning', errorMessage: 'timeout' },
      { status: 'error', errorMessage: 'HTTP 500' }
    ]);
    assert.equal(summary.total, 3);
    assert.equal(summary.byStatus.success, 1);
    assert.equal(summary.byStatus.warning, 1);
    assert.equal(summary.byStatus.error, 1);
    assert.ok(summary.warningCodes.includes('TIMEOUT'));
  });

  it('builds markdown wrapper for diagnostic pack', () => {
    const markdown = DiagnosticsService.buildDiagnosticPackMarkdown(
      { ok: true },
      (key) => key
    );
    assert.match(markdown, /```json/);
    assert.match(markdown, /"ok": true/);
  });
});

const DiagnosticsService = (function () {
  'use strict';

  function normalizeDiagnosticErrorCode(rawCode) {
    if (!rawCode) return '';
    const text = String(rawCode).trim();
    if (!text) return '';

    const tokenMatch = text.match(/[A-Z][A-Z0-9_]{2,}/);
    if (tokenMatch) {
      return tokenMatch[0];
    }

    const httpMatch = text.match(/HTTP\s+(\d{3})/i);
    if (httpMatch) {
      return `HTTP_${httpMatch[1]}`;
    }

    if (/timeout/i.test(text)) {
      return 'TIMEOUT';
    }

    return text
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase()
      .slice(0, 64);
  }

  function dedupeDiagnosticCodes(codes, limit) {
    const max = typeof limit === 'number' ? limit : 10;
    const seen = new Set();
    const result = [];
    (codes || []).forEach(function (code) {
      const normalized = normalizeDiagnosticErrorCode(code);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      result.push(normalized);
    });
    return result.slice(0, max);
  }

  function summarizeContextFileDiagnostics(files, limit) {
    const summary = {
      total: 0,
      byStatus: {
        success: 0,
        warning: 0,
        error: 0,
        loading: 0
      },
      warningCodes: [],
      errorCodes: []
    };

    if (!Array.isArray(files)) return summary;
    summary.total = files.length;
    files.forEach(function (file) {
      const status = file?.status || 'unknown';
      if (Object.prototype.hasOwnProperty.call(summary.byStatus, status)) {
        summary.byStatus[status] += 1;
      }
      if (status === 'warning' && file?.errorMessage) {
        summary.warningCodes.push(file.errorMessage);
      }
      if (status === 'error' && file?.errorMessage) {
        summary.errorCodes.push(file.errorMessage);
      }
    });
    summary.warningCodes = dedupeDiagnosticCodes(summary.warningCodes, limit);
    summary.errorCodes = dedupeDiagnosticCodes(summary.errorCodes, limit);
    return summary;
  }

  function collectRecentDiagnosticErrorCodes(contextSummary, qaEventLog, limit) {
    const max = typeof limit === 'number' ? limit : 10;
    const candidates = [];

    if (contextSummary) {
      candidates.push(...(contextSummary.errorCodes || []));
      candidates.push(...(contextSummary.warningCodes || []));
    }

    const events = Array.isArray(qaEventLog) ? qaEventLog : [];
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const entry = events[i];
      if (!entry) continue;

      if (entry.event === 'timeout') {
        candidates.push('TIMEOUT');
        continue;
      }

      if (entry.event === 'failed') {
        const fromMessage = normalizeDiagnosticErrorCode(entry.error || '');
        candidates.push(fromMessage || 'LLM_CALL_FAILED');
      }

      if (candidates.length >= max * 3) {
        break;
      }
    }

    return dedupeDiagnosticCodes(candidates, max);
  }

  function getConfiguredLlmProvidersForDiagnostic(providerPriority, hasApiKey) {
    const providers = Array.isArray(providerPriority)
      ? providerPriority
      : ['claude', 'openai_llm', 'gemini', 'groq'];
    const has = typeof hasApiKey === 'function' ? hasApiKey : function () { return false; };
    return providers.filter(function (provider) { return Boolean(has(provider)); });
  }

  function getSelectedSttModelForDiagnostic(provider, getModel) {
    const get = typeof getModel === 'function' ? getModel : function () { return null; };
    if (provider === 'deepgram_realtime') {
      return get('deepgram') || 'nova-3-general';
    }
    return get('openai') || 'whisper-1';
  }

  function buildDiagnosticPackMarkdown(pack, t) {
    const translate = typeof t === 'function' ? t : function (k) { return k; };
    const json = JSON.stringify(pack, null, 2);
    return [
      `## ${translate('history.diagnosticTitle')}`,
      '',
      translate('history.diagnosticDescription'),
      '',
      '```json',
      json,
      '```'
    ].join('\n');
  }

  return {
    normalizeDiagnosticErrorCode,
    dedupeDiagnosticCodes,
    summarizeContextFileDiagnostics,
    collectRecentDiagnosticErrorCodes,
    getConfiguredLlmProvidersForDiagnostic,
    getSelectedSttModelForDiagnostic,
    buildDiagnosticPackMarkdown
  };
})();

if (typeof window !== 'undefined') {
  window.DiagnosticsService = DiagnosticsService;
}

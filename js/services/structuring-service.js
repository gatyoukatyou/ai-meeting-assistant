// =====================================
// 録音後の構造化レスポンス正規化
// =====================================
(function (global) {
  const DEFAULT_CATEGORY = '会議・打合せ';
  const CATEGORIES = Object.freeze([
    DEFAULT_CATEGORY,
    '相談・確認',
    '指示・依頼',
    'アイデア',
    'その他'
  ]);

  function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function cleanList(value, limit = Infinity) {
    if (!Array.isArray(value)) return [];
    return value.map(cleanString).filter(Boolean).slice(0, limit);
  }

  function extractJsonText(responseText) {
    const text = cleanString(responseText);
    if (!text) throw new Error('Empty structuring response');
    const withoutFence = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const start = withoutFence.indexOf('{');
    const end = withoutFence.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('Structuring response does not contain JSON');
    return withoutFence.slice(start, end + 1);
  }

  function normalizeResult(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      title: cleanString(source.title),
      category: CATEGORIES.includes(source.category) ? source.category : DEFAULT_CATEGORY,
      tags: cleanList(source.tags, 5),
      keyPoints: cleanList(source.keyPoints),
      decisions: cleanList(source.decisions),
      actionCandidates: cleanList(source.actionCandidates),
      openQuestions: cleanList(source.openQuestions)
    };
  }

  function parseResponse(responseText) {
    return normalizeResult(JSON.parse(extractJsonText(responseText)));
  }

  function buildPrompt(template, transcript, additionalInstruction = '') {
    return String(template || '')
      .replace('{transcript}', String(transcript || ''))
      .replace('{additionalInstruction}', cleanString(additionalInstruction));
  }

  global.StructuringService = Object.freeze({
    CATEGORIES,
    DEFAULT_CATEGORY,
    normalizeResult,
    parseResponse,
    buildPrompt
  });
})(window);

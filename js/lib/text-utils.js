// Pure text-parsing helpers — no DOM / i18n / global-state dependencies.
// Consumed by app.js via thin aliases (e.g. var fixBrokenNumbers = TextUtils.fixBrokenNumbers).
const TextUtils = (function () {
  'use strict';

  /**
   * 単桁がカンマで連なる崩れた数値を結合する
   * パターン: 数字1桁 + (カンマ + 数字1桁) が3回以上繰り返し
   * → 4桁以上の崩れた数値のみ対象（1,2,3のような短い列挙は除外）
   * @param {string} text - テキスト
   * @returns {string}
   */
  function fixBrokenNumbers(text) {
    return text.replace(/\b(\d)(,\d){3,}\b/g, function (match) {
      return match.replace(/,/g, '');
    });
  }

  /**
   * "HH:MM" 形式のタイムスタンプをミリ秒に変換する
   * @param {string} timestamp - "HH:MM" 形式の文字列
   * @returns {number} ミリ秒（パース失敗時は 0）
   */
  function parseTimestampToMs(timestamp) {
    if (!timestamp) return 0;
    var parts = timestamp.split(':').map(Number);
    if (parts.length === 2) {
      var h = parts[0];
      var m = parts[1];
      return (h * 60 + m) * 60 * 1000;
    }
    return 0;
  }

  /**
   * メモ行からAI指示を抽出する
   * 対応パターン: 【AI】xxx, AI: xxx, @ai xxx
   * @param {string} line - メモの1行
   * @returns {string|null} 抽出された指示テキスト、またはnull
   */
  function extractAiInstructionFromMemoLine(line) {
    if (!line || typeof line !== 'string') return null;
    var text = line.trim();
    if (!text) return null;

    var patterns = [
      /^\s*(?:[-*•]\s*)?【\s*AI\s*】\s*(.+)$/i,
      /^\s*(?:[-*•]\s*)?AI\s*[:：]\s*(.+)$/i,
      /^\s*(?:[-*•]\s*)?[@＠]ai\b[\s:：-]*(.+)$/i
    ];

    for (var i = 0; i < patterns.length; i += 1) {
      var match = text.match(patterns[i]);
      if (match && match[1]) {
        var instruction = match[1].trim();
        if (instruction) return instruction;
      }
    }
    return null;
  }

  return {
    fixBrokenNumbers: fixBrokenNumbers,
    parseTimestampToMs: parseTimestampToMs,
    extractAiInstructionFromMemoLine: extractAiInstructionFromMemoLine
  };
})();

if (typeof window !== 'undefined') {
  window.TextUtils = TextUtils;
}

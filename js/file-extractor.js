/**
 * ファイルテキスト抽出モジュール
 * TXT/MDファイルからテキストを抽出する
 *
 * 対応形式:
 * - Phase 1: TXT, MD (UTF-8)
 * - Phase 2: PDF (要pdf.js)
 */

const FileExtractor = (function() {
  'use strict';

  // 文字化け検出用: 一般的な文字化けパターン
  const MOJIBAKE_PATTERNS = [
    /[\ufffd]{3,}/,           // 連続した置換文字
    /[\u0000-\u0008]/,        // 制御文字
    /[\u000e-\u001f]/,        // 制御文字
    /\x00/,                   // NUL文字
  ];

  /**
   * 文字化けの可能性をチェック
   * @param {string} text - チェック対象テキスト
   * @returns {boolean} 文字化けの可能性がある場合true
   */
  function detectMojibake(text) {
    if (!text || text.length === 0) return false;

    // 文字化けパターンのチェック
    for (const pattern of MOJIBAKE_PATTERNS) {
      if (pattern.test(text)) {
        return true;
      }
    }

    // 高頻度の置換文字（U+FFFD）をチェック
    const replacementCount = (text.match(/\ufffd/g) || []).length;
    const ratio = replacementCount / text.length;
    if (ratio > 0.05) { // 5%以上が置換文字なら文字化けの可能性
      return true;
    }

    return false;
  }

  /**
   * ファイル拡張子からMIMEタイプを推定
   * @param {string} filename - ファイル名
   * @returns {string|null} MIMEタイプ
   */
  function getMimeFromExtension(filename) {
    if (!filename) return null;
    const ext = filename.toLowerCase().split('.').pop();
    const mimeMap = {
      'txt': 'text/plain',
      'md': 'text/markdown',
      'markdown': 'text/markdown',
      'pdf': 'application/pdf',
    };
    return mimeMap[ext] || null;
  }

  /**
   * ファイルタイプがサポートされているかチェック
   * @param {File} file - チェック対象ファイル
   * @returns {{supported: boolean, type: string}}
   */
  function checkFileType(file) {
    const type = file.type || getMimeFromExtension(file.name);
    const supportedTypes = ['text/plain', 'text/markdown'];

    // 拡張子でもチェック
    const ext = file.name.toLowerCase().split('.').pop();
    const supportedExts = ['txt', 'md', 'markdown'];

    const supported = supportedTypes.includes(type) || supportedExts.includes(ext);
    return { supported, type: type || `unknown (${ext})` };
  }

  /**
   * プレーンテキストファイルからテキストを抽出
   * @param {File} file - 対象ファイル
   * @returns {Promise<{success: boolean, text?: string, charCount?: number, warning?: string, error?: string}>}
   */
  async function extractPlainText(file) {
    try {
      const text = await file.text(); // UTF-8として読み込み

      // 文字化けチェック
      if (detectMojibake(text)) {
        return {
          success: true,
          text: text,
          charCount: text.length,
          warning: 'POSSIBLE_ENCODING_ISSUE'
        };
      }

      return {
        success: true,
        text: text,
        charCount: text.length
      };
    } catch (err) {
      console.error('[FileExtractor] Plain text extraction failed:', err);
      return {
        success: false,
        error: 'READ_ERROR',
        errorMessage: err.message
      };
    }
  }

  /**
   * PDFファイルからテキストを抽出 (Phase 2)
   * @param {File} file - 対象ファイル
   * @returns {Promise<{success: boolean, text?: string, charCount?: number, error?: string}>}
   */
  async function extractPdfText(file) {
    // Phase 2で実装予定
    // pdf.jsが必要
    if (typeof pdfjsLib === 'undefined') {
      return {
        success: false,
        error: 'PDF_NOT_SUPPORTED',
        errorMessage: 'PDF support is not available yet'
      };
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
      }

      return {
        success: true,
        text: fullText.trim(),
        charCount: fullText.trim().length
      };
    } catch (err) {
      console.error('[FileExtractor] PDF extraction failed:', err);
      return {
        success: false,
        error: 'PDF_EXTRACTION_FAILED',
        errorMessage: err.message
      };
    }
  }

  /**
   * ファイルからテキストを抽出（メインエントリポイント）
   * @param {File} file - 対象ファイル
   * @returns {Promise<{success: boolean, text?: string, charCount?: number, warning?: string, error?: string, errorMessage?: string}>}
   */
  async function extractTextFromFile(file) {
    if (!file) {
      return { success: false, error: 'NO_FILE' };
    }

    const { supported, type } = checkFileType(file);

    if (!supported) {
      return {
        success: false,
        error: 'UNSUPPORTED_FORMAT',
        errorMessage: `Unsupported file type: ${type}`
      };
    }

    // ファイルタイプに応じた抽出
    if (type === 'application/pdf') {
      return extractPdfText(file);
    }

    // TXT/MDはプレーンテキストとして処理
    return extractPlainText(file);
  }

  /**
   * ファイルアイコンを取得
   * @param {string} type - MIMEタイプまたはファイル名
   * @returns {string} アイコン絵文字
   */
  function getFileIcon(type) {
    if (!type) return '📄';
    const t = type.toLowerCase();
    if (t.includes('pdf')) return '📕';
    if (t.includes('markdown') || t.endsWith('.md')) return '📝';
    return '📄';
  }

  // Public API
  return {
    extractTextFromFile,
    checkFileType,
    detectMojibake,
    getFileIcon,
    getMimeFromExtension
  };
})();

// グローバルに公開
if (typeof window !== 'undefined') {
  window.FileExtractor = FileExtractor;
}

/**
 * ファイルテキスト抽出モジュール
 * TXT/MD/PDF/DOCX/CSVファイルからテキストを抽出する
 *
 * 対応形式:
 * - TXT, MD (UTF-8)
 * - PDF (pdf.js による遅延ロード)
 * - DOCX (mammoth による遅延ロード)
 * - CSV (先頭N行のテキスト化)
 *
 * Phase 6: PDF/DOCX/CSV抽出機能を追加
 */

const FileExtractor = (function() {
  'use strict';

  // ========================================
  // 定数（上限制御）
  // ========================================
  const PDF_MAX_PAGES = 20;              // PDF最大ページ数
  const EXTRACTION_MAX_CHARS = 50000;    // 抽出最大文字数
  const CSV_MAX_ROWS = 200;              // CSV最大行数

  // ========================================
  // ライブラリ状態
  // ========================================
  let pdfjsLib = null;
  let mammoth = null;

  // 文字化け検出用: 一般的な文字化けパターン
  const MOJIBAKE_PATTERNS = [
    /[\ufffd]{3,}/,           // 連続した置換文字
    /[\u0000-\u0008]/,        // 制御文字
    /[\u000e-\u001f]/,        // 制御文字
    /\x00/,                   // NUL文字
  ];

  // ========================================
  // ユーティリティ関数
  // ========================================

  /**
   * テキストを最大文字数で切り詰め
   * @param {string} text - 対象テキスト
   * @param {number} maxChars - 最大文字数
   * @returns {{text: string, truncated: boolean}}
   */
  function truncateText(text, maxChars = EXTRACTION_MAX_CHARS) {
    if (!text || text.length <= maxChars) {
      return { text: text || '', truncated: false };
    }
    return {
      text: text.slice(0, maxChars),
      truncated: true
    };
  }

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
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'csv': 'text/csv',
    };
    return mimeMap[ext] || null;
  }

  /**
   * ファイルタイプがサポートされているかチェック
   * @param {File} file - チェック対象ファイル
   * @returns {{supported: boolean, type: string, extractionType: string|null}}
   */
  function checkFileType(file) {
    const type = file.type || getMimeFromExtension(file.name);
    const ext = file.name.toLowerCase().split('.').pop();

    // サポートマッピング
    const supportMap = {
      // プレーンテキスト
      'text/plain': 'plain',
      'text/markdown': 'plain',
      // PDF
      'application/pdf': 'pdfjs',
      // DOCX
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'mammoth',
      // CSV
      'text/csv': 'csv',
    };

    // 拡張子によるフォールバック
    const extMap = {
      'txt': 'plain',
      'md': 'plain',
      'markdown': 'plain',
      'pdf': 'pdfjs',
      'docx': 'mammoth',
      'csv': 'csv',
    };

    const extractionType = supportMap[type] || extMap[ext] || null;
    const supported = extractionType !== null;

    return {
      supported,
      type: type || `unknown (${ext})`,
      extractionType
    };
  }

  // ========================================
  // pdf.js 遅延ロード
  // ========================================

  /**
   * pdf.js を遅延ロード
   * @returns {Promise<object>} pdfjsLib
   */
  async function loadPdfJs() {
    if (pdfjsLib) return pdfjsLib;

    try {
      // Dynamic import で ES module をロード
      const module = await import('../vendor/pdfjs/pdf.min.mjs');
      pdfjsLib = module;

      // Worker の設定
      pdfjsLib.GlobalWorkerOptions.workerSrc = '../vendor/pdfjs/pdf.worker.min.mjs';

      console.log('[FileExtractor] pdf.js loaded successfully');
      return pdfjsLib;
    } catch (err) {
      console.error('[FileExtractor] Failed to load pdf.js:', err);
      throw new Error('PDF_LIBRARY_LOAD_FAILED');
    }
  }

  /**
   * PDFファイルからテキストを抽出
   * @param {ArrayBuffer} arrayBuffer - PDFデータ
   * @returns {Promise<{success: boolean, text?: string, charCount?: number, pageCount?: number, warning?: string, error?: string, errorMessage?: string}>}
   */
  async function extractPdfText(arrayBuffer) {
    try {
      const pdfjs = await loadPdfJs();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

      const totalPages = pdf.numPages;
      const pagesToProcess = Math.min(totalPages, PDF_MAX_PAGES);
      let fullText = '';
      let truncatedPages = false;

      for (let i = 1; i <= pagesToProcess; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        fullText += pageText + '\n\n';

        // 文字数チェック（途中で上限に達した場合）
        if (fullText.length >= EXTRACTION_MAX_CHARS) {
          truncatedPages = true;
          break;
        }
      }

      // 最終的な切り詰め
      const { text, truncated } = truncateText(fullText.trim());

      const result = {
        success: true,
        text: text,
        charCount: text.length,
        pageCount: totalPages,
        extractionType: 'pdfjs',
        extractionAt: Date.now()
      };

      if (truncated || truncatedPages || totalPages > PDF_MAX_PAGES) {
        result.warning = 'TRUNCATED';
        if (totalPages > PDF_MAX_PAGES) {
          result.warningDetail = `Processed ${pagesToProcess} of ${totalPages} pages`;
        }
      }

      return result;
    } catch (err) {
      console.error('[FileExtractor] PDF extraction failed:', err);

      // エラータイプの判定
      let errorType = 'PDF_EXTRACTION_FAILED';
      if (err.message === 'PDF_LIBRARY_LOAD_FAILED') {
        errorType = 'PDF_LIBRARY_LOAD_FAILED';
      } else if (err.name === 'PasswordException') {
        errorType = 'PDF_PASSWORD_PROTECTED';
      } else if (err.name === 'InvalidPDFException') {
        errorType = 'PDF_INVALID';
      }

      return {
        success: false,
        error: errorType,
        errorMessage: err.message
      };
    }
  }

  // ========================================
  // mammoth 遅延ロード
  // ========================================

  /**
   * mammoth を遅延ロード（script タグ注入）
   * @returns {Promise<object>} mammoth
   */
  async function loadMammoth() {
    if (mammoth) return mammoth;

    // window.mammoth が既に存在するかチェック
    if (typeof window !== 'undefined' && window.mammoth) {
      mammoth = window.mammoth;
      return mammoth;
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '../vendor/mammoth/mammoth.browser.min.js';
      script.async = true;

      script.onload = () => {
        if (window.mammoth) {
          mammoth = window.mammoth;
          console.log('[FileExtractor] mammoth loaded successfully');
          resolve(mammoth);
        } else {
          reject(new Error('MAMMOTH_NOT_AVAILABLE'));
        }
      };

      script.onerror = () => {
        reject(new Error('MAMMOTH_LIBRARY_LOAD_FAILED'));
      };

      document.head.appendChild(script);
    });
  }

  /**
   * DOCXファイルからテキストを抽出
   * @param {ArrayBuffer} arrayBuffer - DOCXデータ
   * @returns {Promise<{success: boolean, text?: string, charCount?: number, warning?: string, error?: string, errorMessage?: string}>}
   */
  async function extractDocxText(arrayBuffer) {
    try {
      const mammothLib = await loadMammoth();
      const result = await mammothLib.extractRawText({ arrayBuffer: arrayBuffer });

      // 切り詰め処理
      const { text, truncated } = truncateText(result.value.trim());

      const response = {
        success: true,
        text: text,
        charCount: text.length,
        extractionType: 'mammoth',
        extractionAt: Date.now()
      };

      if (truncated) {
        response.warning = 'TRUNCATED';
      }

      // mammothの警告メッセージがあれば追加
      if (result.messages && result.messages.length > 0) {
        const warnings = result.messages.filter(m => m.type === 'warning');
        if (warnings.length > 0) {
          response.mammothWarnings = warnings.map(w => w.message);
        }
      }

      return response;
    } catch (err) {
      console.error('[FileExtractor] DOCX extraction failed:', err);

      let errorType = 'DOCX_EXTRACTION_FAILED';
      if (err.message === 'MAMMOTH_LIBRARY_LOAD_FAILED' ||
          err.message === 'MAMMOTH_NOT_AVAILABLE') {
        errorType = 'DOCX_LIBRARY_LOAD_FAILED';
      }

      return {
        success: false,
        error: errorType,
        errorMessage: err.message
      };
    }
  }

  // ========================================
  // CSV 抽出
  // ========================================

  /**
   * CSVテキストから先頭N行を抽出
   * @param {string} text - CSVテキスト
   * @returns {{success: boolean, text?: string, charCount?: number, rowCount?: number, warning?: string, error?: string}}
   */
  function extractCsvText(text) {
    try {
      if (!text || text.trim().length === 0) {
        return {
          success: false,
          error: 'CSV_EMPTY',
          errorMessage: 'CSV file is empty'
        };
      }

      const lines = text.split(/\r?\n/);
      const totalRows = lines.length;
      const rowsToProcess = Math.min(totalRows, CSV_MAX_ROWS);

      let extractedText = lines.slice(0, rowsToProcess).join('\n');

      // 切り詰め処理
      const { text: finalText, truncated } = truncateText(extractedText);

      const result = {
        success: true,
        text: finalText,
        charCount: finalText.length,
        rowCount: totalRows,
        extractionType: 'csv',
        extractionAt: Date.now()
      };

      if (truncated || totalRows > CSV_MAX_ROWS) {
        result.warning = 'TRUNCATED';
        if (totalRows > CSV_MAX_ROWS) {
          result.warningDetail = `Processed ${rowsToProcess} of ${totalRows} rows`;
        }
      }

      return result;
    } catch (err) {
      console.error('[FileExtractor] CSV extraction failed:', err);
      return {
        success: false,
        error: 'CSV_EXTRACTION_FAILED',
        errorMessage: err.message
      };
    }
  }

  // ========================================
  // プレーンテキスト抽出
  // ========================================

  /**
   * プレーンテキストファイルからテキストを抽出
   * @param {File} file - 対象ファイル
   * @returns {Promise<{success: boolean, text?: string, charCount?: number, warning?: string, error?: string}>}
   */
  async function extractPlainText(file) {
    try {
      const rawText = await file.text(); // UTF-8として読み込み

      // 切り詰め処理
      const { text, truncated } = truncateText(rawText);

      const result = {
        success: true,
        text: text,
        charCount: text.length,
        extractionType: 'plain',
        extractionAt: Date.now()
      };

      // 文字化けチェック
      if (detectMojibake(text)) {
        result.warning = 'POSSIBLE_ENCODING_ISSUE';
      } else if (truncated) {
        result.warning = 'TRUNCATED';
      }

      return result;
    } catch (err) {
      console.error('[FileExtractor] Plain text extraction failed:', err);
      return {
        success: false,
        error: 'READ_ERROR',
        errorMessage: err.message
      };
    }
  }

  // ========================================
  // メインエントリポイント
  // ========================================

  /**
   * ファイルからテキストを抽出（メインエントリポイント）
   * @param {File} file - 対象ファイル
   * @returns {Promise<{success: boolean, text?: string, charCount?: number, extractionType?: string, extractionAt?: number, warning?: string, error?: string, errorMessage?: string}>}
   */
  async function extractTextFromFile(file) {
    if (!file) {
      return { success: false, error: 'NO_FILE' };
    }

    const { supported, type, extractionType } = checkFileType(file);

    if (!supported) {
      return {
        success: false,
        error: 'UNSUPPORTED_FORMAT',
        errorMessage: `Unsupported file type: ${type}`
      };
    }

    // 抽出タイプに応じた処理
    switch (extractionType) {
      case 'pdfjs': {
        const arrayBuffer = await file.arrayBuffer();
        return extractPdfText(arrayBuffer);
      }

      case 'mammoth': {
        const arrayBuffer = await file.arrayBuffer();
        return extractDocxText(arrayBuffer);
      }

      case 'csv': {
        const text = await file.text();
        return extractCsvText(text);
      }

      case 'plain':
      default:
        return extractPlainText(file);
    }
  }

  /**
   * ファイルアイコンを取得
   * @param {string} type - MIMEタイプまたはファイル名
   * @returns {string} アイコン絵文字
   */
  function getFileIcon(type) {
    if (!type) return '\uD83D\uDCC4'; // 📄
    const t = type.toLowerCase();
    if (t.includes('pdf')) return '\uD83D\uDCD5'; // 📕
    if (t.includes('wordprocessingml') || t.endsWith('.docx')) return '\uD83D\uDCD8'; // 📘
    if (t.includes('csv') || t.endsWith('.csv')) return '\uD83D\uDCCA'; // 📊
    if (t.includes('markdown') || t.endsWith('.md')) return '\uD83D\uDCDD'; // 📝
    return '\uD83D\uDCC4'; // 📄
  }

  /**
   * 抽出上限の定数を取得
   * @returns {{pdfMaxPages: number, extractionMaxChars: number, csvMaxRows: number}}
   */
  function getLimits() {
    return {
      pdfMaxPages: PDF_MAX_PAGES,
      extractionMaxChars: EXTRACTION_MAX_CHARS,
      csvMaxRows: CSV_MAX_ROWS
    };
  }

  // Public API
  return {
    extractTextFromFile,
    checkFileType,
    detectMojibake,
    getFileIcon,
    getMimeFromExtension,
    getLimits,
    // 個別抽出関数（テスト・デバッグ用）
    _extractPdfText: extractPdfText,
    _extractDocxText: extractDocxText,
    _extractCsvText: extractCsvText,
    _loadPdfJs: loadPdfJs,
    _loadMammoth: loadMammoth
  };
})();

// グローバルに公開
if (typeof window !== 'undefined') {
  window.FileExtractor = FileExtractor;
}

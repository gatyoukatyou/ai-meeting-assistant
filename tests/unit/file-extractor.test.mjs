import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

const { FileExtractor } = loadScript('js/file-extractor.js');

// ========================================
// getMimeFromExtension()
// ========================================

describe('getMimeFromExtension', () => {
  it('returns text/plain for .txt', () => {
    assert.equal(FileExtractor.getMimeFromExtension('readme.txt'), 'text/plain');
  });

  it('returns application/pdf for .pdf', () => {
    assert.equal(FileExtractor.getMimeFromExtension('report.pdf'), 'application/pdf');
  });

  it('returns text/markdown for .md', () => {
    assert.equal(FileExtractor.getMimeFromExtension('notes.md'), 'text/markdown');
  });

  it('returns text/csv for .csv', () => {
    assert.equal(FileExtractor.getMimeFromExtension('data.csv'), 'text/csv');
  });

  it('returns DOCX MIME for .docx', () => {
    assert.equal(
      FileExtractor.getMimeFromExtension('doc.docx'),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });

  it('returns null for unknown extension', () => {
    assert.equal(FileExtractor.getMimeFromExtension('image.png'), null);
  });

  it('returns null for null input', () => {
    assert.equal(FileExtractor.getMimeFromExtension(null), null);
  });

  it('handles uppercase extension via toLowerCase', () => {
    assert.equal(FileExtractor.getMimeFromExtension('FILE.PDF'), 'application/pdf');
  });
});

// ========================================
// detectMojibake()
// ========================================

describe('detectMojibake', () => {
  it('returns false for normal ASCII text', () => {
    assert.equal(FileExtractor.detectMojibake('Hello, world!'), false);
  });

  it('returns false for Japanese text', () => {
    assert.equal(FileExtractor.detectMojibake('日本語テキスト'), false);
  });

  it('returns true for consecutive U+FFFD replacement chars', () => {
    assert.equal(FileExtractor.detectMojibake('abc\ufffd\ufffd\ufffddef'), true);
  });

  it('returns true for control characters', () => {
    assert.equal(FileExtractor.detectMojibake('abc\x01def'), true);
  });

  it('returns false for empty string', () => {
    assert.equal(FileExtractor.detectMojibake(''), false);
  });

  it('returns false for null input', () => {
    assert.equal(FileExtractor.detectMojibake(null), false);
  });
});

// ========================================
// checkFileType()
// ========================================

describe('checkFileType', () => {
  it('recognises text/plain as supported with extractionType "plain"', () => {
    const result = FileExtractor.checkFileType({
      type: 'text/plain',
      name: 'readme.txt'
    });
    assert.equal(result.supported, true);
    assert.equal(result.extractionType, 'plain');
  });

  it('recognises application/pdf as supported with extractionType "pdfjs"', () => {
    const result = FileExtractor.checkFileType({
      type: 'application/pdf',
      name: 'report.pdf'
    });
    assert.equal(result.supported, true);
    assert.equal(result.extractionType, 'pdfjs');
  });

  it('recognises text/csv as supported with extractionType "csv"', () => {
    const result = FileExtractor.checkFileType({
      type: 'text/csv',
      name: 'data.csv'
    });
    assert.equal(result.supported, true);
    assert.equal(result.extractionType, 'csv');
  });

  it('returns unsupported for unknown MIME type', () => {
    const result = FileExtractor.checkFileType({
      type: 'image/png',
      name: 'photo.png'
    });
    assert.equal(result.supported, false);
    assert.equal(result.extractionType, null);
  });

  it('falls back to extension when MIME is empty', () => {
    const result = FileExtractor.checkFileType({ type: '', name: 'data.csv' });
    assert.equal(result.supported, true);
    assert.equal(result.extractionType, 'csv');
  });
});

// ========================================
// getFileIcon()
// ========================================

describe('getFileIcon', () => {
  it('returns book emoji for PDF', () => {
    assert.equal(FileExtractor.getFileIcon('application/pdf'), '\uD83D\uDCD5');
  });

  it('returns blue book emoji for DOCX', () => {
    assert.equal(
      FileExtractor.getFileIcon(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ),
      '\uD83D\uDCD8'
    );
  });

  it('returns chart emoji for CSV', () => {
    assert.equal(FileExtractor.getFileIcon('text/csv'), '\uD83D\uDCCA');
  });

  it('returns page emoji for unknown type', () => {
    assert.equal(FileExtractor.getFileIcon('application/zip'), '\uD83D\uDCC4');
  });

  it('returns page emoji for null input', () => {
    assert.equal(FileExtractor.getFileIcon(null), '\uD83D\uDCC4');
  });
});

// ========================================
// getLimits()
// ========================================

describe('getLimits', () => {
  it('returns an object with expected numeric limits', () => {
    const limits = FileExtractor.getLimits();
    assert.equal(typeof limits.pdfMaxPages, 'number');
    assert.equal(typeof limits.extractionMaxChars, 'number');
    assert.equal(typeof limits.csvMaxRows, 'number');
    assert.equal(limits.pdfMaxPages, 20);
    assert.equal(limits.extractionMaxChars, 50000);
    assert.equal(limits.csvMaxRows, 200);
  });
});

// ========================================
// _extractCsvText()  (synchronous)
// ========================================

describe('_extractCsvText', () => {
  it('extracts normal CSV text', () => {
    const csv = 'name,age\nAlice,30\nBob,25';
    const result = FileExtractor._extractCsvText(csv);
    assert.equal(result.success, true);
    assert.equal(result.text, csv);
    assert.equal(result.rowCount, 3);
  });

  it('returns error for empty string', () => {
    const result = FileExtractor._extractCsvText('');
    assert.equal(result.success, false);
    assert.equal(result.error, 'CSV_EMPTY');
  });

  it('returns error for whitespace-only string', () => {
    const result = FileExtractor._extractCsvText('   \n  \n  ');
    assert.equal(result.success, false);
    assert.equal(result.error, 'CSV_EMPTY');
  });

  it('truncates CSV beyond 200 rows with warning', () => {
    const rows = Array.from({ length: 250 }, (_, i) => `row${i},val${i}`);
    const csv = rows.join('\n');
    const result = FileExtractor._extractCsvText(csv);
    assert.equal(result.success, true);
    assert.equal(result.warning, 'TRUNCATED');
    // Should only contain first 200 rows
    const outputLines = result.text.split('\n');
    assert.equal(outputLines.length, 200);
  });
});

/**
 * テストファイル生成スクリプト
 *
 * Issue #39: 資料アップロード機能の手動テスト用ファイルを生成
 *
 * 生成ファイル:
 *   - test-text.txt       (500文字のテキスト)
 *   - test-large.txt      (60,000文字 — EXTRACTION_MAX_CHARS超過テスト)
 *   - test-text.pdf        (3ページのテキストPDF)
 *   - test-scan.pdf        (テキストレイヤーなしPDF)
 *   - test-password.pdf    (パスワード保護PDF)
 *   - test-25pages.pdf     (25ページ — PDF_MAX_PAGES超過テスト)
 *   - test-simple.docx     (見出し+箇条書き)
 *   - test-complex.docx    (表+段落)
 *   - test-small.csv       (30行)
 *   - test-large.csv       (250行 — CSV_MAX_ROWS超過テスト)
 *   - test-image.png       (非対応形式テスト用)
 *   - test-3mb.txt         (3MBファイル — サンプル大型テキスト)
 *
 * Run: node scripts/generate-test-files.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType
} from 'docx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'test-files');

fs.mkdirSync(OUT_DIR, { recursive: true });

function writeTo(name, data) {
  const p = path.join(OUT_DIR, name);
  if (typeof data === 'string') {
    fs.writeFileSync(p, data, 'utf-8');
  } else {
    fs.writeFileSync(p, data);
  }
  console.log(`  ✓ ${name} (${(Buffer.byteLength(data) / 1024).toFixed(1)} KB)`);
}

// ===========================
// 1. test-text.txt (500文字)
// ===========================
function genTextTxt() {
  const line = 'This is a test document for upload verification. ';
  let text = '';
  while (text.length < 500) text += line;
  writeTo('test-text.txt', text.slice(0, 500));
}

// ===========================
// 2. test-large.txt (60,000文字)
// ===========================
function genLargeTxt() {
  const line = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor. ';
  let text = '';
  while (text.length < 60000) text += line;
  writeTo('test-large.txt', text.slice(0, 60000));
}

// ===========================
// 3. test-text.pdf (3ページ)
// ===========================
async function genTextPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontSize = 12;

  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([595.28, 841.89]); // A4
    const lines = [];
    lines.push(`Page ${i} of 3`);
    lines.push('');
    for (let j = 0; j < 20; j++) {
      lines.push(`Line ${j + 1}: This is test content for PDF extraction testing on page ${i}.`);
    }
    let y = 800;
    for (const line of lines) {
      page.drawText(line, { x: 50, y, size: fontSize, font });
      y -= fontSize * 1.5;
    }
  }

  const bytes = await doc.save();
  writeTo('test-text.pdf', Buffer.from(bytes));
}

// ===========================
// 4. test-scan.pdf (テキストレイヤーなし)
// ===========================
async function genScanPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);

  // 画像の代わりに図形のみ描画（テキストレイヤーなし）
  page.drawRectangle({ x: 50, y: 700, width: 200, height: 100,
    color: { type: 'RGB', red: 0.9, green: 0.9, blue: 0.9 } });
  page.drawRectangle({ x: 100, y: 400, width: 300, height: 50,
    color: { type: 'RGB', red: 0.8, green: 0.8, blue: 0.9 } });

  const bytes = await doc.save();
  writeTo('test-scan.pdf', Buffer.from(bytes));
}

// ===========================
// 5. test-password.pdf (パスワード保護)
// ===========================
async function genPasswordPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage();
  page.drawText('This is a password-protected PDF.', { x: 50, y: 700, size: 14, font });

  // pdf-lib supports encryption via save options
  const bytes = await doc.save({
    userPassword: 'test123',
    ownerPassword: 'owner456',
  });
  writeTo('test-password.pdf', Buffer.from(bytes));
}

// ===========================
// 6. test-25pages.pdf (25ページ)
// ===========================
async function genLargePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 1; i <= 25; i++) {
    const page = doc.addPage([595.28, 841.89]);
    page.drawText(`Page ${i} of 25`, { x: 50, y: 800, size: 14, font });
    for (let j = 0; j < 10; j++) {
      page.drawText(`Content line ${j + 1} on page ${i}.`, {
        x: 50, y: 750 - j * 20, size: 11, font
      });
    }
  }

  const bytes = await doc.save();
  writeTo('test-25pages.pdf', Buffer.from(bytes));
}

// ===========================
// 7. test-simple.docx (見出し+箇条書き)
// ===========================
async function genSimpleDocx() {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: 'Meeting Agenda', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: 'Discussion Topics', heading: HeadingLevel.HEADING_2 }),
        new Paragraph({
          children: [new TextRun('Budget review for Q3')],
          bullet: { level: 0 }
        }),
        new Paragraph({
          children: [new TextRun('Project timeline update')],
          bullet: { level: 0 }
        }),
        new Paragraph({
          children: [new TextRun('Team resource allocation')],
          bullet: { level: 0 }
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [new TextRun('This document contains sample content for DOCX extraction testing.')]
        }),
      ]
    }]
  });

  const buf = await Packer.toBuffer(doc);
  writeTo('test-simple.docx', buf);
}

// ===========================
// 8. test-complex.docx (表+段落)
// ===========================
async function genComplexDocx() {
  const rows = [];
  // Header row
  rows.push(new TableRow({
    children: ['Name', 'Role', 'Department'].map(text =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
        width: { size: 3000, type: WidthType.DXA }
      })
    )
  }));
  // Data rows
  const data = [
    ['Tanaka', 'PM', 'Engineering'],
    ['Sato', 'Designer', 'Creative'],
    ['Suzuki', 'Developer', 'Engineering'],
  ];
  for (const row of data) {
    rows.push(new TableRow({
      children: row.map(text =>
        new TableCell({
          children: [new Paragraph({ text })],
          width: { size: 3000, type: WidthType.DXA }
        })
      )
    }));
  }

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: 'Project Report', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: 'This report contains a table of team members and their roles.' }),
        new Table({ rows }),
        new Paragraph({ text: '' }),
        new Paragraph({ text: 'Additional notes: The project is on track for delivery by end of quarter.' }),
      ]
    }]
  });

  const buf = await Packer.toBuffer(doc);
  writeTo('test-complex.docx', buf);
}

// ===========================
// 9. test-small.csv (30行)
// ===========================
function genSmallCsv() {
  const lines = ['id,name,value'];
  for (let i = 1; i <= 30; i++) {
    lines.push(`${i},item_${i},${(Math.random() * 100).toFixed(2)}`);
  }
  writeTo('test-small.csv', lines.join('\n'));
}

// ===========================
// 10. test-large.csv (250行)
// ===========================
function genLargeCsv() {
  const lines = ['id,name,category,value,status'];
  for (let i = 1; i <= 250; i++) {
    const cat = ['A', 'B', 'C'][i % 3];
    const status = i % 5 === 0 ? 'inactive' : 'active';
    lines.push(`${i},item_${i},${cat},${(Math.random() * 1000).toFixed(2)},${status}`);
  }
  writeTo('test-large.csv', lines.join('\n'));
}

// ===========================
// 11. test-image.png (1x1 赤ピクセル)
// ===========================
function genImagePng() {
  // 最小限の有効なPNGファイル (1x1 red pixel)
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
    0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND chunk
    0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  writeTo('test-image.png', png);
}

// ===========================
// 12. test-3mb.txt (3MB sample)
// ===========================
function gen3mbTxt() {
  const targetBytes = 3 * 1024 * 1024;
  const chunk = 'A'.repeat(1024); // 1KB chunk
  let text = '';
  while (Buffer.byteLength(text) < targetBytes) {
    text += chunk;
  }
  writeTo('test-3mb.txt', text.slice(0, targetBytes));
}

// ===========================
// Main
// ===========================
async function main() {
  console.log('Generating test files...\n');

  genTextTxt();
  genLargeTxt();
  await genTextPdf();
  await genScanPdf();
  await genPasswordPdf();
  await genLargePdf();
  await genSimpleDocx();
  await genComplexDocx();
  genSmallCsv();
  genLargeCsv();
  genImagePng();
  gen3mbTxt();

  console.log(`\nDone! ${fs.readdirSync(OUT_DIR).length} files in ${OUT_DIR}`);
}

main().catch(err => {
  console.error('Generation failed:', err);
  process.exit(1);
});

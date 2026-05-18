#!/usr/bin/env node
/**
 * One-shot migration: tests/edge-cases.csv
 *
 * Adds `bucket` and `id` as proper structural columns by parsing them out of
 * the `notes` field. Original format had notes like:
 *
 *   "Bucket A1 — clear in-scope, id=karmijn"
 *
 * After migration:
 *
 *   bucket=A, id=A1, notes="clear in-scope, id=karmijn"
 *
 * Usage:
 *   node tests/migrate-edge-cases-csv.js
 *
 * Reads:  tests/edge-cases.csv
 * Writes: tests/edge-cases.csv (overwrites, after backup to .bak)
 *
 * Safe to run multiple times: if bucket+id already present, exits with notice.
 *
 * Last reviewed: 2026-05-18 (1AM-243)
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CSV_PATH = resolve(__dirname, 'edge-cases.csv');
const BACKUP_PATH = resolve(__dirname, 'edge-cases.csv.bak');

// Parses "Bucket A1 — rest of notes" or "Bucket A1: rest" or "Bucket A1, rest"
const BUCKET_REGEX = /^\s*Bucket\s+([A-D])(\d+)\s*[—:,-]*\s*(.*)$/i;

function parseRow(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function quoteIfNeeded(value) {
  if (value === '' || value === undefined || value === null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function main() {
  if (!existsSync(CSV_PATH)) {
    process.stderr.write(`✗ CSV not found at ${CSV_PATH}\n`);
    process.exitCode = 1;
    return;
  }

  const csvText = readFileSync(CSV_PATH, 'utf8');
  const lines = csvText.split(/\r?\n/);
  // Preserve trailing empty line behaviour: filter only fully empty lines for processing
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);

  if (nonEmptyLines.length === 0) {
    process.stderr.write('✗ CSV is empty\n');
    process.exitCode = 1;
    return;
  }

  const oldHeader = parseRow(nonEmptyLines[0]).map((c) => c.trim());

  // Already migrated?
  if (oldHeader.includes('bucket') && oldHeader.includes('id')) {
    console.log('✓ CSV already has bucket + id columns. No migration needed.');
    return;
  }

  // Sanity check: expect at least question + expected_category + expected_component + notes
  const required = ['question', 'expected_category', 'expected_component', 'notes'];
  const missing = required.filter((c) => !oldHeader.includes(c));
  if (missing.length > 0) {
    process.stderr.write(`✗ Source CSV missing expected columns: ${missing.join(', ')}\n`);
    process.stderr.write(`  Found columns: ${oldHeader.join(', ')}\n`);
    process.exitCode = 1;
    return;
  }

  // Backup
  copyFileSync(CSV_PATH, BACKUP_PATH);
  console.log(`Backup written: ${BACKUP_PATH}`);

  // Build column index lookup
  const idx = Object.fromEntries(oldHeader.map((c, i) => [c, i]));

  // Process rows
  const newRows = [];
  const failures = [];

  for (let lineNum = 1; lineNum < nonEmptyLines.length; lineNum++) {
    const cells = parseRow(nonEmptyLines[lineNum]).map((c) => c.trim());
    if (cells.length !== oldHeader.length) {
      failures.push({ line: lineNum + 1, reason: `column count mismatch (${cells.length} vs ${oldHeader.length})` });
      continue;
    }

    const notesRaw = cells[idx.notes];
    // Unwrap surrounding quotes if present in raw cell
    const notes = notesRaw.replace(/^"(.*)"$/s, '$1');

    const match = notes.match(BUCKET_REGEX);
    if (!match) {
      failures.push({ line: lineNum + 1, reason: `notes does not start with "Bucket X#": ${notes.slice(0, 60)}` });
      continue;
    }

    const bucket = match[1].toUpperCase();
    const id = `${bucket}${match[2]}`;
    const cleanedNotes = match[3].trim();

    newRows.push({
      bucket,
      id,
      question: cells[idx.question].replace(/^"(.*)"$/s, '$1'),
      expected_category: cells[idx.expected_category],
      expected_component: cells[idx.expected_component],
      expected_deflection_target: cells[idx.expected_deflection_target] || '',
      notes: cleanedNotes,
    });
  }

  if (failures.length > 0) {
    process.stderr.write(`\n✗ Migration aborted — ${failures.length} row(s) could not be parsed:\n`);
    for (const f of failures) {
      process.stderr.write(`  Line ${f.line}: ${f.reason}\n`);
    }
    process.stderr.write(`\nBackup preserved at ${BACKUP_PATH}\n`);
    process.exitCode = 1;
    return;
  }

  // Write new CSV
  const newHeader = [
    'bucket',
    'id',
    'question',
    'expected_category',
    'expected_component',
    'expected_deflection_target',
    'notes',
  ];

  const out = [newHeader.join(',')];
  for (const row of newRows) {
    out.push(
      newHeader.map((col) => quoteIfNeeded(row[col])).join(',')
    );
  }

  writeFileSync(CSV_PATH, out.join('\n') + '\n', 'utf8');

  console.log('');
  console.log(`✓ Migrated ${newRows.length} rows`);
  console.log(`  Old header: ${oldHeader.join(', ')}`);
  console.log(`  New header: ${newHeader.join(', ')}`);
  console.log('');
  console.log('Per-bucket counts:');
  const counts = {};
  for (const r of newRows) counts[r.bucket] = (counts[r.bucket] || 0) + 1;
  for (const b of ['A', 'B', 'C', 'D']) {
    if (counts[b]) console.log(`  Bucket ${b}: ${counts[b]}`);
  }
  console.log('');
  console.log(`Original CSV preserved at: ${BACKUP_PATH}`);
  console.log(`Migrated CSV written to:   ${CSV_PATH}`);
}

main();

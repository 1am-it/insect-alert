#!/usr/bin/env node
/**
 * Classifier accuracy evaluation script.
 *
 * Runs all questions from tests/edge-cases.csv against the classify-question
 * endpoint and reports accuracy per bucket and overall. Used to validate the
 * classifier against the OPS-20 Phase D target of >95% accuracy.
 *
 * Usage:
 *   node tests/run-classifier-eval.js                  # all 56 questions
 *   node tests/run-classifier-eval.js --bucket A       # one bucket only
 *   node tests/run-classifier-eval.js --verbose        # show full classifier response per question
 *
 * Environment:
 *   API_BASE_URL — override the classifier endpoint base URL
 *                  (default: https://insect-alert.vercel.app)
 *
 * Exit codes:
 *   0 — total accuracy >= 95% (OPS-20 Phase D target met)
 *   1 — total accuracy < 95%, or hard error during run
 *
 * Output:
 *   - Streaming progress to terminal
 *   - Full report to tests/results/classifier-eval-YYYY-MM-DD-HHmm.txt
 *
 * Last reviewed: 2026-05-18 (1AM-243)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.API_BASE_URL || 'https://insect-alert.vercel.app';
const ENDPOINT = `${API_BASE_URL}/api/classify-question`;
const ACCURACY_TARGET = 0.95;
const REQUIRED_COLUMNS = ['bucket', 'id', 'question', 'expected_category', 'expected_component'];
const OPTIONAL_COLUMNS = ['expected_deflection_target', 'notes'];

// CLI args
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const BUCKET_FILTER = (() => {
  const i = args.indexOf('--bucket');
  return i >= 0 ? args[i + 1]?.toUpperCase() : null;
})();

// Paths (resolve relative to this script's location)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CSV_PATH = resolve(__dirname, 'edge-cases.csv');
const RESULTS_DIR = resolve(__dirname, 'results');

// ---------------------------------------------------------------------------
// CSV parsing (vanilla — no deps)
// ---------------------------------------------------------------------------

/**
 * Parse a CSV file into an array of objects.
 * Handles quoted fields with embedded commas. Does NOT handle escaped quotes
 * or multi-line fields — keep edge-cases.csv simple.
 */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error('CSV is empty');

  const header = parseRow(lines[0]);
  const rows = lines.slice(1).map((line, idx) => {
    const values = parseRow(line);
    if (values.length !== header.length) {
      throw new Error(
        `Row ${idx + 2} has ${values.length} columns, expected ${header.length}`
      );
    }
    return Object.fromEntries(header.map((col, i) => [col, values[i]]));
  });

  return { header, rows };
}

/**
 * Parse a single CSV row, respecting quoted fields.
 */
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
  return result.map((v) => v.trim());
}

/**
 * Validate that the CSV header contains all required columns.
 * On failure: writes directly to stderr (synchronous on TTY) and sets
 * exitCode=1, then returns false so caller can stop. We avoid throw+catch
 * here because on Windows/MINGW64, process.exit(1) right after console.error
 * can truncate stderr output before it's visible. Direct stderr.write +
 * exitCode (instead of exit()) lets Node flush buffers naturally.
 */
function validateHeader(header) {
  const missing = REQUIRED_COLUMNS.filter((col) => !header.includes(col));
  if (missing.length > 0) {
    process.stderr.write('\n');
    process.stderr.write(`✗ Missing required CSV columns: ${missing.join(', ')}\n`);
    process.stderr.write(`  CSV header found: ${header.join(', ')}\n`);
    process.stderr.write(`  Expected at minimum: ${REQUIRED_COLUMNS.join(', ')}\n`);
    process.stderr.write('\n');
    process.stderr.write('  Tip: run `node tests/migrate-edge-cases-csv.js` to add\n');
    process.stderr.write('       bucket + id columns from notes if needed.\n\n');
    process.exitCode = 1;
    return false;
  }
  // Warn about unknown columns (not fatal)
  const known = new Set([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);
  const unknown = header.filter((col) => !known.has(col));
  if (unknown.length > 0) {
    process.stderr.write(`⚠️  Unknown CSV columns (ignored): ${unknown.join(', ')}\n`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Classifier call
// ---------------------------------------------------------------------------

async function callClassifier(question) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      `HTTP ${res.status} — ${errBody.error || 'unknown'}: ${errBody.message || res.statusText}`
    );
  }

  return await res.json();
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * Compare a single classifier response against expected values.
 * Returns { categoryMatch, componentMatch, deflectionMatch }.
 *
 * Confidence is NOT compared per 1AM-232 post-implementation note:
 * confidence describes classification certainty, not answer usability.
 * Backend already forces fallback for low+non-ambiguous via safety-net.
 */
function evaluateResponse(row, response) {
  const categoryMatch = response.category === row.expected_category;
  const componentMatch = response.component === row.expected_component;

  // Deflection target is only checked for category=deflection
  let deflectionMatch = null;
  if (row.expected_category === 'deflection' && row.expected_deflection_target) {
    deflectionMatch = response.deflectionTarget === row.expected_deflection_target;
  }

  return { categoryMatch, componentMatch, deflectionMatch };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function formatTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

function pct(num, denom) {
  if (denom === 0) return '—';
  return ((num / denom) * 100).toFixed(1) + '%';
}

function generateReport(results, summary) {
  const lines = [];
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  Classifier accuracy evaluation report');
  lines.push(`  Generated: ${new Date().toISOString()}`);
  lines.push(`  Endpoint:  ${ENDPOINT}`);
  if (BUCKET_FILTER) lines.push(`  Filter:    bucket=${BUCKET_FILTER}`);
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  // Per-bucket summary
  lines.push('Per-bucket results (category + component must both match):');
  lines.push('');
  for (const bucket of ['A', 'B', 'C', 'D']) {
    const stats = summary.byBucket[bucket];
    if (!stats || stats.total === 0) continue;
    const passSymbol = stats.passed === stats.total ? '✓' : '✗';
    lines.push(
      `  Bucket ${bucket}: ${String(stats.passed).padStart(2)}/${stats.total}  ` +
        `${pct(stats.passed, stats.total).padStart(6)}  ${passSymbol}`
    );
  }
  lines.push('');
  lines.push(
    `  TOTAL:    ${summary.totalPassed}/${summary.totalCount}  ` +
      `${pct(summary.totalPassed, summary.totalCount)}`
  );
  lines.push('');

  // Per-metric breakdown
  lines.push('Per-metric accuracy:');
  lines.push('');
  lines.push(
    `  Category accuracy:        ${summary.categoryPassed}/${summary.totalCount}  ` +
      pct(summary.categoryPassed, summary.totalCount)
  );
  lines.push(
    `  Component accuracy:       ${summary.componentPassed}/${summary.totalCount}  ` +
      pct(summary.componentPassed, summary.totalCount)
  );
  if (summary.deflectionTotal > 0) {
    lines.push(
      `  Deflection-target (C):    ${summary.deflectionPassed}/${summary.deflectionTotal}  ` +
        pct(summary.deflectionPassed, summary.deflectionTotal)
    );
  }
  lines.push('');

  // Confidence distribution (analytical only, not pass/fail)
  lines.push('Confidence distribution:');
  lines.push('');
  for (const level of ['high', 'medium', 'low']) {
    const count = summary.confidenceCounts[level] || 0;
    lines.push(`  ${level.padEnd(8)} ${String(count).padStart(3)}  ${pct(count, summary.totalCount)}`);
  }
  lines.push('');

  // Failures
  const failures = results.filter((r) => !r.passed);
  if (failures.length > 0) {
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push(`Failures (${failures.length}):`);
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('');
    for (const f of failures) {
      lines.push(`  ${f.id}: "${f.question}"`);
      lines.push(
        `    Expected: ${f.expected_category}/${f.expected_component}` +
          (f.expected_deflection_target ? ` (${f.expected_deflection_target})` : '')
      );
      if (f.error) {
        lines.push(`    Error:    ${f.error}`);
      } else {
        lines.push(
          `    Got:      ${f.response.category}/${f.response.component}` +
            (f.response.deflectionTarget ? ` (${f.response.deflectionTarget})` : '') +
            ` [confidence=${f.response.confidence}]`
        );
      }
      lines.push('');
    }
  }

  // Target verdict
  lines.push('═══════════════════════════════════════════════════════════════');
  const totalPct = summary.totalPassed / summary.totalCount;
  if (totalPct >= ACCURACY_TARGET) {
    lines.push(
      `✓ OPS-20 Phase D target (>=${(ACCURACY_TARGET * 100).toFixed(0)}%) MET`
    );
  } else if (totalPct >= 0.75) {
    lines.push(
      `⚠ Above 75% baseline but below ${(ACCURACY_TARGET * 100).toFixed(0)}% target — prompt-tuning recommended`
    );
  } else {
    lines.push(`✗ Below 75% baseline — prompt-tuning required before Sprint 3`);
  }
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Read + validate CSV
  if (!existsSync(CSV_PATH)) {
    process.stderr.write(`✗ CSV not found at ${CSV_PATH}\n`);
    process.exitCode = 1;
    return;
  }
  const csvText = readFileSync(CSV_PATH, 'utf8');
  const { header, rows: allRows } = parseCsv(csvText);
  if (!validateHeader(header)) return;

  // Apply bucket filter
  const rows = BUCKET_FILTER
    ? allRows.filter((r) => r.bucket?.toUpperCase() === BUCKET_FILTER)
    : allRows;

  if (rows.length === 0) {
    process.stderr.write(
      BUCKET_FILTER
        ? `✗ No rows found for bucket=${BUCKET_FILTER}\n`
        : '✗ CSV has no data rows\n'
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Running ${rows.length} questions against ${ENDPOINT}`);
  console.log('');

  // Execute sequentially
  const results = [];
  for (const row of rows) {
    process.stdout.write(`  ${row.id.padEnd(4)} ${row.question.slice(0, 60).padEnd(62)} `);

    let response = null;
    let error = null;
    try {
      response = await callClassifier(row.question);
    } catch (e) {
      error = e.message;
    }

    let result;
    if (error) {
      result = {
        id: row.id,
        bucket: row.bucket,
        question: row.question,
        expected_category: row.expected_category,
        expected_component: row.expected_component,
        expected_deflection_target: row.expected_deflection_target || null,
        response: null,
        error,
        passed: false,
        evaluation: null,
      };
      process.stdout.write('✗ ERROR\n');
    } else {
      const evaluation = evaluateResponse(row, response);
      const passed = evaluation.categoryMatch && evaluation.componentMatch;
      result = {
        id: row.id,
        bucket: row.bucket,
        question: row.question,
        expected_category: row.expected_category,
        expected_component: row.expected_component,
        expected_deflection_target: row.expected_deflection_target || null,
        response,
        error: null,
        passed,
        evaluation,
      };
      process.stdout.write(passed ? '✓\n' : '✗\n');
      if (VERBOSE) {
        console.log(`         response: ${JSON.stringify(response)}`);
      }
    }

    results.push(result);
  }

  console.log('');

  // Aggregate summary
  const summary = {
    totalCount: results.length,
    totalPassed: results.filter((r) => r.passed).length,
    byBucket: {},
    categoryPassed: 0,
    componentPassed: 0,
    deflectionPassed: 0,
    deflectionTotal: 0,
    confidenceCounts: {},
  };

  for (const r of results) {
    const b = r.bucket;
    if (!summary.byBucket[b]) summary.byBucket[b] = { total: 0, passed: 0 };
    summary.byBucket[b].total += 1;
    if (r.passed) summary.byBucket[b].passed += 1;

    if (r.evaluation) {
      if (r.evaluation.categoryMatch) summary.categoryPassed += 1;
      if (r.evaluation.componentMatch) summary.componentPassed += 1;
      if (r.evaluation.deflectionMatch !== null) {
        summary.deflectionTotal += 1;
        if (r.evaluation.deflectionMatch) summary.deflectionPassed += 1;
      }
    }

    if (r.response?.confidence) {
      summary.confidenceCounts[r.response.confidence] =
        (summary.confidenceCounts[r.response.confidence] || 0) + 1;
    }
  }

  // Generate + print + persist report
  const report = generateReport(results, summary);
  console.log(report);

  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });
  const reportPath = resolve(
    RESULTS_DIR,
    `classifier-eval-${formatTimestamp()}.txt`
  );
  writeFileSync(reportPath, report, 'utf8');
  console.log('');
  console.log(`Report written to: ${reportPath}`);

  // Exit code based on target
  const totalPct = summary.totalPassed / summary.totalCount;
  process.exitCode = totalPct >= ACCURACY_TARGET ? 0 : 1;
}

main().catch((e) => {
  // Use process.stderr.write + exitCode (not exit) so Node flushes buffers
  // before the process terminates. On Windows/MINGW64, process.exit(1)
  // immediately after console.error can drop the error message.
  process.stderr.write('\n');
  process.stderr.write(`✗ Fatal error: ${e.message}\n`);
  if (VERBOSE) process.stderr.write(`${e.stack}\n`);
  process.exitCode = 1;
});

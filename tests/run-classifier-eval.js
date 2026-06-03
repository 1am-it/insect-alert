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

// Rate limiting: Gemini Flash free tier is 10 RPM. We throttle to stay well
// under that. CALL_DELAY_MS is the pause between consecutive classifier calls.
// MAX_RETRIES_ON_503 is the number of retries when Gemini briefly rejects
// (e.g., during a rate-limit spike).
const CALL_DELAY_MS = Number(process.env.CALL_DELAY_MS) || 7000;
const MAX_RETRIES_ON_503 = 2;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call the classifier endpoint, with retry-with-backoff on 503 errors.
 *
 * Gemini Flash free tier has aggressive rate limits (10 RPM). Sequential
 * unthrottled calls quickly exhaust this. The eval script throttles between
 * calls (CALL_DELAY_MS), and additionally retries 503s with longer waits in
 * case Gemini briefly rejects.
 *
 * Returns { response, error, errorKind } where:
 *   - response: parsed JSON on success, or null
 *   - error: error message on failure, or null
 *   - errorKind: 'classification' | 'infra' | null
 *      - 'infra' = HTTP 5xx, network failure, timeout (re-runnable, not classifier's fault)
 *      - 'classification' = HTTP 4xx (bad request, validation) — counts against accuracy
 */
async function callClassifierWithRetry(question) {
  const backoffs = [10000, 30000]; // 10s then 30s retry waits

  for (let attempt = 0; attempt <= MAX_RETRIES_ON_503; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      if (res.ok) {
        return { response: await res.json(), error: null, errorKind: null };
      }

      // Read error body (best effort)
      const errBody = await res.json().catch(() => ({}));
      const errorMsg = `HTTP ${res.status} — ${errBody.error || 'unknown'}: ${errBody.message || res.statusText}`;

      // 5xx = infrastructure: retry if attempts remain
      if (res.status >= 500 && attempt < MAX_RETRIES_ON_503) {
        process.stdout.write(`(retry in ${backoffs[attempt] / 1000}s...) `);
        await sleep(backoffs[attempt]);
        continue;
      }

      return {
        response: null,
        error: errorMsg,
        errorKind: res.status >= 500 ? 'infra' : 'classification',
      };
    } catch (e) {
      // Network/fetch failure = infra
      if (attempt < MAX_RETRIES_ON_503) {
        process.stdout.write(`(retry in ${backoffs[attempt] / 1000}s...) `);
        await sleep(backoffs[attempt]);
        continue;
      }
      return { response: null, error: e.message, errorKind: 'infra' };
    }
  }

  return { response: null, error: 'unreachable code', errorKind: 'infra' };
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

  // Infra failures summary (if any)
  if (summary.infraFailures > 0) {
    lines.push('⚠️  INFRASTRUCTURE FAILURES DETECTED');
    lines.push('');
    lines.push(
      `  ${summary.infraFailures} of ${summary.totalCount} requests failed due to HTTP 5xx or network issues`
    );
    lines.push(
      `  (likely Gemini rate limiting or transient outage). These are NOT classifier`
    );
    lines.push(`  failures — they were never actually classified. Accuracy below is`);
    lines.push(`  calculated only on the ${summary.testedCount} successfully-tested questions.`);
    lines.push('');
    lines.push(
      `  Recommendation: increase CALL_DELAY_MS (env var) and re-run to get a complete sample.`
    );
    lines.push('');
  }

  // Per-bucket summary
  lines.push('Per-bucket results (category + component must both match):');
  lines.push('');
  for (const bucket of ['A', 'B', 'C', 'D']) {
    const stats = summary.byBucket[bucket];
    if (!stats || stats.total === 0) continue;
    const passSymbol = stats.passed === stats.tested && stats.tested > 0 ? '✓' : '✗';
    let line =
      `  Bucket ${bucket}: ${String(stats.passed).padStart(2)}/${stats.tested}` +
      `  ${pct(stats.passed, stats.tested).padStart(6)}  ${passSymbol}`;
    if (stats.infra > 0) line += `  (${stats.infra} infra-failed)`;
    lines.push(line);
  }
  lines.push('');
  lines.push(
    `  TOTAL:    ${summary.totalPassed}/${summary.testedCount}  ` +
      `${pct(summary.totalPassed, summary.testedCount)}` +
      (summary.infraFailures > 0 ? `  (${summary.infraFailures} infra-failed, NOT tested)` : '')
  );
  lines.push('');

  // Per-metric breakdown
  lines.push('Per-metric accuracy (on tested calls only):');
  lines.push('');
  lines.push(
    `  Category accuracy:        ${summary.categoryPassed}/${summary.testedCount}  ` +
      pct(summary.categoryPassed, summary.testedCount)
  );
  lines.push(
    `  Component accuracy:       ${summary.componentPassed}/${summary.testedCount}  ` +
      pct(summary.componentPassed, summary.testedCount)
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

  // Failures — split into infra (not tested) and classification (wrong answer)
  const infraFailures = results.filter((r) => r.errorKind === 'infra');
  const classificationFailures = results.filter(
    (r) => r.errorKind === 'classification' || (r.evaluation && !r.passed)
  );

  if (classificationFailures.length > 0) {
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push(`Classification failures (${classificationFailures.length}):`);
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('');
    for (const f of classificationFailures) {
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

  if (infraFailures.length > 0) {
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push(`Infra failures — NOT tested (${infraFailures.length}):`);
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('');
    // Compact format — these aren't classifier failures, just list them briefly
    for (const f of infraFailures) {
      lines.push(`  ${f.id}: ${f.error}`);
    }
    lines.push('');
  }

  // Target verdict
  lines.push('═══════════════════════════════════════════════════════════════');
  if (summary.infraFailures > 0) {
    lines.push(`⚠ INCOMPLETE RUN — ${summary.infraFailures} infra failures, accuracy not reliable`);
    lines.push(`  Re-run with CALL_DELAY_MS=10000 or higher to throttle further.`);
  } else if (summary.testedCount === 0) {
    lines.push(`✗ No requests were successfully tested.`);
  } else {
    const totalPct = summary.totalPassed / summary.testedCount;
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
  console.log(`Throttle: ${CALL_DELAY_MS}ms between calls, max ${MAX_RETRIES_ON_503} retries on 5xx`);
  console.log('');

  // Execute sequentially with throttle
  const results = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    process.stdout.write(`  ${row.id.padEnd(4)} ${row.question.slice(0, 60).padEnd(62)} `);

    const { response, error, errorKind } = await callClassifierWithRetry(row.question);

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
        errorKind, // 'infra' or 'classification'
        passed: false,
        evaluation: null,
      };
      process.stdout.write(errorKind === 'infra' ? '✗ INFRA\n' : '✗ ERROR\n');
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
        errorKind: null,
        passed,
        evaluation,
      };
      process.stdout.write(passed ? '✓\n' : '✗\n');
      if (VERBOSE) {
        console.log(`         response: ${JSON.stringify(response)}`);
      }
    }

    results.push(result);

    // Throttle between calls (not after the last one)
    if (i < rows.length - 1) {
      await sleep(CALL_DELAY_MS);
    }
  }

  console.log('');

  // Aggregate summary
  const summary = {
    totalCount: results.length,
    totalPassed: results.filter((r) => r.passed).length,
    infraFailures: results.filter((r) => r.errorKind === 'infra').length,
    classificationFailures: results.filter(
      (r) => r.errorKind === 'classification' || (r.evaluation && !r.passed)
    ).length,
    testedCount: results.filter((r) => r.errorKind !== 'infra').length,
    byBucket: {},
    categoryPassed: 0,
    componentPassed: 0,
    deflectionPassed: 0,
    deflectionTotal: 0,
    confidenceCounts: {},
  };

  for (const r of results) {
    const b = r.bucket;
    if (!summary.byBucket[b]) {
      summary.byBucket[b] = { total: 0, passed: 0, infra: 0, tested: 0 };
    }
    summary.byBucket[b].total += 1;
    if (r.errorKind === 'infra') {
      summary.byBucket[b].infra += 1;
    } else {
      summary.byBucket[b].tested += 1;
      if (r.passed) summary.byBucket[b].passed += 1;
    }

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

  // Exit code: 0 only if (a) all questions actually tested AND (b) accuracy >= target
  // If infra failures occurred, the run is incomplete regardless of accuracy.
  if (summary.infraFailures > 0) {
    process.exitCode = 1;
  } else {
    const totalPct = summary.totalPassed / summary.totalCount;
    process.exitCode = totalPct >= ACCURACY_TARGET ? 0 : 1;
  }
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

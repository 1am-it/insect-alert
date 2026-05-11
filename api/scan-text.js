/**
 * Vercel serverless function — POST /api/scan-text
 *
 * Accepts an ingredient list as plain text and runs the local detector against it.
 * Mirror of /api/scan-photo, but skips the vision-LLM extraction step since
 * the text is already provided.
 *
 * Why this endpoint exists alongside the local detector:
 *   When the frontend lives in a separate codebase (or is built by a different
 *   tool, e.g. Lovable), having a single API contract for both paste and photo
 *   flows keeps the integration simple. The frontend speaks JSON; the backend
 *   owns all detection logic and pattern updates.
 *
 * Last reviewed: 2026-05-05 (1AM-57+1AM-133)
 */

import { detect } from '../src/detector.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 10,
};

const MAX_TEXT_LENGTH = 10000; // generous limit — typical ingredient list is <500 chars

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // CORS — allow cross-origin requests so the frontend can be hosted elsewhere
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'method_not_allowed',
      message: 'Only POST is supported',
    });
  }

  try {
    // Parse JSON body — Vercel doesn't auto-parse for the Node.js runtime
    const body = await readJsonBody(req);

    if (!body || typeof body.text !== 'string') {
      return res.status(400).json({
        error: 'invalid_body',
        message: 'Request body must be JSON with a "text" field',
      });
    }

    const text = body.text;

    if (text.length > MAX_TEXT_LENGTH) {
      return res.status(413).json({
        error: 'text_too_long',
        message: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters`,
      });
    }

    const detection = detect(text);

    return res.status(200).json({
      state: detection.state,
      matches: detection.matches,
    });
  } catch (error) {
    console.error('[scan-text] error:', error.message);
    return res.status(500).json({
      error: 'detection_failed',
      message: 'Er ging iets mis bij het analyseren van de tekst.',
    });
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Shared Gemini client factory.
 *
 * Both `adapters/gemini.js` (vision) and `adapters/gemini-text.js` (text)
 * use this to centralize auth + env-var lookup. The rest of the adapter
 * code stays per-modality.
 *
 * Why this exists:
 *   - Single source of truth for GEMINI_API_KEY env-var
 *   - Easier to swap auth method later (e.g. service account, OAuth)
 *   - Prevents the two adapters from drifting in how they read credentials
 *
 * Last reviewed: 2026-05-17 (1AM-234)
 */

import { GoogleGenAI } from '@google/genai';

/**
 * Construct a Gemini client. Throws with a clear message when the
 * GEMINI_API_KEY environment variable is missing, so configuration
 * errors fail fast at first use rather than surfacing as a cryptic
 * SDK stack trace later.
 *
 * @returns {GoogleGenAI} A configured Gemini client instance
 * @throws {Error} When GEMINI_API_KEY is not set
 */
export function createClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }
  return new GoogleGenAI({ apiKey });
}

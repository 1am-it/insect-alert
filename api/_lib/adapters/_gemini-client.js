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
 * Construct a Gemini client. Throws with a clear message when no API key
 * is available, so configuration errors fail fast at first use rather
 * than surfacing as a cryptic SDK stack trace later.
 *
 * @param {string} [overrideApiKey] - Optional API key override; falls back to
 *   process.env.GEMINI_API_KEY when omitted. Mainly useful for tests.
 * @returns {GoogleGenAI} A configured Gemini client instance
 * @throws {Error} When neither overrideApiKey nor GEMINI_API_KEY is set
 */
export function createClient(overrideApiKey) {
  const apiKey = overrideApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('gemini client: GEMINI_API_KEY env var is not set');
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Gemini text adapter for classifyText.
 *
 * Adapter contract — every vendor adapter exports `scan({...})` with the same
 * signature. Vendor-specific options live in `params.options` (model, timeout,
 * apiKey, etc.). The public classifyText interface validates inputs before
 * calling here, so adapters can assume non-empty question/prompt/schema.
 *
 * Parallel to `gemini.js` (vision) — same patterns, different modality:
 *   - vision: image + prompt as multimodal user-input
 *   - text:   classifier prompt as systemInstruction, question as user-input
 *
 * Last reviewed: 2026-05-17 (1AM-235)
 */

import { createClient } from './_gemini-client.js';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Run a text classification via Gemini.
 *
 * @param {Object} params
 * @param {string} params.question - User question to classify
 * @param {string} params.prompt - Classifier system instruction
 * @param {Object} params.schema - JSON schema for response
 * @param {Object} [params.options]
 * @param {string} [params.options.model]
 * @param {number} [params.options.timeoutMs]
 * @param {string} [params.options.apiKey] - Override GEMINI_API_KEY env var
 * @returns {Promise<Object>} Parsed structured response matching schema
 */
export async function scan({ question, prompt, schema, options = {} }) {
  const model = options.model || DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  // createClient throws with a clear message if GEMINI_API_KEY is missing
  const ai = createClient(options.apiKey);

  // Race the API call against a manual timeout — Gemini SDK doesn't accept
  // AbortSignal directly, so we wrap with Promise.race
  const apiCall = ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [{ text: question }],
      },
    ],
    config: {
      systemInstruction: prompt,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  });

  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`gemini-text adapter: request timed out after ${timeoutMs}ms`)),
      timeoutMs
    )
  );

  let response;
  try {
    response = await Promise.race([apiCall, timeout]);
  } catch (error) {
    // Re-throw with adapter prefix for easier debugging
    if (error.message.startsWith('gemini-text adapter:')) {
      throw error;
    }
    throw new Error(`gemini-text adapter: ${error.message}`);
  }

  const text = response.text;
  if (!text) {
    throw new Error('gemini-text adapter: empty response from model');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (parseError) {
    throw new Error(
      `gemini-text adapter: model returned invalid JSON — ${parseError.message}`
    );
  }

  return parsed;
}
